-- No historical confirmation emails: only subsequent scheduling changes queue them.
alter table public.student_sessions add column if not exists schedule_version bigint not null default 0;
create table if not exists public.session_schedule_notices (
  id bigint generated always as identity primary key,
  student_session_id bigint not null references public.student_sessions(id) on delete cascade,
  schedule_version bigint not null,
  kind text not null check (kind in ('confirmation','reminder')),
  scheduled_at timestamptz not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','uncertain','cancelled')),
  attempts integer not null default 0,
  claim_token uuid,
  claimed_at timestamptz,
  sent_at timestamptz,
  unique(student_session_id,schedule_version,kind)
);
alter table public.session_schedule_notices enable row level security;
revoke all on public.session_schedule_notices from public,anon,authenticated;
grant select on public.session_schedule_notices to authenticated;
grant all on public.session_schedule_notices to service_role;
grant usage,select on sequence public.session_schedule_notices_id_seq to service_role;
drop policy if exists "Mentor reads session delivery status" on public.session_schedule_notices;
create policy "Mentor reads session delivery status" on public.session_schedule_notices
  for select to authenticated using ((select public.is_admin()));

create or replace function public.track_session_schedule()
returns trigger language plpgsql security definer set search_path=''
as $$
declare start_at timestamptz; reminder_at timestamptz;
begin
 if tg_op='UPDATE' and
   row(new.data_sessao,new.session_time,new.liberada,new.student_id,new.session_id)
   is not distinct from row(old.data_sessao,old.session_time,old.liberada,old.student_id,old.session_id)
 then new.schedule_version:=old.schedule_version;return new;end if;
 if tg_op='UPDATE' then new.schedule_version:=old.schedule_version+1;
 else new.schedule_version:=1;end if;
 -- The AFTER trigger queues rows after the assignment itself is stored.
 return new;
end;
$$;
create or replace function public.queue_session_schedule()
returns trigger language plpgsql security definer set search_path=''
as $$
declare start_at timestamptz; reminder_at timestamptz;
begin
 if tg_op='UPDATE' and new.schedule_version=old.schedule_version then return new;end if;
 update public.session_schedule_notices set status='cancelled'
 where student_session_id=new.id and schedule_version<>new.schedule_version and status in ('pending','failed','processing');
 if new.liberada is distinct from true or new.data_sessao is null or new.session_time is null then return new;end if;
 start_at:=(new.data_sessao+new.session_time) at time zone 'America/Sao_Paulo';
 if start_at<=now() then return new;end if;
 insert into public.session_schedule_notices(student_session_id,schedule_version,kind,scheduled_at,due_at)
 values(new.id,new.schedule_version,'confirmation',start_at,now()) on conflict do nothing;
 reminder_at:=((new.data_sessao-1)+time '09:00') at time zone 'America/Sao_Paulo';
 -- A booking after the reminder time gets its confirmation, not a second immediate email.
 if reminder_at>now() then
  insert into public.session_schedule_notices(student_session_id,schedule_version,kind,scheduled_at,due_at)
  values(new.id,new.schedule_version,'reminder',start_at,reminder_at) on conflict do nothing;
 end if;
 return new;
end;
$$;
drop trigger if exists track_session_schedule on public.student_sessions;
create trigger track_session_schedule before insert or update on public.student_sessions
 for each row execute function public.track_session_schedule();
drop trigger if exists queue_session_schedule on public.student_sessions;
create trigger queue_session_schedule after insert or update on public.student_sessions
 for each row execute function public.queue_session_schedule();
revoke all on function public.track_session_schedule(),public.queue_session_schedule() from public,anon,authenticated;

create or replace function public.claim_session_schedule_notice(target_session bigint default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare notice public.session_schedule_notices; item public.student_sessions; person public.profiles; lesson public.sessions;
begin
 update public.session_schedule_notices set status='uncertain'
 where status='processing' and claimed_at<now()-interval '10 minutes';
 loop
  select * into notice from public.session_schedule_notices
  where status in ('pending','failed') and due_at<=now() and attempts<3
    and (target_session is null or student_session_id=target_session)
  order by due_at,id for update skip locked limit 1;
  if not found then return null;end if;
  select * into item from public.student_sessions where id=notice.student_session_id;
  select * into person from public.profiles where id=item.student_id;
  if item.id is null or person.id is null or item.liberada is distinct from true or person.role is distinct from 'aluno' or person.status is distinct from 'ativo'
    or item.schedule_version<>notice.schedule_version or item.data_sessao is null or item.session_time is null
    or notice.scheduled_at<=now()
    or (notice.kind='reminder' and (now() at time zone 'America/Sao_Paulo')::date<>item.data_sessao-1)
    or notice.scheduled_at is distinct from ((item.data_sessao+item.session_time) at time zone 'America/Sao_Paulo')
    or nullif(btrim(person.email),'') is null
    or (person.data_expiracao is not null and person.data_expiracao<(now() at time zone 'America/Sao_Paulo')::date
      and not mentorship_private.extension_open(person.id))
  then update public.session_schedule_notices set status='cancelled' where id=notice.id;continue;end if;
  select * into lesson from public.sessions where id=item.session_id;
  update public.session_schedule_notices set status='processing',attempts=attempts+1,claim_token=gen_random_uuid(),claimed_at=now()
   where id=notice.id returning * into notice;
  return jsonb_build_object('id',notice.id,'claim_token',notice.claim_token,'kind',notice.kind,
    'student_session_id',item.id,'recipient_email',person.email,'recipient_name',person.nome,
    'session_number',lesson.numero,'session_title',coalesce(item.titulo_personalizado,lesson.titulo),
    'scheduled_at',notice.scheduled_at);
 end loop;
end;
$$;
create or replace function public.finish_session_schedule_notice(target_notice bigint, token uuid, outcome text, delay_minutes integer default 15)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if outcome not in ('sent','failed','uncertain') then raise exception 'Invalid outcome';end if;
 update public.session_schedule_notices set status=outcome,
  sent_at=case when outcome='sent' then now() else sent_at end,
  due_at=case when outcome='failed' then now()+make_interval(mins=>greatest(5,least(delay_minutes,1440))) else due_at end
 where id=target_notice and status='processing' and claim_token=token;
 return found;
end;
$$;
revoke all on function public.claim_session_schedule_notice(bigint),public.finish_session_schedule_notice(bigint,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_session_schedule_notice(bigint),public.finish_session_schedule_notice(bigint,uuid,text,integer) to service_role;
create index if not exists session_schedule_notices_due_idx on public.session_schedule_notices(due_at,id) where status in ('pending','failed');
notify pgrst,'reload schema';
