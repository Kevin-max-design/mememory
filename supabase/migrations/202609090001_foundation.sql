-- Patient-owned data foundation. Apply transactionally to development first.
create type public.document_status as enum ('uploaded','queued','processing','needs_review','completed','failed');
create type public.review_status as enum ('extracted','approved','corrected','rejected');
create type public.job_status as enum ('queued','processing','completed','failed');
create type public.record_kind as enum ('diagnosis','medication','lab','allergy','procedure','vital','doctor_note');

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '', date_of_birth date, blood_group text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.documents (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 original_filename text not null check (length(original_filename) between 1 and 255), display_name text not null,
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 file_size bigint not null check(file_size > 0 and file_size <= 20971520),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), storage_path text not null unique,
 normalized_storage_path text, document_type text, event_date date,
 processing_status public.document_status not null default 'uploaded',
 processing_error_code text, processing_error_message text,
 ocr_provider text, ocr_version text, extraction_provider text, extraction_version text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,user_id),
 check(storage_path ~ ('^' || user_id::text || '/' || id::text || '/original/[a-f0-9-]+\.(pdf|jpg|png|webp)$')),
 check(normalized_storage_path is null or normalized_storage_path ~ ('^' || user_id::text || '/' || id::text || '/normalized/[a-f0-9.-]+$'))
);
create table public.document_pages (
 id uuid primary key default gen_random_uuid(), document_id uuid not null, user_id uuid not null,
 page_number integer not null check(page_number > 0), width integer not null check(width > 0),
 height integer not null check(height > 0), rotation integer not null default 0,
 skew_angle real not null default 0, native_text_used boolean not null,
 created_at timestamptz not null default now(), unique(document_id,page_number), unique(id,document_id,user_id),
 foreign key(document_id,user_id) references public.documents(id,user_id) on delete cascade
);
create table public.document_text_blocks (
 id uuid primary key default gen_random_uuid(), document_id uuid not null, page_id uuid not null, user_id uuid not null,
 block_index integer not null check(block_index >= 0), text text not null,
 confidence real check(confidence between 0 and 1), bbox jsonb,
 source_type text not null check(source_type in ('native_pdf','ocr')),
 search_vector tsvector generated always as (to_tsvector('simple',text)) stored,
 created_at timestamptz not null default now(), unique(page_id,block_index), unique(id,document_id,user_id),
 foreign key(page_id,document_id,user_id) references public.document_pages(id,document_id,user_id) on delete cascade
);
create table public.medical_records (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, document_id uuid not null,
 record_type public.record_kind not null, event_date date,
 confidence real not null check(confidence between 0 and 1), review_status public.review_status not null default 'extracted',
 source_page_number integer not null check(source_page_number > 0),
 source_block_ids uuid[] not null check(cardinality(source_block_ids) > 0),
 source_text text not null check(length(source_text) > 0), extraction_method text not null,
 extraction_version text not null, fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(document_id,fingerprint), unique(id,user_id), unique(id,document_id,user_id),
 foreign key(document_id,user_id) references public.documents(id,user_id) on delete cascade,
 foreign key(document_id,source_page_number) references public.document_pages(document_id,page_number) on delete cascade
);
-- Array provenance is checked against the same document, owner, and page.
create function public.validate_record_sources() returns trigger language plpgsql set search_path = '' as $$
begin
 if exists(select 1 from unnest(new.source_block_ids) b(id) where not exists (
   select 1 from public.document_text_blocks t join public.document_pages p on p.id=t.page_id
   where t.id=b.id and t.document_id=new.document_id and t.user_id=new.user_id and p.page_number=new.source_page_number
 )) then raise exception 'PROVENANCE_INVALID' using errcode='23514'; end if;
 return new;
end; $$;
create trigger validate_record_sources before insert or update on public.medical_records
 for each row execute function public.validate_record_sources();

create table public.diagnoses (
 id uuid primary key default gen_random_uuid(), medical_record_id uuid not null unique, user_id uuid not null,
 name text not null, code text, diagnosed_at date, status text,
 foreign key(medical_record_id,user_id) references public.medical_records(id,user_id) on delete cascade
);
create table public.medications (
 id uuid primary key default gen_random_uuid(), medical_record_id uuid not null unique, user_id uuid not null,
 name text not null, generic_name text, dose text, dose_unit text, route text, frequency text, duration text,
 start_date date, end_date date, status text,
 foreign key(medical_record_id,user_id) references public.medical_records(id,user_id) on delete cascade,
 check(end_date is null or start_date is null or end_date >= start_date)
);
create table public.lab_results (
 id uuid primary key default gen_random_uuid(), medical_record_id uuid not null unique, user_id uuid not null,
 test_name text not null, original_value text not null, numeric_value numeric, unit text,
 reference_range text, flag text, specimen text, collected_at date,
 foreign key(medical_record_id,user_id) references public.medical_records(id,user_id) on delete cascade
);
create table public.allergies (
 id uuid primary key default gen_random_uuid(), medical_record_id uuid not null unique, user_id uuid not null,
 allergen text not null, reaction text, severity text, status text,
 foreign key(medical_record_id,user_id) references public.medical_records(id,user_id) on delete cascade
);
create table public.procedures (
 id uuid primary key default gen_random_uuid(), medical_record_id uuid not null unique, user_id uuid not null,
 procedure_name text not null, performed_at date, notes text,
 foreign key(medical_record_id,user_id) references public.medical_records(id,user_id) on delete cascade
);
create table public.vitals (
 id uuid primary key default gen_random_uuid(), medical_record_id uuid not null unique, user_id uuid not null,
 measurement_type text not null check(measurement_type in ('blood_pressure','heart_rate','temperature','respiratory_rate','oxygen_saturation','height','weight','BMI','other')),
 label text not null, original_value text not null, numeric_value numeric, secondary_value numeric, unit text, measured_at timestamptz,
 foreign key(medical_record_id,user_id) references public.medical_records(id,user_id) on delete cascade
);
create table public.doctor_notes (
 id uuid primary key default gen_random_uuid(), medical_record_id uuid not null unique, user_id uuid not null, text text not null,
 foreign key(medical_record_id,user_id) references public.medical_records(id,user_id) on delete cascade
);
create table public.medical_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 document_id uuid, event_type text not null, title text not null, description text, event_date date not null,
 date_is_estimated boolean not null default false, source_record_id uuid unique,
 created_at timestamptz not null default now(),
 foreign key(document_id,user_id) references public.documents(id,user_id) on delete cascade,
 foreign key(source_record_id,user_id) references public.medical_records(id,user_id) on delete cascade,
 foreign key(source_record_id,document_id,user_id) references public.medical_records(id,document_id,user_id) on delete cascade,
 check(source_record_id is null or document_id is not null)
);
create table public.emergency_profiles (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
 enabled boolean not null default false, full_name text, blood_group text, allergies_summary text,
 medications_summary text, conditions_summary text, emergency_contacts jsonb not null default '[]', warnings text,
 enabled_fields text[] not null default '{}', token_hash text unique check(token_hash ~ '^[a-f0-9]{64}$'),
 updated_at timestamptz not null default now(), check(not enabled or token_hash is not null),
 check(enabled_fields <@ array['full_name','blood_group','allergies_summary','medications_summary','conditions_summary','emergency_contacts','warnings']::text[]),
 check(jsonb_typeof(emergency_contacts)='array')
);
create table public.share_links (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'), expires_at timestamptz not null,
 revoked_at timestamptz, access_code_hash text, access_count integer not null default 0 check(access_count >= 0),
 last_accessed_at timestamptz, created_at timestamptz not null default now(), unique(id,user_id),
 check(expires_at > created_at)
);
create table public.share_link_documents (
 share_link_id uuid not null, document_id uuid not null, user_id uuid not null,
 primary key(share_link_id,document_id),
 foreign key(share_link_id,user_id) references public.share_links(id,user_id) on delete cascade,
 foreign key(document_id,user_id) references public.documents(id,user_id) on delete cascade
);
create table public.processing_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, document_id uuid not null,
 job_type text not null check(job_type in ('analyze','reprocess')), status public.job_status not null default 'queued',
 attempt_count integer not null default 0 check(attempt_count >= 0), max_attempts integer not null default 3 check(max_attempts between 1 and 10),
 locked_at timestamptz, lock_token uuid, started_at timestamptz, completed_at timestamptz,
 last_error_code text, last_error_message text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(document_id,user_id) references public.documents(id,user_id) on delete cascade,
 check(attempt_count <= max_attempts)
);
create unique index one_active_job on public.processing_jobs(document_id) where status in ('queued','processing');
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
 action text not null, resource_type text not null, resource_id uuid,
 metadata jsonb not null default '{}', ip_hash text, created_at timestamptz not null default now(),
 check(jsonb_typeof(metadata)='object'), check(octet_length(metadata::text) <= 2048)
);

-- RLS and grants are explicit. System-derived data is readable by its owner;
-- writes go through validated server workflows, not unrestricted client mutations.
do $$
declare t text;
begin
 foreach t in array array['documents','document_pages','document_text_blocks','medical_records','diagnoses','medications','lab_results','allergies','procedures','vitals','medical_events','doctor_notes','emergency_profiles','share_links','share_link_documents','processing_jobs','audit_logs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy owner_select on public.%I for select to authenticated using (user_id=(select auth.uid()))',t);
  execute format('create index on public.%I(user_id)',t);
 end loop;
 foreach t in array array['documents','document_pages','document_text_blocks','medical_records','medical_events','processing_jobs'] loop
  if t <> 'documents' then
   execute format('create index on public.%I(document_id)',t);
  end if;
 end loop;
 foreach t in array array['profiles','documents','medical_records','emergency_profiles','processing_jobs'] loop
  execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',t);
 end loop;
end $$;
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select,update on public.profiles to authenticated;
grant all on public.profiles to service_role;
create policy owner_select on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy owner_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));

create index documents_event_date on public.documents(user_id,event_date);
create index records_event_date on public.medical_records(user_id,event_date);
create index events_event_date on public.medical_events(user_id,event_date);
create index documents_status on public.documents(processing_status);
create index jobs_queue on public.processing_jobs(status,created_at);
create index jobs_stale on public.processing_jobs(locked_at) where status='processing';
create index shares_expiry on public.share_links(expires_at) where revoked_at is null;
create index blocks_search on public.document_text_blocks using gin(search_vector);
create index documents_name_search on public.documents using gin(to_tsvector('simple',display_name));
create index records_source_search on public.medical_records using gin(to_tsvector('simple',source_text));

create function public.bootstrap_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id) values(new.id); return new; end; $$;
create trigger bootstrap_profile after insert on auth.users for each row execute function public.bootstrap_profile();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('medical-records','medical-records',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp']);
-- Originals are written only by server upload orchestration. Client cannot replace them.
create policy medmemory_owner_read on storage.objects for select to authenticated using (
 bucket_id='medical-records' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.documents d where d.user_id=(select auth.uid()) and (d.storage_path=name or d.normalized_storage_path=name))
);
revoke execute on function public.touch_updated_at() from public,anon,authenticated;
revoke execute on function public.validate_record_sources() from public,anon,authenticated;
revoke execute on function public.bootstrap_profile() from public,anon,authenticated;
