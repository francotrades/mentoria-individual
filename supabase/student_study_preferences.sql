-- Personal study data is never shared with other students or the mentor UI.
create table if not exists public.student_study_preferences (
  student_id uuid not null references public.profiles(id) on delete cascade,
  content_type text not null check (content_type in ('analysis', 'video', 'session')),
  content_id bigint not null check (content_id > 0),
  favorited boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 10000),
  updated_at timestamptz not null default now(),
  primary key (student_id, content_type, content_id)
);
alter table public.student_study_preferences enable row level security;
revoke all on public.student_study_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.student_study_preferences to authenticated;
grant all on public.student_study_preferences to service_role;

-- Invoker permissions and the target tables' existing RLS remain in force.
create or replace function public.can_personalize_study(target_kind text, target_id bigint)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select auth.uid() is not null and case target_kind
    when 'analysis' then public.can_access_trade_analysis_reviews() and exists (
      select 1 from public.trade_analysis_reviews r where r.id = target_id and r.ativo
    )
    when 'video' then public.can_access_trade_video_reviews() and exists (
      select 1 from public.trade_reviews r where r.id = target_id and r.ativo
    )
    when 'session' then public.has_learning_content_access() and exists (
      select 1 from public.student_sessions s
      where s.id = target_id and s.student_id = auth.uid() and s.liberada = true
    )
    else false
  end;
$$;
revoke all on function public.can_personalize_study(text, bigint) from public, anon;
grant execute on function public.can_personalize_study(text, bigint) to authenticated, service_role;

drop policy if exists "Students read own study preferences" on public.student_study_preferences;
create policy "Students read own study preferences"
  on public.student_study_preferences for select to authenticated
  using (student_id = (select auth.uid()));
drop policy if exists "Students insert eligible study preferences" on public.student_study_preferences;
create policy "Students insert eligible study preferences"
  on public.student_study_preferences for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and public.can_personalize_study(content_type, content_id)
  );
drop policy if exists "Students update eligible study preferences" on public.student_study_preferences;
create policy "Students update eligible study preferences"
  on public.student_study_preferences for update to authenticated
  using (
    student_id = (select auth.uid())
    and public.can_personalize_study(content_type, content_id)
  )
  with check (
    student_id = (select auth.uid())
    and public.can_personalize_study(content_type, content_id)
  );
drop policy if exists "Students delete own study preferences" on public.student_study_preferences;
create policy "Students delete own study preferences"
  on public.student_study_preferences for delete to authenticated
  using (student_id = (select auth.uid()));

-- Independent patches keep a favorite toggle from overwriting a note saved in
-- another tab, and a note save from overwriting the favorite flag.
create or replace function public.save_student_study_preference(
  target_kind text,
  target_id bigint,
  favorite_value boolean default null,
  note_value text default null
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  personal public.student_study_preferences;
begin
  if auth.uid() is null then
    raise exception 'Login necessário' using errcode = '42501';
  end if;
  if favorite_value is null and note_value is null then
    raise exception 'Não há alterações para salvar' using errcode = '22023';
  end if;
  insert into public.student_study_preferences as existing (
    student_id, content_type, content_id, favorited, notes
  ) values (
    auth.uid(), target_kind, target_id, coalesce(favorite_value, false), coalesce(note_value, '')
  )
  on conflict (student_id, content_type, content_id) do update
    set favorited = coalesce(favorite_value, existing.favorited),
        notes = coalesce(note_value, existing.notes),
        updated_at = now()
  returning * into personal;
  return jsonb_build_object(
    'content_type', personal.content_type,
    'content_id', personal.content_id,
    'favorited', personal.favorited,
    'notes', personal.notes,
    'updated_at', personal.updated_at
  );
end;
$$;
revoke all on function public.save_student_study_preference(text, bigint, boolean, text) from public, anon;
grant execute on function public.save_student_study_preference(text, bigint, boolean, text) to authenticated;
notify pgrst, 'reload schema';
