-- iyzico checkout records. No card numbers, PAN, or CVC columns.
-- Status changes only through the security definer functions below.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id),
  member_package_id uuid references public.member_packages (id),
  package_request_id uuid references public.package_requests (id),
  conversation_id text not null unique,
  iyzico_token text,
  payment_id text,
  payment_page_url text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 1000000),
  currency text not null default 'TRY' check (currency = 'TRY'),
  paid_at timestamptz,
  error_message text check (error_message is null or char_length(error_message) <= 300),
  token_set_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_token_format check (
    iyzico_token is null
    or iyzico_token ~ '^[0-9a-fA-F-]{16,80}$'
  ),
  constraint payments_page_url_host check (
    payment_page_url is null
    or (
      char_length(payment_page_url) <= 2000
      and payment_page_url ~ '^https://([a-z0-9-]+\.)*iyzipay\.com([/?#].*)?$'
    )
  )
);

create unique index payments_iyzico_token_key
  on public.payments (iyzico_token)
  where iyzico_token is not null;

create unique index payments_one_pending_package
  on public.payments (member_package_id)
  where status = 'pending' and member_package_id is not null;

create index payments_member_id_idx on public.payments (member_id);

comment on table public.payments is
  'iyzico checkout state for a package purchase. Card data is never stored.';

alter table public.payments enable row level security;

create policy payments_no_anon on public.payments
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.payments from public, anon, authenticated, service_role;

create or replace function public.iyzico_package_amount(p_package_name text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case p_package_name
    when '8''li Pilates Paketi' then 8000::numeric
    when '12''li Pilates Paketi' then 11500::numeric
    when 'Özel Ders Paketi (Private)' then 8000::numeric
    else null::numeric
  end;
$$;

revoke all on function public.iyzico_package_amount(text) from public, anon, authenticated;
grant execute on function public.iyzico_package_amount(text) to service_role;

create or replace function public.begin_iyzico_payment(
  p_user_id uuid,
  p_member_package_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members%rowtype;
  v_name text;
  v_activated timestamptz;
  v_amount numeric(12, 2);
  v_kind text;
  v_request_id uuid;
  v_payment public.payments%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'Yetkisiz';
  end if;

  if p_user_id is null or p_member_package_id is null then
    raise exception 'Yetkisiz';
  end if;

  select * into v_member
  from public.members
  where user_id = p_user_id;

  if not found then
    raise exception 'Üye bulunamadı';
  end if;

  select p.name, mp.activated_at
  into v_name, v_activated
  from public.member_packages mp
  join public.packages p on p.id = mp.package_id
  where mp.id = p_member_package_id
    and mp.member_id = v_member.id
  for update of mp;

  if not found then
    raise exception 'Ödeme üyeyle eşleşmiyor';
  end if;

  if v_activated is not null then
    raise exception 'Paket zaten aktif';
  end if;

  v_amount := public.iyzico_package_amount(v_name);
  if v_amount is null then
    raise exception 'Paket seçeneği geçersiz';
  end if;

  if exists (
    select 1
    from public.payments
    where member_package_id = p_member_package_id
      and member_id = v_member.id
      and status = 'paid'
  ) then
    raise exception 'Paket zaten aktif';
  end if;

  v_kind := case v_name
    when '8''li Pilates Paketi' then 'pack_8'
    when '12''li Pilates Paketi' then 'pack_12'
    when 'Özel Ders Paketi (Private)' then 'private_single'
    else null
  end;

  select id
  into v_request_id
  from public.package_requests
  where member_id = v_member.id
    and kind = v_kind
    and status = 'pending'
  order by created_at desc
  limit 1;

  select *
  into v_payment
  from public.payments
  where member_package_id = p_member_package_id
    and member_id = v_member.id
    and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    insert into public.payments (
      member_id,
      member_package_id,
      package_request_id,
      conversation_id,
      status,
      amount,
      currency
    )
    values (
      v_member.id,
      p_member_package_id,
      v_request_id,
      gen_random_uuid()::text,
      'pending',
      v_amount,
      'TRY'
    )
    returning * into v_payment;
  else
    update public.payments
    set amount = v_amount,
        currency = 'TRY',
        package_request_id = coalesce(package_request_id, v_request_id),
        updated_at = now()
    where id = v_payment.id
      and status = 'pending'
    returning * into v_payment;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'conversation_id', v_payment.conversation_id,
    'amount', to_char(v_payment.amount, 'FM999999990.00'),
    'currency', v_payment.currency,
    'member_id', v_member.id,
    'member_package_id', p_member_package_id,
    'package_request_id', v_payment.package_request_id,
    'package_name', v_name,
    'iyzico_token', v_payment.iyzico_token,
    'payment_page_url', v_payment.payment_page_url,
    'buyer', jsonb_build_object(
      'id', v_member.id,
      'name', v_member.first_name,
      'surname', v_member.last_name,
      'email', coalesce(
        nullif(btrim(coalesce(v_member.email, '')), ''),
        nullif(btrim(coalesce(p_email, '')), '')
      ),
      'phone', v_member.phone,
      'registered_at', v_member.created_at
    )
  );
end;
$$;

revoke all on function public.begin_iyzico_payment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.begin_iyzico_payment(uuid, uuid, text) to service_role;

create or replace function public.attach_iyzico_checkout(
  p_user_id uuid,
  p_payment_id uuid,
  p_token text,
  p_payment_page_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'Yetkisiz';
  end if;

  if p_user_id is null or p_token is null or p_token !~ '^[0-9a-fA-F-]{16,80}$' then
    raise exception 'Ödeme bağlantısı geçersiz';
  end if;

  if p_payment_page_url is not null and (
    char_length(p_payment_page_url) > 2000
    or p_payment_page_url !~ '^https://([a-z0-9-]+\.)*iyzipay\.com([/?#].*)?$'
  ) then
    raise exception 'Ödeme bağlantısı geçersiz';
  end if;

  select p.*
  into v_payment
  from public.payments p
  join public.members m on m.id = p.member_id
  where p.id = p_payment_id
    and m.user_id = p_user_id
  for update of p;

  if not found or v_payment.status is distinct from 'pending' then
    raise exception 'Ödeme bulunamadı';
  end if;

  if v_payment.iyzico_token is not null and v_payment.iyzico_token is distinct from p_token then
    raise exception 'Ödeme oturumu zaten açık';
  end if;

  if v_payment.iyzico_token = p_token then
    return;
  end if;

  update public.payments
  set iyzico_token = p_token,
      payment_page_url = p_payment_page_url,
      token_set_at = now(),
      updated_at = now()
  where id = p_payment_id
    and status = 'pending';
end;
$$;

revoke all on function public.attach_iyzico_checkout(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.attach_iyzico_checkout(uuid, uuid, text, text) to service_role;

create or replace function public.iyzico_payment_for_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'Yetkisiz';
  end if;

  if p_token is null or p_token !~ '^[0-9a-fA-F-]{16,80}$' then
    return null;
  end if;

  select *
  into v_payment
  from public.payments
  where iyzico_token = p_token;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'member_id', v_payment.member_id,
    'member_package_id', v_payment.member_package_id,
    'package_request_id', v_payment.package_request_id,
    'conversation_id', v_payment.conversation_id,
    'iyzico_token', v_payment.iyzico_token,
    'iyzico_payment_id', v_payment.payment_id,
    'status', v_payment.status,
    'amount', to_char(v_payment.amount, 'FM999999990.00'),
    'currency', v_payment.currency,
    'paid_at', v_payment.paid_at
  );
end;
$$;

revoke all on function public.iyzico_payment_for_token(text) from public, anon, authenticated;
grant execute on function public.iyzico_payment_for_token(text) to service_role;

create or replace function public.mark_iyzico_payment_failed(
  p_payment_id uuid,
  p_member_id uuid,
  p_member_package_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_error text := left(regexp_replace(coalesce(p_error, ''), '[[:cntrl:]]', '', 'g'), 300);
begin
  if coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'Yetkisiz';
  end if;

  if nullif(v_error, '') is null then
    v_error := 'Ödeme tamamlanmadı';
  end if;

  update public.payments
  set status = 'failed',
      error_message = v_error,
      updated_at = now()
  where id = p_payment_id
    and member_id = p_member_id
    and member_package_id is not distinct from p_member_package_id
    and status = 'pending';

  if not found then
    raise exception 'Ödeme üyeyle eşleşmiyor';
  end if;
end;
$$;

revoke all on function public.mark_iyzico_payment_failed(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_iyzico_payment_failed(uuid, uuid, uuid, text) to service_role;

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

    if v_credits_after is distinct from v_credits
      or v_starts_after is distinct from v_starts
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
