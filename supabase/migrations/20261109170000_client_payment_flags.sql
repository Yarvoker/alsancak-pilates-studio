create or replace function public.admin_list_clients(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_today date := (timezone('Europe/Istanbul', now()))::date;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  select coalesce(jsonb_agg(item order by item->>'full_name'), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'id', m.id,
      'full_name', m.full_name,
      'phone', m.phone,
      'sign_in_method', public.member_sign_in_method(m.user_id),
      'active_package', active.name,
      'package_starts_on', active.starts_on,
      'credits_remaining', bal.credits_remaining,
      'packages', coalesce(open_packs.packages, '[]'::jsonb),
      'has_cash', exists (
        select 1 from public.cash_receipts r where r.member_id = m.id
      ),
      'has_site_card', m.user_id is not null and (
        exists (
          select 1 from public.payments p
          where p.member_id = m.id and p.status = 'paid'
        )
        or exists (
          select 1 from public.member_packages mp
          where mp.member_id = m.id and mp.activation_source = 'iyzico'
        )
      ),
      'has_external_card', m.user_id is null and (
        exists (
          select 1 from public.payments p
          where p.member_id = m.id and p.status = 'paid'
        )
        or exists (
          select 1 from public.member_packages mp
          where mp.member_id = m.id and mp.activation_source = 'iyzico'
        )
      )
    ) as item
    from public.members m
    left join lateral (
      select p.name, mp.starts_on
      from public.member_packages mp
      join public.packages p on p.id = mp.package_id
      where mp.member_id = m.id
        and mp.credits_remaining > 0
        and coalesce((timezone('Europe/Istanbul', mp.expires_at))::date, mp.expires_on) >= v_today
      order by
        case when mp.starts_on <= v_today then 0 else 1 end,
        mp.starts_on,
        mp.created_at
      limit 1
    ) active on true
    left join lateral (
      select coalesce(sum(mp.credits_remaining), 0)::integer as credits_remaining
      from public.member_packages mp
      where mp.member_id = m.id
    ) bal on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', mp.id,
          'name', p.name,
          'credits_remaining', mp.credits_remaining,
          'credits_total', mp.credits_total,
          'starts_on', mp.starts_on,
          'expires_on', coalesce((timezone('Europe/Istanbul', mp.expires_at))::date, mp.expires_on),
          'session_type', p.session_type
        )
        order by
          case
            when coalesce((timezone('Europe/Istanbul', mp.expires_at))::date, mp.expires_on) >= v_today then 0
            else 1
          end,
          mp.starts_on,
          mp.created_at
      ) as packages
      from public.member_packages mp
      join public.packages p on p.id = mp.package_id
      where mp.member_id = m.id
    ) open_packs on true
  ) listed;

  return v_rows;
end;
$$;

revoke all on function public.admin_list_clients(text, text) from public;
grant execute on function public.admin_list_clients(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
