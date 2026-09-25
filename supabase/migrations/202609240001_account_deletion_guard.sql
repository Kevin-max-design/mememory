-- Serialize document creation with account erasure so Storage cannot outlive its owner.
alter table public.profiles
  add column deletion_requested_at timestamptz;

-- Keep the deletion marker server-controlled while preserving ordinary profile edits.
revoke update on public.profiles from authenticated;
grant update(full_name, date_of_birth, blood_group) on public.profiles to authenticated;

create function public.guard_document_owner_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deletion_requested_at timestamptz;
begin
  select p.deletion_requested_at
    into v_deletion_requested_at
    from public.profiles p
    where p.id = new.user_id
    for share;

  if not found or v_deletion_requested_at is not null then
    raise exception 'ACCOUNT_DELETION_PENDING' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger guard_document_owner_active
before insert on public.documents
for each row execute function public.guard_document_owner_active();

revoke execute on function public.guard_document_owner_active() from public, anon, authenticated;
grant execute on function public.guard_document_owner_active() to service_role;
