import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {parseCsv,readCsvFile,isNinjaReport,prepareNinjaImport,excludeImportedNinja} from '../aluno/diario-de-trade/modules/ninja-import.js';
const html=fs.readFileSync(new URL('../aluno/diario-de-trade/index.html',import.meta.url),'utf8');
const script=html.slice(html.indexOf('function nh(s)'),html.indexOf('$("calendarPrev")'));
const csv='Trade number,Instrument,Account,Market pos.,Qty,Entry price,Exit price,Entry time,Exit time,Profit,Commission\n1,MNQ 12-26,Sim101,Long,2,21000,21010,11/05/2026 9:30:00 AM,11/05/2026 9:35:00 AM,36,4';
function fixture({existing=[],dbError=false,mentor=false}={}){
 const elements=new Map(),queries=[],insertions=[],messages=[];let reloads=0;
 const $=id=>{if(!elements.has(id)){const hidden=new Set();elements.set(id,{value:'',checked:false,files:[],disabled:false,textContent:'',innerHTML:'',listeners:new Map(),classList:{add:x=>hidden.add(x),remove:x=>hidden.delete(x),toggle:(x,on)=>on?hidden.add(x):hidden.delete(x),contains:x=>hidden.has(x)},addEventListener(event,fn){this.listeners.set(event,fn)}})}return elements.get(id)};
 $('importProfile').value='ninjatrader';$('importAccount').value='12';$('ninjaDateOrder').value='mdy';$('ninjaNumberLocale').value='en-US';$('ninjaPnlMode').value='net';$('ninjaCurrencyConfirm').checked=true;$('importTimezone').value='America/Chicago';$('csvFile').files=[new Blob([csv])];
 const db={from(table){assert.equal(table,'student_trades');return {select(columns){this.columns=columns;return this},eq(key,value){(this.filters??=[]).push([key,value]);return this},async in(key,ids){queries.push(this.filters);return {data:existing.filter(id=>ids.includes(id)).map(external_id=>({external_id})),error:dbError?{}:null}},async insert(rows){insertions.push(rows);return {error:null}}}}};
 const context={$,...{parseCsv,readCsvFile,isNinjaReport,prepareNinjaImport,excludeImportedNinja},Number,Set,Event,console,supabase:db,currentUser:{id:'student-1'},diaryStudentId:'student-1',mentorView:mentor,accounts:[{id:12,active:true,currency:'USD'},{id:13,active:false,currency:'USD'}],csvRows:[],esc:v=>String(v).replaceAll('<','&lt;'),money:v=>String(v),showMessage:(...v)=>messages.push(v),loadData:async()=>{reloads++},setScreen:()=>{}};
 vm.createContext(context);vm.runInContext(script,context);return {context,$,queries,insertions,messages,existing,reloads:()=>reloads,preview:()=>context.refreshCsvPreview(),submit:()=>$('importCsvButton').listeners.get('click')()};
}
test('Ninja upload previews correct net and imports only into the signed-in student and selected account',async()=>{
 const f=fixture();await f.preview();assert.equal(f.$('importCsvButton').disabled,false);assert(f.$('csvPreview').innerHTML.includes('<th>Líquido</th>'));assert(f.$('importDetection').textContent.includes('36'));await Promise.all([f.submit(),f.submit()]);assert.equal(f.insertions.length,1);const t=f.insertions[0][0];assert.equal(t.student_id,'student-1');assert.equal(t.account_id,12);assert.equal(t.pnl,40);assert.equal(t.fees,4);assert.equal(f.reloads(),1);assert(f.queries.every(filters=>filters.some(([k,v])=>k==='student_id'&&v==='student-1')&&filters.some(([k,v])=>k==='account_id'&&v===12)));
});
test('Fresh duplicate lookup at confirmation skips a trade imported after the preview',async()=>{const f=fixture();await f.preview();f.existing.push(f.context.csvRows[0].external_id);await f.submit();assert.equal(f.insertions.length,0);assert(f.messages.some(([text])=>text.includes('já estão importadas')));});
test('Missing choices, failed duplicate lookup and inactive account cannot import',async()=>{
 let f=fixture();f.$('ninjaPnlMode').value='';await f.preview();assert(f.$('importCsvButton').disabled);assert.equal(f.context.csvRows.length,0);
 f=fixture({dbError:true});await f.preview();assert(f.$('importCsvButton').disabled);await f.submit();assert.equal(f.insertions.length,0);
 f=fixture();await f.preview();f.$('importAccount').value='13';await f.submit();assert.equal(f.insertions.length,0);
 f=fixture({mentor:true});await f.preview();await f.submit();assert.equal(f.insertions.length,0);
});
test('Generic CSV path keeps its existing mapping and a stale read never replaces a newer file',async()=>{
 const f=fixture();f.$('importProfile').value='generic';f.$('csvFile').files=[new Blob(['Date,Symbol,Side,Quantity,Entry,Exit,PnL,Fees\n2026-11-05,AAPL,long,1,100,110,10,1'])];await f.preview();assert.equal(f.context.csvRows[0].symbol,'AAPL');assert.equal(f.context.csvRows[0].pnl,10);assert(f.$('ninjaImportOptions').classList.contains('hidden'));
 let release;const wait=new Promise(resolve=>release=resolve);const slow={arrayBuffer:async()=>{await wait;return new TextEncoder().encode(csv).buffer}};f.$('csvFile').files=[slow];const old=f.preview();f.$('csvFile').files=[];await f.preview();release();await old;assert.equal(f.context.csvRows.length,0);assert.equal(f.$('csvPreview').innerHTML,'');
});
