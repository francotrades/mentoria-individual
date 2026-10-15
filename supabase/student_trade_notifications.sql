-- Avisos ao mentor: aplicar após student_trade_journal.sql.
-- Somente novos registros feitos pelo aluno; sem disparos sobre o histórico.
begin;
create table if not exists public.student_trade_email_deliveries (
 id bigint generated always as identity primary key,
 trade_id bigint not null references public.student_trades(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 mentor_id uuid not null references public.profiles(id) on delete cascade,
 recipient_email text not null,
 status text not null default 'pending' check(status in('pending','processing','sent','failed','uncertain','cancelled')),
 attempts integer not null default 0,
 retry_after timestamptz not null default (now()+interval '45 seconds'),
 batch_id uuid,created_at timestamptz not null default now(),sent_at timestamptz,
 unique(trade_id,mentor_id)
);
create unique index if not exists student_trade_email_address_once on public.student_trade_email_deliveries(trade_id,lower(btrim(recipient_email)));
create index if not exists student_trade_email_pending on public.student_trade_email_deliveries(status,retry_after,id);
alter table public.student_trade_email_deliveries enable row level security;
revoke all on public.student_trade_email_deliveries from anon,authenticated;
grant select on public.student_trade_email_deliveries to authenticated;
drop policy if exists "Mentors read own trade email deliveries" on public.student_trade_email_deliveries;
create policy "Mentors read own trade email deliveries" on public.student_trade_email_deliveries for select to authenticated using(public.is_admin() and mentor_id=auth.uid());

create or replace function public.queue_student_trade_email() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is distinct from new.student_id then return new;end if;
 if not exists(select 1 from public.profiles where id=new.student_id and role='aluno') then return new;end if;
 if not public.can_access_student_trade_journal(new.student_id) then return new;end if;
 insert into public.student_trade_email_deliveries(trade_id,student_id,mentor_id,recipient_email)
 select new.id,new.student_id,p.id,btrim(p.email) from (
  select distinct on(lower(btrim(email))) id,email from public.profiles
  where role='admin' and nullif(btrim(email),'') is not null
  order by lower(btrim(email)),id
 ) p on conflict do nothing;
 return new;
end;$$;
revoke all on function public.queue_student_trade_email() from public,anon,authenticated;
drop trigger if exists student_trade_email_notice on public.student_trades;
create trigger student_trade_email_notice after insert on public.student_trades for each row execute function public.queue_student_trade_email();

-- O mentor deve continuar administrador e com o mesmo endereço no momento do envio.
-- Trades excluídos somem por cascade; trades já comentados não geram aviso atrasado.
create or replace function public.claim_student_trade_email()
returns table(batch_id uuid,email text,student_id uuid,student_name text,trades jsonb)
language plpgsql security definer set search_path=public as $$
declare candidate public.student_trade_email_deliveries%rowtype;batch uuid:=gen_random_uuid();
begin
 update public.student_trade_email_deliveries d set status='cancelled'
 where d.status in('pending','failed') and (
  not exists(select 1 from public.profiles p where p.id=d.mentor_id and p.role='admin' and lower(btrim(p.email))=lower(btrim(d.recipient_email)))
  or not exists(select 1 from public.student_trades t join public.profiles p on p.id=t.student_id where t.id=d.trade_id and t.student_id=d.student_id and p.role='aluno')
  or exists(select 1 from public.student_trade_comments c join public.profiles p on p.id=c.author_id where c.trade_id=d.trade_id and c.student_id=d.student_id and p.role='admin')
 );
 select d.* into candidate from public.student_trade_email_deliveries d
 where d.status in('pending','failed') and d.retry_after<=now() and d.attempts<3
 order by d.id for update skip locked limit 1;
 if not found then return;end if;
 return query
 with picked as (
  select d.id from public.student_trade_email_deliveries d
  where d.student_id=candidate.student_id and d.mentor_id=candidate.mentor_id
  and d.status in('pending','failed') and d.retry_after<=now() and d.attempts<3
  order by d.id for update skip locked limit 50
 ), claimed as (
  update public.student_trade_email_deliveries d set status='processing',attempts=d.attempts+1,batch_id=batch
  where d.id in(select picked.id from picked) returning d.*
 )
 select batch,candidate.recipient_email,candidate.student_id,p.nome,
 jsonb_agg(jsonb_build_object('id',t.id::text,'symbol',t.symbol,'trade_date',t.trade_date) order by d.id)
 from claimed d join public.student_trades t on t.id=d.trade_id join public.profiles p on p.id=d.student_id
 group by p.nome;
end;$$;
revoke all on function public.claim_student_trade_email() from public,anon,authenticated;
grant execute on function public.claim_student_trade_email() to service_role;

create or replace function public.finish_student_trade_email(target_batch uuid,outcome text,delay_minutes integer default 15)
returns void language plpgsql security definer set search_path=public as $$
begin
 if outcome not in('sent','failed','uncertain') then raise exception 'Invalid outcome';end if;
 update public.student_trade_email_deliveries set status=outcome,
 sent_at=case when outcome='sent' then now() else null end,
 retry_after=now()+make_interval(mins=>greatest(15,least(delay_minutes,1440)))
 where batch_id=target_batch and status='processing';
end;$$;
revoke all on function public.finish_student_trade_email(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.finish_student_trade_email(uuid,text,integer) to service_role;
notify pgrst,'reload schema';
commit;
