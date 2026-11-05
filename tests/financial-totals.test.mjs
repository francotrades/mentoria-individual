import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {financialTotals,installmentTotal,nextContractTotal} from '../assets/financial-totals.js';
const original=Array.from({length:4},()=>({valor:2500,paga:true}));
const extension=Array.from({length:3},()=>({valor:1200,paga:false}));
test('New unpaid installments raise the displayed contract and balance even when the stored contract is old',()=>{
 assert.deepEqual(financialTotals(10000,[...original,...extension]),{contracted:13600,scheduled:13600,received:10000,outstanding:3600});assert.deepEqual(financialTotals(10000,original),{contracted:10000,scheduled:10000,received:10000,outstanding:0});
 assert.equal(financialTotals(13600,[...original,...extension.map(p=>({...p,paga:true}))]).outstanding,0);
});
test('Totals respect cents, incomplete schedules and actual paid flags',()=>{
 assert.equal(installmentTotal([{valor:'0.10'},{valor:'0.20'}]),0.3);assert.equal(financialTotals(1,[{valor:.1,paga:true},{valor:.2,paga:false}]).outstanding,.9);
 assert.deepEqual(financialTotals(1000,[{valor:200,paga:true}]),{contracted:1000,scheduled:200,received:200,outstanding:800});assert.equal(financialTotals(100,[{valor:100,paga:'false'}]).received,0);
});
test('Fully scheduled contracts follow added, edited and removed installments; unscheduled value is preserved',()=>{
 assert.equal(nextContractTotal(10000,10000,13600),13600);assert.equal(nextContractTotal(13600,13600,12400),12400);assert.equal(nextContractTotal(13600,13600,13000),13000);
 assert.equal(nextContractTotal(1000,200,400),1000);assert.equal(nextContractTotal(1000,400,1200),1200);assert.equal(nextContractTotal(1,.3,.4),1);
});
const admin=fs.readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const helpers=admin.slice(admin.indexOf('let editorScheduledTotal ='),admin.indexOf('function addFinancialPaymentRow('));
const save=admin.slice(admin.indexOf('async function saveStudentFinancial()'),admin.indexOf('function renderStudentProgress()'));
function fixture(){
 const scheduled=[...original,...extension].map((payment,index)=>({...payment,due:'2027-0'+(index+1)+'-05',paidDate:payment.paga?'2026-09-28':''}));
 const rows=scheduled.map(p=>({dataset:{paidDate:p.paidDate},querySelector(selector){return selector.includes('value')?{value:String(p.valor)}:selector.includes('due')?{value:p.due}:{checked:p.paga}}}));
 const total={value:'10000'},summary={textContent:''},writes={},button={};let refreshes=0;
 const db={from(table){return {upsert(payload){writes.contract=payload;return this},select(){return this},single:async()=>({data:{id:'contract-1'},error:null}),delete(){return this},eq:async()=>({error:null}),insert:async payload=>{assert.equal(table,'mentorship_payments');writes.payments=payload;return {error:null}}}}};
 const ctx={financialTotals,installmentTotal,nextContractTotal,studentFinancialTotal:total,studentFinancialPayments:{querySelectorAll:()=>rows},studentFinancialCurrency:{value:'BRL'},studentFinancialNotes:{value:'Extensão'},studentFinancialEditor:{classList:{add(){}}},saveStudentFinancialButton:button,selectedStudent:{id:'student-1',nome:'Aluno',email:'student@example.test'},studentSessions:Array(13).fill({}),supabase:db,getStudentFinancial:()=>({financial:{id:'contract-1',quantidade_sessoes:13,origem:'painel-admin'}}),$:()=>summary,formatMoney:n=>n.toFixed(2),showMessage(){},refreshData:async()=>{refreshes++},dateToISO:()=> '2026-11-05',console};
 vm.createContext(ctx);vm.runInContext(helpers+save,ctx);vm.runInContext('editorScheduledTotal=installmentTotal(financialEditorPayments());',ctx);
 return {ctx,writes,total,summary,rows,scheduled,refreshes:()=>refreshes};
}
test('Saving automatically persists the extended total while retaining amounts, due dates and paid status',async()=>{
 const f=fixture();await f.ctx.saveStudentFinancial();assert.equal(f.writes.contract.valor_total,13600);assert.equal(f.total.value,'13600.00');assert.equal(f.writes.payments.length,7);assert.equal(f.writes.payments.filter(p=>p.paga).length,4);assert.equal(f.writes.payments[4].vencimento,'2027-05-05');assert.equal(f.writes.payments[0].data_pagamento,'2026-09-28');assert.equal(f.writes.payments[4].data_pagamento,null);assert(f.summary.textContent.includes('3600.00'));assert.equal(f.refreshes(),1);
});
test('Finance overview uses each student balance instead of cancelling it against another student payment',()=>{
 const html=fs.readFileSync(new URL('../admin/financeiro/index.html',import.meta.url),'utf8'),fn=html.slice(html.indexOf('function totals(){'),html.indexOf('async function toggle('));
 const ctx={financialTotals,financials:[{id:'a',valor_total:100,moeda:'BRL'},{id:'b',valor_total:200,moeda:'BRL'}],payments:[{mentorship_id:'a',valor:100,paga:true},{mentorship_id:'b',valor:200,paga:false},{mentorship_id:'b',valor:50,paga:false}],brl:v=>v};vm.createContext(ctx);vm.runInContext(fn,ctx);const totals=ctx.totals();assert.equal(totals.contracted,350);assert.equal(totals.received,100);assert.equal(totals.outstanding,250);
});
