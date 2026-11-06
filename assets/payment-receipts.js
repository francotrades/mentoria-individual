export function receiptFor(payment,receipts,currency){
 return receipts.find(r=>r.installment===payment.numero_parcela&&r.mentorship_id===payment.mentorship_id&&Number(r.amount)===Number(payment.valor)&&r.currency===currency&&(!payment.data_pagamento||r.paid_date===payment.data_pagamento))||null;
}
export function receiptLabel(receipt){
 return ({historical:'Pagamento anterior à ativação',queued:'Recibo aguardando envio',processing:'Recibo em envio',sent:'Recibo enviado por email',failed:'Falha no envio do recibo',uncertain:'Envio sem confirmação: confira antes de reenviar',cancelled:'Recibo cancelado: confira os dados'})[receipt?.status]||'Recibo ainda não emitido';
}
export async function requestReceipt(client,paymentId){
 const {error}=await client.rpc('request_payment_receipt',{target_payment:paymentId});if(error)throw new Error(error.message||'Não foi possível solicitar o recibo');
}
