import {parseReviewReference} from '../supabase/functions/shared/review-protocol.js';
const escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function loginReviewSuffix(search=location.search){const ref=parseReviewReference(new URLSearchParams(search).get('review'));return ref?'?review='+ref.type+'-'+ref.id:'';}
export function watchReviewCard(card,type,id,supabase,user){
 card.dataset.reviewReference=type+'-'+id;card.id='review-'+type+'-'+id;
 if(typeof IntersectionObserver==='undefined')return;
 let timer=null,recorded=false,inView=false;
 const schedule=()=>{clearTimeout(timer);if(recorded||!inView||document.visibilityState!=='visible')return;timer=setTimeout(async()=>{if(recorded||!card.isConnected||document.visibilityState!=='visible')return;recorded=true;observer.disconnect();document.removeEventListener('visibilitychange',schedule);const owner=user();if(!owner)return;try{await supabase.from('trade_review_opens').upsert({student_id:owner.id,review_type:type,review_id:id},{onConflict:'student_id,review_type,review_id',ignoreDuplicates:true});}catch{}},1500);};
 const observer=new IntersectionObserver(entries=>{if(!card.isConnected){clearTimeout(timer);observer.disconnect();document.removeEventListener('visibilitychange',schedule);return;}inView=Boolean(entries[0]?.isIntersecting);schedule();},{threshold:1});
 document.addEventListener('visibilitychange',schedule);
 observer.observe(card.querySelector('.trade-review-title')||card);
}
export function openLinkedReview(setTab,section,body){
 const ref=parseReviewReference(new URLSearchParams(location.search).get('review'));if(!ref)return;
 setTab(ref.type);if(section.classList.contains('is-collapsed'))section.querySelector('button[aria-expanded="false"]')?.click();body.classList.remove('hidden');section.classList.remove('is-collapsed');
 const card=document.getElementById('review-'+ref.type+'-'+ref.id);
 if(card){card.setAttribute('tabindex','-1');requestAnimationFrame(()=>{card.scrollIntoView({behavior:'smooth',block:'center'});card.focus({preventScroll:true});});}
 else{let note=document.getElementById('review-link-note');if(!note){note=document.createElement('p');note.id='review-link-note';body.prepend(note)}note.textContent='Esta revisão não está disponível para seu acesso neste momento.';section.scrollIntoView({block:'start'});}
}
export async function loadReviewEngagement(supabase,host){
 try{
 const {data,error}=await supabase.rpc('review_engagement');if(error){host.textContent='O acompanhamento de visualizações aguarda a ativação da integração.';return;}
 host.innerHTML='<p>Visualização: título da revisão visível na tela por pelo menos 1,5 segundo. Isso não comprova leitura completa. Os números consideram alunos elegíveis atualmente.</p><div style="overflow:auto"><table><thead><tr><th>Revisão</th><th>Com acesso</th><th>Visualizou</th><th>Concluiu</th></tr></thead><tbody>'+data.map(row=>'<tr><td>'+escape(row.title)+'</td><td>'+row.eligible+'</td><td>'+row.viewed+'</td><td>'+row.completed+'</td></tr>').join('')+'</tbody></table></div>';
 }catch{host.textContent='Não foi possível atualizar o acompanhamento agora.';}
}
export async function dispatchReviewNotices(supabase,host){
 try{
 host.textContent='Verificando avisos pendentes...';
 const {data,error}=await supabase.functions.invoke('trade-review-notification',{body:{}});
 if(error){host.textContent='As revisões estão salvas. A integração de e-mails precisa ser ativada ou verificada.';return;}
 if(!data?.configured){host.textContent='As revisões estão salvas. Verifique a configuração de e-mails do portal para ativar os avisos.';return;}
 if(data.paused){host.textContent='Os avisos de revisão por e-mail estão pausados. As revisões continuam disponíveis no portal.';return;}
 const parts=[];
 if(data.sent)parts.push(data.sent+' e-mail(s) enviado(s) aos alunos com acesso.');
 if(data.skipped)parts.push(data.skipped+' entrega(s) ignorada(s) por alteração no acesso ou cadastro.');
 if(data.needsCheck)parts.push('Um envio precisa ser conferido antes de tentar novamente.');
 if(data.failed)parts.push('Uma tentativa falhou; há entregas aguardando nova tentativa.');
 host.textContent=parts.join(' ')||'Não há e-mails prontos para envio. Publicações antigas não são anunciadas automaticamente.';
 }catch{host.textContent='A revisão está salva; não foi possível verificar o envio dos e-mails agora.';}
}
