-- Owner-authorized, transactional review updates with immutable provenance.
create function public.review_medical_record(
  p_document_id uuid,
  p_record_id uuid,
  p_action text,
  p_correction jsonb default null
)
returns public.document_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_record public.medical_records%rowtype;
  v_status public.document_status;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_action not in ('approve','reject','correct') then
    raise exception 'REVIEW_ACTION_INVALID' using errcode='22023';
  end if;
  select record.* into v_record from public.medical_records record
  where record.id=p_record_id and record.document_id=p_document_id
    and record.user_id=v_user_id for update;
  if not found then raise exception 'RECORD_NOT_FOUND' using errcode='P0002'; end if;

  if p_action in ('approve','reject') then
    if p_correction is not null then raise exception 'REVIEW_PAYLOAD_INVALID' using errcode='22023'; end if;
    update public.medical_records set review_status=
      case when p_action='approve' then 'approved'::public.review_status
           else 'rejected'::public.review_status end
    where id=p_record_id;
  else
    if jsonb_typeof(p_correction) <> 'object'
       or p_correction->>'recordType' <> v_record.record_type::text then
      raise exception 'REVIEW_PAYLOAD_INVALID' using errcode='22023';
    end if;
    case v_record.record_type
      when 'lab' then update public.lab_results set
        test_name=p_correction->>'test_name',original_value=p_correction->>'original_value',
        numeric_value=(p_correction->>'numeric_value')::numeric,unit=p_correction->>'unit',
        reference_range=p_correction->>'reference_range',flag=p_correction->>'flag'
        where medical_record_id=p_record_id and user_id=v_user_id;
      when 'medication' then update public.medications set
        name=p_correction->>'name',dose=p_correction->>'dose',dose_unit=p_correction->>'dose_unit',
        route=p_correction->>'route',frequency=p_correction->>'frequency',duration=p_correction->>'duration'
        where medical_record_id=p_record_id and user_id=v_user_id;
      when 'diagnosis' then update public.diagnoses set
        name=p_correction->>'name',code=p_correction->>'code',status=p_correction->>'status'
        where medical_record_id=p_record_id and user_id=v_user_id;
      when 'allergy' then update public.allergies set
        allergen=p_correction->>'allergen',reaction=p_correction->>'reaction',
        severity=p_correction->>'severity',status=p_correction->>'status'
        where medical_record_id=p_record_id and user_id=v_user_id;
      when 'vital' then update public.vitals set
        measurement_type=p_correction->>'measurement_type',label=p_correction->>'label',
        original_value=p_correction->>'original_value',numeric_value=(p_correction->>'numeric_value')::numeric,
        secondary_value=(p_correction->>'secondary_value')::numeric,unit=p_correction->>'unit'
        where medical_record_id=p_record_id and user_id=v_user_id;
      when 'procedure' then update public.procedures set
        procedure_name=p_correction->>'procedure_name',performed_at=(p_correction->>'performed_at')::date,
        notes=p_correction->>'notes'
        where medical_record_id=p_record_id and user_id=v_user_id;
      when 'doctor_note' then update public.doctor_notes set text=p_correction->>'text'
        where medical_record_id=p_record_id and user_id=v_user_id;
    end case;
    if not found then raise exception 'REVIEW_CHILD_NOT_FOUND' using errcode='P0002'; end if;
    update public.medical_records set review_status='corrected' where id=p_record_id;
  end if;

  select case when exists(
      select 1 from public.medical_records where document_id=p_document_id and user_id=v_user_id
    ) and not exists(
      select 1 from public.medical_records where document_id=p_document_id and user_id=v_user_id
        and review_status='extracted'
    ) then 'completed'::public.document_status else 'needs_review'::public.document_status end
  into v_status;
  update public.documents set processing_status=v_status
  where id=p_document_id and user_id=v_user_id;
  return v_status;
end;
$$;

revoke execute on function public.review_medical_record(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.review_medical_record(uuid,uuid,text,jsonb) to authenticated,service_role;
