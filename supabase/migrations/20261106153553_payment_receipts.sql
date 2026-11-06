-- Receipts are immutable payment snapshots. Existing paid installments are baselined without sending.
create schema if not exists receipt_private;
revoke all on schema receipt_private from public,anon,authenticated;
create table if not exists public.payment_receipts (
 id uuid primary key default gen_random_uuid(),
 mentorship_id uuid not null references public.mentorship_financials(id) on delete cascade,
 installment integer not null, amount numeric(12,2) not null, currency text not null,
 paid_date date not null, recipient_email text not null, recipient_name text not null,
 status text not null default 'queued' check(status in ('historical','queued','processing','sent','failed','uncertain','cancelled')),
 created_at timestamptz not null default now(), sent_at timestamptz,
 available_at timestamptz not null default now()+interval '30 seconds',
 claim_token uuid, claimed_at timestamptz, attempts integer not null default 0,
 constraint payment_receipts_payment_key unique(mentorship_id,installment,amount,currency,paid_date)
);
alter table public.payment_receipts enable row level security;
revoke all on public.payment_receipts from public,anon,authenticated;
grant select(id,mentorship_id,installment,amount,currency,paid_date,status,created_at,sent_at,attempts) on public.payment_receipts to authenticated;
grant all on public.payment_receipts to service_role;
create policy admin_read_receipts on public.payment_receipts for select to authenticated using ((select public.is_admin()));
create index payment_receipts_queue_idx on public.payment_receipts(available_at) where status='queued';

-- No retroactive messages at activation.
insert into public.payment_receipts(mentorship_id,installment,amount,currency,paid_date,recipient_email,recipient_name,status)
select p.mentorship_id,p.numero_parcela,p.valor,f.moeda,coalesce(p.data_pagamento,(p.updated_at at time zone 'America/Sao_Paulo')::date),f.email,f.nome,'historical'
from public.mentorship_payments p join public.mentorship_financials f on f.id=p.mentorship_id where p.paga
on conflict do nothing;

create function receipt_private.capture_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare f public.mentorship_financials;
begin
 if not new.paga then return new;end if;
 if tg_op='UPDATE' then if old.paga then return new;end if;end if;
 select * into strict f from public.mentorship_financials where id=new.mentorship_id;
 insert into public.payment_receipts(mentorship_id,installment,amount,currency,paid_date,recipient_email,recipient_name)
 values(new.mentorship_id,new.numero_parcela,new.valor,f.moeda,coalesce(new.data_pagamento,(now() at time zone 'America/Sao_Paulo')::date),f.email,f.nome) on conflict do nothing;
 return new;
end $$;
revoke all on function receipt_private.capture_payment() from public,anon,authenticated;
create trigger payment_receipt_capture after insert or update of paga on public.mentorship_payments for each row execute function receipt_private.capture_payment();

-- Admin-only transaction: retain IDs and reject removing/renumbering paid history.
create function public.save_mentorship_installments(target_contract uuid, installments jsonb) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; existing public.mentorship_payments; keep_ids bigint[]:='{}'; next_id bigint; n integer; v numeric; due date; paid boolean; paid_on date;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Somente o mentor pode salvar parcelas';end if;
 perform 1 from public.mentorship_financials where id=target_contract for update;
 if not found then raise exception 'Contrato não encontrado';end if;
 if installments is null or jsonb_typeof(installments)<>'array' or jsonb_array_length(installments)>200 then raise exception 'Parcelas inválidas';end if;
 if (select count(*)<>count(distinct (e->>'numero_parcela')::integer) from jsonb_array_elements(installments) e) then raise exception 'Numeração de parcelas repetida';end if;
 -- Existing IDs must belong to this contract. Do not let omitted IDs replace a paid installment.
 for item in select * from jsonb_array_elements(installments) loop
  if nullif(item->>'id','') is not null and not exists(select 1 from public.mentorship_payments where id=(item->>'id')::bigint and mentorship_id=target_contract) then raise exception 'Parcela inválida';end if;
 end loop;
 if exists(select 1 from public.mentorship_payments p where p.mentorship_id=target_contract and p.paga and not exists(select 1 from jsonb_array_elements(installments) e where (e->>'id')::bigint=p.id)) then raise exception 'Desmarque o pagamento antes de remover uma parcela paga';end if;
 -- Delete removed pending installments before adding replacements.
 delete from public.mentorship_payments p where p.mentorship_id=target_contract and not exists(select 1 from jsonb_array_elements(installments) e where (e->>'id')::bigint=p.id);
 -- Keep numbering stable for existing installments; new installments use a free number.
 for item in select * from jsonb_array_elements(installments) loop
  n:=(item->>'numero_parcela')::integer;v:=(item->>'valor')::numeric;due:=nullif(item->>'vencimento','')::date;paid:=coalesce((item->>'paga')::boolean,false);paid_on:=case when paid then coalesce(nullif(item->>'data_pagamento','')::date,(now() at time zone 'America/Sao_Paulo')::date) end;
  if n is null or n<1 or n>200 or v is null or v<0 or v>9999999999.99 then raise exception 'Valor ou número de parcela inválido';end if;
  if nullif(item->>'id','') is not null then
   select * into strict existing from public.mentorship_payments where id=(item->>'id')::bigint and mentorship_id=target_contract;
   if existing.numero_parcela<>n then raise exception 'Mantenha a numeração das parcelas existentes';end if;
   update public.mentorship_payments set valor=v,vencimento=due,paga=paid,data_pagamento=paid_on,updated_at=now() where id=existing.id;
  else
   insert into public.mentorship_payments(mentorship_id,numero_parcela,valor,vencimento,paga,data_pagamento) values(target_contract,n,v,due,paid,paid_on);
  end if;
 end loop;
end $$;
revoke all on function public.save_mentorship_installments(uuid,jsonb) from public,anon;
grant execute on function public.save_mentorship_installments(uuid,jsonb) to authenticated;

create function public.request_payment_receipt(target_payment bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.mentorship_payments;f public.mentorship_financials;r public.payment_receipts;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Somente o mentor pode reenviar recibos';end if;
 select * into strict p from public.mentorship_payments where id=target_payment for update;
 if not p.paga then raise exception 'A parcela precisa estar paga';end if;
 select * into strict f from public.mentorship_financials where id=p.mentorship_id;
 if f.email !~ '^[^[:space:]@,;]+@[^[:space:]@,;]+\.[^[:space:]@,;]+$' then raise exception 'Confira o email do mentorado';end if;
 insert into public.payment_receipts(mentorship_id,installment,amount,currency,paid_date,recipient_email,recipient_name,status)
 values(p.mentorship_id,p.numero_parcela,p.valor,f.moeda,coalesce(p.data_pagamento,(p.updated_at at time zone 'America/Sao_Paulo')::date),f.email,f.nome,'historical') on conflict do nothing;
 select * into strict r from public.payment_receipts where mentorship_id=p.mentorship_id and installment=p.numero_parcela and amount=p.valor and currency=f.moeda and paid_date=coalesce(p.data_pagamento,(p.updated_at at time zone 'America/Sao_Paulo')::date) for update;
 if r.status in ('queued','processing') then return r.id;end if;
 if r.sent_at>now()-interval '5 minutes' or r.claimed_at>now()-interval '5 minutes' then raise exception 'Aguarde cinco minutos antes de reenviar';end if;
 update public.payment_receipts set status='queued',recipient_email=f.email,recipient_name=f.nome,available_at=now(),claim_token=null,claimed_at=null where id=r.id;
 return r.id;
end $$;
revoke all on function public.request_payment_receipt(bigint) from public,anon;
grant execute on function public.request_payment_receipt(bigint) to authenticated;

create function public.claim_payment_receipt() returns setof public.payment_receipts language plpgsql security definer set search_path='' as $$
declare r public.payment_receipts;
begin
 -- Lost confirmations are held for manual review, never automatically sent twice.
 update public.payment_receipts set status='uncertain' where status='processing' and claimed_at<now()-interval '10 minutes';
 for r in select * from public.payment_receipts where status='queued' and available_at<=now() order by available_at for update skip locked limit 20 loop
  if not exists(select 1 from public.mentorship_payments p join public.mentorship_financials f on f.id=p.mentorship_id where p.mentorship_id=r.mentorship_id and p.numero_parcela=r.installment and p.paga and p.valor=r.amount and coalesce(p.data_pagamento,(p.updated_at at time zone 'America/Sao_Paulo')::date)=r.paid_date and f.moeda=r.currency and f.email=r.recipient_email and f.nome=r.recipient_name) or r.recipient_email !~ '^[^[:space:]@,;]+@[^[:space:]@,;]+\.[^[:space:]@,;]+$' then
   update public.payment_receipts set status='cancelled' where id=r.id;continue;
  end if;
  return query update public.payment_receipts set status='processing',claim_token=gen_random_uuid(),claimed_at=now(),attempts=attempts+1 where id=r.id returning *;
  return;
 end loop;
end $$;
create function public.finish_payment_receipt(target_receipt uuid, token uuid, outcome text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if outcome not in ('sent','failed','uncertain') then raise exception 'Invalid outcome';end if;
 update public.payment_receipts set status=outcome,sent_at=case when outcome='sent' then now() else sent_at end where id=target_receipt and claim_token=token and status='processing';return found;
end $$;
revoke all on function public.claim_payment_receipt() from public,anon,authenticated;
revoke all on function public.finish_payment_receipt(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_payment_receipt() to service_role;
grant execute on function public.finish_payment_receipt(uuid,uuid,text) to service_role;
