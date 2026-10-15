-- Reutiliza os dois registros do Vault já criados para os avisos de revisão.
-- Não altera o agendamento que envia as revisões do mentor aos alunos.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='review_notice_worker_url' and decrypted_secret ~ '^https://[^/]+\.supabase\.co/functions/v1/trade-review-notification/?$')
 or not exists(select 1 from vault.decrypted_secrets where name='review_notice_worker_secret' and length(decrypted_secret)>=32)
 then raise exception 'Confira review_notice_worker_url e review_notice_worker_secret no Vault';end if;
end;$$;
select cron.unschedule(jobid) from cron.job where jobname='student-trade-email-notices';
select cron.schedule('student-trade-email-notices','* * * * *',$job$
 select net.http_post(
  url:=regexp_replace(u.decrypted_secret,'/trade-review-notification/?$','/student-trade-notification'),
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||s.decrypted_secret),
  body:='{}'::jsonb)
 from vault.decrypted_secrets u cross join vault.decrypted_secrets s
 where u.name='review_notice_worker_url' and s.name='review_notice_worker_secret';
$job$);
