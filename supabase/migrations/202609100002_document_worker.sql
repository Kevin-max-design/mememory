-- Atomic, service-role-only document job orchestration.
create function public.claim_document_processing_job(
  p_lock_timeout_seconds integer default 900,
  p_job_id uuid default null
)
returns table (
  job_id uuid,
  document_id uuid,
  user_id uuid,
  lock_token uuid,
  attempt_count integer,
  max_attempts integer,
  storage_path text,
  mime_type text,
  file_size bigint,
  sha256 text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_lock_token uuid := gen_random_uuid();
begin
  if p_lock_timeout_seconds < 60 or p_lock_timeout_seconds > 3600 then
    raise exception 'PROCESSING_INVALID_LOCK_TIMEOUT' using errcode = '22023';
  end if;

  update public.processing_jobs as exhausted
  set status = 'failed',
      locked_at = null,
      lock_token = null,
      completed_at = now(),
      last_error_code = 'PROCESSING_RETRY_EXHAUSTED',
      last_error_message = 'Maximum processing attempts reached.'
  where exhausted.attempt_count >= exhausted.max_attempts
    and (
      exhausted.status = 'queued'
      or (
        exhausted.status = 'processing'
        and exhausted.locked_at < now() - make_interval(secs => p_lock_timeout_seconds)
      )
    );

  update public.documents as document
  set processing_status = 'failed',
      processing_error_code = 'PROCESSING_RETRY_EXHAUSTED',
      processing_error_message = 'Maximum processing attempts reached.'
  where document.processing_status in ('queued', 'processing')
    and exists (
      select 1
      from public.processing_jobs as failed_job
      where failed_job.document_id = document.id
        and failed_job.status = 'failed'
        and failed_job.last_error_code = 'PROCESSING_RETRY_EXHAUSTED'
    );

  select candidate.id
  into v_job_id
  from public.processing_jobs as candidate
  where candidate.attempt_count < candidate.max_attempts
    and (p_job_id is null or candidate.id = p_job_id)
    and (
      candidate.status = 'queued'
      or (
        candidate.status = 'processing'
        and candidate.locked_at < now() - make_interval(secs => p_lock_timeout_seconds)
      )
    )
  order by candidate.created_at, candidate.id
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  update public.processing_jobs as claimed
  set status = 'processing',
      attempt_count = claimed.attempt_count + 1,
      locked_at = now(),
      lock_token = v_lock_token,
      started_at = coalesce(claimed.started_at, now()),
      completed_at = null,
      last_error_code = null,
      last_error_message = null
  where claimed.id = v_job_id;

  update public.documents as document
  set processing_status = 'processing',
      processing_error_code = null,
      processing_error_message = null
  where document.id = (
    select claimed.document_id
    from public.processing_jobs as claimed
    where claimed.id = v_job_id
  );

  return query
  select claimed.id,
         claimed.document_id,
         claimed.user_id,
         claimed.lock_token,
         claimed.attempt_count,
         claimed.max_attempts,
         document.storage_path,
         document.mime_type,
         document.file_size,
         document.sha256
  from public.processing_jobs as claimed
  join public.documents as document
    on document.id = claimed.document_id and document.user_id = claimed.user_id
  where claimed.id = v_job_id;
end;
$$;

create function public.renew_document_processing_job(
  p_job_id uuid,
  p_lock_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.processing_jobs as job
  set locked_at = now()
  where job.id = p_job_id
    and job.status = 'processing'
    and job.lock_token = p_lock_token;
  return found;
end;
$$;

create function public.complete_document_processing_job(
  p_job_id uuid,
  p_lock_token uuid,
  p_pages jsonb,
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
  v_page_id uuid;
begin
  select job.* into v_job
  from public.processing_jobs as job
  where job.id = p_job_id
  for update;

  if not found then
    raise exception 'PROCESSING_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_job.status = 'completed' and v_job.lock_token = p_lock_token then
    return true;
  end if;
  if v_job.status <> 'processing' or v_job.lock_token <> p_lock_token then
    raise exception 'PROCESSING_JOB_CLAIM_LOST' using errcode = '55000';
  end if;
  if p_pages is null
     or jsonb_typeof(p_pages) <> 'array'
     or jsonb_array_length(p_pages) < 1
     or jsonb_array_length(p_pages) > 250 then
    raise exception 'PROCESSING_INVALID_PAGE_RESULT' using errcode = '22023';
  end if;

  delete from public.document_text_blocks as block
  where block.document_id = v_job.document_id and block.user_id = v_job.user_id;
  delete from public.document_pages as page
  where page.document_id = v_job.document_id and page.user_id = v_job.user_id;

  for v_page in select value from jsonb_array_elements(p_pages)
  loop
    if jsonb_typeof(v_page) <> 'object'
       or jsonb_typeof(coalesce(v_page->'blocks', 'null'::jsonb)) <> 'array' then
      raise exception 'PROCESSING_INVALID_PAGE_RESULT' using errcode = '22023';
    end if;

    insert into public.document_pages (
      document_id, user_id, page_number, width, height, rotation, skew_angle,
      native_text_used
    ) values (
      v_job.document_id,
      v_job.user_id,
      (v_page->>'page_number')::integer,
      (v_page->>'width')::integer,
      (v_page->>'height')::integer,
      coalesce((v_page->>'rotation')::integer, 0),
      coalesce((v_page->>'skew_angle')::real, 0),
      (v_page->>'native_text_used')::boolean
    )
    returning id into v_page_id;

    for v_block in select value from jsonb_array_elements(v_page->'blocks')
    loop
      if length(coalesce(v_block->>'text', '')) < 1
         or length(v_block->>'text') > 1000000 then
        raise exception 'PROCESSING_INVALID_TEXT_BLOCK' using errcode = '22023';
      end if;
      insert into public.document_text_blocks (
        document_id, page_id, user_id, block_index, text, confidence, bbox,
        source_type
      ) values (
        v_job.document_id,
        v_page_id,
        v_job.user_id,
        (v_block->>'block_index')::integer,
        v_block->>'text',
        (v_block->>'confidence')::real,
        v_block->'bbox',
        v_block->>'source_type'
      );
    end loop;
  end loop;

  update public.documents as document
  set processing_status = 'needs_review',
      processing_error_code = null,
      processing_error_message = null,
      ocr_provider = nullif(left(p_ocr_provider, 100), ''),
      ocr_version = nullif(left(p_ocr_version, 100), '')
  where document.id = v_job.document_id and document.user_id = v_job.user_id;

  update public.processing_jobs as job
  set status = 'completed',
      completed_at = now(),
      locked_at = null,
      last_error_code = null,
      last_error_message = null
  where job.id = v_job.id and job.lock_token = p_lock_token;

  return true;
end;
$$;

create function public.fail_document_processing_job(
  p_job_id uuid,
  p_lock_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.processing_jobs%rowtype;
  v_next_status public.job_status;
begin
  select job.* into v_job
  from public.processing_jobs as job
  where job.id = p_job_id
  for update;

  if not found then
    raise exception 'PROCESSING_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_job.status <> 'processing' or v_job.lock_token <> p_lock_token then
    raise exception 'PROCESSING_JOB_CLAIM_LOST' using errcode = '55000';
  end if;
  if p_error_code !~ '^[A-Z0-9_]{3,100}$' then
    raise exception 'PROCESSING_INVALID_ERROR_CODE' using errcode = '22023';
  end if;

  v_next_status := case
    when p_retryable and v_job.attempt_count < v_job.max_attempts then 'queued'
    else 'failed'
  end;

  update public.processing_jobs as job
  set status = v_next_status,
      locked_at = null,
      lock_token = null,
      completed_at = case when v_next_status = 'failed' then now() else null end,
      last_error_code = p_error_code,
      last_error_message = left(coalesce(p_error_message, 'Processing failed.'), 500)
  where job.id = v_job.id;

  update public.documents as document
  set processing_status = case
        when v_next_status = 'queued' then 'queued'::public.document_status
        else 'failed'::public.document_status
      end,
      processing_error_code = p_error_code,
      processing_error_message = left(coalesce(p_error_message, 'Processing failed.'), 500)
  where document.id = v_job.document_id and document.user_id = v_job.user_id;

  return v_next_status::text;
end;
$$;

revoke execute on function public.claim_document_processing_job(integer, uuid)
  from public, anon, authenticated;
revoke execute on function public.renew_document_processing_job(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.complete_document_processing_job(uuid, uuid, jsonb, text, text)
  from public, anon, authenticated;
revoke execute on function public.fail_document_processing_job(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;

grant execute on function public.claim_document_processing_job(integer, uuid) to service_role;
grant execute on function public.renew_document_processing_job(uuid, uuid) to service_role;
grant execute on function public.complete_document_processing_job(uuid, uuid, jsonb, text, text)
  to service_role;
grant execute on function public.fail_document_processing_job(uuid, uuid, text, text, boolean)
  to service_role;
