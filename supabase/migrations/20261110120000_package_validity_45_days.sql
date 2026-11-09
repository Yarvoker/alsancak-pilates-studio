-- Package lessons stay usable through the Istanbul calendar day 45 days after starts_on.
-- Trial lessons keep the separate 30-day window in sync_member_package_fields.

create or replace function public.package_expires_at(p_starts_on date)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when p_starts_on is null then null::timestamptz
    else (((p_starts_on + 46)::timestamp) - interval '1 microsecond') at time zone 'Europe/Istanbul'
  end;
$$;

revoke all on function public.package_expires_at(date) from public;
grant execute on function public.package_expires_at(date) to service_role;

update public.member_packages mp
set expires_at = public.package_expires_at(mp.starts_on)
from public.packages p
where p.id = mp.package_id
  and p.name is distinct from 'Ücretsiz Deneme Dersi'
  and mp.starts_on is not null
  and mp.expires_at = ((((mp.starts_on + 31)::timestamp) - interval '1 microsecond') at time zone 'Europe/Istanbul');
