-- Atomically persist OCR pages, deterministic extraction candidates, and job completion.
create function public.complete_document_processing_with_extraction(
  p_job_id uuid,
  p_lock_token uuid,
  p_pages jsonb,
  p_candidates jsonb,
  p_ocr_provider text default null,
  p_ocr_version text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.processing_jobs%rowtype;
  v_page jsonb;
  v_block jsonb;
  v_candidate jsonb;
  v_page_id uuid;
  v_record_id uuid;
  v_data jsonb;
  v_kind public.record_kind;
begin
  select job.* into v_job from public.processing_jobs job
  where job.id = p_job_id for update;
  if not found then raise exception 'PROCESSING_JOB_NOT_FOUND' using errcode='P0002'; end if;
  if v_job.status = 'completed' and v_job.lock_token = p_lock_token then return true; end if;
  if v_job.status <> 'processing' or v_job.lock_token <> p_lock_token then
    raise exception 'PROCESSING_JOB_CLAIM_LOST' using errcode='55000';
  end if;
  if jsonb_typeof(p_pages) <> 'array' or jsonb_array_length(p_pages) not between 1 and 250 then
    raise exception 'PROCESSING_INVALID_PAGE_RESULT' using errcode='22023';
  end if;
  if jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) > 1000 then
    raise exception 'EXTRACTION_INVALID_OUTPUT' using errcode='22023';
  end if;
  if exists (
    select 1 from public.medical_records record
    where record.document_id=v_job.document_id and record.user_id=v_job.user_id
      and record.review_status <> 'extracted'
  ) then
    raise exception 'EXTRACTION_PROTECTED_RECORDS_EXIST' using errcode='55000';
  end if;

  delete from public.medical_records record
  where record.document_id=v_job.document_id and record.user_id=v_job.user_id
    and record.review_status='extracted';
  delete from public.document_text_blocks block
  where block.document_id=v_job.document_id and block.user_id=v_job.user_id;
  delete from public.document_pages page
  where page.document_id=v_job.document_id and page.user_id=v_job.user_id;

  for v_page in select value from jsonb_array_elements(p_pages) loop
    if jsonb_typeof(v_page) <> 'object' or jsonb_typeof(v_page->'blocks') <> 'array' then
      raise exception 'PROCESSING_INVALID_PAGE_RESULT' using errcode='22023';
    end if;
    v_page_id := coalesce((v_page->>'id')::uuid, gen_random_uuid());
    insert into public.document_pages(
      id,document_id,user_id,page_number,width,height,rotation,skew_angle,native_text_used
    ) values (
      v_page_id,v_job.document_id,v_job.user_id,(v_page->>'page_number')::integer,
      (v_page->>'width')::integer,(v_page->>'height')::integer,
      coalesce((v_page->>'rotation')::integer,0),coalesce((v_page->>'skew_angle')::real,0),
      (v_page->>'native_text_used')::boolean
    );
    for v_block in select value from jsonb_array_elements(v_page->'blocks') loop
      if length(coalesce(v_block->>'text','')) not between 1 and 1000000 then
        raise exception 'PROCESSING_INVALID_TEXT_BLOCK' using errcode='22023';
      end if;
      insert into public.document_text_blocks(
        id,document_id,page_id,user_id,block_index,text,confidence,bbox,source_type
      ) values (
        (v_block->>'id')::uuid,v_job.document_id,v_page_id,v_job.user_id,
        (v_block->>'block_index')::integer,v_block->>'text',(v_block->>'confidence')::real,
        v_block->'bbox',v_block->>'source_type'
      );
    end loop;
  end loop;

  for v_candidate in select value from jsonb_array_elements(p_candidates) loop
    if jsonb_typeof(v_candidate) <> 'object'
       or v_candidate->>'source_document_id' <> v_job.document_id::text
       or coalesce(v_candidate->>'source_text','') = ''
       or jsonb_typeof(v_candidate->'source_block_ids') <> 'array'
       or jsonb_array_length(v_candidate->'source_block_ids') < 1
       or coalesce(v_candidate->>'fingerprint','') !~ '^[a-f0-9]{64}$' then
      raise exception 'EXTRACTION_PROVENANCE_MISSING' using errcode='23514';
    end if;
    begin v_kind := (v_candidate->>'record_type')::public.record_kind;
    exception when others then raise exception 'EXTRACTION_INVALID_OUTPUT' using errcode='22023'; end;
    v_data := v_candidate->'data';
    if jsonb_typeof(v_data) <> 'object' then
      raise exception 'EXTRACTION_INVALID_OUTPUT' using errcode='22023';
    end if;
    insert into public.medical_records(
      user_id,document_id,record_type,event_date,confidence,review_status,
      source_page_number,source_block_ids,source_text,extraction_method,
      extraction_version,fingerprint
    ) values (
      v_job.user_id,v_job.document_id,v_kind,(v_candidate->>'event_date')::date,
      (v_candidate->>'confidence')::real,'extracted',
      (v_candidate->>'source_page_number')::integer,
      array(select jsonb_array_elements_text(v_candidate->'source_block_ids'))::uuid[],
      v_candidate->>'source_text',v_candidate->>'extraction_method',
      v_candidate->>'extraction_version',v_candidate->>'fingerprint'
    ) returning id into v_record_id;

    case v_kind
      when 'lab' then insert into public.lab_results(
        medical_record_id,user_id,test_name,original_value,numeric_value,unit,
        reference_range,flag,specimen,collected_at
      ) values (v_record_id,v_job.user_id,v_data->>'test_name',v_data->>'original_value',
        (v_data->>'numeric_value')::numeric,v_data->>'unit',v_data->>'reference_range',
        v_data->>'flag',v_data->>'specimen',(v_data->>'collected_at')::date);
      when 'medication' then insert into public.medications(
        medical_record_id,user_id,name,generic_name,dose,dose_unit,route,frequency,
        duration,start_date,end_date,status
      ) values (v_record_id,v_job.user_id,v_data->>'name',v_data->>'generic_name',
        v_data->>'dose',v_data->>'dose_unit',v_data->>'route',v_data->>'frequency',
        v_data->>'duration',(v_data->>'start_date')::date,(v_data->>'end_date')::date,v_data->>'status');
      when 'diagnosis' then insert into public.diagnoses(
        medical_record_id,user_id,name,code,diagnosed_at,status
      ) values (v_record_id,v_job.user_id,v_data->>'name',v_data->>'code',
        (v_data->>'diagnosed_at')::date,v_data->>'status');
      when 'allergy' then insert into public.allergies(
        medical_record_id,user_id,allergen,reaction,severity,status
      ) values (v_record_id,v_job.user_id,v_data->>'allergen',v_data->>'reaction',
        v_data->>'severity',v_data->>'status');
      when 'procedure' then insert into public.procedures(
        medical_record_id,user_id,procedure_name,performed_at,notes
      ) values (v_record_id,v_job.user_id,v_data->>'procedure_name',
        (v_data->>'performed_at')::date,v_data->>'notes');
      when 'vital' then insert into public.vitals(
        medical_record_id,user_id,measurement_type,label,original_value,numeric_value,
        secondary_value,unit,measured_at
      ) values (v_record_id,v_job.user_id,v_data->>'measurement_type',v_data->>'label',
        v_data->>'original_value',(v_data->>'numeric_value')::numeric,
        (v_data->>'secondary_value')::numeric,v_data->>'unit',(v_data->>'measured_at')::timestamptz);
      when 'doctor_note' then insert into public.doctor_notes(medical_record_id,user_id,text)
        values (v_record_id,v_job.user_id,v_data->>'text');
    end case;
  end loop;

  update public.documents document set processing_status='needs_review',
    processing_error_code=null,processing_error_message=null,
    ocr_provider=p_ocr_provider,ocr_version=p_ocr_version,
    extraction_provider='deterministic',extraction_version='1.0.0'
  where document.id=v_job.document_id and document.user_id=v_job.user_id;
  update public.processing_jobs job set status='completed',completed_at=now(),locked_at=null,
    last_error_code=null,last_error_message=null
  where job.id=p_job_id and job.lock_token=p_lock_token;
  return true;
end;
$$;

revoke execute on function public.complete_document_processing_with_extraction(uuid,uuid,jsonb,jsonb,text,text)
from public,anon,authenticated;
grant execute on function public.complete_document_processing_with_extraction(uuid,uuid,jsonb,jsonb,text,text)
to service_role;
