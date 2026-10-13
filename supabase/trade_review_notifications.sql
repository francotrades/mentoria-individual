-- Aplicar depois dos SQLs de acesso e progresso das revisões. Não avisa sobre publicações antigas.
begin;
create table if not exists public.trade_review_notice_queue (
 id bigint generated always as identity primary key,
 review_type text not null check(review_type in ('analysis','video')),
 review_id bigint not null,title text not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','uncertain','cancelled')),
 attempts integer not null default 0, retry_after timestamptz not null default now(),
 message_id text,created_at timestamptz not null default now(),sent_at timestamptz,
 unique(review_type,review_id)
);
alter table public.trade_review_notice_queue enable row level security;
drop policy if exists "Mentor sees review notices" on public.trade_review_notice_queue;
create policy "Mentor sees review notices" on public.trade_review_notice_queue for select to authenticated using(public.is_admin());
create or replace function public.queue_trade_review_notice() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.ativo and (tg_op='INSERT' or not old.ativo) then
  insert into public.trade_review_notice_queue(review_type,review_id,title)
  values(case when tg_table_name='trade_analysis_reviews' then 'analysis' else 'video' end,new.id,new.titulo)
  on conflict(review_type,review_id) do nothing;
 end if;return new;
end;$$;
drop trigger if exists trade_analysis_notice on public.trade_analysis_reviews;
create trigger trade_analysis_notice after insert or update of ativo on public.trade_analysis_reviews for each row execute function public.queue_trade_review_notice();
drop trigger if exists trade_video_notice on public.trade_reviews;
create trigger trade_video_notice after insert or update of ativo on public.trade_reviews for each row execute function public.queue_trade_review_notice();
create or replace function public.claim_trade_review_notice() returns setof public.trade_review_notice_queue language sql security definer set search_path=public as $$
 update public.trade_review_notice_queue set status='processing',attempts=attempts+1
 where id=(select id from public.trade_review_notice_queue where status in('pending','failed') and retry_after<=now() and attempts<3 order by id for update skip locked limit 1) returning *;
$$;
revoke all on function public.claim_trade_review_notice() from public,anon,authenticated;
grant execute on function public.claim_trade_review_notice() to service_role;
create table if not exists public.trade_review_opens (
 student_id uuid not null references public.profiles(id) on delete cascade,
 review_type text not null check(review_type in ('analysis','video')),review_id bigint not null,
 first_opened_at timestamptz not null default now(),primary key(student_id,review_type,review_id)
);
alter table public.trade_review_opens enable row level security;
drop policy if exists "Own review views and mentor reporting" on public.trade_review_opens;
create policy "Own review views and mentor reporting" on public.trade_review_opens for select to authenticated using(student_id=auth.uid() or public.is_admin());
drop policy if exists "Eligible students record review views" on public.trade_review_opens;
create policy "Eligible students record review views" on public.trade_review_opens for insert to authenticated with check(student_id=auth.uid() and (
 (review_type='analysis' and public.can_access_trade_analysis_reviews() and exists(select 1 from public.trade_analysis_reviews r where r.id=review_id and r.ativo)) or
 (review_type='video' and public.can_access_trade_video_reviews() and exists(select 1 from public.trade_reviews r where r.id=review_id and r.ativo))
));
-- Cópia privada das regras vigentes: permite calcular elegíveis sem expor dados de alunos.
do $$ declare body text;kind text;begin
 foreach kind in array array['analysis','video'] loop
  select p.prosrc into body from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='can_access_trade_'||kind||'_reviews' and p.pronargs=0;
  if body is null then raise exception 'Aplicar primeiro as regras de acesso às revisões';end if;
  execute format('create or replace function public.review_%s_eligible_for_student(target_student uuid) returns boolean language sql stable security definer set search_path=public as %L',kind,replace(body,'auth.uid()','target_student'));
 end loop;
end;$$;
revoke all on function public.review_analysis_eligible_for_student(uuid),public.review_video_eligible_for_student(uuid) from public,anon,authenticated;
create or replace function public.review_engagement() returns table(review_type text,review_id bigint,title text,eligible bigint,viewed bigint,completed bigint) language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 return query
 with reviews as(select 'analysis'::text kind,r.id,r.titulo from public.trade_analysis_reviews r where r.ativo union all select 'video',r.id,r.titulo from public.trade_reviews r where r.ativo),
 students as(select p.id,public.review_analysis_eligible_for_student(p.id) analysis,public.review_video_eligible_for_student(p.id) video from public.profiles p where p.role='aluno')
 select r.kind,r.id,r.titulo,
 (select count(*) from students s where case when r.kind='analysis' then s.analysis else s.video end),
 (select count(*) from public.trade_review_opens o join students s on s.id=o.student_id where o.review_type=r.kind and o.review_id=r.id and case when r.kind='analysis' then s.analysis else s.video end),
 (select count(*) from public.trade_review_progress g join students s on s.id=g.student_id where g.review_type=r.kind and g.review_id=r.id and g.concluida and case when r.kind='analysis' then s.analysis else s.video end)
 from reviews r order by r.id desc;
end;$$;
revoke all on function public.review_engagement() from public,anon;
grant execute on function public.review_engagement() to authenticated;
commit;
