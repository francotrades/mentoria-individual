import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
import {mailWebhook,reviewEmail} from "../shared/review-protocol.js";
const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const cors={'Access-Control-Allow-Origin':'https://francotrades.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 const worker=Deno.env.get('REVIEW_NOTICE_WORKER_SECRET');
 if(!worker||worker.length<32||token!==worker){
  const {data:auth,error:authError}=await db.auth.getUser(token);if(authError||!auth.user)return reply({error:'Unauthorized'},401);
  const {data:profile}=await db.from('profiles').select('role').eq('id',auth.user.id).single();if(profile?.role!=='admin')return reply({error:'Forbidden'},403);
 }
 if(Deno.env.get('REVIEW_EMAIL_NOTICES_ENABLED')==='false')return reply({configured:true,paused:true,sent:0});
 const raw=Deno.env.get('GOOGLE_MAIL_WEBHOOK_URL'),secret=Deno.env.get('GOOGLE_MAIL_SECRET');
 if(!raw||!secret)return reply({configured:false,sent:0});
 let url:string;try{url=mailWebhook(raw)}catch{return reply({error:'Mail configuration invalid'},503)}
 let sent=0,skipped=0,needsCheck=false,failed=0;const start=Date.now();
 for(let i=0;i<20&&Date.now()-start<60000;i++){
  const {data:claimed,error}=await db.rpc('claim_trade_review_email');if(error)return reply({error:'Email database unavailable'},503);
  const row=claimed?.[0];if(!row)break;
  const {data:targets,error:targetError}=await db.rpc('trade_review_email_target',{delivery_id:row.id});
  if(targetError){failed++;await db.from('trade_review_email_deliveries').update({status:'failed',retry_after:new Date(Date.now()+15*60000).toISOString()}).eq('id',row.id);break;}
  const target=targets?.[0];
  if(!target?.allowed||!String(target.email||'').trim()){
   await db.from('trade_review_email_deliveries').update({status:'cancelled'}).eq('id',row.id);skipped++;continue;
  }
  let response:Response;
  try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret,...reviewEmail(target)}),signal:AbortSignal.timeout(15000)});}catch{
   await db.from('trade_review_email_deliveries').update({status:'uncertain'}).eq('id',row.id);needsCheck=true;break;
  }
  if(!response.ok){
   const status=response.status>=500?'uncertain':'failed';if(status==='uncertain')needsCheck=true;else failed++;
   await db.from('trade_review_email_deliveries').update({status,retry_after:new Date(Date.now()+15*60000).toISOString()}).eq('id',row.id);break;
  }
  let result;try{result=await response.json()}catch{await db.from('trade_review_email_deliveries').update({status:'uncertain'}).eq('id',row.id);needsCheck=true;break;}
  if(result.ok!==true){
   const delay=/quota|one day|daily|di[aá]rio|cota/i.test(String(result.error||''))?24*60*60000:15*60000;
   await db.from('trade_review_email_deliveries').update({status:'failed',retry_after:new Date(Date.now()+delay).toISOString()}).eq('id',row.id);failed++;break;
  }
  const {error:updateError}=await db.from('trade_review_email_deliveries').update({status:'sent',sent_at:new Date().toISOString()}).eq('id',row.id);
  // Após confirmação do provedor, um registro incompleto não é reenviado automaticamente.
  if(updateError)return reply({configured:true,sent:sent+1,needsCheck:true,skipped});sent++;
 }
 return reply({configured:true,sent,skipped,needsCheck,failed});
});
