import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {mentorTradeReference,mentorLoginSuffix,mentorLoginDestination} from '../assets/mentor-trade-link.js';
const student='11111111-1111-4111-8111-111111111111';
const source=fs.readFileSync(new URL('../supabase/functions/student-trade-notification/index.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
function fixture({role='admin',configured=true,paused=false,network='ok',finishError=false}={}){
 let handler,sends=0,mail,claimed=false;
 const state={status:'pending',outcome:null,delay:null};
 const batch={batch_id:'batch',email:'mentor@example.com',student_id:student,student_name:'Ana <script>',trades:[{id:'1',symbol:'<img>',trade_date:'2026-10-15'},{id:'2',symbol:'YM',trade_date:'2026-10-15'}]};
 const env={SUPABASE_URL:'https://project.test',SUPABASE_SERVICE_ROLE_KEY:'private',REVIEW_NOTICE_WORKER_SECRET:'worker-secret-long-0123456789abcdef',...(configured?{GOOGLE_MAIL_WEBHOOK_URL:'https://script.google.com/macros/s/test/exec',GOOGLE_MAIL_SECRET:'private-mail'}:{}),...(paused?{MENTOR_TRADE_NOTICES_ENABLED:'false'}:{})};
 const db={auth:{getUser:async token=>({data:{user:token==='user'?{id:'user'}:null},error:null})},from(){return {select(){return this},eq(){return this},single:async()=>({data:{role}})}},async rpc(name,args){
  if(name==='claim_student_trade_email'){if(claimed)return {data:[]};claimed=true;state.status='processing';return {data:[batch]};}
  assert.equal(name,'finish_student_trade_email');if(finishError)return {error:{message:'db offline'}};state.status=args.outcome;state.outcome=args.outcome;state.delay=args.delay_minutes;return {error:null};
 }};
 const context={Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn},createClient:()=>db,Response,URL,AbortSignal,fetch:async(url,options)=>{assert.equal(url,'https://script.google.com/macros/s/test/exec');mail=JSON.parse(options.body);sends++;if(network==='timeout')throw Error('timeout');if(network==='500')return new Response('{}',{status:500});if(network==='invalid')return new Response('not-json');return new Response(JSON.stringify(network==='quota'?{ok:false,error:'Daily quota exceeded'}:{ok:true}));}};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,batch,state,mail:()=>mail,sends:()=>sends,request:(token='user')=>handler(new Request('https://function.test',{method:'POST',headers:{authorization:'Bearer '+token}}))};
}
test('Mentor links preserve only internal diary identifiers through login',()=>{
 const search='?student='+student+'&trade=22';assert.equal(mentorLoginSuffix(search),search);assert.equal(mentorLoginDestination(search),'../admin/diario-de-trade/'+search);
 assert.equal(mentorLoginDestination('?next=https://evil.test'),'../admin/');
 for(const search of ['?student=https://evil.test','?student='+student+'&trade=0','?student='+student+'&trade=1<script>'])assert.equal(mentorTradeReference(search),null);
 assert.equal(mentorTradeReference('?student='+student).trade,null);
});
test('Only mentor or private worker dispatches; imports become one individual digest',async()=>{
 let f=fixture({role:'aluno'});assert.equal((await f.request()).status,403);assert.equal(f.sends(),0);
 f=fixture();assert.equal((await f.request('invalid')).status,401);await f.request();assert.equal(f.sends(),1);assert.equal(f.state.status,'sent');assert.equal(f.mail().to,'mentor@example.com');assert(!('cc' in f.mail()));assert(!('bcc' in f.mail()));assert(!f.mail().html.includes('<script>'));assert(!f.mail().html.includes('<img>'));assert(f.mail().html.includes('&lt;img&gt;'));assert(f.mail().html.includes('trade=1'));assert(f.mail().html.includes('trade=2'));await f.request();assert.equal(f.sends(),1);
 f=fixture();await f.request('worker-secret-long-0123456789abcdef');assert.equal(f.state.status,'sent');
});
test('Missing provider or pause keeps queue intact; ambiguous sends never auto-retry',async()=>{
 for(const config of [{configured:false},{paused:true}]){const f=fixture(config);await f.request();assert.equal(f.state.status,'pending');assert.equal(f.sends(),0);}
 for(const network of ['timeout','500','invalid']){const f=fixture({network});await f.request();assert.equal(f.state.status,'uncertain');await f.request();assert.equal(f.sends(),1);}
 const f=fixture({network:'quota'});await f.request();assert.equal(f.state.status,'failed');assert.equal(f.state.delay,1440);
});
test('Provider success plus database failure requires checking, without resending',async()=>{const f=fixture({finishError:true});const result=await(await f.request()).json();assert.equal(result.needsCheck,true);assert.equal(result.sent,1);assert.equal(f.state.status,'processing');await f.request();assert.equal(f.sends(),1);});
test('Mail formatter rejects unsafe diary identifiers and excludes private trade content',()=>{const f=fixture();f.batch.trades[0].notes='PRIVATE_NOTES';f.batch.trades[0].storage_path='PRIVATE_PATH';assert(!JSON.stringify(f.context.mentorEmail(f.batch)).includes('PRIVATE_'));assert.throws(()=>f.context.mentorEmail({...f.batch,student_id:'evil'}));assert.throws(()=>f.context.mentorEmail({...f.batch,trades:[{id:'1&next=evil'}]}));});
