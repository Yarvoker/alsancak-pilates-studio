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
