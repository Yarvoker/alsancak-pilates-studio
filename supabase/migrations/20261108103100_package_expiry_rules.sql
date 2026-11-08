-- Apply the 30-day start-date expiry to manual lessons, card activation, and existing packages.

create or replace function public.adjust_member_credits(p_member_id uuid, p_delta integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_package_id uuid;
  v_manual_id uuid;
  v_left integer;
  v_take integer;
  v_start date;
  r record;
begin
  if p_delta = 0 then
    select coalesce(sum(credits_remaining), 0)::integer
    into v_current
    from public.member_packages
    where member_id = p_member_id;
    return v_current;
  end if;

  if p_delta > 0 then
    select mp.id
    into v_manual_id
    from public.member_packages mp
    join public.packages p on p.id = mp.package_id
    where mp.member_id = p_member_id
      and p.name = 'Elle giriş'
    order by mp.created_at desc
    limit 1;

    if v_manual_id is null then
      select id
      into v_package_id
      from public.packages
      where name = 'Elle giriş';

      if v_package_id is null then
        insert into public.packages (name, credit_count, session_type)
        values ('Elle giriş', 1, null)
        returning id into v_package_id;
      end if;

      v_start := (timezone('Europe/Istanbul', now()))::date;

      insert into public.member_packages (
        member_id,
        package_id,
        credits_total,
        credits_remaining,
        starts_on,
        expires_at,
        activated_at,
        activation_source
      )
      values (
        p_member_id,
        v_package_id,
        p_delta,
        p_delta,
        v_start,
        public.package_expires_at(v_start),
        now(),
        'desk'
      )
      returning id into v_manual_id;

      insert into public.credit_ledger (member_package_id, delta, reason)
      values (v_manual_id, p_delta, 'assign');
    else
      update public.member_packages
      set
        credits_remaining = credits_remaining + p_delta,
        credits_total = credits_total + p_delta,
        activated_at = coalesce(activated_at, now()),
        activation_source = coalesce(activation_source, 'desk'),
        starts_on = coalesce(starts_on, (timezone('Europe/Istanbul', now()))::date),
        expires_at = public.package_expires_at(coalesce(starts_on, (timezone('Europe/Istanbul', now()))::date))
      where id = v_manual_id;

      insert into public.credit_ledger (member_package_id, delta, reason)
      values (v_manual_id, p_delta, 'adjust');
    end if;

    perform public.assert_package_balance(v_manual_id);
  else
    v_left := -p_delta;

    for r in
      select mp.id, mp.credits_remaining
      from public.member_packages mp
      join public.packages p on p.id = mp.package_id
      where mp.member_id = p_member_id
        and mp.credits_remaining > 0
      order by case when p.name = 'Elle giriş' then 0 else 1 end, mp.created_at desc
    loop
      exit when v_left = 0;
      v_take := least(r.credits_remaining, v_left);

      update public.member_packages
      set credits_remaining = credits_remaining - v_take
      where id = r.id;

      insert into public.credit_ledger (member_package_id, delta, reason)
      values (r.id, -v_take, 'adjust');

      perform public.assert_package_balance(r.id);
      v_left := v_left - v_take;
    end loop;

    if v_left <> 0 then
      raise exception 'Kalan ders geçersiz';
    end if;
  end if;

  select coalesce(sum(credits_remaining), 0)::integer
  into v_current
  from public.member_packages
  where member_id = p_member_id;

  return v_current;
end;
$$;

revoke all on function public.adjust_member_credits(uuid, integer) from public, anon, authenticated;

drop function if exists public.admin_set_remaining_lessons(text, text, uuid, integer, uuid);

create function public.admin_set_remaining_lessons(
  p_username text,
  p_password text,
  p_member_id uuid,
  p_remaining integer,
  p_teacher_id uuid,
  p_starts_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_next integer;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_remaining is null or p_remaining < 0 or p_remaining > 500 then
    raise exception 'Kalan ders geçersiz';
  end if;

  if p_teacher_id is null or not exists (
    select 1
    from public.teachers
    where id = p_teacher_id
      and active
  ) then
    raise exception 'Öğretmen seç';
  end if;

  perform 1
  from public.members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'Üye bulunamadı';
  end if;

  perform 1
  from public.member_packages
  where member_id = p_member_id
  for update;

  select coalesce(sum(credits_remaining), 0)::integer
  into v_current
  from public.member_packages
  where member_id = p_member_id;

  v_next := public.adjust_member_credits(p_member_id, p_remaining - v_current);

  if p_starts_on is not null then
    update public.member_packages mp
    set
      starts_on = p_starts_on,
      expires_at = public.package_expires_at(p_starts_on)
    where mp.id = (
      select mp2.id
      from public.member_packages mp2
      join public.packages p2 on p2.id = mp2.package_id
      where mp2.member_id = p_member_id
        and p2.name = 'Elle giriş'
      order by mp2.created_at desc
      limit 1
    );
  end if;

  insert into public.manual_credit_adjustments (
    member_id,
    teacher_id,
    previous_remaining,
    new_remaining
  )
  values (
    p_member_id,
    p_teacher_id,
    v_current,
    v_next
  );

  return jsonb_build_object(
    'member_id', p_member_id,
    'teacher_id', p_teacher_id,
    'previous', v_current,
    'credits_remaining', v_next,
    'starts_on', p_starts_on,
    'expires_on', case
      when p_starts_on is null then null
      else (timezone('Europe/Istanbul', public.package_expires_at(p_starts_on)))::date
    end
  );
end;
$$;

revoke all on function public.admin_set_remaining_lessons(text, text, uuid, integer, uuid, date) from public;
grant execute on function public.admin_set_remaining_lessons(text, text, uuid, integer, uuid, date) to anon, authenticated, service_role;

create or replace function public.activate_package(
  p_purchase_id uuid,
  p_paid_at timestamptz,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid timestamptz := coalesce(p_paid_at, now());
  v_starts date;
begin
  if p_source is null or p_source not in ('manual', 'iyzico') then
    raise exception 'Paket seçeneği geçersiz';
  end if;

  if p_purchase_id is null then
    raise exception 'Paket bulunamadı';
  end if;

  select starts_on
  into v_starts
  from public.member_packages
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'Paket bulunamadı';
  end if;

  if v_starts is null then
    v_starts := (timezone('Europe/Istanbul', now()))::date;
  end if;

  update public.member_packages
  set
    activated_at = v_paid,
    starts_on = v_starts,
    expires_at = public.package_expires_at(v_starts),
    activation_source = p_source
  where id = p_purchase_id
    and activated_at is null;

  if not found then
    if exists (
      select 1
      from public.member_packages
      where id = p_purchase_id
        and activated_at is not null
    ) then
      raise exception 'Paket zaten aktif';
    end if;
    raise exception 'Paket bulunamadı';
  end if;

  return p_purchase_id;
end;
$$;

revoke all on function public.activate_package(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.activate_package(uuid, timestamptz, text) to service_role;

create or replace function public.mark_iyzico_payment_paid(
  p_payment_id uuid,
  p_member_id uuid,
  p_member_package_id uuid,
  p_conversation_id text,
  p_token text,
  p_iyzico_payment_id text,
  p_amount numeric,
  p_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_credits integer;
  v_starts date;
  v_credits_after integer;
  v_starts_after date;
  v_paid timestamptz := coalesce(p_paid_at, now());
begin
  if coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'Yetkisiz';
  end if;

  if p_token is null or p_token !~ '^[0-9a-fA-F-]{16,80}$' then
    raise exception 'Ödeme üyeyle eşleşmiyor';
  end if;

  if p_iyzico_payment_id is null
    or char_length(btrim(p_iyzico_payment_id)) < 1
    or char_length(p_iyzico_payment_id) > 64
  then
    raise exception 'Ödeme üyeyle eşleşmiyor';
  end if;

  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Ödeme bulunamadı';
  end if;

  if v_payment.member_id is distinct from p_member_id
    or v_payment.member_package_id is distinct from p_member_package_id
    or v_payment.conversation_id is distinct from p_conversation_id
    or v_payment.iyzico_token is distinct from p_token
    or v_payment.currency is distinct from 'TRY'
    or v_payment.amount is distinct from round(p_amount, 2)
  then
    raise exception 'Ödeme üyeyle eşleşmiyor';
  end if;

  if not exists (
    select 1
    from public.member_packages
    where id = p_member_package_id
      and member_id = p_member_id
  ) then
    raise exception 'Ödeme üyeyle eşleşmiyor';
  end if;

  if v_payment.status = 'paid' then
    if v_payment.payment_id is not null
      and v_payment.payment_id is distinct from btrim(p_iyzico_payment_id)
    then
      raise exception 'Ödeme üyeyle eşleşmiyor';
    end if;

    return jsonb_build_object(
      'status', 'paid',
      'idempotent', true,
      'member_package_id', v_payment.member_package_id
    );
  end if;

  if v_payment.status is distinct from 'pending' then
    raise exception 'Ödeme tamamlanamadı';
  end if;

  select credits_remaining, starts_on
  into v_credits, v_starts
  from public.member_packages
  where id = p_member_package_id
    and member_id = p_member_id
  for update;

  begin
    perform public.activate_package(p_member_package_id, v_paid, 'iyzico');

    select credits_remaining, starts_on
    into v_credits_after, v_starts_after
    from public.member_packages
    where id = p_member_package_id
      and member_id = p_member_id;

    if v_credits_after is distinct from v_credits then
      raise exception 'Kredi defteri uyuşmuyor';
    end if;

    if v_starts is not null and v_starts_after is distinct from v_starts then
      raise exception 'Kredi defteri uyuşmuyor';
    end if;

    if v_starts is null
      and v_starts_after is distinct from (timezone('Europe/Istanbul', now()))::date
    then
      raise exception 'Kredi defteri uyuşmuyor';
    end if;
  exception
    when others then
      if sqlerrm like '%Paket zaten aktif%' then
        update public.payments
        set status = 'failed',
            error_message = 'Paket zaten aktif',
            updated_at = now()
        where id = p_payment_id
          and status = 'pending';

        return jsonb_build_object(
          'status', 'failed',
          'error', 'Paket zaten aktif',
          'member_package_id', p_member_package_id
        );
      end if;
      raise;
  end;

  update public.payments
  set status = 'paid',
      payment_id = btrim(p_iyzico_payment_id),
      paid_at = v_paid,
      error_message = null,
      updated_at = now()
  where id = p_payment_id
    and status = 'pending'
    and member_id = p_member_id
    and member_package_id = p_member_package_id;

  if not found then
    raise exception 'Ödeme tamamlanamadı';
  end if;

  return jsonb_build_object(
    'status', 'paid',
    'idempotent', false,
    'member_package_id', p_member_package_id
  );
end;
$$;

revoke all on function public.mark_iyzico_payment_paid(uuid, uuid, uuid, text, text, text, numeric, timestamptz)
  from public, anon, authenticated;
grant execute on function public.mark_iyzico_payment_paid(uuid, uuid, uuid, text, text, text, numeric, timestamptz)
  to service_role;

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
  set
    starts_on = p_starts_on,
    expires_at = public.package_expires_at(p_starts_on)
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
      'packages', coalesce(open_packs.packages, '[]'::jsonb)
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

create or replace function public.admin_member_dashboard(
  p_username text,
  p_password text,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_uid uuid;
  v_phone text;
  v_pending jsonb;
  v_packages jsonb;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_member_id is null or not exists (
    select 1 from public.members where id = p_member_id
  ) then
    raise exception 'Üye bulunamadı';
  end if;

  select user_id, phone
  into v_uid, v_phone
  from public.members
  where id = p_member_id;

  v_payload := public.member_dashboard_payload(p_member_id, 50);
  v_payload := jsonb_set(
    v_payload,
    '{profile,sign_in_method}',
    coalesce(to_jsonb(public.member_sign_in_method(v_uid)), 'null'::jsonb),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{profile,phone}',
    coalesce(to_jsonb(v_phone), 'null'::jsonb),
    true
  );

  select jsonb_build_object(
    'id', mp.id,
    'name', p.name,
    'credits_remaining', mp.credits_remaining,
    'credits_total', mp.credits_total,
    'starts_on', mp.starts_on
  )
  into v_pending
  from public.member_packages mp
  join public.packages p on p.id = mp.package_id
  where mp.member_id = p_member_id
    and mp.activated_at is null
    and mp.credits_remaining > 0
  order by mp.created_at desc
  limit 1;

  select coalesce(jsonb_agg(item order by item->>'starts_on', item->>'name'), '[]'::jsonb)
  into v_packages
  from (
    select jsonb_build_object(
      'id', mp.id,
      'name', p.name,
      'credits_remaining', mp.credits_remaining,
      'credits_total', mp.credits_total,
      'starts_on', mp.starts_on,
      'expires_on', coalesce((timezone('Europe/Istanbul', mp.expires_at))::date, mp.expires_on),
      'session_type', p.session_type,
      'activated_at', mp.activated_at
    ) as item
    from public.member_packages mp
    join public.packages p on p.id = mp.package_id
    where mp.member_id = p_member_id
  ) listed;

  v_payload := v_payload || jsonb_build_object(
    'pending_package', v_pending,
    'packages', coalesce(v_packages, '[]'::jsonb)
  );
  return v_payload;
end;
$$;

revoke all on function public.admin_member_dashboard(text, text, uuid) from public;
grant execute on function public.admin_member_dashboard(text, text, uuid) to anon, authenticated, service_role;

update public.member_packages mp
set expires_at = public.package_expires_at(mp.starts_on)
from public.packages p
where p.id = mp.package_id
  and mp.starts_on is not null
  and (
    mp.expires_at is null
    or p.name = 'Elle giriş'
    or mp.activation_source = 'desk'
    or (
      mp.activated_at is not null
      and p.name is distinct from 'Ücretsiz Deneme Dersi'
      and coalesce(mp.activation_source, '') is distinct from 'trial'
    )
  );

notify pgrst, 'reload schema';
