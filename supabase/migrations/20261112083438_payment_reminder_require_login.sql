-- O cadastro financeiro e o convite podem existir antes da definição da senha.
begin;

create or replace function mentorship_private.payment_reminder_login_ready(
  contract_id uuid,
  recipient_email text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.mentorship_financials as financial
    join auth.users as account
      on lower(account.email) = lower(btrim(financial.email))
      and (financial.profile_id is null or financial.profile_id = account.id)
    join public.profiles as profile on profile.id = account.id
    where financial.id = contract_id
      and financial.email = recipient_email
      and profile.role = 'aluno'
      and account.email_confirmed_at is not null
      and nullif(account.encrypted_password, '') is not null
  );
$$;

create or replace function public.payment_reminder_login_ready(
  contract_id uuid,
  recipient_email text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select mentorship_private.payment_reminder_login_ready(contract_id, recipient_email);
$$;

revoke all on function mentorship_private.payment_reminder_login_ready(uuid, text)
  from public, anon, authenticated;
revoke all on function public.payment_reminder_login_ready(uuid, text)
  from public, anon, authenticated;
grant usage on schema mentorship_private to service_role;
grant execute on function mentorship_private.payment_reminder_login_ready(uuid, text)
  to service_role;
grant execute on function public.payment_reminder_login_ready(uuid, text)
  to service_role;

commit;
