-- Reuse the existing review worker Vault secrets without exposing their values.
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='review_notice_worker_url' and decrypted_secret ~ '^https://[^/]+\.supabase\.co/functions/v1/trade-review-notification/?$')
 or not exists(select 1 from vault.decrypted_secrets where name='review_notice_worker_secret' and length(decrypted_secret)>=32)
 then raise exception 'Confira review_notice_worker_url e review_notice_worker_secret no Vault';end if;
end;$$;
select cron.unschedule(jobid) from cron.job where jobname='payment-receipt-emails';
select cron.schedule('payment-receipt-emails','* * * * *',$job$
 select net.http_post(
  url:=regexp_replace(u.decrypted_secret,'/trade-review-notification/?$','/payment-receipt'),
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||s.decrypted_secret),
  body:='{}'::jsonb)
 from vault.decrypted_secrets u cross join vault.decrypted_secrets s
 where u.name='review_notice_worker_url' and s.name='review_notice_worker_secret';
$job$);
