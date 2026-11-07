-- Let the studio desk set a manual package start date.
-- Credits and the credit ledger stay untouched.

create or replace function public.admin_set_package_start(
  p_username text,
  p_password text,
  p_member_package_id uuid,
  p_starts_on date
)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starts date;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_member_package_id is null or p_starts_on is null then
    raise exception 'Başlangıç tarihi geçersiz';
  end if;

  update public.member_packages
  set starts_on = p_starts_on
  where id = p_member_package_id
  returning starts_on into v_starts;

  if not found then
    raise exception 'Paket bulunamadı';
  end if;

  return v_starts;
end;
$$;

revoke all on function public.admin_set_package_start(text, text, uuid, date) from public;
grant execute on function public.admin_set_package_start(text, text, uuid, date) to anon, authenticated, service_role;
