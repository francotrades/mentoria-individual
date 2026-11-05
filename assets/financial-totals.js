// Todos os cálculos monetários são feitos em centavos.
const cents=value=>{const number=Number(value||0);return Number.isFinite(number)?Math.round(number*100):0;};
export function installmentTotal(payments){return payments.reduce((sum,payment)=>sum+cents(payment.valor),0)/100;}
export function financialTotals(declaredTotal,payments){
 const scheduled=payments.reduce((sum,payment)=>sum+cents(payment.valor),0);
 const received=payments.filter(payment=>payment.paga===true).reduce((sum,payment)=>sum+cents(payment.valor),0);
 // Parcelas novas já salvas não podem desaparecer do saldo por um total antigo.
 const contracted=Math.max(0,cents(declaredTotal),scheduled);
 return {contracted:contracted/100,scheduled:scheduled/100,received:received/100,outstanding:Math.max(0,contracted-received)/100};
}
export function nextContractTotal(currentTotal,previousScheduled,nextScheduled){
 // Um contrato totalmente parcelado acompanha edições e extensões do cronograma.
 // Se ainda há valor não parcelado, preserva o total informado até que seja coberto.
 const current=cents(currentTotal),previous=cents(previousScheduled),next=cents(nextScheduled);
 return Math.max(0,current<=previous?next:Math.max(current,next))/100;
}
