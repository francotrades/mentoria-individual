-- FrancoTrades Mentoria - nova periodicidade dos lembretes
-- Execute uma única vez no SQL Editor do Supabase.
-- Nova régua automática:
--   3 dias antes do vencimento
--   no dia do vencimento
--   3 dias após o vencimento
--
-- Os tipos antigos permanecem aceitos apenas para preservar o histórico já gravado.

alter table public.payment_reminder_log
  drop constraint if exists payment_reminder_log_reminder_type_check;

alter table public.payment_reminder_log
  add constraint payment_reminder_log_reminder_type_check
  check (
    reminder_type in (
      '3_days_before',
      'due_today',
      '3_days_overdue',
      'manual',
      '5_days_before',
      '1_day_before'
    )
  );
