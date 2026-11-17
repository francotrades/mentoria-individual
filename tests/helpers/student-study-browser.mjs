// Runs the actual student page with synthetic records and intercepted integrations.
// No production credentials, logins, writes, payments or emails.
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.STUDY_TEST_URL || 'http://127.0.0.1:8765';
const screenshots = process.env.STUDY_SCREENSHOT_DIR;
function createClient() {
  const sessionProgress=[{session_id:1,concluida:true}],reviewProgress=[{review_type:'analysis',review_id:1,concluida:true}];
  const reviews=Array.from({length:16},(_,i)=>({id:i+1,titulo:i===0?'<img src=x onerror=alert(1)>':i%2?'Gestão de risco na abertura':'Leitura do contexto no Nasdaq',explicacao:'Contexto: região de suporte.\nEntrada com risco definido.\nAprendizado: aguardar a confirmação.',image_path:'fixture-'+i+'.png',instrumento:i%2?'Nasdaq':'S&P 500',tema:i%2?'Gestão de risco':'Leitura de contexto',ativo:true,published_at:new Date(Date.UTC(2026,10,17-i,12)).toISOString()}));
  const videos=[{id:1,titulo:'Condução de uma operação',descricao:'Como administrar o risco após a entrada.',youtube_url:'https://www.youtube.com/watch?v=abcdefghijk',instrumento:'Nasdaq',tema:'Condução',published_at:'2026-11-17T12:00:00Z'}];
  const sessions=Array.from({length:12},(_,i)=>({id:i+1,session_id:i+1,sessions:{numero:i+1,titulo:['Diagnóstico do operacional','Estrutura e contexto','Gestão de risco'][i%3],descricao:'Conecte a leitura técnica às decisões da operação.'},titulo_personalizado:null,youtube_url:i<8?'https://youtu.be/abcdefghijk':null,teams_url:'https://meet.google.com/aaa-bbbb-ccc',teams_url_added_at:'2026-11-17T09:00:00Z',data_sessao:i<8?'2026-11-10':i===8?'2026-11-18':null,session_time:'14:00:00',observacoes:'Revisar a definição do risco antes de entrar.',liberada:true}));
  const user={id:new URLSearchParams(location.search).has('fixtureOtherStudent')?'fixture-other':'fixture-student'};
  const preferences=JSON.parse(sessionStorage.getItem('fixture-preferences:'+user.id)||'[]');
  const readRows=JSON.parse(sessionStorage.getItem('fixture-reads:'+user.id)||'null') || (new URLSearchParams(location.search).has('fixtureSingleUnread')?reviews.map(item=>({review_type:'analysis',review_id:item.id})):[]);
  const dataFor=name=>({profiles:[{nome:'Aluno Demonstração',email:'aluno@example.test',role:'aluno',status:'ativo',data_inicio:'2026-09-01',data_expiracao:'2027-09-01'}],student_sessions:sessions,student_progress:sessionProgress,trade_analysis_reviews:new URLSearchParams(location.search).has("fixtureNoReviews")?[]:reviews,trade_reviews:new URLSearchParams(location.search).has("fixtureNoReviews")?[]:videos,trade_review_reads:readRows,student_study_preferences:preferences,trade_review_progress:reviewProgress,materials:[{id:1,nome:'Roteiro de revisão',url:'https://example.test/material.pdf',tipo:'pdf'}],mentorship_financials:[],mentorship_settings:[],trade_journal_access_overrides:[]}[name]||[]);
  function from(name) {
    const chain={
      select(){return chain},eq(){return chain},order(){return chain},limit(){return chain},
      update(record){if(name==='student_progress')Object.assign(sessionProgress[0],record);return chain},
      single:async()=>({data:dataFor(name)[0]||null,error:null}),
      maybeSingle:async()=>({data:dataFor(name)[0]||null,error:null}),
      then(resolve,reject){return Promise.resolve(name==='student_study_preferences'&&new URLSearchParams(location.search).has('fixturePreferenceLoadFailure')?{data:null,error:{message:'Falha simulada'}}:{data:dataFor(name),error:null}).then(resolve,reject)},
      async upsert(record){
        if(name==='trade_review_reads'){if(!readRows.some(row=>row.review_type===record.review_type&&row.review_id===record.review_id))readRows.push({...record});sessionStorage.setItem('fixture-reads:'+user.id,JSON.stringify(readRows));return {error:null};}
        const rows=name==='trade_review_progress'?reviewProgress:name==='student_progress'?sessionProgress:null;
        if(rows){const prior=rows.find(row=>name==='trade_review_progress'?row.review_id===record.review_id&&row.review_type===record.review_type:row.session_id===record.session_id);if(prior)Object.assign(prior,record);else rows.push({...record});}
        return {data:null,error:null}
      }
    };return chain
  }
  return {from,auth:{getSession:async()=>({data:{session:{user}}}),signOut:async()=>({error:null})},
    rpc:async(name,args)=>{
      if(name==='save_student_study_preference'){
        if(window.__fixtureSaveFailure)return {data:null,error:{message:'Falha simulada'}};
        let target=preferences.find(row=>row.content_type===args.target_kind&&String(row.content_id)===String(args.target_id));
        if(!target){target={content_type:args.target_kind,content_id:args.target_id,favorited:false,notes:''};preferences.push(target)}
        if(typeof args.favorite_value==='boolean')target.favorited=args.favorite_value;
        if(typeof args.note_value==='string')target.notes=args.note_value;
        target.updated_at=new Date().toISOString();sessionStorage.setItem('fixture-preferences:'+user.id,JSON.stringify(preferences));
        const snapshot={...target};
        if(typeof args.favorite_value==='boolean'&&window.__fixtureDelayFavoriteResponse)await new Promise(resolve=>setTimeout(resolve,180));
        return {data:snapshot,error:null};
      }
      return {data:name==='get_mentorship_extension_state'?{extended:false,total_sessions:12,final_recorded:false,recording_access:false}:true,error:null};
    },
    storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://fixture-images.test/chart.svg'},error:null})})}
  };
}
const stub='export '+createClient.toString();
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:1050}});
page.setDefaultTimeout(10000);
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',async route=>{
  const url=route.request().url();
  if(url.startsWith(base)) return route.continue();
  if(url.includes('@supabase/supabase-js')) return route.fulfill({contentType:'text/javascript',body:stub});
  if(url.includes('qrcode')) return route.fulfill({contentType:'text/javascript',body:'export default {toDataURL:async()=>""};'});
  if(url.startsWith('https://fixture-images.test/')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="650" viewBox="0 0 1200 650"><rect width="1200" height="650" fill="#12251b"/><path d="M0 500L100 450 200 480 300 300 400 350 500 270 600 320 700 190 800 250 900 120 1100 170" fill="none" stroke="#c8ff86" stroke-width="5"/><path d="M0 350H1200" stroke="#c8ff86" stroke-dasharray="8 8"/><text x="30" y="60" fill="#d5e7d9" font-size="25">GRÁFICO FICTÍCIO · PRÉVIA DA INTERFACE</text></svg>'});
  if(url.startsWith('https://www.youtube-nocookie.com/')) return route.fulfill({contentType:'text/html',body:'<html><body style="background:#12251b;color:white">Vídeo demonstrativo</body></html>'});
  if(url.includes('fonts.googleapis')||url.includes('fonts.gstatic')) return route.abort();
  throw Error('Unexpected external request: '+url);
});
await page.goto(base+'/aluno/');
await page.locator('#content:not(.hidden)').waitFor();
await page.locator('.study-card').first().waitFor({state:'attached'});
assert.equal(await page.locator('.study-card').count(),12);
assert.equal(await page.locator('.study-home-grid article').count(),2);
assert.equal(await page.locator('#studentSessionsSection .study-session-stage').count(),12);
assert.equal(await page.locator('#studentSessionsSection').isVisible(),false);
await page.locator('.study-navigation a[href="#tradeReviewsSection"]').click();
assert.equal(await page.locator('.study-card[data-review-state="completed"] .study-review-status').first().textContent(),'Concluída');
assert.equal(await page.locator('.study-card[data-review-state="unopened"] .study-review-status').first().textContent(),'Não vista');
await page.getByLabel('Seu estudo',{exact:true}).selectOption('unopened');
assert.equal(await page.locator('.study-card').count(),12);
assert.equal(await page.locator('.study-card:not([data-review-state="unopened"])').count(),0);
await page.getByRole('button',{name:'Mostrar mais revisões',exact:true}).click();
assert.equal(await page.locator('.study-card').count(),16);
await page.getByRole('button',{name:'Limpar filtros'}).click();
await page.getByLabel('Buscar revisões').fill('gestao NASDAQ');
assert.equal(await page.locator('.study-card').count(),8);
await page.getByLabel('Seu estudo',{exact:true}).selectOption('completed');
assert.equal(await page.locator('.study-card').count(),0);
await page.getByRole('button',{name:'Limpar filtros'}).click();
await page.getByLabel('Formato',{exact:true}).selectOption('video');
assert.equal(await page.locator('.study-card').count(),1);
await page.locator('.study-card-open').click();
await page.locator('dialog[open] iframe').waitFor();
assert.equal(await page.locator('.study-card[data-review-state="opened"] .study-review-status').textContent(),'Já aberta');
assert.match(await page.locator('dialog iframe').getAttribute('src'),/^https:\/\/www\.youtube-nocookie\.com\/embed\/abcdefghijk$/);
await page.getByRole('button',{name:'Marcar como estudada',exact:true}).click();
await page.getByText('Progresso salvo.',{exact:true}).waitFor();
await page.keyboard.press('Escape');
assert.equal(await page.locator('dialog[open]').count(),0);
assert.equal(await page.locator('.study-card[data-review-state="completed"]').count(),1);
await page.waitForFunction(()=>document.activeElement?.dataset.open==='video-1');
await page.getByRole('button',{name:'Limpar filtros'}).click();
await page.getByLabel('Buscar revisões').fill('contexto');
await page.locator('.study-card-open').first().click();
await page.getByRole('button',{name:'Ampliar imagem',exact:true}).click();
assert.equal(await page.locator('.study-image-stage.is-zoomed').count(),1);
await page.getByRole('button',{name:'Próxima →',exact:true}).click();
await page.getByRole('button',{name:'Ampliar imagem',exact:true}).waitFor();
await page.keyboard.press('Escape');
await page.getByRole('button',{name:'Limpar filtros'}).click();
await page.getByRole('button',{name:'Mostrar mais revisões',exact:true}).click();
assert.equal(await page.locator('.study-card').count(),17);
assert.equal(await page.locator('.study-card-title img').count(),0,'Titles are escaped');
await page.locator('.study-navigation a[href="#studentSessionsSection"]').click();
await page.locator('#studentSessionsSection [data-session]').first().click();
await page.getByRole('heading',{name:'Observações do mentor',exact:true}).waitFor();
await page.getByRole('link',{name:'Roteiro de revisão ↗',exact:true}).waitFor();
await page.getByRole('button',{name:'✓ Revisada · desfazer',exact:true}).click();
await page.getByText('Progresso salvo.',{exact:true}).waitFor();
await page.keyboard.press('Escape');
if(screenshots)await page.screenshot({path:screenshots+'/study-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});
await page.evaluate(()=>window.scrollTo(0,0));
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile page has no horizontal overflow');
if(screenshots)await page.screenshot({path:screenshots+'/study-mobile.png',fullPage:true});
await page.locator('.study-navigation a[href="#studyHome"]').click();
await page.locator('.study-home-latest [data-open]').first().click();
await page.locator('dialog[open]').waitFor();
assert.equal(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Mobile dialog fits without horizontal overflow');
await page.keyboard.press('Escape');
await page.goto(base+'/aluno/?review=video-1');
await page.locator('dialog[open] iframe').waitFor();

await page.keyboard.press('Escape');
await page.evaluate(()=>{localStorage.removeItem('francotrades:study:fixture-student:opened-reviews');sessionStorage.removeItem('fixture-reads:fixture-student')});
await page.goto(base+'/aluno/?fixtureSingleUnread=1');
await page.locator('#content:not(.hidden)').waitFor();
assert.match(await page.locator('.study-navigation a[href="#tradeReviewsSection"]').getAttribute('aria-label'),/1 revisão ainda não aberta/);
assert.equal(await page.locator('.study-unread-dot').getAttribute('hidden'),null);
await page.locator('.study-navigation a[href="#tradeReviewsSection"]').click();
await page.waitForTimeout(1700);
assert.equal(await page.locator('.study-unread-dot').getAttribute('hidden'),null,'Entering the library and viewing titles must not clear the reminder');
await page.getByLabel('Seu estudo',{exact:true}).selectOption('unopened');
assert.equal(await page.locator('.study-card').count(),1);
await page.getByLabel('Formato',{exact:true}).selectOption('video');
await page.locator('.study-card-open').click();
await page.locator('dialog[open] iframe').waitFor();
assert.equal(await page.locator('.study-unread-dot').getAttribute('hidden'),'','Opening the last unseen study clears the dot');
assert.equal(await page.locator('.study-card').count(),0,'An opened study leaves the unseen-only results immediately');
assert.match(await page.locator('#reviewProgressText').textContent(),/1 de 17/,'Opening a review never marks it completed');
await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('fixture-reads:fixture-student')||'[]').some(row=>row.review_type==='video'));
await page.keyboard.press('Escape');
await page.getByLabel('Seu estudo',{exact:true}).selectOption('opened');
assert.equal(await page.locator('.study-card').count(),1);
assert.equal(await page.locator('.study-review-status').textContent(),'Já aberta');
await page.evaluate(()=>localStorage.removeItem('francotrades:study:fixture-student:opened-reviews'));
await page.reload();
await page.locator('#content:not(.hidden)').waitFor();
assert.equal(await page.locator('.study-unread-dot').getAttribute('hidden'),'','Persisted account reads are used without the browser cache');
await page.goto(base+'/aluno/?fixtureOtherStudent=1');
await page.locator('#content:not(.hidden)').waitFor();
assert.equal(await page.locator('.study-unread-dot').getAttribute('hidden'),null,'Another account has its own reminder');

await page.goto(base+'/aluno/?fixturePersonalStudy=1');
await page.locator('#content:not(.hidden)').waitFor();
await page.locator('.study-navigation a[href="#tradeReviewsSection"]').click();
await page.locator('#reviewLibraryRoot [data-study-favorite="video-1"]').click();
await page.waitForFunction(()=>document.querySelector('#reviewLibraryRoot [data-study-favorite="video-1"]')?.getAttribute('aria-pressed')==='true');
assert.equal(await page.locator('dialog[open]').count(),0,'Favoriting a card does not open the reader');
await page.getByLabel('Somente favoritos',{exact:true}).check();
assert.equal(await page.locator('.study-card').count(),1);
await page.locator('.study-card-open').click();
await page.getByLabel('Minhas anotações',{exact:true}).fill('Aprendizado privado <img src=x onerror=alert(1)>');
assert.equal(await page.locator('.study-personal-panel img').count(),0);
await page.getByRole('button',{name:'Salvar anotação',exact:true}).click();
await page.getByText('Anotação salva.',{exact:true}).waitFor();
await page.locator('dialog [data-study-favorite="video-1"]').click();
await page.waitForFunction(()=>document.querySelector('dialog [data-study-favorite="video-1"]')?.getAttribute('aria-pressed')==='false');
assert.equal(await page.getByLabel('Minhas anotações',{exact:true}).inputValue(),'Aprendizado privado <img src=x onerror=alert(1)>');
await page.keyboard.press('Escape');
assert.equal(await page.locator('.study-card').count(),0);
await page.getByRole('button',{name:'Limpar filtros'}).click();
await page.getByLabel('Formato',{exact:true}).selectOption('video');
await page.locator('.study-card-open').click();
await page.getByLabel('Minhas anotações',{exact:true}).fill('Rascunho da revisão');
await page.keyboard.press('Escape');
await page.locator('.study-card-open').click();
assert.equal(await page.getByLabel('Minhas anotações',{exact:true}).inputValue(),'Rascunho da revisão','Unsaved drafts remain when reopening in the same page');
await page.evaluate(()=>window.__fixtureSaveFailure=true);
await page.getByRole('button',{name:'Salvar anotação',exact:true}).click();
await page.getByText('Não foi possível salvar. Seu rascunho foi mantido. Tente novamente.',{exact:true}).waitFor();
assert.equal(await page.getByLabel('Minhas anotações',{exact:true}).inputValue(),'Rascunho da revisão');
await page.evaluate(()=>window.__fixtureSaveFailure=false);
await page.getByRole('button',{name:'Salvar anotação',exact:true}).click();
await page.getByText('Anotação salva.',{exact:true}).waitFor();
await page.getByLabel('Minhas anotações',{exact:true}).fill('Salvar enquanto favorita');
await page.evaluate(()=>window.__fixtureDelayFavoriteResponse=true);
await page.locator('dialog [data-study-favorite="video-1"]').click();
await page.getByRole('button',{name:'Salvar anotação',exact:true}).click();
await page.getByText('Anotação salva.',{exact:true}).waitFor();
await page.waitForFunction(()=>document.querySelector('dialog [data-study-favorite="video-1"]')?.getAttribute('aria-pressed')==='true');
await page.keyboard.press('Escape');
await page.locator('.study-card-open').click();
assert.equal(await page.getByLabel('Minhas anotações',{exact:true}).inputValue(),'Salvar enquanto favorita','Delayed favorite responses cannot overwrite a newer note');
await page.keyboard.press('Escape');
await page.reload();
await page.locator('#content:not(.hidden)').waitFor();
await page.getByLabel('Formato',{exact:true}).selectOption('video');
await page.locator('.study-card-open').click();
assert.equal(await page.getByLabel('Minhas anotações',{exact:true}).inputValue(),'Salvar enquanto favorita');
assert.equal(await page.locator('dialog [data-study-favorite="video-1"]').getAttribute('aria-pressed'),'true');
await page.keyboard.press('Escape');
await page.locator('.study-navigation a[href="#studentSessionsSection"]').click();
assert.equal(await page.locator('#studentSessionsSection [data-study-favorite="session-1"]').isDisabled(),false);
await page.getByLabel('Somente sessões favoritas',{exact:true}).check();
assert.equal(await page.locator('.session-card:visible').count(),0);
await page.getByLabel('Somente sessões favoritas',{exact:true}).uncheck();
await page.locator('#studentSessionsSection [data-study-favorite="session-1"]').click();
await page.waitForFunction(()=>document.querySelector('#studentSessionsSection [data-study-favorite="session-1"]')?.getAttribute('aria-pressed')==='true');
await page.getByLabel('Somente sessões favoritas',{exact:true}).check();
assert.equal(await page.locator('.session-card:visible').count(),1);
await page.locator('.session-card:visible [data-session]').click();
assert.equal(await page.getByLabel('Minhas anotações',{exact:true}).inputValue(),'');
await page.getByLabel('Minhas anotações',{exact:true}).fill('Anotação exclusiva da sessão');
await page.getByRole('button',{name:'Salvar anotação',exact:true}).click();
await page.getByText('Anotação salva.',{exact:true}).waitFor();
await page.keyboard.press('Escape');
await page.reload();
await page.locator('#content:not(.hidden)').waitFor();
assert.equal(await page.locator('#studentSessionsSection [data-study-favorite="session-1"]').getAttribute('aria-pressed'),'true');
assert.equal(await page.locator('#studentSessionsSection [data-study-favorite="session-1"]').isDisabled(),false);
await page.locator('#studentSessionsSection [data-session]').first().click();
assert.equal(await page.getByLabel('Minhas anotações',{exact:true}).inputValue(),'Anotação exclusiva da sessão');
await page.keyboard.press('Escape');

await page.goto(base+'/aluno/?fixtureOtherStudent=1');
await page.locator('#content:not(.hidden)').waitFor();
await page.locator('.study-navigation a[href="#tradeReviewsSection"]').click();
await page.getByLabel('Formato',{exact:true}).selectOption('video');
await page.locator('.study-card-open').click();
assert.equal(await page.getByLabel('Minhas anotações',{exact:true}).inputValue(),'','Notes are isolated between accounts');
assert.equal(await page.locator('dialog [data-study-favorite="video-1"]').getAttribute('aria-pressed'),'false');
await page.keyboard.press('Escape');

await page.goto(base+'/aluno/?fixturePreferenceLoadFailure=1');
await page.locator('#content:not(.hidden)').waitFor();
await page.locator('.study-navigation a[href="#tradeReviewsSection"]').click();
assert.equal(await page.getByLabel('Somente favoritos',{exact:true}).isDisabled(),true);
assert.equal(await page.locator('#reviewLibraryRoot [data-study-favorite]').first().isDisabled(),true);
await page.getByLabel('Formato',{exact:true}).selectOption('video');
await page.locator('.study-card-open').click();
assert.equal(await page.locator('.study-personal-panel textarea').count(),0,'Failed initial loading cannot present an empty editor over an existing note');
await page.getByText('Não foi possível carregar seus favoritos e anotações. Atualize a página para tentar novamente.',{exact:true}).waitFor();
await page.keyboard.press('Escape');
await page.goto(base+'/aluno/?fixtureNoReviews=1');
await page.locator('#content:not(.hidden)').waitFor();
assert.equal(await page.locator('.study-unread-dot').getAttribute('hidden'),'','No accessible reviews means no reminder');
assert.deepEqual(errors,[]);
console.log('Browser: actual student page, 390/1440px, filters, pagination, progress callbacks, image zoom, video, session materials, deep links and escaped titles passed');
await browser.close();
