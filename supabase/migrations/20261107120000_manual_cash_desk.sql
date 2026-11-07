-- Manual remaining-lesson edits and cash receipts for the studio desk.
-- Credit changes stay on the ledger so package balances still reconcile.

alter table public.credit_ledger drop constraint credit_ledger_check;

alter table public.credit_ledger add constraint credit_ledger_check check (
  (reason = 'assign' and delta > 0)
  or (reason = 'book' and delta < 0)
  or (reason = 'refund' and delta > 0)
  or (reason = 'burn' and delta = 0)
  or (reason = 'adjust' and delta <> 0)
);

insert into public.packages (name, credit_count, session_type)
select 'Elle giriş', 1, null
where not exists (
  select 1 from public.packages where name = 'Elle giriş'
);

create table public.cash_receipts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0 and amount <= 1000000),
  lesson_count integer not null default 0 check (lesson_count >= 0 and lesson_count <= 500),
  note text,
  received_on date not null,
  created_at timestamptz not null default now(),
  check (note is null or char_length(note) <= 400),
  check (received_on >= date '2020-01-01')
);

create index cash_receipts_received_on_idx
  on public.cash_receipts (received_on desc, created_at desc);

alter table public.cash_receipts enable row level security;
revoke all on table public.cash_receipts from public, anon, authenticated;

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

      insert into public.member_packages (
        member_id,
        package_id,
        credits_total,
        credits_remaining,
        starts_on,
        activated_at,
        activation_source
      )
      values (
        p_member_id,
        v_package_id,
        p_delta,
        p_delta,
        (timezone('Europe/Istanbul', now()))::date,
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
        activation_source = coalesce(activation_source, 'desk')
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

create or replace function public.admin_set_remaining_lessons(
  p_username text,
  p_password text,
  p_member_id uuid,
  p_remaining integer
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

  return jsonb_build_object(
    'member_id', p_member_id,
    'previous', v_current,
    'credits_remaining', v_next
  );
end;
$$;

create or replace function public.admin_record_cash_payment(
  p_username text,
  p_password text,
  p_member_id uuid,
  p_amount numeric,
  p_lesson_count integer,
  p_received_on date,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lessons integer := coalesce(p_lesson_count, 0);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
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
    v_remaining := public.adjust_member_credits(p_member_id, v_lessons);
  else
    select coalesce(sum(credits_remaining), 0)::integer
    into v_remaining
    from public.member_packages
    where member_id = p_member_id;
  end if;

  insert into public.cash_receipts (member_id, amount, lesson_count, note, received_on)
  values (p_member_id, round(p_amount, 2), v_lessons, v_note, p_received_on)
  returning id into v_receipt_id;

  return jsonb_build_object(
    'id', v_receipt_id,
    'amount', round(p_amount, 2),
    'lesson_count', v_lessons,
    'received_on', p_received_on,
    'credits_remaining', v_remaining
  );
end;
$$;

create or replace function public.admin_list_cash_receipts(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  select coalesce(jsonb_agg(item order by item->>'received_on' desc, item->>'created_at' desc), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'id', r.id,
      'member_id', m.id,
      'full_name', m.full_name,
      'phone', m.phone,
      'amount', r.amount,
      'lesson_count', r.lesson_count,
      'note', r.note,
      'received_on', r.received_on,
      'created_at', r.created_at
    ) as item
    from public.cash_receipts r
    join public.members m on m.id = r.member_id
    order by r.received_on desc, r.created_at desc
    limit 40
  ) listed;

  return v_rows;
end;
$$;

revoke all on function public.adjust_member_credits(uuid, integer) from public, anon, authenticated;
revoke all on function public.admin_set_remaining_lessons(text, text, uuid, integer) from public;
revoke all on function public.admin_record_cash_payment(text, text, uuid, numeric, integer, date, text) from public;
revoke all on function public.admin_list_cash_receipts(text, text) from public;

grant execute on function public.admin_set_remaining_lessons(text, text, uuid, integer) to anon, authenticated, service_role;
grant execute on function public.admin_record_cash_payment(text, text, uuid, numeric, integer, date, text) to anon, authenticated, service_role;
grant execute on function public.admin_list_cash_receipts(text, text) to anon, authenticated, service_role;
