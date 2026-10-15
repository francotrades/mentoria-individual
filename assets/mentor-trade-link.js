// Retorno limitado ao diário administrativo: nunca aceita URLs livres.
export function mentorTradeReference(search){
 const params=new URLSearchParams(search),student=params.get('student'),trade=params.get('trade');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(student||'')||(trade!==null&&!/^[1-9]\d{0,18}$/.test(trade)))return null;
 return {student,trade};
}
export function mentorLoginSuffix(search){const ref=mentorTradeReference(search);return ref?'?student='+ref.student+(ref.trade?'&trade='+ref.trade:''):'';}
export function mentorLoginDestination(search){const suffix=mentorLoginSuffix(search);return suffix?'../admin/diario-de-trade/'+suffix:'../admin/';}
