-- Reuse existing Vault credentials; never return or copy their values.
do $$begin
 if not exists(select 1 from vault.decrypted_secrets where name='review_notice_worker_url' and decrypted_secret ~ '^https://[^/]+\.supabase\.co/functions/v1/trade-review-notification/?$')
 or not exists(select 1 from vault.decrypted_secrets where name='review_notice_worker_secret' and length(decrypted_secret)>=32)
 then raise exception 'Existing worker configuration unavailable';end if;
end;$$;
select cron.unschedule(jobid) from cron.job where jobname='session-schedule-notifications';
select cron.schedule('session-schedule-notifications','* * * * *',$job$
 select net.http_post(
  url:=regexp_replace(u.decrypted_secret,'/trade-review-notification/?$','/session-schedule-notification'),
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||s.decrypted_secret),
  body:='{}'::jsonb)
 from vault.decrypted_secrets u cross join vault.decrypted_secrets s
 where u.name='review_notice_worker_url' and s.name='review_notice_worker_secret';
$job$);
