-- New cash entries can be group or private. Existing receipts and packages stay as they are.

alter table public.cash_receipts
  add column if not exists session_type public.session_type;

create or replace function public.admin_record_cash_payment(
  p_username text,
  p_password text,
  p_member_id uuid,
  p_amount numeric,
  p_lesson_count integer,
  p_received_on date,
  p_note text,
  p_teacher_id uuid,
  p_session_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lessons integer := coalesce(p_lesson_count, 0);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_type public.session_type;
  v_package_name text;
  v_package_id uuid;
  v_manual_id uuid;
  v_start date;
  v_receipt_id uuid;
  v_remaining integer;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'Tutar geçersiz';
  end if;

  if v_lessons < 0 or v_lessons > 500 then
    raise exception 'Ders adedi geçersiz';
  end if;

  if p_received_on is null
    or p_received_on < date '2020-01-01'
    or p_received_on > (timezone('Europe/Istanbul', now()))::date
  then
    raise exception 'Tahsilat tarihi geçersiz';
  end if;

  if v_note is not null and char_length(v_note) > 400 then
    raise exception 'Not çok uzun';
  end if;

  if p_teacher_id is null or not exists (
    select 1
    from public.teachers
    where id = p_teacher_id
      and active
  ) then
    raise exception 'Öğretmen seç';
  end if;

  if p_session_type is null or p_session_type not in ('group', 'private') then
    raise exception 'Grup veya özel ders seç';
  end if;

  v_type := p_session_type::public.session_type;
  v_package_name := case v_type
    when 'group' then 'Elle giriş grup'
    when 'private' then 'Elle giriş özel'
  end;

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

  if v_lessons > 0 then
    select mp.id
    into v_manual_id
    from public.member_packages mp
    join public.packages p on p.id = mp.package_id
    where mp.member_id = p_member_id
      and p.name = v_package_name
      and p.session_type = v_type
    order by mp.created_at desc
    limit 1;

    if v_manual_id is null then
      select id
      into v_package_id
      from public.packages
      where name = v_package_name
        and session_type = v_type;

      if v_package_id is null then
        insert into public.packages (name, credit_count, session_type)
        values (v_package_name, 1, v_type)
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
        v_lessons,
        v_lessons,
        v_start,
        public.package_expires_at(v_start),
        now(),
        'desk'
      )
      returning id into v_manual_id;

      insert into public.credit_ledger (member_package_id, delta, reason)
      values (v_manual_id, v_lessons, 'assign');
    else
      update public.member_packages
      set
        credits_remaining = credits_remaining + v_lessons,
        credits_total = credits_total + v_lessons,
        activated_at = coalesce(activated_at, now()),
        activation_source = coalesce(activation_source, 'desk'),
        starts_on = coalesce(starts_on, (timezone('Europe/Istanbul', now()))::date),
        expires_at = public.package_expires_at(coalesce(starts_on, (timezone('Europe/Istanbul', now()))::date))
      where id = v_manual_id;

      insert into public.credit_ledger (member_package_id, delta, reason)
      values (v_manual_id, v_lessons, 'adjust');
    end if;

    perform public.assert_package_balance(v_manual_id);
  end if;

  select coalesce(sum(credits_remaining), 0)::integer
  into v_remaining
  from public.member_packages
  where member_id = p_member_id;

  insert into public.cash_receipts (member_id, amount, lesson_count, note, received_on, teacher_id, session_type)
  values (p_member_id, round(p_amount, 2), v_lessons, v_note, p_received_on, p_teacher_id, v_type)
  returning id into v_receipt_id;

  return jsonb_build_object(
    'id', v_receipt_id,
    'amount', round(p_amount, 2),
    'lesson_count', v_lessons,
    'received_on', p_received_on,
    'teacher_id', p_teacher_id,
    'session_type', v_type,
    'credits_remaining', v_remaining
  );
end;
$$;

revoke all on function public.admin_record_cash_payment(text, text, uuid, numeric, integer, date, text, uuid, text) from public;
grant execute on function public.admin_record_cash_payment(text, text, uuid, numeric, integer, date, text, uuid, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
