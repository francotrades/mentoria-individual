import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {scheduleEmail} from '../supabase/functions/session-schedule-notification/email.js';
import {nextMentorship} from '../assets/student-study.js';
const notice={id:1,claim_token:'00000000-0000-4000-8000-000000000001',kind:'confirmation',recipient_name:'Aluno <teste>',recipient_email:'a@example.test',session_number:10,session_title:'Contexto',scheduled_at:'2026-11-22T17:00:00Z'};
test('Schedule email uses Brasilia time, escapes text and links to the authenticated portal',()=>{
 const mail=scheduleEmail(notice);assert.match(mail.subject,/22\/11\/2026 às 14:00/);assert.match(mail.html,/Aluno &lt;teste&gt;/);assert.match(mail.html,/#studyHome/);
 assert.match(scheduleEmail({...notice,kind:'reminder'}).subject,/amanhã/);
 for(const patch of [{recipient_email:'a@test.example,b@test.example'},{scheduled_at:'bad'},{kind:'bad'}])assert.throws(()=>scheduleEmail({...notice,...patch}));
});
test('Next mentorship keeps the current live session, orders by exact local time and ignores unavailable dates',()=>{
 const items=[{id:2,data_sessao:'2026-11-22',session_time:'16:00:00'},{id:1,data_sessao:'2026-11-22',session_time:'14:00:00'}, {id:3,data_sessao:'2026-11-21',session_time:'13:00:00',liberada:false}];
 assert.equal(nextMentorship(items,Date.parse('2026-11-22T15:00:00-03:00')).id,1);
 assert.equal(nextMentorship(items,Date.parse('2026-11-22T16:30:00-03:00')).id,2);
 assert.equal(nextMentorship([{data_sessao:'2026-11-22'}]),null);
});
const worker=fs.readFileSync(new URL('../supabase/functions/session-schedule-notification/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
async function run({token='worker-secret-01234567890123456789012345',networkFail=false,finish=true,providerOk=true,health=false}={}){
 let handler,claimed=false;const calls=[],mails=[];const db={rpc:async(name,args)=>{calls.push({name,args});return name==='claim_session_schedule_notice'?{data:claimed?null:(claimed=true,notice)}:{data:finish}},auth:{getUser:async()=>({error:true})}};
 const env={REVIEW_NOTICE_WORKER_SECRET:'worker-secret-01234567890123456789012345',GOOGLE_MAIL_WEBHOOK_URL:'https://script.google.com/macros/s/TEST/exec',GOOGLE_MAIL_SECRET:'test-only'};
 vm.runInNewContext(worker,{createClient:()=>db,scheduleEmail,Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn},URL,Response,AbortSignal,Date,fetch:async(url,init)=>{mails.push(JSON.parse(init.body));if(networkFail)throw Error('offline');return {ok:true,json:async()=>({ok:providerOk})}}});
 const response=await handler(new Request('https://worker.test',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify(health?{healthOnly:true}:{})}));return {response,calls,mails};
}
test('Schedule worker authenticates, validates configuration without sending and finalizes claimed deliveries',async()=>{
 const denied=await run({token:'bad'});assert.equal(denied.response.status,401);assert.equal(denied.mails.length,0);
 const health=await run({health:true});assert.equal(health.calls.length,0);assert.equal(health.mails.length,0);
 const sent=await run();assert.equal(sent.mails.length,1);assert.equal(sent.calls[1].args.outcome,'sent');
 for(const args of [{networkFail:true},{finish:false}]){const t=await run(args);assert.equal(t.mails.length,1);assert.equal((await t.response.json()).needsCheck,true);}
 const failed=await run({providerOk:false});assert.equal(failed.calls[1].args.outcome,'failed');
});
