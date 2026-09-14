-- Audit history is append-only for every application role.
revoke insert, update, delete, truncate on table public.audit_logs from anon, authenticated;
revoke update, delete, truncate on table public.audit_logs from service_role;
grant select, insert on table public.audit_logs to service_role;
