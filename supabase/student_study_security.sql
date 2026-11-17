-- Student study library and content authorization.
-- Additive metadata; existing publications and progress are preserved.
alter table public.trade_analysis_reviews
  add column if not exists instrumento text check (char_length(instrumento) <= 60),
  add column if not exists tema text check (char_length(tema) <= 80);
alter table public.trade_reviews
  add column if not exists instrumento text check (char_length(instrumento) <= 60),
  add column if not exists tema text check (char_length(tema) <= 80);

-- Public helpers may inspect only the caller, an administrator's target,
-- or targets from a trusted service/maintenance connection.
create or replace function mentorship_private.can_inspect_access(target_user uuid)
returns boolean language sql stable set search_path = ''
as $$
  select coalesce(
    auth.uid() = target_user
    or public.is_admin()
    or current_setting('role', true) = 'service_role'
    or (
      session_user in ('postgres', 'supabase_admin')
      and current_setting('role', true) in ('none', 'postgres', 'supabase_admin')
    ), false
  );
$$;
revoke all on function mentorship_private.can_inspect_access(uuid) from public, anon, authenticated;

create or replace function public.has_active_mentorship_access(target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = ''
as $$
  select mentorship_private.can_inspect_access(target_user) and exists (
    select 1 from public.profiles p
    where p.id = target_user and p.role = 'aluno' and p.status = 'ativo'
      and (p.data_expiracao is null or p.data_expiracao >= current_date)
  );
$$;
create or replace function public.has_first_eight_recordings(target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = ''
as $$
  select mentorship_private.can_inspect_access(target_user) and (
    select count(distinct s.numero)
    from public.student_sessions ss join public.sessions s on s.id = ss.session_id
    where ss.student_id = target_user and s.numero between 1 and 8
      and nullif(btrim(coalesce(ss.youtube_url, '')), '') is not null
  ) = 8;
$$;
create or replace function public.has_trade_journal_early_access(target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = ''
as $$
  select mentorship_private.can_inspect_access(target_user) and exists (
    select 1 from public.trade_journal_access_overrides o
    where o.student_id = target_user and o.early_access = true
  );
$$;
create or replace function public.has_trade_review_early_access(target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = ''
as $$
  select mentorship_private.can_inspect_access(target_user) and exists (
    select 1 from public.trade_review_access_overrides o
    where o.student_id = target_user and o.early_access = true
  );
$$;

-- Runs as the owner to avoid recursive RLS when checking extension recordings.
-- No target argument: an API caller can check only their own eligibility.
create or replace function public.has_learning_content_access()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    public.is_admin() or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'aluno' and p.status = 'ativo'
        and (
          p.data_expiracao is null
          or p.data_expiracao >= (now() at time zone 'America/Sao_Paulo')::date
          or mentorship_private.extension_open(p.id)
        )
    )
  );
$$;
revoke all on function public.has_learning_content_access() from public, anon;
grant execute on function public.has_learning_content_access() to authenticated, service_role;

alter policy "Aluno ve proprias aulas" on public.student_sessions
  using (
    student_id = (select auth.uid())
    and liberada = true
    and (select public.has_learning_content_access())
  );
alter policy "Aluno ve proprios materiais" on public.materials
  using (
    student_id = (select auth.uid())
    and (select public.has_learning_content_access())
    and (materials.session_id is null or exists (
      select 1 from public.student_sessions ss
      where ss.student_id = (select auth.uid())
        and ss.session_id = materials.session_id and ss.liberada = true
    ))
  );
alter policy "Alunos veem sessoes" on public.sessions
  using ((select public.has_learning_content_access()));

revoke execute on function public.has_active_mentorship_access(uuid),
  public.has_first_eight_recordings(uuid),
  public.has_trade_journal_early_access(uuid),
  public.has_trade_review_early_access(uuid),
  public.is_admin(), public.is_trade_journal_globally_enabled()
from public, anon;
grant execute on function public.has_active_mentorship_access(uuid),
  public.has_first_eight_recordings(uuid),
  public.has_trade_journal_early_access(uuid),
  public.has_trade_review_early_access(uuid),
  public.is_admin(), public.is_trade_journal_globally_enabled()
to authenticated, service_role;

-- These functions are trigger-only; they are never browser RPCs.
revoke execute on function public.handle_new_user(),
  public.link_financial_profile_by_email(),
  public.queue_trade_review_notice()
from public, anon, authenticated;
alter function public.set_trade_reviews_updated_at() set search_path = '';
alter function public.set_trade_analysis_reviews_updated_at() set search_path = '';
alter function public.set_student_trade_updated_at() set search_path = '';

notify pgrst, 'reload schema';
