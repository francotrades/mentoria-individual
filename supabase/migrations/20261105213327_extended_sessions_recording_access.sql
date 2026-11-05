-- Extensões de 14+ sessões: diário e ambas as revisões até a gravação da última aula.
-- Não altera parcelas, valores, gravações ou progresso existente.
begin;
create schema if not exists mentorship_private;
revoke all on schema mentorship_private from public,anon,authenticated;

-- Guarda as regras anteriores de 1–13 sessões para preservar esses contratos.
do $block$
declare kind text;body text;
begin
 foreach kind in array array['analysis','video'] loop
  if to_regprocedure('mentorship_private.legacy_'||kind||'_eligible(uuid)') is null then
   select p.prosrc into strict body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='can_access_trade_'||kind||'_reviews' and p.pronargs=0;
   execute format('create function mentorship_private.legacy_%s_eligible(target_student uuid) returns boolean language sql stable set search_path=public as %L',kind,replace(body,'auth.uid()','target_student'));
  end if;
 end loop;
 if to_regprocedure('mentorship_private.legacy_journal(uuid)') is null then
  select p.prosrc into strict body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='can_access_student_trade_journal' and p.pronargs=1;
  execute format('create function mentorship_private.legacy_journal(target_student uuid) returns boolean language sql stable set search_path=public as %L',body);
 end if;
end;$block$;

create or replace function mentorship_private.session_total(target_student uuid) returns integer language sql stable set search_path='' as $$
 select coalesce(nullif(greatest(
  coalesce((select f.quantidade_sessoes from public.mentorship_financials f join public.profiles p on p.id=target_student where f.profile_id=p.id or (f.profile_id is null and nullif(btrim(p.email),'') is not null and lower(btrim(f.email))=lower(btrim(p.email))) order by (f.profile_id=target_student) desc nulls last,f.id limit 1),0),
  coalesce((select max(s.numero) from public.student_sessions ss join public.sessions s on s.id=ss.session_id where ss.student_id=target_student),0)
 ),0),12);
$$;
create or replace function mentorship_private.final_recorded(target_student uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.student_sessions ss join public.sessions s on s.id=ss.session_id where ss.student_id=target_student and s.numero=mentorship_private.session_total(target_student) and nullif(btrim(ss.youtube_url),'') is not null);
$$;
create or replace function mentorship_private.extension_open(target_student uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=target_student and p.role='aluno' and p.status='ativo') and mentorship_private.session_total(target_student)>=14 and not mentorship_private.final_recorded(target_student);
$$;
create or replace function mentorship_private.review_eligible(target_student uuid,kind text) returns boolean language sql stable set search_path='' as $$
 select case when mentorship_private.session_total(target_student)>=14 then mentorship_private.extension_open(target_student)
 when kind='analysis' then mentorship_private.legacy_analysis_eligible(target_student) else mentorship_private.legacy_video_eligible(target_student) end;
$$;

create or replace function public.can_access_trade_analysis_reviews() returns boolean language sql stable security definer set search_path='' as $$select mentorship_private.review_eligible(auth.uid(),'analysis');$$;
create or replace function public.can_access_trade_video_reviews() returns boolean language sql stable security definer set search_path='' as $$select mentorship_private.review_eligible(auth.uid(),'video');$$;
create or replace function public.can_access_student_trade_journal(target_student uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_admin() or (auth.uid()=target_student and case when mentorship_private.session_total(target_student)>=14 then mentorship_private.extension_open(target_student) else mentorship_private.legacy_journal(target_student) end);
$$;
-- O login só ignora a data de expiração quando a extensão ativa aguarda a última gravação.
create or replace function public.has_recording_extension_access() returns boolean language sql stable security definer set search_path='' as $$select mentorship_private.extension_open(auth.uid());$$;
create or replace function public.get_mentorship_extension_state(target_student uuid default auth.uid()) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare total integer;recorded boolean;
begin
 if auth.uid() is null or (auth.uid() is distinct from target_student and not public.is_admin()) then raise exception 'Acesso negado' using errcode='42501';end if;
 total:=mentorship_private.session_total(target_student);recorded:=mentorship_private.final_recorded(target_student);
 return jsonb_build_object('total_sessions',total,'extended',total>=14,'final_recorded',recorded,'recording_access',mentorship_private.extension_open(target_student));
end;$$;

-- Amplia o catálogo sem alterar os títulos das aulas que já existem.
do $block$
declare seq regclass;last_id bigint;max_id bigint;
begin
 seq:=pg_get_serial_sequence('public.sessions','id')::regclass;
 execute format('select last_value from %s',seq) into last_id;
 select max(id) into max_id from public.sessions;
 perform setval(seq,greatest(coalesce(last_id,1),coalesce(max_id,1)),true);
end;$block$;
insert into public.sessions(numero,titulo) select n,'Sessão '||lpad(n::text,2,'0') from generate_series(1,200) n on conflict(numero) do nothing;

create or replace function public.extend_mentorship_sessions(target_student uuid,total_sessions integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_total integer;added integer;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Somente o mentor pode ampliar sessões' using errcode='42501';end if;
 if total_sessions is null or total_sessions<1 or total_sessions>200 then raise exception 'Informe de 1 a 200 sessões';end if;
 perform 1 from public.profiles where id=target_student and role='aluno' for update;
 if not found then raise exception 'Mentorado não encontrado';end if;
 current_total:=mentorship_private.session_total(target_student);
 if total_sessions<current_total then raise exception 'A quantidade não pode ser menor que as % sessões atuais',current_total;end if;
 insert into public.student_sessions(student_id,session_id,liberada)
 select target_student,s.id,true from public.sessions s where s.numero between 1 and total_sessions on conflict(student_id,session_id) do nothing;
 get diagnostics added=row_count;
 update public.mentorship_financials f set quantidade_sessoes=total_sessions where f.profile_id=target_student or (f.profile_id is null and nullif(btrim(f.email),'') is not null and exists(select 1 from public.profiles p where p.id=target_student and lower(btrim(p.email))=lower(btrim(f.email))));
 return jsonb_build_object('total_sessions',total_sessions,'added_sessions',added);
end;$$;

-- As filas de e-mail e as métricas usam a mesma decisão de acesso das telas.
create or replace function public.review_analysis_eligible_for_student(target_student uuid) returns boolean language sql stable security definer set search_path='' as $$select mentorship_private.review_eligible(target_student,'analysis');$$;
create or replace function public.review_video_eligible_for_student(target_student uuid) returns boolean language sql stable security definer set search_path='' as $$select mentorship_private.review_eligible(target_student,'video');$$;
revoke all on function public.review_analysis_eligible_for_student(uuid),public.review_video_eligible_for_student(uuid) from public,anon,authenticated;
grant execute on function public.review_analysis_eligible_for_student(uuid),public.review_video_eligible_for_student(uuid) to service_role;
revoke all on all functions in schema mentorship_private from public,anon,authenticated;
revoke all on function public.has_recording_extension_access(),public.get_mentorship_extension_state(uuid),public.extend_mentorship_sessions(uuid,integer),public.can_access_trade_analysis_reviews(),public.can_access_trade_video_reviews(),public.can_access_student_trade_journal(uuid) from public,anon;
grant execute on function public.has_recording_extension_access(),public.get_mentorship_extension_state(uuid),public.extend_mentorship_sessions(uuid,integer),public.can_access_trade_analysis_reviews(),public.can_access_trade_video_reviews(),public.can_access_student_trade_journal(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
