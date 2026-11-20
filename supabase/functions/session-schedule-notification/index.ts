import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.119.0';
import {scheduleEmail} from './email.js';
const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const cors={'Access-Control-Allow-Origin':'https://francotrades.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 const secret=Deno.env.get('REVIEW_NOTICE_WORKER_SECRET');
 const worker=!!secret&&secret.length>=32&&token===secret;
 if(!worker){
  const {data,error}=await db.auth.getUser(token);if(error||!data?.user)return reply({error:'Unauthorized'},401);
  const {data:profile}=await db.from('profiles').select('role').eq('id',data.user.id).single();
  if(profile?.role!=='admin')return reply({error:'Forbidden'},403);
 }
 let body;try{body=await request.json()}catch{body={}}
 const target=body.student_session_id==null?null:Number(body.student_session_id);
 if(!worker&&(!Number.isSafeInteger(target)||target<=0)&&body.healthOnly!==true)return reply({error:'Session required'},400);
 const raw=Deno.env.get('GOOGLE_MAIL_WEBHOOK_URL'),mailSecret=Deno.env.get('GOOGLE_MAIL_SECRET');
 if(!raw||!mailSecret)return reply({configured:false,sent:0});
 let url;try{url=new URL(raw);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)||url.username||url.password)throw Error();}catch{return reply({error:'Invalid mail configuration'},503)}
 if(body.healthOnly===true)return reply({configured:true,ready:true});
 let sent=0,failed=0,needsCheck=false;const started=Date.now();
 for(let i=0;i<8&&Date.now()-started<45000;i++){
  const {data:item,error}=await db.rpc('claim_session_schedule_notice',{target_session:target});
  if(error)return reply({error:'Schedule queue unavailable'},503);
  if(!item)break;
  const finish=async(outcome,delay=15)=>{const {data,error}=await db.rpc('finish_session_schedule_notice',{target_notice:item.id,token:item.claim_token,outcome,delay_minutes:delay});return !error&&data===true};
  let mail;try{mail=scheduleEmail(item)}catch{await finish('failed');failed++;break;}
  let response,result;
  try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:mailSecret,...mail}),signal:AbortSignal.timeout(15000)});
   if(!response.ok){await finish('uncertain');needsCheck=true;break;}
   result=await response.json();
  }catch{await finish('uncertain');needsCheck=true;break;}
  if(result.ok!==true){await finish('failed',/quota|daily|one day|cota/i.test(String(result.error||''))?1440:15);failed++;break;}
  sent++;if(!await finish('sent')){needsCheck=true;break;}
 }
 return reply({configured:true,sent,failed,needsCheck});
});
