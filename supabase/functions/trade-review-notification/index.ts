import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
import {discordWebhook,noticePayload} from "../shared/review-protocol.js";
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
 const raw=Deno.env.get('DISCORD_REVIEW_WEBHOOK_URL');if(!raw)return reply({configured:false,sent:0});
 let url:string;try{url=discordWebhook(raw)}catch{return reply({error:'Webhook configuration invalid'},503)}
 let sent=0,needsCheck=false,failed=0;
 // Pedido do mentor após o commit. Nunca envia corpo, imagem ou link privado do vídeo.
 for(let i=0;i<10;i++){
  const {data:claimed,error}=await db.rpc('claim_trade_review_notice');if(error)return reply({error:'Notification database unavailable'},503);
  const row=claimed?.[0];if(!row)break;
  const table=row.review_type==='analysis'?'trade_analysis_reviews':'trade_reviews';
  const {data:review,error:reviewError}=await db.from(table).select('id,titulo,ativo').eq('id',row.review_id).maybeSingle();
  if(reviewError){failed++;await db.from('trade_review_notice_queue').update({status:'failed',retry_after:new Date(Date.now()+60000).toISOString()}).eq('id',row.id);break;}
  if(!review?.ativo){await db.from('trade_review_notice_queue').update({status:'cancelled'}).eq('id',row.id);continue;}
  let response:Response;
  try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(noticePayload({...row,title:review.titulo})),signal:AbortSignal.timeout(15000)});}catch{
   await db.from('trade_review_notice_queue').update({status:'uncertain'}).eq('id',row.id);needsCheck=true;break;
  }
  if(!response.ok){
   // Uma falha HTTP é definitiva. Timeout/conexão ambígua nunca reenvia automaticamente.
   const status=response.status>=500?'uncertain':'failed';if(status==='uncertain')needsCheck=true;else failed++;
   await db.from('trade_review_notice_queue').update({status,retry_after:new Date(Date.now()+60000).toISOString()}).eq('id',row.id);break;
  }
  let message;try{message=await response.json()}catch{await db.from('trade_review_notice_queue').update({status:'uncertain'}).eq('id',row.id);needsCheck=true;break;}
  const {error:updateError}=await db.from('trade_review_notice_queue').update({status:'sent',sent_at:new Date().toISOString(),message_id:message.id}).eq('id',row.id);
  // Se o registro falhar após o Discord confirmar, permanece processing; não duplica aviso.
  if(updateError)return reply({configured:true,sent:sent+1,needsCheck:true});sent++;
 }
 return reply({configured:true,sent,needsCheck,failed});
});
