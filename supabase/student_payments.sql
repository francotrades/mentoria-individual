-- FrancoTrades Mentoria
-- Libera ao próprio mentorado a leitura do financeiro e configura o PIX.

alter table public.mentorship_settings
  add column if not exists pix_name text,
  add column if not exists pix_key text;

update public.mentorship_settings
set
  pix_name = 'Franco Trades',
  pix_key = '0b3aead6-081c-4c89-88d5-ad5bd784163b',
  updated_at = now()
where id = 1;

drop policy if exists "student_select_own_mentorship_financial" on public.mentorship_financials;

create policy "student_select_own_mentorship_financial"
on public.mentorship_financials
for select
to authenticated
using (
  profile_id = auth.uid()
);

drop policy if exists "student_select_own_mentorship_payments" on public.mentorship_payments;

create policy "student_select_own_mentorship_payments"
on public.mentorship_payments
for select
to authenticated
using (
  exists (
    select 1
    from public.mentorship_financials f
    where
      f.id = mentorship_payments.mentorship_id
      and f.profile_id = auth.uid()
  )
);

drop policy if exists "authenticated_select_pix_settings" on public.mentorship_settings;

create policy "authenticated_select_pix_settings"
on public.mentorship_settings
for select
to authenticated
using (true);
