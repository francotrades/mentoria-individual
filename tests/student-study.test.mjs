import test from 'node:test';
import assert from 'node:assert/strict';
import {filterReviews, youtubeVideoId, safeLink, sessionStage, unopenedReviews, reviewState, mentorshipHomeState} from '../assets/student-study.js';
const entries = [
  {id: 1, type: 'analysis', titulo: 'Condução no índice', explicacao: 'Gestão de risco na abertura', instrumento: 'Nasdaq', tema: 'Condução'},
  {id: 2, type: 'video', titulo: 'Rompimento', descricao: 'Contexto do dia', instrumento: 'S&P 500', tema: 'Entrada'},
  {id: 3, type: 'analysis', titulo: 'Análise antiga sem classificação'}
];
test('Home distinguishes upcoming, unscheduled and final-recording states without depending on review progress', () => {
  const now = Date.parse('2026-11-20T12:00:00-03:00');
  const session = (number, patch = {}) => ({id: number, sessions: {numero: number}, liberada: true, ...patch});
  const recorded = session(12, {youtube_url: 'https://youtu.be/abcdefghijk', data_sessao: '2026-11-20', session_time: '14:00:00'});
  assert.equal(mentorshipHomeState([recorded], 12, now).label, 'ENCONTROS CONCLUÍDOS');
  assert.equal(mentorshipHomeState([recorded], 12, now).next, null);
  assert.equal(mentorshipHomeState([recorded], 16, now).label, 'SEU ACOMPANHAMENTO');
  assert.equal(mentorshipHomeState([recorded, session(16, {youtube_url: 'https://video.test/'})], 16, now).label, 'ENCONTROS CONCLUÍDOS');
  for (const sessions of [[], [session(1, {youtube_url: 'https://video.test/'})], [session(12, {youtube_url: '  '})], [{...recorded, liberada: false}]]) {
    assert.equal(mentorshipHomeState(sessions, 12, now).label, 'SEU ACOMPANHAMENTO');
  }
  assert.equal(mentorshipHomeState([recorded], undefined, now).label, 'SEU ACOMPANHAMENTO');
  const upcoming = session(13, {data_sessao: '2026-11-21', session_time: '15:30:00'});
  const state = mentorshipHomeState([recorded, upcoming], 12, now);
  assert.equal(state.label, 'PRÓXIMA MENTORIA');
  assert.equal(state.next.id, 13);
  assert.match(state.description, /21\/11\/2026 às 15:30 · Brasília/);
  assert.equal(mentorshipHomeState([upcoming], 13, Date.parse('2026-11-21T18:00:00-03:00')).label, 'SEU ACOMPANHAMENTO');
});
test('Reminder excludes opened and completed studies, keeps formats distinct and considers only accessible items', () => {
  const progress = new Map([['analysis:1', true]]);
  assert.deepEqual(unopenedReviews(entries,new Set(['video-2','analysis-999']),progress).map(item=>item.id),[3]);
  assert.equal(unopenedReviews([],new Set(),progress).length,0);
  const sameId = [{id:1,type:'analysis'},{id:1,type:'video'}];
  assert.deepEqual(unopenedReviews(sameId,new Set(['analysis-1']),new Map()).map(item=>item.type),['video']);
  assert.equal(unopenedReviews(entries,new Set(),new Map()).length,3);
});
test('Review states and filters separate unopened, opened and explicitly completed studies', () => {
  const progress = new Map([['analysis:1', true]]);
  const opened = new Set(['video-2']);
  assert.deepEqual(entries.map(item=>reviewState(item,opened,progress)),['completed','opened','unopened']);
  for (const [status,id] of [['completed',1],['opened',2],['unopened',3]]) {
    assert.deepEqual(filterReviews(entries,{status},progress,opened).map(item=>item.id),[id]);
  }
  assert.deepEqual(filterReviews(entries,{status:'pending'},progress,opened).map(item=>item.id),[2,3]);
  assert.deepEqual(filterReviews(entries,{status:'unopened',format:'video'},progress,opened),[]);
  progress.set('video:2',true);
  assert.equal(reviewState(entries[1],opened,progress),'completed');
  progress.set('video:2',false);
  assert.equal(reviewState(entries[1],opened,progress),'opened');
});
test('Favorite filtering combines with existing study filters and keeps review formats separate', () => {
  const preferences = new Map([['analysis-1',{favorited:true}],['video-2',{favorited:false}],['session-3',{favorited:true}]]);
  const progress = new Map([['analysis:1',true]]);
  assert.deepEqual(filterReviews(entries,{favorites:true},progress,new Set(),preferences).map(item=>item.id),[1]);
  assert.deepEqual(filterReviews(entries,{favorites:true,status:'unopened'},progress,new Set(),preferences),[]);
  assert.deepEqual(filterReviews(entries,{favorites:true,format:'video'},progress,new Set(),preferences),[]);
  assert.equal(filterReviews(entries,{favorites:false},progress,new Set(),preferences).length,3);
});
test('Study search combines accent-insensitive words, filters and per-format progress without losing old studies', () => {
  const progress = new Map([['analysis:1', true], ['video:2', false]]);
  assert.deepEqual(filterReviews(entries, {search:'gestao NASDAQ'}, progress).map(x=>x.id), [1]);
  assert.deepEqual(filterReviews(entries, {status:'pending'}, progress).map(x=>x.id), [2,3]);
  assert.deepEqual(filterReviews(entries, {format:'video',instrument:'Nasdaq'}, progress), []);
  assert.deepEqual(filterReviews(entries, {topic:'Entrada',status:'pending'}, progress).map(x=>x.id), [2]);
  assert.equal(filterReviews(entries, {}, progress).length,3);
  assert.equal(filterReviews(entries,{search:'classificacao'},progress)[0].id,3);
});
test('Video embedding accepts only valid YouTube IDs and exact HTTPS hosts', () => {
  for (const url of ['https://youtu.be/abcdefghijk','https://www.youtube.com/watch?v=abcdefghijk','https://youtube.com/live/abcdefghijk','https://youtube.com/shorts/abcdefghijk']) assert.equal(youtubeVideoId(url),'abcdefghijk');
  for (const url of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=abcdefghijk','http://youtube.com/watch?v=abcdefghijk','https://youtu.be/x','https://evil.test/abcdefghijk']) assert.equal(youtubeVideoId(url),null);
  assert.equal(safeLink('javascript:alert(1)'),'');assert.equal(safeLink('data:text/html,hello'),'');assert.equal(safeLink('https://example.test/a'),'https://example.test/a');
});
test('Session availability is separate from the student review and uses explicit calendar dates', () => {
  assert.equal(sessionStage({youtube_url:'https://video.test/'},'2026-11-17'),'Gravação disponível');
  assert.equal(sessionStage({data_sessao:'2026-11-18'},'2026-11-17'),'Sessão agendada');
  assert.equal(sessionStage({data_sessao:'2026-11-16'},'2026-11-17'),'Gravação em breve');
  assert.equal(sessionStage({},'2026-11-17'),'Aguardando agendamento');
});
