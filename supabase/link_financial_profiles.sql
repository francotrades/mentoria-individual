-- FrancoTrades Mentoria - vincula financeiro importado à conta do aluno
-- Execute uma única vez no SQL Editor do Supabase.
-- Depois disso, novos perfis passam a ser vinculados automaticamente pelo e-mail.

-- Vinculação imediata dos registros existentes.
update public.mentorship_financials mf
set
  profile_id = p.id,
  updated_at = now()
from public.profiles p
where
  lower(trim(mf.email)) = lower(trim(p.email))
  and (
    mf.profile_id is null
    or mf.profile_id <> p.id
  );

-- Função usada pelo trigger para futuras contas.
create or replace function public.link_financial_profile_by_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and trim(new.email) <> '' then
    update public.mentorship_financials
    set
      profile_id = new.id,
      updated_at = now()
    where
      lower(trim(email)) = lower(trim(new.email))
      and (
        profile_id is null
        or profile_id <> new.id
      );
  end if;

  return new;
end;
$$;

drop trigger if exists link_financial_profile_after_profile_write
on public.profiles;

create trigger link_financial_profile_after_profile_write
after insert or update of email
on public.profiles
for each row
execute function public.link_financial_profile_by_email();

-- Conferência opcional após executar:
-- select nome, email, profile_id
-- from public.mentorship_financials
-- order by nome;
