alter table public.mentorship_financials
  drop constraint mentorship_financials_moeda_check,
  add constraint mentorship_financials_moeda_check
    check (moeda in ('BRL', 'USD', 'EUR'));
