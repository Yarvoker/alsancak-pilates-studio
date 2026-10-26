-- Member identity is the Supabase Auth user (email OTP). Phone stays contact data.
--
-- Auth rate limit to set in the dashboard:
-- Authentication → Rate Limits → "Rate limit for sending OTPs" (rate_limit_otp) = 4 per hour.
-- Same address cannot request another code for 60 seconds
-- (Authentication → Rate Limits → "Send OTPs or magic links").
-- The built-in free mailer only delivers to organization team addresses, and its
-- project-wide email ceiling cannot be changed without custom SMTP.

alter table public.members rename column auth_user_id to user_id;

alter table public.members
  add column email text;

comment on column public.members.user_id is
  'Supabase Auth user. Linked once; a bound member cannot move to another account.';

comment on column public.members.email is
  'Contact email from the verified Auth session. Not used as a second login key.';

alter function public.cancel_reservation(uuid) rename to cancel_reservation_core;

create or replace function public.admin_mark_attendance(
  p_username text,
  p_password text,
  p_reservation_id uuid,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations;
  v_slot public.session_slots;
  v_early boolean;
  v_credits integer;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_outcome not in ('attended', 'no_show', 'cancelled') then
    raise exception 'Katılım durumu geçersiz';
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  if v_reservation.status <> 'booked' then
    raise exception 'Katılım bu kayıttan değiştirilemez';
  end if;

  select *
  into v_slot
  from public.session_slots
  where id = v_reservation.slot_id
  for update;

  perform 1
  from public.member_packages
  where id = v_reservation.member_package_id
  for update;

  if p_outcome = 'attended' then
    if v_slot.starts_at > now() then
      raise exception 'Geldi işareti ders başladıktan sonra konur';
    end if;

    update public.reservations
    set status = 'attended'
    where id = p_reservation_id;
  elsif p_outcome = 'no_show' then
    if now() < v_slot.starts_at - interval '24 hours' then
      raise exception 'No-show yalnızca derse 24 saatten az kala işaretlenir';
    end if;

    update public.reservations
    set status = 'no_show',
        cancelled_at = now()
    where id = p_reservation_id;

    if not exists (
      select 1
      from public.credit_ledger
      where reservation_id = p_reservation_id
        and reason = 'burn'
    ) then
      insert into public.credit_ledger (member_package_id, reservation_id, delta, reason)
      values (v_reservation.member_package_id, p_reservation_id, 0, 'burn');
    end if;

    perform public.assert_package_balance(v_reservation.member_package_id);
  else
    v_early := now() < v_slot.starts_at - interval '24 hours';
    perform public.cancel_reservation_core(p_reservation_id);
  end if;

  perform public.refresh_slot_occupancy(v_reservation.slot_id);

  select coalesce(sum(credits_remaining), 0)::integer
  into v_credits
  from public.member_packages
  where member_id = v_reservation.member_id;

  return jsonb_build_object(
    'reservation_id', p_reservation_id,
    'outcome', p_outcome,
    'refunded', coalesce(v_early, false),
    'credits_remaining', v_credits
  );
end;
$$;

create or replace function public.session_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
$$;

create or replace function public.claim_member_phone(p_phone text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_self uuid;
  v_existing uuid;
  v_owner uuid;
  v_email text;
begin
  if v_uid is null then
    raise exception 'Yetkisiz';
  end if;

  select id
  into v_self
  from public.members
  where user_id = v_uid;

  if v_self is not null then
    return v_self;
  end if;

  v_phone := public.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'Telefon numarası geçersiz';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_phone));

  v_existing := public.member_id_for_phone(v_phone);
  if v_existing is null then
    return null;
  end if;

  select user_id
  into v_owner
  from public.members
  where id = v_existing
  for update;

  if v_owner is not null and v_owner is distinct from v_uid then
    raise exception 'Bu telefon başka bir hesaba bağlı';
  end if;

  if v_owner is null then
    v_email := public.session_email();
    update public.members
    set user_id = v_uid,
        email = coalesce(email, v_email)
    where id = v_existing
      and user_id is null;

    if not found then
      select user_id
      into v_owner
      from public.members
      where id = v_existing;

      if v_owner is distinct from v_uid then
        raise exception 'Bu telefon başka bir hesaba bağlı';
      end if;
    end if;
  end if;

  return v_existing;
end;
$$;

create or replace function public.member_booking_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_name text;
  v_credits integer;
  v_packages jsonb;
  v_reservations jsonb;
  v_has_taken boolean;
  v_trial_used boolean;
  v_has_paid boolean;
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz';
  end if;

  select id, full_name
  into v_member_id, v_name
  from public.members
  where user_id = auth.uid();

  if v_member_id is null then
    return jsonb_build_object('member', null, 'reservations', '[]'::jsonb);
  end if;

  select coalesce(sum(credits_remaining), 0)::integer
  into v_credits
  from public.member_packages
  where member_id = v_member_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', mp.id,
        'name', p.name,
        'credits_remaining', mp.credits_remaining,
        'credits_total', mp.credits_total,
        'starts_on', mp.starts_on,
        'session_type', p.session_type
      )
      order by mp.starts_on, mp.created_at
    ),
    '[]'::jsonb
  )
  into v_packages
  from public.member_packages mp
  join public.packages p on p.id = mp.package_id
  where mp.member_id = v_member_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'session_type', s.session_type,
        'status', r.status
      )
      order by s.starts_at
    ),
    '[]'::jsonb
  )
  into v_reservations
  from public.reservations r
  join public.session_slots s on s.id = r.slot_id
  where r.member_id = v_member_id
    and r.status = 'booked'
    and s.starts_at > now();

  select f.has_taken_lessons, f.trial_used, f.has_paid_package
  into v_has_taken, v_trial_used, v_has_paid
  from public.member_lesson_flags(v_member_id) as f;

  return jsonb_build_object(
    'member', jsonb_build_object(
      'full_name', v_name,
      'credits_remaining', v_credits,
      'has_taken_lessons', v_has_taken,
      'trial_used', v_trial_used,
      'has_paid_package', v_has_paid,
      'packages', v_packages
    ),
    'reservations', v_reservations
  );
end;
$$;

create or replace function public.book_session(p_slot_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz';
  end if;

  select id
  into v_member_id
  from public.members
  where user_id = auth.uid();

  if v_member_id is null then
    raise exception 'Üye bulunamadı';
  end if;

  return public.book_session(v_member_id, p_slot_id);
end;
$$;

create or replace function public.cancel_reservation(p_reservation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz';
  end if;

  select id
  into v_member_id
  from public.members
  where user_id = auth.uid();

  if v_member_id is null then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  select member_id
  into v_owner
  from public.reservations
  where id = p_reservation_id;

  if v_owner is null or v_owner <> v_member_id then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  return public.cancel_reservation_core(p_reservation_id);
end;
$$;

create or replace function public.register_member(
  p_first_name text,
  p_last_name text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_phone text;
  v_member_id uuid;
begin
  if v_uid is null then
    raise exception 'Yetkisiz';
  end if;

  if char_length(v_first) < 2
    or char_length(v_first) > 40
    or char_length(v_last) < 2
    or char_length(v_last) > 40
    or v_first !~ '[[:alpha:]]'
    or v_last !~ '[[:alpha:]]'
    or v_first ~ '[0-9]'
    or v_last ~ '[0-9]'
  then
    raise exception 'İsim ve soyisim gerekli';
  end if;

  v_phone := public.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'Telefon numarası geçersiz';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_phone));

  if exists (select 1 from public.members where user_id = v_uid) then
    raise exception 'Bu hesap zaten bir üyeye bağlı';
  end if;

  v_member_id := public.member_id_for_phone(v_phone);
  if v_member_id is not null then
    raise exception 'Bu telefonla kayıtlı üyelik var';
  end if;

  insert into public.members (full_name, phone, user_id, email)
  values (v_first || ' ' || v_last, v_phone, v_uid, public.session_email())
  returning id into v_member_id;

  return v_member_id;
end;
$$;

create or replace function public.register_trial_lesson(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_slot_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_phone text;
  v_member_id uuid;
  v_self uuid;
  v_owner uuid;
  v_existed boolean := false;
  v_slot public.session_slots;
  v_booked integer;
  v_package_id uuid;
  v_member_package_id uuid;
  v_slot_date date;
  v_has_taken boolean;
  v_trial_used boolean;
  v_has_paid boolean;
  v_reservation_id uuid;
begin
  if v_uid is null then
    raise exception 'Yetkisiz';
  end if;

  if char_length(v_first) < 2
    or char_length(v_first) > 40
    or char_length(v_last) < 2
    or char_length(v_last) > 40
    or v_first !~ '[[:alpha:]]'
    or v_last !~ '[[:alpha:]]'
    or v_first ~ '[0-9]'
    or v_last ~ '[0-9]'
  then
    raise exception 'İsim ve soyisim gerekli';
  end if;

  v_phone := public.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'Telefon numarası geçersiz';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_phone));

  select *
  into v_slot
  from public.session_slots
  where id = p_slot_id
  for update;

  if not found then
    raise exception 'Slot bulunamadı';
  end if;

  if v_slot.session_type is distinct from 'group'::public.session_type then
    raise exception 'Deneme antrenmanı yalnız grup dersine yazılır';
  end if;

  if v_slot.status <> 'open'
    or v_slot.starts_at <= now()
    or not public.slot_is_legal(v_slot.starts_at)
  then
    raise exception 'Slot rezervasyona kapalı';
  end if;

  select count(*)::integer
  into v_booked
  from public.reservations
  where slot_id = p_slot_id
    and status = 'booked';

  if v_booked >= v_slot.capacity then
    raise exception 'Slot dolu';
  end if;

  select id
  into v_self
  from public.members
  where user_id = v_uid;

  v_member_id := public.member_id_for_phone(v_phone);

  if v_self is not null then
    if v_member_id is not null and v_member_id <> v_self then
      select user_id
      into v_owner
      from public.members
      where id = v_member_id;

      if v_owner is not null and v_owner is distinct from v_uid then
        raise exception 'Bu telefon başka bir hesaba bağlı';
      end if;

      raise exception 'Bu telefonla kayıtlı üyelik var';
    end if;

    v_member_id := v_self;
    v_existed := true;
  elsif v_member_id is not null then
    select user_id
    into v_owner
    from public.members
    where id = v_member_id
    for update;

    if v_owner is not null and v_owner is distinct from v_uid then
      raise exception 'Bu telefon başka bir hesaba bağlı';
    end if;

    if v_owner is null then
      update public.members
      set user_id = v_uid,
          email = coalesce(email, public.session_email())
      where id = v_member_id
        and user_id is null;

      if not found then
        raise exception 'Bu telefon başka bir hesaba bağlı';
      end if;
    end if;

    v_existed := true;
  else
    insert into public.members (full_name, phone, user_id, email)
    values (v_first || ' ' || v_last, v_phone, v_uid, public.session_email())
    returning id into v_member_id;
  end if;

  if v_existed then
    select f.has_taken_lessons, f.trial_used, f.has_paid_package
    into v_has_taken, v_trial_used, v_has_paid
    from public.member_lesson_flags(v_member_id) as f;

    if v_has_taken
      or v_trial_used
      or v_has_paid
      or exists (
        select 1
        from public.reservations
        where member_id = v_member_id
          and status = 'booked'
      )
    then
      raise exception 'Bu telefonla kayıtlı üyelik var';
    end if;
  end if;

  insert into public.packages (name, credit_count)
  values ('Ücretsiz Deneme Dersi', 1)
  on conflict (name) do nothing;

  select id
  into v_package_id
  from public.packages
  where name = 'Ücretsiz Deneme Dersi';

  v_slot_date := (timezone('Europe/Istanbul', v_slot.starts_at))::date;

  insert into public.member_packages (
    member_id,
    package_id,
    credits_total,
    credits_remaining,
    starts_on
  )
  values (
    v_member_id,
    v_package_id,
    1,
    1,
    v_slot_date
  )
  returning id into v_member_package_id;

  insert into public.credit_ledger (member_package_id, delta, reason)
  values (v_member_package_id, 1, 'assign');

  perform public.assert_package_balance(v_member_package_id);
  v_reservation_id := public.book_session(v_member_id, p_slot_id);
  return v_reservation_id;
end;
$$;

revoke all on function public.member_booking_state(text) from public, anon, authenticated, service_role;
drop function public.member_booking_state(text);

revoke all on function public.book_session_for_phone(text, uuid) from public, anon, authenticated, service_role;
drop function public.book_session_for_phone(text, uuid);

revoke all on function public.cancel_reservation_for_phone(text, uuid) from public, anon, authenticated, service_role;
drop function public.cancel_reservation_for_phone(text, uuid);

revoke all on function public.session_email() from public, anon, authenticated;
revoke all on function public.claim_member_phone(text) from public, anon, authenticated;
revoke all on function public.member_booking_state() from public, anon, authenticated;
revoke all on function public.book_session(uuid) from public, anon, authenticated;
revoke all on function public.cancel_reservation(uuid) from public, anon, authenticated;
revoke all on function public.cancel_reservation_core(uuid) from public, anon, authenticated;
revoke all on function public.register_member(text, text, text) from public, anon, authenticated;
revoke all on function public.register_trial_lesson(text, text, text, uuid) from public, anon, authenticated;

grant execute on function public.claim_member_phone(text) to anon, authenticated, service_role;
grant execute on function public.member_booking_state() to anon, authenticated, service_role;
grant execute on function public.book_session(uuid) to anon, authenticated, service_role;
grant execute on function public.cancel_reservation(uuid) to anon, authenticated, service_role;
grant execute on function public.cancel_reservation_core(uuid) to service_role;
grant execute on function public.register_member(text, text, text) to anon, authenticated, service_role;
grant execute on function public.register_trial_lesson(text, text, text, uuid) to anon, authenticated, service_role;

grant select on table public.members to authenticated;
grant select on table public.reservations to authenticated;

drop policy if exists members_select_own on public.members;
create policy members_select_own
  on public.members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists reservations_select_own on public.reservations;
create policy reservations_select_own
  on public.reservations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.members m
      where m.id = reservations.member_id
        and m.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';
