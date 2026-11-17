import assert from 'node:assert/strict';
import fs from 'node:fs';
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const student='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',inactive='00000000-0000-4000-8000-000000000003';
await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;"
  + "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;"
  + "create table profiles(id uuid primary key);insert into profiles values('"+student+"'),('"+other+"'),('"+inactive+"');"
  + "create table trade_analysis_reviews(id bigint primary key,ativo boolean);create table trade_reviews(like trade_analysis_reviews including all);"
  + "insert into trade_analysis_reviews values(1,true),(2,false);insert into trade_reviews values(1,true);"
  + "create function can_access_trade_analysis_reviews() returns boolean language sql stable as $$select auth.uid()<>'"+inactive+"'::uuid$$;"
  + "create function can_access_trade_video_reviews() returns boolean language sql stable as $$select auth.uid()<>'"+inactive+"'::uuid$$;"
  + "grant usage on schema public,auth to anon,authenticated;grant select on trade_analysis_reviews,trade_reviews to authenticated;");
const sql=fs.readFileSync(new URL('../../supabase/trade_review_reads.sql',import.meta.url),'utf8');
await db.exec(sql);
const who=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role)};
const insert=(owner,type,id)=>db.query("insert into trade_review_reads(student_id,review_type,review_id) values($1,$2,$3) on conflict(student_id,review_type,review_id) do nothing",[owner,type,id]);
await who(student);await insert(student,'analysis',1);await insert(student,'analysis',1);
assert.equal((await db.query('select count(*)::integer c from trade_review_reads')).rows[0].c,1,'Opening repeatedly is idempotent');
await insert(student,'video',1);
assert.equal((await db.query('select count(*)::integer c from trade_review_reads')).rows[0].c,2,'Image and video IDs are independent');
await assert.rejects(insert(other,'analysis',1),/row-level security/);
await assert.rejects(insert(student,'analysis',2),/row-level security/);
await assert.rejects(insert(student,'video',999),/row-level security/);
await assert.rejects(db.query('delete from trade_review_reads'),/permission denied/);
await who(other);assert.equal((await db.query('select count(*)::integer c from trade_review_reads')).rows[0].c,0);
await insert(other,'analysis',1);
await who(inactive);await assert.rejects(insert(inactive,'analysis',1),/row-level security/);
await who('', 'anon');await assert.rejects(db.query('select * from trade_review_reads'),/permission denied/);
await db.exec('reset role');await db.exec(sql);
await who(student);assert.equal((await db.query('select count(*)::integer c from trade_review_reads')).rows[0].c,2);
console.log('PostgreSQL: per-student read history, independent formats, idempotent opens, unavailable reviews, ineligible/anonymous denial and repeat migration passed');
await db.close();
