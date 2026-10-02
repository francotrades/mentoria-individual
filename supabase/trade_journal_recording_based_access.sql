-- Diário de Trade — liberação após as 8 primeiras gravações + override do mentor
-- Execute UMA VEZ no SQL Editor do Supabase.
--
-- Regra normal:
-- - aluno ativo acessa o Diário de Trade quando as gravações das sessões 1 a 8 existirem;
-- - administrador pode liberar antecipadamente por aluno;
-- - ao expirar/inativar, o aluno perde acesso, mas o histórico é preservado;
-- - administrador continua acessando o histórico normalmente.

create table if not exists public.trade_journal_access_overrides (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  early_access boolean not null default true,
  granted_at timestamptz not null default now()
);

alter table public.trade_journal_access_overrides enable row level security;

drop policy if exists "Admins manage trade journal access overrides"
  on public.trade_journal_access_overrides;

create policy "Admins manage trade journal access overrides"
on public.trade_journal_access_overrides
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());


create or replace function public.has_trade_journal_early_access(
  target_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trade_journal_access_overrides o
    where o.student_id = target_user
      and o.early_access = true
  );
$$;


create or replace function public.has_first_eight_recordings(
  target_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    select count(distinct s.numero)
    from public.student_sessions ss
    join public.sessions s
      on s.id = ss.session_id
    where ss.student_id = target_user
      and s.numero between 1 and 8
      and nullif(btrim(coalesce(ss.youtube_url, '')), '') is not null
  ) = 8;
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
        or public.has_first_eight_recordings(target_student)
      )
    );
$$;


-- Os anexos seguem a mesma regra do restante do Diário de Trade.
drop policy if exists "Students read own trade journal screenshots"
  on storage.objects;

create policy "Students read own trade journal screenshots"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'trade-journal-screenshots'
  and split_part(name, '/', 1) = auth.uid()::text
  and public.can_access_student_trade_journal(auth.uid())
);


drop policy if exists "Students upload own trade journal screenshots"
  on storage.objects;

create policy "Students upload own trade journal screenshots"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'trade-journal-screenshots'
  and split_part(name, '/', 1) = auth.uid()::text
  and public.can_access_student_trade_journal(auth.uid())
);


drop policy if exists "Students delete own trade journal screenshots"
  on storage.objects;

create policy "Students delete own trade journal screenshots"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'trade-journal-screenshots'
  and split_part(name, '/', 1) = auth.uid()::text
  and public.can_access_student_trade_journal(auth.uid())
);
