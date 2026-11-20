import fs from 'node:fs';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),student='00000000-0000-4000-8000-000000000001';
await db.exec("create role anon;create role authenticated;create role service_role;create schema mentorship_private;"
 +"create function is_admin() returns boolean language sql as $$select false$$;create function mentorship_private.extension_open(uuid) returns boolean language sql as $$select false$$;"
 +"create table profiles(id uuid primary key,nome text,email text,role text,status text,data_expiracao date);"
 +"create table sessions(id bigint primary key,numero integer,titulo text);"
 +"create table student_sessions(id bigint primary key,student_id uuid,session_id bigint,data_sessao date,session_time time,liberada boolean,teams_url text,titulo_personalizado text);"
 +"insert into profiles values('"+student+"','Aluno','a@example.test','aluno','ativo',current_date+365);insert into sessions values(10,10,'Sessão dez');");
const sql=fs.readFileSync(new URL('../../supabase/session_schedule_notifications.sql',import.meta.url),'utf8');
await db.exec(sql);
await db.exec("insert into student_sessions values(1,'"+student+"',10,current_date+5,'14:00',true,null,null,0)");
let rows=(await db.query('select * from session_schedule_notices order by id')).rows;
assert.equal(rows.length,2);assert.equal(rows[0].kind,'confirmation');
assert.equal(new Date(rows[1].due_at).getUTCHours(),12,'Reminder is 9am in Brasilia');
let item=(await db.query('select claim_session_schedule_notice() item')).rows[0].item;assert.equal(item.recipient_email,'a@example.test');
assert.equal((await db.query("select finish_session_schedule_notice($1,$2,'sent') ok",[item.id,item.claim_token])).rows[0].ok,true);
await db.exec("update student_sessions set teams_url='https://meet.google.com/abc-defg-hij' where id=1");
assert.equal((await db.query('select count(*)::integer n from session_schedule_notices')).rows[0].n,2,'Adding a live link does not duplicate a confirmation');
await db.exec("update student_sessions set data_sessao=current_date+7 where id=1");
rows=(await db.query('select * from session_schedule_notices order by id')).rows;
assert.equal(rows.length,4);assert.equal(rows[1].status,'cancelled');assert.equal(rows[0].status,'sent');
item=(await db.query('select claim_session_schedule_notice() item')).rows[0].item;
await db.query("select finish_session_schedule_notice($1,$2,'uncertain')",[item.id,item.claim_token]);
assert.equal((await db.query('select claim_session_schedule_notice() item')).rows[0].item,null,'Ambiguous deliveries are never retried automatically');
await db.exec("update student_sessions set data_sessao=current_date+9 where id=1");
await db.exec("update profiles set status='inativo'");
assert.equal((await db.query('select claim_session_schedule_notice() item')).rows[0].item,null,'Inactive students receive no notices');
await db.exec("update profiles set status='ativo';update student_sessions set data_sessao=current_date+10 where id=1;update student_sessions set liberada=false where id=1");
assert.equal((await db.query('select claim_session_schedule_notice() item')).rows[0].item,null,'Unreleased sessions cancel pending notices');
await db.exec("update student_sessions set data_sessao=current_date-1,liberada=true where id=1");
assert.equal((await db.query('select claim_session_schedule_notice() item')).rows[0].item,null,'Past sessions generate no emails');
await db.exec("insert into student_sessions values(2,'"+student+"',10,current_date+1,'14:00',true,null,null,0)");
item=(await db.query('select claim_session_schedule_notice(2) item')).rows[0].item;
await db.query("select finish_session_schedule_notice($1,$2,'sent')",[item.id,item.claim_token]);
await db.exec("insert into session_schedule_notices(student_session_id,schedule_version,kind,scheduled_at,due_at) select id,schedule_version,'reminder',(data_sessao+session_time) at time zone 'America/Sao_Paulo',now()-interval '1 minute' from student_sessions where id=2 on conflict(student_session_id,schedule_version,kind) do update set due_at=excluded.due_at");
item=(await db.query('select claim_session_schedule_notice(2) item')).rows[0].item;assert.equal(item.kind,'reminder');
await db.query("select finish_session_schedule_notice($1,$2,'sent')",[item.id,item.claim_token]);
await db.exec("insert into student_sessions values(3,'"+student+"',10,(now() at time zone 'America/Sao_Paulo')::date,'23:59',true,null,null,0)");
item=(await db.query('select claim_session_schedule_notice(3) item')).rows[0].item;
if(item) await db.query("select finish_session_schedule_notice($1,$2,'sent')",[item.id,item.claim_token]);
await db.exec("insert into session_schedule_notices(student_session_id,schedule_version,kind,scheduled_at,due_at) select id,schedule_version,'reminder',(data_sessao+session_time) at time zone 'America/Sao_Paulo',now()-interval '1 minute' from student_sessions where id=3 on conflict do nothing");
assert.equal((await db.query('select claim_session_schedule_notice(3) item')).rows[0].item,null,'A delayed reminder is never sent on the day of the session');
await db.exec(sql);
assert.equal((await db.query("select has_function_privilege('authenticated','claim_session_schedule_notice(bigint)','execute') ok")).rows[0].ok,false);
assert.equal((await db.query("select has_table_privilege('anon','session_schedule_notices','select') ok")).rows[0].ok,false);
console.log('PostgreSQL: confirmation/reminder timing, reschedule cancellation, no duplicate link notice, ambiguity, inactive/unreleased/past rejection and idempotency passed');
await db.close();
