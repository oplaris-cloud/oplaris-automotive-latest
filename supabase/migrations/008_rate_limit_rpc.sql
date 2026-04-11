-- 008_rate_limit_rpc.sql — atomic rate-limit increment
--
-- Called by the status page rate limiter. Returns the new count after
-- increment. Runs as service_role via the admin client.

begin;

create or replace function public.increment_rate_limit(
  p_bucket text,
  p_window_start timestamptz
)
returns int
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_count int;
begin
  insert into private.rate_limits (bucket, window_start, count)
  values (p_bucket, p_window_start, 1)
  on conflict (bucket, window_start) do update
    set count = private.rate_limits.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

-- Only service_role calls this (via admin client). Not exposed to PostgREST.
revoke execute on function public.increment_rate_limit(text, timestamptz)
  from public, anon, authenticated;

commit;
