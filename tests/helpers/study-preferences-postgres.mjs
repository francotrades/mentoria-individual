import fs from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const student='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',mentor='00000000-0000-4000-8000-000000000003';
await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;"
  + "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;"
  + "create table profiles(id uuid primary key,active boolean);insert into profiles values('"+student+"',true),('"+other+"',true),('"+mentor+"',true);"
  + "create table trade_analysis_reviews(id bigint primary key,ativo boolean);create table trade_reviews(like trade_analysis_reviews including all);"
  + "insert into trade_analysis_reviews values(1,true),(2,false);insert into trade_reviews values(1,true);"
  + "create table student_sessions(id bigint primary key,student_id uuid,liberada boolean);insert into student_sessions values(10,'"+student+"',true),(11,'"+other+"',true),(12,'"+student+"',false);"
  + "alter table student_sessions enable row level security;create policy own_sessions on student_sessions for select to authenticated using(student_id=auth.uid() and liberada);"
  + "create function has_learning_content_access() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and active)$$;"
  + "create function can_access_trade_analysis_reviews() returns boolean language sql stable as $$select public.has_learning_content_access()$$;"
  + "create function can_access_trade_video_reviews() returns boolean language sql stable as $$select public.has_learning_content_access()$$;"
  + "grant usage on schema public,auth to anon,authenticated;grant select on trade_analysis_reviews,trade_reviews,student_sessions to authenticated;");
const sql=fs.readFileSync(new URL('../../supabase/student_study_preferences.sql',import.meta.url),'utf8');
await db.exec(sql);
const who=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role)};
const save=async(kind,id,favorite=null,note=null)=>(await db.query('select save_student_study_preference($1,$2,$3,$4) result',[kind,id,favorite,note])).rows[0].result;
await who(student);
let result=await save('analysis',1,null,'Meu plano <script>alert(1)</script>');
assert.equal(result.favorited,false);assert.equal(result.notes,'Meu plano <script>alert(1)</script>');
result=await save('analysis',1,true);
assert.equal(result.favorited,true);assert.equal(result.notes,'Meu plano <script>alert(1)</script>','Favorite patches preserve notes');
result=await save('analysis',1,null,'Atualização da anotação');
assert.equal(result.favorited,true,'Note patches preserve favorites');
result=await save('analysis',1,false);assert.equal(result.notes,'Atualização da anotação');
result=await save('analysis',1,null,'');assert.equal(result.notes,'','Empty notes can be saved intentionally');
await save('video',1,true,'Vídeo tem sua própria anotação');
await save('session',10,true,'Plano para a próxima sessão');
await assert.rejects(save('session',11,true),/row-level security/);
await assert.rejects(save('session',12,true),/row-level security/);
await assert.rejects(save('analysis',2,true),/row-level security/);
await assert.rejects(save('video',999,true),/row-level security/);
await assert.rejects(save('analysis',1,null,'x'.repeat(10001)),/check constraint/);
await assert.rejects(db.query("update student_study_preferences set student_id=$1 where content_type='video'",[other]),/row-level security/);
await who(other);assert.equal((await db.query('select count(*)::integer c from student_study_preferences')).rows[0].c,0);
await save('analysis',1,true,'Anotação do outro aluno');
await who(mentor);assert.equal((await db.query('select count(*)::integer c from student_study_preferences')).rows[0].c,0,'The mentor cannot read student notes');
await who('', 'anon');await assert.rejects(db.query('select * from student_study_preferences'),/permission denied/);
await assert.rejects(save('analysis',1,true),/permission denied/);
await db.exec('reset role');await db.exec("update profiles set active=false where id='"+student+"'");
await who(student);await assert.rejects(save('analysis',1,true),/row-level security/);
assert.equal((await db.query('select count(*)::integer c from student_study_preferences')).rows[0].c,3,'Own notes are retained when access expires');
await db.query("delete from student_study_preferences where content_type='video'");
await db.exec('reset role');await db.exec(sql);
await who(other);assert.equal((await save('analysis',1,null,'Depois da reaplicação')).favorited,true);
console.log('PostgreSQL: private owner-only notes, mentor/anonymous isolation, eligible sessions/reviews, partial field updates, limits, expiration, deletion and idempotency passed');
await db.close();
