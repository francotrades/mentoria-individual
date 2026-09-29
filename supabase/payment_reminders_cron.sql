-- FrancoTrades Mentoria - agendamento diário dos lembretes
-- Execute somente DEPOIS de:
-- 1) publicar a Edge Function payment-reminders;
-- 2) cadastrar os secrets no Supabase Vault:
--    project_url
--    publishable_key
--    reminder_cron_secret
-- O valor de reminder_cron_secret deve ser exatamente o mesmo
-- configurado em Edge Functions > Secrets como REMINDER_CRON_SECRET.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'francotrades-payment-reminders';
exception
  when others then
    null;
end $$;

select cron.schedule(
  'francotrades-payment-reminders',
  '0 12 * * *',
  $$
  select
    net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'project_url'
        limit 1
      ) || '/functions/v1/payment-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'publishable_key'
          limit 1
        ),
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'reminder_cron_secret'
          limit 1
        )
      ),
      body := jsonb_build_object(
        'source', 'supabase-cron',
        'run_at', now()
      ),
      timeout_milliseconds := 15000
    ) as request_id;
  $$
);
