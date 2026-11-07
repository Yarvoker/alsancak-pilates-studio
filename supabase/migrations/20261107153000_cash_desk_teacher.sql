-- Attribute cash-desk actions to a teacher.
-- Old cash receipts stay valid with a null teacher_id.
-- Manual balance changes are recorded beside the credit ledger;
-- existing credit rows are not rewritten.

alter table public.cash_receipts
  add column teacher_id uuid references public.teachers (id);

create index cash_receipts_teacher_id_idx
  on public.cash_receipts (teacher_id)
  where teacher_id is not null;

create table public.manual_credit_adjustments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id),
  previous_remaining integer not null check (previous_remaining >= 0),
  new_remaining integer not null check (new_remaining >= 0 and new_remaining <= 500),
  created_at timestamptz not null default now()
);

create index manual_credit_adjustments_member_idx
  on public.manual_credit_adjustments (member_id, created_at desc);

alter table public.manual_credit_adjustments enable row level security;
revoke all on table public.manual_credit_adjustments from public, anon, authenticated;

drop function if exists public.admin_set_remaining_lessons(text, text, uuid, integer);

create function public.admin_set_remaining_lessons(
  p_username text,
  p_password text,
  p_member_id uuid,
  p_remaining integer,
  p_teacher_id uuid
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
    'credits_remaining', v_next
  );
end;
$$;

drop function if exists public.admin_record_cash_payment(text, text, uuid, numeric, integer, date, text);

create function public.admin_record_cash_payment(
  p_username text,
  p_password text,
  p_member_id uuid,
  p_amount numeric,
  p_lesson_count integer,
  p_received_on date,
  p_note text,
  p_teacher_id uuid
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

  if v_lessons > 0 then
    v_remaining := public.adjust_member_credits(p_member_id, v_lessons);
  else
    select coalesce(sum(credits_remaining), 0)::integer
    into v_remaining
    from public.member_packages
    where member_id = p_member_id;
  end if;

  insert into public.cash_receipts (member_id, amount, lesson_count, note, received_on, teacher_id)
  values (p_member_id, round(p_amount, 2), v_lessons, v_note, p_received_on, p_teacher_id)
  returning id into v_receipt_id;

  return jsonb_build_object(
    'id', v_receipt_id,
    'amount', round(p_amount, 2),
    'lesson_count', v_lessons,
    'received_on', p_received_on,
    'teacher_id', p_teacher_id,
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
      'created_at', r.created_at,
      'teacher_id', r.teacher_id,
      'teacher_name', t.full_name
    ) as item
    from public.cash_receipts r
    join public.members m on m.id = r.member_id
    left join public.teachers t on t.id = r.teacher_id
    order by r.received_on desc, r.created_at desc
    limit 40
  ) listed;

  return v_rows;
end;
$$;

revoke all on function public.admin_set_remaining_lessons(text, text, uuid, integer, uuid) from public;
revoke all on function public.admin_record_cash_payment(text, text, uuid, numeric, integer, date, text, uuid) from public;
revoke all on function public.admin_list_cash_receipts(text, text) from public;

grant execute on function public.admin_set_remaining_lessons(text, text, uuid, integer, uuid) to anon, authenticated, service_role;
grant execute on function public.admin_record_cash_payment(text, text, uuid, numeric, integer, date, text, uuid) to anon, authenticated, service_role;
grant execute on function public.admin_list_cash_receipts(text, text) to anon, authenticated, service_role;
