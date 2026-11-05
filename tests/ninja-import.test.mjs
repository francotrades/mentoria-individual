import test from 'node:test';import assert from 'node:assert/strict';
import {parseCsv,readCsvFile,isNinjaReport,parseNinjaNumber,parseNinjaTime,prepareNinjaImport,excludeImportedNinja} from '../aluno/diario-de-trade/modules/ninja-import.js';
const row={'Trade number':'1',Instrument:'MNQ 12-26',Account:'Sim101',Strategy:'ATM','Market pos.':'Long',Qty:'2','Entry price':'21,000.25','Exit price':'21,010.25','Entry time':'11/05/2026 9:30:00 AM','Exit time':'11/05/2026 9:35:00 AM',Profit:'$36.00','Cum. net profit':'$999,999.00',Commission:'$2.00','Clearing Fee':'$0.50','Exchange Fee':'$1.00','IP Fee':'$0.25','NFA Fee':'$0.25',MAE:'$10.00',MFE:'$42.00'};
const options={studentId:'student-1',accountId:12,pnlMode:'net',currencyConfirmed:true,timeZone:'America/Chicago'};
const makeCsv=rows=>[Object.keys(rows[0]),...rows.map(r=>Object.keys(rows[0]).map(k=>r[k]??''))].map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
test('CSV supports BOM, semicolons, tabs, escaped quotes and multiline cells, and rejects broken tables',()=>{
 assert.equal(parseCsv('\uFEFF'+makeCsv([row]))[0].Instrument,'MNQ 12-26');assert.equal(parseCsv('sep=;\r\nA;B\r\n1;2')[0].B,'2');assert.equal(parseCsv('A\tB\n1\t2')[0].B,'2');assert.equal(parseCsv('A,B\n"a\nb","say ""hi"""')[0].B,'say "hi"');assert.equal(parseCsv('A,B,\n1,2,')[0].B,'2');assert.equal(parseCsv('A,B,\n1,2')[0].B,'2');
 assert.throws(()=>parseCsv('A,B\n"unfinished'),/aspas/);assert.throws(()=>parseCsv('A,B\n1,2,3'),/colunas/);assert.throws(()=>parseCsv('A,A\n1,2'),/repetidas/);
});
test('Ninja monetary values keep losses, thousand separators, zeros and explicit locale',()=>{
 assert.equal(parseNinjaNumber('($1,234.56)'),-1234.56);assert.equal(parseNinjaNumber('−$12.50'),-12.5);assert.equal(parseNinjaNumber('(R$ 1.234,56)','pt-BR'),-1234.56);assert.equal(parseNinjaNumber('1,000'),1000);assert.equal(parseNinjaNumber('1.000','pt-BR'),1000);assert.equal(parseNinjaNumber('$0.00'),0);
 for(const v of ['abc','%','15 ticks','10.50%','1,23','1.234,56'])assert.equal(parseNinjaNumber(v),null);assert.equal(parseNinjaNumber('1,234.56','pt-BR'),null);
});
test('US and BR dates remain in the exported timezone, including AM/PM and invalid dates',()=>{
 assert.equal(parseNinjaTime('11/05/2026 9:30:00 AM').date,'2026-11-05');assert.equal(parseNinjaTime('05/11/2026 09:30:00','dmy').date,'2026-11-05');assert.equal(parseNinjaTime('2026-11-05 12:01:00 AM').local,'2026-11-05T00:01:00.000');assert.equal(parseNinjaTime('11/5/2026 12:01:00 PM').local,'2026-11-05T12:01:00.000');
 assert.equal(parseNinjaTime('02/30/2026 09:30:00'),null);assert.equal(parseNinjaTime('11/05/2026 24:00:00'),null);assert.equal(parseNinjaTime('11/05/2026'),null);
});
test('Trade report maps fields and all costs without double deducting net Profit or inventing risk',async()=>{
 assert(isNinjaReport([row]));const result=await prepareNinjaImport([row],options);const t=result.rows[0];assert.equal(t.pnl,40);assert.equal(t.fees,4);assert.equal(t.pnl-t.fees,36);assert.equal(t.trade_date,'2026-11-05');assert.equal(t.entry_price,21000.25);assert.equal(t.duration_minutes,5);assert.equal(t.mae,10);assert.equal(t.mfe,42);assert.equal(t.initial_risk,null);assert.equal(t.rr,null);assert.equal(t.quick_review_completed,false);assert.equal(t.student_id,'student-1');assert.equal(t.raw_data.Strategy,'ATM');assert.equal(t.raw_data._franco_import.time_zone,'America/Chicago');assert.equal(t.setup,undefined);
 const gross=(await prepareNinjaImport([{...row,Profit:'$40.00'}],{...options,pnlMode:'gross'})).rows[0];assert.equal(gross.pnl-gross.fees,36);
 const loss=(await prepareNinjaImport([{...row,Profit:'($44.00)','Market pos.':'Short'}],options)).rows[0];assert.equal(loss.side,'short');assert.equal(loss.pnl,-40);assert.equal(loss.pnl-loss.fees,-44);
});
test('Rejects cumulative-only profit, executions, multiple accounts and unknown units or P&L mode',async()=>{
 const missing={...row};delete missing.Profit;await assert.rejects(prepareNinjaImport([missing],options),/lucro acumulado/);await assert.rejects(prepareNinjaImport([{Instrument:'MNQ',Action:'Buy',Price:'21000',Time:'11/5/2026'}],options),/Exporte/);
 await assert.rejects(prepareNinjaImport([row,{...row,Account:'Sim102'}],options),/única conta/);await assert.rejects(prepareNinjaImport([row],{...options,currencyConfirmed:false}),/moeda/);await assert.rejects(prepareNinjaImport([row],{...options,pnlMode:''}),/Profit/);
 const result=await prepareNinjaImport([row,{...row,'Exit time':''},{...row,Profit:'5%'},{...row,'Market pos.':'INVALID'},{...row,Qty:'0'}],options);assert.equal(result.rows.length,1);assert.equal(result.rejected.length,4);
});
test('Localized numbers and overnight trades preserve the closing date',async()=>{
 const local={...row,'Entry price':'21.000,25','Exit price':'21.010,25','Entry time':'04/11/2026 23:58:00','Exit time':'05/11/2026 00:05:00',Profit:'(R$ 44,00)',Commission:'2,00','Clearing Fee':'0,50','Exchange Fee':'1,00','IP Fee':'0,25','NFA Fee':'0,25',MAE:'10,00',MFE:'42,00'};
 const t=(await prepareNinjaImport([local],{...options,dateOrder:'dmy',numberLocale:'pt-BR'})).rows[0];assert.equal(t.trade_date,'2026-11-05');assert.equal(t.duration_minutes,7);assert.equal(t.pnl-t.fees,-44);assert.equal(t.quantity,2);
});
test('Stable reimport IDs ignore report numbering and keep identical legitimate partial fills',async()=>{
 const a=(await prepareNinjaImport([row,row],options)).rows;assert.equal(a.length,2);assert.notEqual(a[0].external_id,a[1].external_id);
 const renumbered=(await prepareNinjaImport([{...row,'Trade number':'99','Cum. net profit':'0'}],options)).rows[0];assert.equal(renumbered.external_id,a[0].external_id);
 assert.equal(excludeImportedNinja(a,[a[0].external_id]).rows.length,1);assert.equal(excludeImportedNinja(a,a.map(x=>x.external_id)).duplicates,2);
});
test('Reads real CSV byte encodings without requiring Excel and preserves original data',async()=>{
 const csv=makeCsv([row]);const utf16=Buffer.concat([Buffer.from([255,254]),Buffer.from(csv,'utf16le')]);assert.equal(parseCsv(await readCsvFile(new Blob([utf16])))[0].Account,'Sim101');assert.equal(parseCsv(await readCsvFile(new Blob([csv])))[0].Profit,'$36.00');
 const result=await prepareNinjaImport([{...row,student_id:'another-student',pnl:'123456'}],options);assert.equal(result.rows[0].student_id,'student-1');assert.equal(result.rows[0].pnl,40);
});
