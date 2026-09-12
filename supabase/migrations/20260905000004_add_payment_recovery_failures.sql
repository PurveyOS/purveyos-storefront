-- Compensation record for the rare case where a Stripe charge succeeds but
-- storefront order persistence subsequently fails (e.g. DB outage). Lets
-- support/ops reconcile and confirms refunds were attempted.
begin;

create table if not exists public.payment_recovery_failures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  checkout_attempt_id text,
  stripe_payment_intent_id text not null,
  amount_cents integer not null check (amount_cents >= 0),
  failure_reason text not null,
  refund_id text,
  refund_status text not null default 'not_attempted'
    check (refund_status in ('not_attempted', 'succeeded', 'failed')),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_recovery_failures_tenant_idx
  on public.payment_recovery_failures (tenant_id, resolved);

alter table public.payment_recovery_failures enable row level security;

drop policy if exists "Tenant members can read payment recovery failures" on public.payment_recovery_failures;
create policy "Tenant members can read payment recovery failures"
  on public.payment_recovery_failures for select
  to authenticated
  using (
    tenant_id in (
      select profiles.tenant_id from public.profiles where profiles.id = auth.uid()
    )
  );

commit;
