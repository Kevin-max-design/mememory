-- Bound processor output before the service-role persistence function expands JSON rows.
alter function public.complete_document_processing_with_extraction(
  uuid, uuid, jsonb, jsonb, text, text
) rename to complete_document_processing_with_extraction_unbounded;

revoke execute on function public.complete_document_processing_with_extraction_unbounded(
  uuid, uuid, jsonb, jsonb, text, text
) from public, anon, authenticated, service_role;

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
  v_total_blocks bigint;
  v_total_text_bytes bigint;
begin
  if jsonb_typeof(p_pages) <> 'array' then
    raise exception 'PROCESSING_INVALID_PAGE_RESULT' using errcode = '22023';
  end if;

  if jsonb_array_length(p_pages) not between 1 and 250 then
    raise exception 'PROCESSING_INVALID_PAGE_RESULT' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_pages) as page(value)
    where case
      when jsonb_typeof(page.value) <> 'object' then true
      when jsonb_typeof(page.value->'blocks') <> 'array' then true
      else jsonb_array_length(page.value->'blocks') > 2000
    end
  ) then
    raise exception 'PROCESSING_BLOCK_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  select count(*), coalesce(sum(octet_length(block.value->>'text')), 0)
  into v_total_blocks, v_total_text_bytes
  from jsonb_array_elements(p_pages) as page(value)
  cross join lateral jsonb_array_elements(page.value->'blocks') as block(value);

  if v_total_blocks > 20000 or v_total_text_bytes > 20000000 then
    raise exception 'PROCESSING_OUTPUT_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  return public.complete_document_processing_with_extraction_unbounded(
    p_job_id,
    p_lock_token,
    p_pages,
    p_candidates,
    p_ocr_provider,
    p_ocr_version
  );
end;
$$;

revoke execute on function public.complete_document_processing_with_extraction(
  uuid, uuid, jsonb, jsonb, text, text
) from public, anon, authenticated;

grant execute on function public.complete_document_processing_with_extraction(
  uuid, uuid, jsonb, jsonb, text, text
) to service_role;
