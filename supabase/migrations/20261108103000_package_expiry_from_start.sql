-- Lessons expire on the Istanbul calendar date of starts_on plus 30 days.
-- Credits stay on the ledger. An expired package remains visible and cannot be booked.

create or replace function public.package_expires_at(p_starts_on date)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when p_starts_on is null then null::timestamptz
    else (((p_starts_on + 31)::timestamp) - interval '1 microsecond') at time zone 'Europe/Istanbul'
  end;
$$;

revoke all on function public.package_expires_at(date) from public;
grant execute on function public.package_expires_at(date) to service_role;
