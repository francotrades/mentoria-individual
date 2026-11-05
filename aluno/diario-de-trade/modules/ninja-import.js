// NinjaTrader Desktop: Trade Performance > Trades, exibido em moeda.
export const normalizeHeader=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={account:['Account','Conta'],symbol:['Instrument','Instrumento'],side:['Market pos.','Market position','Posicao do mercado','Pos. mercado'],quantity:['Qty','Quantity','Quantidade','Qtd.'],entry:['Entry price','Preco de entrada'],exit:['Exit price','Preco de saida'],entryTime:['Entry time','Hora de entrada','Horario de entrada'],exitTime:['Exit time','Hora de saida','Horario de saida'],profit:['Profit','Lucro','Resultado'],commission:['Commission','Comissao'],clearing:['Clearing Fee','Taxa de compensacao'],exchange:['Exchange Fee','Taxa de bolsa'],ip:['IP Fee'],nfa:['NFA Fee'],mae:['MAE'],mfe:['MFE']};
function valueOf(row,key){for(const alias of aliases[key]){const keyInRow=Object.keys(row).find(k=>normalizeHeader(k)===normalizeHeader(alias));if(keyInRow!=null&&String(row[keyInRow]).trim()!=='')return String(row[keyInRow]).trim()}return '';}
function hasColumn(row,key){return aliases[key].some(alias=>Object.keys(row).some(k=>normalizeHeader(k)===normalizeHeader(alias)));}
export function isNinjaReport(rows){return !!rows.length&&hasColumn(rows[0],'symbol')&&hasColumn(rows[0],'side')&&(hasColumn(rows[0],'entryTime')||hasColumn(rows[0],'exitTime'));}
export async function readCsvFile(file){
 const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length>10*1024*1024)throw Error('Use um CSV de até 10 MB; exporte um período menor.');
 if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes.subarray(2));
 if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(bytes.subarray(2));
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return new TextDecoder('windows-1252').decode(bytes)}
}
export function parseCsv(text){
 text=String(text).replace(/^\uFEFF/,'').trimStart();let delimiter;
 const sep=/^sep=([;,\t])\r?\n/i.exec(text);if(sep){delimiter=sep[1];text=text.slice(sep[0].length)}
 if(!delimiter){let quoted=false;const scores={',':0,';':0,'\t':0};for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){i++;continue}quoted=!quoted}else if(!quoted){if(c==='\n'||c==='\r')break;if(c in scores)scores[c]++}}delimiter=Object.keys(scores).sort((a,b)=>scores[b]-scores[a])[0];}
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i],next=text[i+1];if(c==='"'&&quoted&&next==='"'){cell+='"';i++;continue}if(c==='"'){quoted=!quoted;continue}if(c===delimiter&&!quoted){row.push(cell);cell='';continue}if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&next==='\n')i++;row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);row=[];cell='';continue}cell+=c}
 if(quoted)throw Error('O CSV tem aspas sem fechamento. Exporte o arquivo novamente.');if(cell||row.length){row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row)}
 if(rows.length<2)return [];if(rows.length>10001)throw Error('Exporte até 10.000 operações por arquivo.');
 const headers=rows.shift().map(v=>v.trim());
 while(headers.length&&!headers.at(-1)&&rows.every(r=>!(r[headers.length-1]||'').trim())){const index=headers.length-1;headers.pop();for(const r of rows)if(r.length>index)r.splice(index,1)}
 if(headers.some(v=>!v)||new Set(headers.map(normalizeHeader)).size!==headers.length)throw Error('O cabeçalho tem colunas vazias ou repetidas. Exporte a grade Trades completa.');
 return rows.map((r,i)=>{if(r.length!==headers.length)throw Error('A linha '+(i+2)+' tem uma quantidade de colunas diferente do cabeçalho. Exporte novamente.');return Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]))});
}
export function parseNinjaNumber(value,locale='en-US'){
 let s=String(value??'').trim().replace(/\u2212/g,'-');if(!s||/^(n\/?a|--?|null)$/i.test(s))return null;
 if(/%|ticks?|pips?|points?|pontos?/i.test(s))return null;
 const parenthesized=/^\(.*\)$/.test(s);if(parenthesized)s=s.slice(1,-1);
 s=s.replace(/(?:US\$|R\$|USD|BRL|EUR|GBP|CAD|AUD|[$€£\s\u00a0])/gi,'');
 if(/[a-z]/i.test(s)||!/^[+-]?[\d.,]+$/.test(s))return null;
 const pattern=locale==='pt-BR'?/^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/:/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
 if(!pattern.test(s))return null;
 if(locale==='pt-BR')s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');
 const n=Number(s);return Number.isFinite(n)?(parenthesized?-Math.abs(n):n):null;
}
export function parseNinjaTime(value,dateOrder='mdy'){
 const s=String(value??'').trim();let m=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](.*))?$/.exec(s),year,month,day,time;
 if(m){[,year,month,day,time]=m}else{m=/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})(?:[ T](.*))?$/.exec(s);if(!m)return null;year=m[3].length===2?'20'+m[3]:m[3];[month,day]=dateOrder==='dmy'?[m[2],m[1]]:[m[1],m[2]];time=m[4]}
 year=Number(year);month=Number(month);day=Number(day);if(year<2000||year>2100)return null;
 const t=/^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3}))?)?\s*(AM|PM)?$/i.exec(time||'');if(!t)return null;
 let hour=Number(t[1]);const minute=Number(t[2]),second=Number(t[3]||0),millisecond=Number((t[4]||'').padEnd(3,'0'));
 if(t[5]){if(hour<1||hour>12)return null;hour=hour%12+(t[5].toUpperCase()==='PM'?12:0)}
 if(hour>23||minute>59||second>59)return null;
 const clock=Date.UTC(year,month-1,day,hour,minute,second,millisecond),d=new Date(clock);
 if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return null;
 const date=String(year)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
 return {date,clock,local:date+'T'+String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')+':'+String(second).padStart(2,'0')+'.'+String(millisecond).padStart(3,'0')};
}
export async function prepareNinjaImport(rows,{studentId,accountId,dateOrder='mdy',numberLocale='en-US',pnlMode,timeZone='America/New_York',currencyConfirmed=false}={}){
 if(!rows.length)throw Error('O arquivo não contém operações.');
 const sample=rows[0],required=['account','symbol','side','quantity','entry','exit','entryTime','exitTime','profit'];
 if(required.some(key=>!hasColumn(sample,key)))throw Error('Exporte Trade Performance → Trades em moeda, com Account, Instrument, Market pos., Qty, Entry/Exit price, Entry/Exit time e Profit. Relatórios Orders, Executions e somente lucro acumulado não são aceitos.');
 if(!currencyConfirmed)throw Error('Confirme que exportou Trades em moeda (Currency), na mesma moeda da conta de destino.');
 if(!['net','gross'].includes(pnlMode))throw Error('Selecione se a coluna Profit já desconta as taxas ou está antes delas.');
 const accounts=new Set(rows.map(row=>valueOf(row,'account')).filter(Boolean));if(accounts.size!==1)throw Error('O CSV deve conter uma única conta NinjaTrader. Filtre a conta no relatório e exporte novamente.');
 const accepted=[],rejected=[],warnings=[],occurrences=new Map();let missingFees=false;
 for(const [index,row] of rows.entries()){
  const fail=reason=>rejected.push({line:index+2,reason});
  const symbol=valueOf(row,'symbol').toUpperCase(),sourceAccount=valueOf(row,'account'),direction=normalizeHeader(valueOf(row,'side'));
  const side=['long','buy','comprado','compra'].includes(direction)?'long':['short','sell','vendido','venda'].includes(direction)?'short':null;
  const quantity=parseNinjaNumber(valueOf(row,'quantity'),numberLocale),entry=parseNinjaNumber(valueOf(row,'entry'),numberLocale),exit=parseNinjaNumber(valueOf(row,'exit'),numberLocale),profit=parseNinjaNumber(valueOf(row,'profit'),numberLocale);
  const entryTime=parseNinjaTime(valueOf(row,'entryTime'),dateOrder),exitTime=parseNinjaTime(valueOf(row,'exitTime'),dateOrder);
  if(!sourceAccount||!symbol||!side){fail('Conta, ativo ou direção inválidos.');continue}
  if(quantity==null||quantity<=0||entry==null||exit==null||profit==null){fail('Quantidade, preços ou Profit inválidos. Confira se o relatório está em moeda e o formato numérico.');continue}
  if(!entryTime||!exitTime||exitTime.clock<entryTime.clock){fail('Horários inválidos ou saída anterior à entrada. Confira o formato da data.');continue}
  let fees=0,badFee=false;
  for(const key of ['commission','clearing','exchange','ip','nfa']){const raw=valueOf(row,key);if(!raw)continue;const cost=parseNinjaNumber(raw,numberLocale);if(cost==null){badFee=true;break}fees+=Math.abs(cost)}
  if(badFee){fail('Uma das taxas não é um valor monetário válido.');continue}
  if(!valueOf(row,'commission'))missingFees=true;
  fees=Math.round(fees*100)/100;const gross=pnlMode==='net'?profit+fees:profit;
  const identity=JSON.stringify([sourceAccount,symbol,side,quantity,entry,exit,entryTime.local,exitTime.local]);
  const occurrence=(occurrences.get(identity)||0)+1;occurrences.set(identity,occurrence);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity+'#'+occurrence));
  const externalId='ninjatrader:v1:'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  const magnitude=key=>{const v=parseNinjaNumber(valueOf(row,key),numberLocale);return v==null?null:Math.abs(v)};
  accepted.push({student_id:studentId,account_id:accountId||null,trade_date:exitTime.date,symbol,side,quantity,entry_price:entry,exit_price:exit,pnl:Math.round(gross*100)/100,fees,duration_minutes:Math.round((exitTime.clock-entryTime.clock)/60000),mae:magnitude('mae'),mfe:magnitude('mfe'),initial_risk:null,rr:null,source:'csv',external_id:externalId,quick_review_completed:false,raw_data:{...row,_franco_import:{platform:'ninjatrader',version:1,date_order:dateOrder,number_locale:numberLocale,pnl_mode:pnlMode,time_zone:timeZone,entry_local:entryTime.local,exit_local:exitTime.local,source_account:sourceAccount}}});
 }
 if(missingFees)warnings.push('Há linhas sem Commission preenchida; confira as taxas no NinjaTrader e na prévia.');
 return {rows:accepted,rejected,warnings,sourceAccount:[...accounts][0]};
}
export function excludeImportedNinja(rows,existingIds){const ids=new Set(existingIds);return {rows:rows.filter(row=>!ids.has(row.external_id)),duplicates:rows.filter(row=>ids.has(row.external_id)).length};}
