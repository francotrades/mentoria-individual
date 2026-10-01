-- Diário de Trade — recursos avançados de contas/prop firms
-- Execute após student_trade_journal.sql se a estrutura base já tiver sido criada.
-- É seguro executar mais de uma vez.

alter table public.student_trade_accounts
  add column if not exists account_size numeric(18,2),
  add column if not exists account_stage text not null default 'new',
  add column if not exists current_balance numeric(18,2),
  add column if not exists drawdown_remaining numeric(18,2),
  add column if not exists max_drawdown numeric(18,2),
  add column if not exists profit_target numeric(18,2),
  add column if not exists daily_loss_limit numeric(18,2),
  add column if not exists consistency_rule numeric(8,2),
  add column if not exists rules jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_trade_accounts_stage_check'
  ) then
    alter table public.student_trade_accounts
      add constraint student_trade_accounts_stage_check
      check (account_stage in ('new','existing'));
  end if;
end
$$;

create index if not exists student_trade_accounts_prop_firm_idx
  on public.student_trade_accounts(student_id, prop_firm, active);
