-- Diário de Trade — chave global de liberação para mentorados
-- Execute UMA VEZ no SQL Editor do Supabase.
--
-- Enquanto enabled = false:
-- - a liberação automática pelas 8 primeiras gravações fica suspensa;
-- - alunos liberados manualmente pelo mentor continuam podendo acessar;
-- - o administrador continua acessando para testes;
-- - todo o histórico permanece preservado.
--
-- Ao ativar:
-- - volta a valer a regra normal: 8 primeiras gravações OU liberação antecipada individual.

begin;

create table if not exists public.trade_journal_settings (
  id integer primary key check (id = 1),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.trade_journal_settings (
  id,
  enabled
)
values (
  1,
  false
)
on conflict (id) do nothing;

alter table public.trade_journal_settings enable row level security;

drop policy if exists "Admins read trade journal settings"
  on public.trade_journal_settings;

create policy "Admins read trade journal settings"
on public.trade_journal_settings
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins update trade journal settings"
  on public.trade_journal_settings;

create policy "Admins update trade journal settings"
on public.trade_journal_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.is_trade_journal_globally_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.enabled
      from public.trade_journal_settings s
      where s.id = 1
    ),
    false
  );
$$;

create or replace function public.can_access_student_trade_journal(
  target_student uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or (
      auth.uid() = target_student
      and public.has_active_mentorship_access(target_student)
      and (
        public.has_trade_journal_early_access(target_student)
        or (
          public.is_trade_journal_globally_enabled()
          and public.has_first_eight_recordings(target_student)
        )
      )
    );
$$;

-- Atualiza a descoberta das funções pela API após a migração.
notify pgrst, 'reload schema';

commit;
