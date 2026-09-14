-- Atomic, privacy-safe fixed-window rate limits shared by all web instances.
create table public.rate_limit_buckets (
  scope text not null check (scope in ('login','signup','verification','upload','search','ask','ask_duplicate','preview')),
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (scope,key_hash)
);
alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from public,anon,authenticated;
grant select,insert,update,delete on table public.rate_limit_buckets to service_role;
create index rate_limit_buckets_updated_at on public.rate_limit_buckets(updated_at);

create function public.check_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean,retry_after_seconds integer,remaining integer,first_denial boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window timestamptz;
  v_count integer;
begin
  if p_scope not in ('login','signup','verification','upload','search','ask','ask_duplicate','preview')
     or p_key_hash !~ '^[a-f0-9]{64}$'
     or p_limit not between 1 and 1000
     or p_window_seconds not between 1 and 86400 then
    raise exception 'RATE_LIMIT_INVALID_ARGUMENT' using errcode='22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);
  delete from public.rate_limit_buckets
  where ctid in (
    select ctid from public.rate_limit_buckets
    where updated_at < v_now - interval '7 days'
    order by updated_at limit 100
  );
  insert into public.rate_limit_buckets(scope,key_hash,window_start,request_count,updated_at)
  values(p_scope,p_key_hash,v_window,1,v_now)
  on conflict(scope,key_hash) do update set
    window_start=case when rate_limit_buckets.window_start < v_window then v_window else rate_limit_buckets.window_start end,
    request_count=case when rate_limit_buckets.window_start < v_window then 1 else rate_limit_buckets.request_count+1 end,
    updated_at=v_now
  returning request_count into v_count;
  return query select
    v_count <= p_limit,
    case when v_count <= p_limit then 0 else greatest(1,ceil(extract(epoch from (v_window + make_interval(secs=>p_window_seconds) - v_now)))::integer) end,
    greatest(0,p_limit-v_count),
    v_count=p_limit+1;
end;
$$;
revoke execute on function public.check_rate_limit(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.check_rate_limit(text,text,integer,integer) to service_role;
