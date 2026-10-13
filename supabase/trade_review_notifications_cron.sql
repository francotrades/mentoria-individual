-- Opcional, recomendado: processa a fila mesmo se o mentor fechar o portal após salvar.
-- Primeiro: instale pg_net e pg_cron no dashboard; crie no Vault:
-- review_notice_worker_url: URL HTTPS da função trade-review-notification
-- review_notice_worker_secret: mesmo valor privado de REVIEW_NOTICE_WORKER_SECRET
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname in('trade-review-discord-notices','trade-review-email-notices');
select cron.schedule('trade-review-email-notices','* * * * *', $job$
 select net.http_post(url:=u.decrypted_secret,
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||s.decrypted_secret),body:='{}'::jsonb)
 from vault.decrypted_secrets u cross join vault.decrypted_secrets s
 where u.name='review_notice_worker_url' and s.name='review_notice_worker_secret';
$job$);
