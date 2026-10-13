-- Aplicar depois de trade_review_notifications.sql. Migra novos avisos para e-mail.
-- Não transforma publicações/avisos antigos em disparos de e-mail.
begin;
-- Interrompe o transporte antigo; a função por e-mail usa sua própria fila de entregas.
update public.trade_review_notice_queue set status='cancelled' where status in('pending','failed');
create or replace function public.claim_trade_review_notice() returns setof public.trade_review_notice_queue language sql security definer set search_path=public as $$
 select * from public.trade_review_notice_queue where false;
$$;
create table if not exists public.trade_review_email_deliveries (
 id bigint generated always as identity primary key,
 notice_id bigint not null references public.trade_review_notice_queue(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 recipient_email text not null,
 status text not null default 'pending' check(status in('pending','processing','sent','failed','uncertain','cancelled')),
 attempts integer not null default 0,retry_after timestamptz not null default now(),
 created_at timestamptz not null default now(),sent_at timestamptz,
 unique(notice_id,student_id)
);
create unique index if not exists trade_review_email_address_once on public.trade_review_email_deliveries(notice_id,lower(btrim(recipient_email)));
create index if not exists trade_review_email_pending on public.trade_review_email_deliveries(status,retry_after,id);
alter table public.trade_review_email_deliveries enable row level security;
drop policy if exists "Mentor sees review email deliveries" on public.trade_review_email_deliveries;
create policy "Mentor sees review email deliveries" on public.trade_review_email_deliveries for select to authenticated using(public.is_admin());
create or replace function public.queue_trade_review_notice() returns trigger language plpgsql security definer set search_path=public as $$
declare notice bigint;kind text;
begin
 if not new.ativo then return new;end if;
 if tg_op='UPDATE' then if old.ativo then return new;end if;end if;
 kind:=case when tg_table_name='trade_analysis_reviews' then 'analysis' else 'video' end;
 insert into public.trade_review_notice_queue(review_type,review_id,title,status)
 values(kind,new.id,new.titulo,'cancelled') on conflict(review_type,review_id) do nothing returning id into notice;
 if notice is null then return new;end if;
 insert into public.trade_review_email_deliveries(notice_id,student_id,recipient_email)
 select notice,p.id,btrim(p.email) from (
  select distinct on(lower(btrim(profile.email))) profile.id,profile.email
  from public.profiles profile
  where profile.role='aluno' and nullif(btrim(profile.email),'') is not null
  and case when kind='analysis' then public.review_analysis_eligible_for_student(profile.id) else public.review_video_eligible_for_student(profile.id) end
  order by lower(btrim(profile.email)),profile.id
 ) p;
 return new;
end;$$;
create or replace function public.claim_trade_review_email() returns setof public.trade_review_email_deliveries language sql security definer set search_path=public as $$
 update public.trade_review_email_deliveries set status='processing',attempts=attempts+1
 where id=(select id from public.trade_review_email_deliveries where status in('pending','failed') and retry_after<=now() and attempts<3 order by id for update skip locked limit 1) returning *;
$$;
revoke all on function public.claim_trade_review_email() from public,anon,authenticated;
grant execute on function public.claim_trade_review_email() to service_role;
-- Revalida liberação, atividade da revisão e e-mail antes do envio. Consulta privada.
create or replace function public.trade_review_email_target(delivery_id bigint)
returns table(student_id uuid,email text,first_name text,review_type text,review_id bigint,title text,allowed boolean)
language sql stable security definer set search_path=public as $$
 select p.id,p.email,p.nome,n.review_type,n.review_id,coalesce(a.titulo,v.titulo,n.title),
  p.role='aluno' and lower(btrim(p.email))=lower(btrim(d.recipient_email)) and
  case when n.review_type='analysis' then coalesce(a.ativo,false) and public.review_analysis_eligible_for_student(p.id)
  else coalesce(v.ativo,false) and public.review_video_eligible_for_student(p.id) end
 from public.trade_review_email_deliveries d
 join public.trade_review_notice_queue n on n.id=d.notice_id
 join public.profiles p on p.id=d.student_id
 left join public.trade_analysis_reviews a on n.review_type='analysis' and a.id=n.review_id
 left join public.trade_reviews v on n.review_type='video' and v.id=n.review_id
 where d.id=delivery_id and d.status='processing';
$$;
revoke all on function public.trade_review_email_target(bigint) from public,anon,authenticated;
grant execute on function public.trade_review_email_target(bigint) to service_role;
commit;
