begin;

alter table public.mentorship_financials
  add column usdc_base_address text
    check (usdc_base_address ~ '^0x[0-9A-Fa-f]{40}$'
      and usdc_base_address <> '0x0000000000000000000000000000000000000000');

alter table public.mentorship_payments
  add column usdc_amount numeric
    check (usdc_amount > 0 and usdc_amount <= 9999999999.999999
      and scale(usdc_amount) <= 6);

-- Reuse the existing admin-only installment save, including its receipt triggers.
create function public.save_mentorship_installments(
  target_contract uuid,
  installments jsonb,
  base_address text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.save_mentorship_installments(target_contract, installments);

  update public.mentorship_financials
  set usdc_base_address = base_address
  where id = target_contract and usdc_base_address is distinct from base_address;

  if base_address is not null then
    update public.mentorship_payments as payment
    set usdc_amount = (item.value->>'usdc_amount')::numeric
    from jsonb_array_elements(installments) as item(value)
    where payment.mentorship_id = target_contract
      and payment.numero_parcela = (item.value->>'numero_parcela')::integer
      and payment.usdc_amount is distinct from (item.value->>'usdc_amount')::numeric;
  end if;
end;
$$;

revoke all on function public.save_mentorship_installments(uuid, jsonb, text) from public, anon;
grant execute on function public.save_mentorship_installments(uuid, jsonb, text) to authenticated;

commit;
