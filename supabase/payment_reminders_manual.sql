-- FrancoTrades Mentoria - habilita lembretes manuais no histórico
-- Execute uma única vez no SQL Editor do Supabase.

alter table public.payment_reminder_log
  drop constraint if exists payment_reminder_log_reminder_type_check;

alter table public.payment_reminder_log
  add constraint payment_reminder_log_reminder_type_check
  check (
    reminder_type in (
      '5_days_before',
      '1_day_before',
      'due_today',
      '3_days_overdue',
      'manual'
    )
  );

alter table public.payment_reminder_log
  drop constraint if exists payment_reminder_log_unique;

create unique index if not exists payment_reminder_log_automatic_unique
  on public.payment_reminder_log(payment_id, reminder_type)
  where reminder_type <> 'manual';

create index if not exists payment_reminder_log_sent_at_idx
  on public.payment_reminder_log(sent_at desc);
