// Arquivo completo: pode ser colado sozinho no editor de Edge Functions.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const cors={'Access-Control-Allow-Origin':'https://francotrades.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
function mailWebhook(value){const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)||url.username||url.password)throw Error('Invalid mail webhook');return url.toString();}
function mentorLink(student,trade){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(student))||trade!=null&&!/^[1-9]\d{0,18}$/.test(String(trade)))throw Error('Invalid diary reference');
 return 'https://francotrades.github.io/mentoria-individual/admin/diario-de-trade/?student='+encodeURIComponent(student)+(trade!=null?'&trade='+trade:'');
}
function mentorEmail(batch){
 const trades=batch.trades;if(!Array.isArray(trades)||!trades.length||trades.length>50)throw Error('Invalid trade batch');
 const name=String(batch.student_name||'Mentorado');
 const link=mentorLink(batch.student_id,trades.length===1?trades[0].id:null);
 const items=trades.map(trade=>'<li><a href="'+escapeHtml(mentorLink(batch.student_id,trade.id))+'">'+escapeHtml(trade.symbol)+' · '+escapeHtml(trade.trade_date)+'</a></li>').join('');
 return {to:String(batch.email||'').trim(),subject:(trades.length===1?'Novo trade':'Novos trades')+' para feedback — '+name.replace(/[\r\n]/g,' ')+' | Franco Trades',html:'<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f8f5;font-family:Arial,sans-serif;color:#142019"><div style="max-width:620px;margin:auto;padding:30px 18px"><h2>FRANCO <span style="color:#16844d">TRADES</span></h2><div style="background:#fff;border:1px solid #d3dfd7;border-radius:14px;padding:24px"><h1 style="font-size:24px">'+(trades.length===1?'Novo trade para revisar':'Novos trades para revisar')+'</h1><p><strong>'+escapeHtml(name)+'</strong> adicionou '+trades.length+' '+(trades.length===1?'operação':'operações')+' ao diário. Acesse para analisar e deixar seu feedback.</p><ul>'+items+'</ul><a href="'+escapeHtml(link)+'" style="display:inline-block;padding:14px 20px;background:#43e290;color:#04130c;text-decoration:none;border-radius:8px;font-weight:bold">Abrir diário e dar feedback</a><p style="font-size:13px;color:#66756c">O acesso exige sua conta de mentor. Prints, anotações e detalhes das operações ficam no portal.</p></div></div></body></html>'};
}
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 const worker=Deno.env.get('REVIEW_NOTICE_WORKER_SECRET');
 if(!worker||worker.length<32||token!==worker){
  const {data:auth,error}=await db.auth.getUser(token);if(error||!auth?.user)return reply({error:'Unauthorized'},401);
  const {data:profile}=await db.from('profiles').select('role').eq('id',auth.user.id).single();if(profile?.role!=='admin')return reply({error:'Forbidden'},403);
 }
 if(Deno.env.get('MENTOR_TRADE_NOTICES_ENABLED')==='false')return reply({configured:true,paused:true,sent:0});
 const raw=Deno.env.get('GOOGLE_MAIL_WEBHOOK_URL'),secret=Deno.env.get('GOOGLE_MAIL_SECRET');
 if(!raw||!secret)return reply({configured:false,sent:0});
 let url;try{url=mailWebhook(raw)}catch{return reply({error:'Mail configuration invalid'},503)}
 let sent=0,notifiedTrades=0,failed=0,needsCheck=false;const start=Date.now();
 async function finish(batch,outcome,delay=15){const {error}=await db.rpc('finish_student_trade_email',{target_batch:batch.batch_id,outcome,delay_minutes:delay});if(error){needsCheck=true;return false}return true;}
 for(let i=0;i<10&&Date.now()-start<60000;i++){
  const {data,error}=await db.rpc('claim_student_trade_email');if(error)return reply({error:'Mentor notice database unavailable'},503);
  const batch=data?.[0];if(!batch)break;
  let mail;try{mail=mentorEmail(batch);if(!mail.to)throw Error('Missing recipient')}catch{await finish(batch,'failed');failed++;break;}
  let response;
  try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret,...mail}),signal:AbortSignal.timeout(15000)});}catch{await finish(batch,'uncertain');needsCheck=true;break;}
  if(!response.ok){const status=response.status>=500?'uncertain':'failed';await finish(batch,status);if(status==='uncertain')needsCheck=true;else failed++;break;}
  let result;try{result=await response.json()}catch{await finish(batch,'uncertain');needsCheck=true;break;}
  if(result.ok!==true){const delay=/quota|one day|daily|di[aá]rio|cota/i.test(String(result.error||''))?1440:15;await finish(batch,'failed',delay);failed++;break;}
  sent++;notifiedTrades+=batch.trades.length;
  // Sem confirmação no banco, mantém processing: não duplica um envio já aceito.
  if(!await finish(batch,'sent'))break;
 }
 return reply({configured:true,sent,notifiedTrades,failed,needsCheck});
});
