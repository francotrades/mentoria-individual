import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import {receiptEmail} from './email.js';
const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async request=>{
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 const secret=Deno.env.get('REVIEW_NOTICE_WORKER_SECRET');
 if(!secret||secret.length<32||request.headers.get('authorization')!=='Bearer '+secret)return reply({error:'Unauthorized'},401);
 const raw=Deno.env.get('GOOGLE_MAIL_WEBHOOK_URL'),mailSecret=Deno.env.get('GOOGLE_MAIL_SECRET');
 if(!raw||!mailSecret)return reply({configured:false},503);
 let url;try{url=new URL(raw);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)||url.username||url.password)throw Error();}catch{return reply({error:'Invalid mail configuration'},503);}
 let payload;try{payload=await request.json()}catch{payload={}}
 if(payload?.healthOnly===true)return reply({configured:true,ready:true});
 let sent=0,failed=0,needsCheck=false;const start=Date.now();
 for(let i=0;i<8&&Date.now()-start<45000;i++){
  const {data,error}=await db.rpc('claim_payment_receipt');if(error)return reply({error:'Receipt queue unavailable'},503);
  const r=data?.[0];if(!r)break;
  const finish=async outcome=>{const {data,error}=await db.rpc('finish_payment_receipt',{target_receipt:r.id,token:r.claim_token,outcome});return !error&&data===true;};
  let mail;try{mail=receiptEmail(r);}catch{await finish('failed');failed++;continue;}
  let response,result;
  try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:mailSecret,...mail}),signal:AbortSignal.timeout(15000)});
   if(!response.ok){await finish('uncertain');needsCheck=true;break;}
   result=await response.json();
  }catch{await finish('uncertain');needsCheck=true;break;}
  if(result.ok!==true){await finish('failed');failed++;break;}
  sent++;if(!await finish('sent')){needsCheck=true;break;}
 }
 return reply({configured:true,sent,failed,needsCheck});
});
