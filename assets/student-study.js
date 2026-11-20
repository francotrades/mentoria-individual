import {createPersonalStudy} from './student-personal-study.js?v=20261117e';
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const reviewKey = item => item.type + '-' + item.id;
export function reviewState(item, opened, progress) {
  if (progress.get(item.type + ':' + item.id) === true) return 'completed';
  return opened.has(reviewKey(item)) ? 'opened' : 'unopened';
}
const reviewStateLabels = {unopened: 'Não vista', opened: 'Já aberta', completed: 'Concluída'};
export function unopenedReviews(items, opened, progress) {
  return items.filter(item => reviewState(item, opened, progress) === 'unopened');
}
export function filterReviews(items, filters, progress, opened = new Set(), preferences = new Map()) {
  const words = normalizeSearch(filters.search).split(/\s+/).filter(Boolean);
  return items.filter(item => (!filters.format || item.type === filters.format)
    && (!filters.instrument || (item.instrumento || '') === filters.instrument)
    && (!filters.topic || (item.tema || '') === filters.topic)
    && (!filters.favorites || preferences.get(reviewKey(item))?.favorited === true)
    && (!filters.status || (filters.status === 'pending'
      ? reviewState(item, opened, progress) !== 'completed'
      : reviewState(item, opened, progress) === filters.status))
    && words.every(word => normalizeSearch([item.titulo, item.explicacao, item.descricao, item.instrumento, item.tema].join(' ')).includes(word)));
}
export function youtubeVideoId(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const id = host === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)
      ? (url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]) : null;
    return /^[\w-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}
export function safeLink(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
export function sessionStage(item, today = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'})) {
  if (item.youtube_url) return 'Gravação disponível';
  if (item.data_sessao && item.data_sessao >= today) return 'Sessão agendada';
  return item.data_sessao ? 'Gravação em breve' : 'Aguardando agendamento';
}
export function nextMentorship(sessions, now = Date.now()) {
  return sessions.filter(item => item.data_sessao && item.session_time && item.liberada !== false)
    .map(item => ({item, start: Date.parse(item.data_sessao + 'T' + String(item.session_time).slice(0,5) + ':00-03:00')}))
    .filter(({start}) => Number.isFinite(start) && start + 150 * 60000 > now)
    .sort((a,b) => a.start-b.start)[0]?.item || null;
}
const titleOfSession = item => item.titulo_personalizado || item.sessions?.titulo || 'Sessão ' + (item.sessions?.numero || item.session_id);
const dateLabel = value => value ? new Date(value).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'}) : '';
const external = (url, label) => safeLink(url) ? '<a class="study-button secondary" href="' + escape(safeLink(url)) + '" target="_blank" rel="noopener noreferrer">' + escape(label) + ' ↗</a>' : '';

export function mountStudentStudy(options) {
  const {root, home, sessionsRoot, reviewsSection, getData, completeReview, completeSession, signedImage, liveAvailable, watchCard, loadMaterials, recordReviewRead, savePreference, onError} = options;
  const filters = {search: '', format: '', status: '', instrument: '', topic: '', favorites: false};
  let limit = 12, ready = false, current = null, lastTrigger = null, renderVersion = 0, imageVersion = 0;
  const imageCache = new Map();
  const storageKey = suffix => 'francotrades:study:' + getData().userId + ':' + suffix;
  const read = suffix => { try { return localStorage.getItem(storageKey(suffix)); } catch { return null; } };
  const write = (suffix, value) => { try { if (getData().userId) localStorage.setItem(storageKey(suffix), value); } catch {} };
  let previousVisit = null;
  const navigation = document.querySelector('.study-navigation');
  const reviewLink = navigation?.querySelector('a[href="#tradeReviewsSection"]');
  const reminder = document.createElement('span');
  reminder.className = 'study-unread-dot';
  reminder.hidden = true;
  reminder.setAttribute('aria-hidden', 'true');
  reviewLink?.append(reminder);
  const openedHere = new Set();
  const pendingReads = new Set();
  const openedReferences = () => new Set([...openedHere, ...(getData().reviewReads || [])]);
  let sessionFavoritesOnly = false;
  const personal = createPersonalStudy({
    getPreferences: () => getData().preferences || new Map(),
    getPreferencesReady: () => getData().preferencesLoaded !== false,
    savePreference,
    onChange: () => { if (ready) { renderCards(); updateSessionPreferences(); } },
    onError
  });
  function updateUnreadReminder() {
    if (!ready || !reviewLink) return;
    const count = unopenedReviews(items(), openedReferences(), getData().reviewProgress).length;
    const message = count === 1 ? '1 revisão ainda não aberta' : count + ' revisões ainda não abertas';
    reminder.hidden = count === 0;
    reviewLink.title = count ? message : 'Todas as revisões disponíveis já foram abertas';
    reviewLink.setAttribute('aria-label', 'Revisões de trades' + (count ? ' — ' + message : ''));
  }
  function rememberOpened(item) {
    const key = reviewKey(item);
    openedHere.add(key);
    write('opened-reviews', JSON.stringify([...openedReferences()]));
    updateUnreadReminder();
    if (!getData().reviewReads?.has(key) && !pendingReads.has(key) && recordReviewRead) {
      pendingReads.add(key);
      Promise.resolve().then(() => recordReviewRead(item.type, item.id)).catch(() => {
        // The account-scoped browser cache retains the reminder state offline.
      }).finally(() => pendingReads.delete(key));
    }
  }
  const panels = {
    studyHome: [home, document.querySelector('#content > .hero'), document.querySelector('.progress-panel'), document.querySelector('.access-panel'), document.getElementById('paymentPanel')],
    studentSessionsSection: [sessionsRoot.closest('section')],
    tradeReviewsSection: [reviewsSection]
  };
  function showView(view, move = false, updateHistory = true) {
    if (!panels[view]) view = 'studyHome';
    for (const [key, sections] of Object.entries(panels)) for (const section of sections) if (section) section.hidden = key !== view;
    navigation?.querySelectorAll('a').forEach(link => {
      if (link.getAttribute('href') === '#' + view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const section = document.getElementById(view);
    if (section?.classList.contains('is-collapsed')) section.querySelector('button[aria-expanded="false"]')?.click();
    if (updateHistory) {
      const url = location.pathname + location.search + '#' + view;
      if (move && location.hash !== '#' + view) history.pushState(null, '', url);
      else history.replaceState(null, '', url);
    }
    if (move) navigation?.scrollIntoView({block: 'start', behavior: 'instant'});
  }
  const items = () => {
    const data = getData();
    return [...data.analysis.map(item => ({...item, type: 'analysis'})), ...data.videos.map(item => ({...item, type: 'video'}))]
      .sort((a, b) => (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0) || Number(b.id) - Number(a.id));
  };
  const filtered = () => filterReviews(items(), filters, getData().reviewProgress, openedReferences(), getData().preferences);
  const done = item => getData().reviewProgress.get(item.type + ':' + item.id) === true;
  const isNew = item => previousVisit !== null && Date.parse(item.published_at) > previousVisit;
  const image = async path => {
    const cached = imageCache.get(path);
    if (cached && Date.now() - cached.created < 45 * 60 * 1000) return cached.promise;
    const promise = Promise.resolve(signedImage(path)).catch(() => null);
    imageCache.set(path, {created: Date.now(), promise}); return promise;
  };
  root.innerHTML = '<div class="study-library-heading"><p>Encontre uma operação pelo contexto que você quer estudar.</p><button type="button" class="study-text-button" data-clear>Limpar filtros</button></div>'
    + '<div class="study-filters"><label class="study-search">Buscar revisões<input type="search" placeholder="Ex.: gestão de risco, Nasdaq, rompimento…" autocomplete="off" data-filter="search"></label>'
    + '<label>Formato<select aria-label="Formato" data-filter="format"><option value="">Todos os formatos</option><option value="analysis">Imagem e explicação</option><option value="video">Vídeo comentado</option></select></label>'
    + '<label>Seu estudo<select aria-label="Seu estudo" data-filter="status"><option value="">Todas as revisões</option><option value="unopened">Não vistas</option><option value="opened">Já abertas</option><option value="pending">Não concluídas</option><option value="completed">Concluídas</option></select></label>'
    + '<label>Ativo<select aria-label="Ativo" data-filter="instrument"><option value="">Todos os ativos</option></select></label>'
    + '<label>Tema<select aria-label="Tema" data-filter="topic"><option value="">Todos os temas</option></select></label></div>'
    + '<label class="study-favorites-filter"><input type="checkbox" data-filter="favorites">Somente favoritos</label>'
    + '<p class="study-results" aria-live="polite"></p><div class="study-grid"></div><button class="study-button study-more" type="button">Mostrar mais revisões</button>';
  const grid = root.querySelector('.study-grid'), results = root.querySelector('.study-results'), more = root.querySelector('.study-more');
  const sessionCollection = document.createElement('label');
  sessionCollection.className = 'study-favorites-filter';
  sessionCollection.innerHTML = '<input type="checkbox">Somente sessões favoritas';
  sessionsRoot.before(sessionCollection);
  const sessionCollectionEmpty = document.createElement('p');
  sessionCollectionEmpty.className = 'study-empty'; sessionCollectionEmpty.hidden = true;
  sessionCollectionEmpty.textContent = 'Você ainda não tem sessões favoritas. Use a estrela de uma sessão para guardá-la aqui.';
  sessionsRoot.after(sessionCollectionEmpty);
  sessionCollection.querySelector('input').addEventListener('change', event => {
    sessionFavoritesOnly = event.target.checked; updateSessionPreferences();
  });
  const dialog = document.createElement('dialog');
  dialog.className = 'study-dialog'; dialog.setAttribute('aria-labelledby', 'studyDialogTitle');
  dialog.innerHTML = '<div class="study-dialog-toolbar"><span data-kind></span><button class="study-text-button" type="button" data-close aria-label="Fechar conteúdo">Fechar ✕</button></div><div data-detail></div>';
  document.body.append(dialog);
  const detail = dialog.querySelector('[data-detail]');
  const close = () => dialog.close();
  dialog.querySelector('[data-close]').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog && (event.clientX < dialog.getBoundingClientRect().left || event.clientX > dialog.getBoundingClientRect().right || event.clientY < dialog.getBoundingClientRect().top || event.clientY > dialog.getBoundingClientRect().bottom)) close(); });
  dialog.addEventListener('close', () => {
    current = null; imageVersion++; detail.replaceChildren();
    document.body.classList.remove('study-dialog-open');
    const reference = lastTrigger?.getAttribute('data-open');
    const restore = lastTrigger?.isConnected ? lastTrigger : reference
      ? root.querySelector('[data-open="' + CSS.escape(reference) + '"]') : null;
    if (restore && restore !== document.body && restore.getClientRects().length) restore.focus();
    else navigation?.querySelector('[aria-current]')?.focus();
  });
  const showDialog = () => { if (!dialog.open) { lastTrigger = document.activeElement; dialog.showModal(); document.body.classList.add('study-dialog-open'); } };
  function updateOptions() {
    for (const [key, field, label] of [['instrument', 'instrumento', 'Todos os ativos'], ['topic', 'tema', 'Todos os temas']]) {
      const select = root.querySelector('[data-filter="' + key + '"]');
      const values = [...new Set(items().map(item => item[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      select.innerHTML = '<option value="">' + label + '</option>' + values.map(value => '<option value="' + escape(value) + '">' + escape(value) + '</option>').join('');
      if (!values.includes(filters[key])) filters[key] = '';
      select.value = filters[key];
    }
  }
  function renderCards() {
    const version = ++renderVersion, selected = filtered(), visible = selected.slice(0, limit);
    grid.replaceChildren();
    results.textContent = selected.length + (selected.length === 1 ? ' revisão encontrada' : ' revisões encontradas');
    for (const item of visible) {
      const card = document.createElement('article'); card.className = 'study-card' + (done(item) ? ' is-completed' : '');
      const state = reviewState(item, openedReferences(), getData().reviewProgress);
      card.dataset.reviewState = state;
      card.innerHTML = '<button type="button" class="study-card-open" data-open="' + escape(reviewKey(item)) + '">'
        + '<span class="study-thumbnail" aria-hidden="true">' + (item.type === 'video' ? '▶' : '↗') + '</span>'
        + '<span class="study-card-body"><span class="study-card-meta">' + (item.type === 'video' ? 'VÍDEO COMENTADO' : 'IMAGEM + EXPLICAÇÃO') + '<span class="study-review-status is-' + state + '">' + reviewStateLabels[state] + '</span></span>'
        + '<span class="trade-review-title study-card-title">' + escape(item.titulo) + '</span>'
        + '<span class="study-tags">' + [item.instrumento, item.tema].filter(Boolean).map(tag => '<span>' + escape(tag) + '</span>').join('') + '</span>'
        + (personal.entry(item.type, item.id).notes.trim() ? '<span class="study-personal-hint">Com anotações</span>' : '')
        + '<span class="study-card-footer">' + escape(dateLabel(item.published_at)) + '<span>Abrir estudo →</span></span></span></button>'
        + personal.favoriteMarkup(item.type, item.id, true);
      grid.append(card); watchCard?.(card, item.type, item.id);
      if (item.type === 'analysis' && item.image_path) image(item.image_path).then(url => {
        if (version !== renderVersion || !card.isConnected || !safeLink(url)) return;
        const img = document.createElement('img'); img.src = safeLink(url); img.alt = ''; img.loading = 'lazy'; card.querySelector('.study-thumbnail').replaceChildren(img);
      });
    }
    more.hidden = selected.length <= limit;
    if (!selected.length) {
      const notice = document.createElement('p'); notice.className = 'study-empty';
      notice.textContent = items().length ? 'Nenhuma revisão com esses filtros. Tente outro termo ou limpe os filtros.' : 'As revisões disponíveis para você aparecerão aqui.';
      grid.append(notice);
    }
  }
  function renderHome() {
    const data = getData(), latest = items().filter(item => !done(item)).slice(0, 3);
    const last = items().find(item => reviewKey(item) === read('last-review'));
    const next = nextMentorship(data.sessions);
    home.innerHTML = '<div class="study-home-heading"><div><span class="section-kicker">Seu próximo passo</span><h2>Vamos ao estudo.</h2></div><a class="study-text-button" href="#tradeReviewsSection">Ver biblioteca →</a></div><div class="study-home-grid">'
      + '<article><span class="study-card-meta">PRÓXIMA MENTORIA</span><h3>' + escape(next ? titleOfSession(next) : 'Seu acompanhamento') + '</h3><p>' + (next ? escape(next.data_sessao.split('-').reverse().join('/') + (next.session_time ? ' às ' + next.session_time.slice(0, 5) + ' · Brasília' : '')) : 'Consulte as gravações e as observações dos seus encontros.') + '</p>'
      + (next ? '<div class="study-upcoming-actions"><button class="study-button secondary" type="button" data-session="' + next.id + '">Ver sessão →</button>' + liveButton(next) + '</div>' : '<a class="study-button secondary" href="#studentSessionsSection">Minhas sessões →</a>') + '</article>'
      + '<article><span class="study-card-meta">' + (last ? 'CONTINUAR ESTUDANDO' : 'PARA REVISAR') + '</span><h3>' + escape(last?.titulo || latest[0]?.titulo || 'Seu espaço de estudo') + '</h3><p>' + (last ? 'Volte ao último estudo que você abriu.' : 'Acompanhe os estudos liberados para a sua mentoria.') + '</p>'
      + (last || latest[0] ? '<button class="study-button" type="button" data-open="' + escape(reviewKey(last || latest[0])) + '">Abrir revisão →</button>' : '<a class="study-button" href="#tradeReviewsSection">Ver revisões →</a>') + '</article></div>'
      + (latest.length ? '<div class="study-home-latest"><h3>Revisões para estudar</h3>' + latest.map(item => '<button type="button" data-open="' + escape(reviewKey(item)) + '"><span>' + escape(item.titulo) + '</span><span>' + (isNew(item) ? 'Novo · ' : '') + (item.type === 'video' ? 'Vídeo' : 'Imagem e explicação') + ' ↗</span></button>').join('') + '</div>' : '');
  }
  function liveButton(item) {
    if (!safeLink(item.teams_url)) return '';
    return liveAvailable(item)
      ? external(item.teams_url, 'Entrar ao vivo')
      : '<button type="button" class="study-button secondary" disabled title="A entrada abre 30 minutos antes do horário da sessão">Entrar ao vivo · em breve</button>';
  }
  async function openReview(key) {
    const item = items().find(candidate => reviewKey(candidate) === key); if (!item) return false;
    showView('tradeReviewsSection');
    current = {kind: 'review', key}; write('last-review', key); showDialog();
    const version = ++imageVersion;
    dialog.querySelector('[data-kind]').textContent = item.type === 'video' ? 'Revisão em vídeo' : 'Revisão com imagem';
    const selected = filtered(), index = selected.findIndex(candidate => reviewKey(candidate) === key);
    detail.innerHTML = '<h2 id="studyDialogTitle">' + escape(item.titulo) + '</h2><p class="study-detail-meta">' + escape([dateLabel(item.published_at), item.instrumento, item.tema].filter(Boolean).join(' · ')) + '</p><div data-media></div>'
      + '<div class="study-explanation">' + escape(item.explicacao || item.descricao || '').replaceAll('\n', '<br>') + '</div>'
      + '<section class="study-personal-panel" data-personal-editor></section>'
      + '<div class="study-detail-actions"><button class="study-button" type="button" data-complete>' + (done(item) ? '✓ Concluída · desfazer' : 'Marcar como estudada') + '</button><p class="study-action-status" aria-live="polite"></p></div>'
      + '<nav class="study-detail-nav" aria-label="Navegar pelas revisões"><button type="button" class="study-button secondary" data-previous ' + (index <= 0 ? 'disabled' : '') + '>← Anterior</button><button type="button" class="study-button secondary" data-next ' + (index < 0 || index >= selected.length - 1 ? 'disabled' : '') + '>Próxima →</button></nav>';
    rememberOpened(item);
    renderCards();
    personal.mountEditor(detail.querySelector('[data-personal-editor]'), item.type, item.id);
    const media = detail.querySelector('[data-media]');
    if (item.type === 'video') renderVideo(media, item.youtube_url, item.titulo);
    else if (item.image_path) {
      media.innerHTML = '<p>Carregando imagem…</p>';
      image(item.image_path).then(url => {
      if (version !== imageVersion || !dialog.open) return;
      media.innerHTML = safeLink(url) ? '<button class="study-text-button" type="button" data-zoom aria-pressed="false">Ampliar imagem</button><div class="study-image-stage"><img src="' + escape(safeLink(url)) + '" alt="Gráfico da análise: ' + escape(item.titulo) + '"></div>' : '<p>Não foi possível carregar a imagem. Feche o estudo e tente novamente.</p>';
      media.querySelector('[data-zoom]')?.addEventListener('click', event => {
        const enlarged = media.querySelector('.study-image-stage').classList.toggle('is-zoomed');
        event.target.setAttribute('aria-pressed', String(enlarged)); event.target.textContent = enlarged ? 'Ajustar à tela' : 'Ampliar imagem';
      });
      });
    }
    if (version !== imageVersion) return true;
    detail.querySelector('[data-complete]').addEventListener('click', async event => {
      const button = event.currentTarget, before = done(item); button.disabled = true;
      try {
        await completeReview(item.type, item.id);
        if (current?.key !== key) return;
        button.textContent = done(item) ? '✓ Concluída · desfazer' : 'Marcar como estudada';
        detail.querySelector('.study-action-status').textContent = done(item) !== before ? 'Progresso salvo.' : 'Não foi possível salvar. Tente novamente.';
      } catch { if (current?.key === key) detail.querySelector('.study-action-status').textContent = 'Não foi possível salvar. Tente novamente.'; }
      finally { button.disabled = false; }
    });
    detail.querySelector('[data-previous]').addEventListener('click', () => openReview(reviewKey(selected[index - 1])));
    detail.querySelector('[data-next]').addEventListener('click', () => openReview(reviewKey(selected[index + 1])));
    renderHome(); return true;
  }
  function renderVideo(host, url, title) {
    const id = youtubeVideoId(url);
    host.innerHTML = (id ? '<iframe class="study-video" src="https://www.youtube-nocookie.com/embed/' + id + '" title="' + escape(title) + '" allow="encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>' : '')
      + external(url, 'Abrir vídeo no YouTube');
  }
  async function openSession(id) {
    const item = getData().sessions.find(candidate => String(candidate.id) === String(id)); if (!item) return;
    showView('studentSessionsSection');
    current = {kind: 'session', key: String(id)}; showDialog(); const version = ++imageVersion;
    dialog.querySelector('[data-kind]').textContent = 'Sua sessão · ' + sessionStage(item);
    detail.innerHTML = '<h2 id="studyDialogTitle">' + escape(titleOfSession(item)) + '</h2><p class="study-detail-meta">' + escape(item.data_sessao ? item.data_sessao.split('-').reverse().join('/') + (item.session_time ? ' às ' + item.session_time.slice(0, 5) + ' · Brasília' : '') : 'Data a combinar') + '</p><div data-media></div>'
      + '<div data-session-live>' + liveButton(item) + '</div>'
      + (item.sessions?.descricao ? '<h3>Sobre esta sessão</h3><p class="study-explanation">' + escape(item.sessions.descricao) + '</p>' : '')
      + (item.observacoes ? '<h3>Observações do mentor</h3><p class="study-explanation">' + escape(item.observacoes) + '</p>' : '')
      + '<h3>Materiais da sessão</h3><div data-materials aria-live="polite">Carregando materiais…</div>'
      + '<section class="study-personal-panel" data-personal-editor></section>'
      + '<div class="study-detail-actions"><button class="study-button" type="button" data-session-complete>' + (getData().sessionProgress.get(item.session_id) ? '✓ Revisada · desfazer' : 'Marcar revisão da sessão como concluída') + '</button><p class="study-action-status" aria-live="polite"></p></div>';
    personal.mountEditor(detail.querySelector('[data-personal-editor]'), 'session', item.id);
    if (item.youtube_url) renderVideo(detail.querySelector('[data-media]'), item.youtube_url, titleOfSession(item));
    else detail.querySelector('[data-media]').innerHTML = '<p class="study-empty">' + escape(sessionStage(item)) + '. A gravação aparecerá aqui quando for publicada.</p>';
    detail.querySelector('[data-session-complete]').addEventListener('click', async event => {
      const button = event.currentTarget, before = getData().sessionProgress.get(item.session_id) === true; button.disabled = true;
      try {
        await completeSession(item.session_id);
        if (current?.kind !== 'session' || current.key !== String(id)) return;
        const after = getData().sessionProgress.get(item.session_id) === true;
        button.textContent = after ? '✓ Revisada · desfazer' : 'Marcar revisão da sessão como concluída';
        detail.querySelector('.study-action-status').textContent = before !== after ? 'Progresso salvo.' : 'Não foi possível salvar. Tente novamente.';
      } catch { if (current?.key === String(id)) detail.querySelector('.study-action-status').textContent = 'Não foi possível salvar. Tente novamente.'; }
      finally { button.disabled = false; }
    });
    try {
      const materials = await loadMaterials(item.session_id);
      if (version !== imageVersion) return;
      detail.querySelector('[data-materials]').innerHTML = materials.length ? '<ul class="study-materials">' + materials.map(material => '<li>' + external(material.url, material.nome || 'Abrir material') + '</li>').join('') + '</ul>' : '<p>Não há materiais adicionais nesta sessão.</p>';
    } catch { if (version === imageVersion) detail.querySelector('[data-materials]').textContent = 'Não foi possível carregar os materiais. Tente abrir a sessão novamente.'; }
  }
  function enhanceSessions() {
    const data = getData();
    sessionsRoot.querySelectorAll('.session-card').forEach((card, index) => {
      const item = data.sessions[index]; if (!item) return;
      card.dataset.studySession = item.id;
      card.querySelector('.status-pill').textContent = data.sessionProgress.get(item.session_id) ? 'Revisada' : 'Não revisada';
      const stage = document.createElement('span'); stage.className = 'study-session-stage'; stage.textContent = sessionStage(item); card.querySelector('.session-topline').append(stage);
      const button = document.createElement('button'); button.className = 'study-button'; button.type = 'button'; button.dataset.session = item.id; button.textContent = 'Abrir sessão →';
      card.querySelector('.session-actions').prepend(button);
      if (safeLink(item.teams_url) && !liveAvailable(item)) {
        const pending = document.createElement('button');
        pending.type = 'button'; pending.disabled = true; pending.className = 'study-button secondary';
        pending.textContent = 'Entrar ao vivo · em breve';
        pending.title = 'A entrada abre 30 minutos antes do horário da sessão';
        card.querySelector('.session-actions').append(pending);
      }
    });
    updateSessionPreferences();
    if (current?.kind === 'session') {
      const currentSession = data.sessions.find(item => String(item.id) === current.key);
      const live = detail.querySelector('[data-session-live]');
      if (live) live.innerHTML = currentSession ? liveButton(currentSession) : '';
      if (currentSession) {
        detail.querySelector('#studyDialogTitle').textContent = titleOfSession(currentSession);
        detail.querySelector('.study-detail-meta').textContent = currentSession.data_sessao
          ? currentSession.data_sessao.split('-').reverse().join('/') + (currentSession.session_time ? ' às ' + currentSession.session_time.slice(0,5) + ' · Brasília' : '')
          : 'Data a combinar';
      }
    }
  }
  function updateSessionPreferences() {
    let visible = 0;
    sessionsRoot.querySelectorAll('.session-card').forEach(card => {
      const id = card.dataset.studySession;
      if (!id) return;
      let favorite = card.querySelector('.study-session-favorite');
      if (!favorite) {
        favorite = document.createElement('span'); favorite.className = 'study-session-favorite';
        card.querySelector('.session-actions').append(favorite);
      }
      favorite.innerHTML = personal.favoriteMarkup('session', id, true);
      card.querySelector('.study-session-note-hint')?.remove();
      if (personal.entry('session', id).notes.trim()) {
        const hint = document.createElement('span'); hint.className = 'study-personal-hint study-session-note-hint';
        hint.textContent = ' · Com anotações'; card.querySelector('.session-meta').append(hint);
      }
      card.hidden = sessionFavoritesOnly && personal.entry('session', id).favorited !== true;
      if (!card.hidden) visible++;
    });
    sessionCollectionEmpty.hidden = !sessionFavoritesOnly || visible > 0 || getData().sessions.length === 0;
  }
  const navigate = async event => {
    const favorite = event.target.closest('[data-study-favorite]');
    if (favorite) {
      const reference = favorite.dataset.studyFavorite;
      const match = /^(analysis|video|session)-([1-9]\d*)$/.exec(reference);
      if (match) {
        const hadFocus = document.activeElement === favorite;
        await personal.toggleFavorite(match[1], Number(match[2]));
        if (hadFocus && !dialog.open) {
          const replacement = document.querySelector('[data-study-favorite="' + CSS.escape(reference) + '"]');
          if (replacement?.getClientRects().length) replacement.focus();
          else if (match[1] === 'session') sessionCollection.querySelector('input').focus();
          else root.querySelector('[data-filter="favorites"]').focus();
        }
      }
      return;
    }
    const review = event.target.closest('[data-open]'), session = event.target.closest('[data-session]');
    if (review) openReview(review.dataset.open);
    if (session) openSession(session.dataset.session);
  };
  root.addEventListener('click', navigate); home.addEventListener('click', navigate); sessionsRoot.addEventListener('click', navigate);
  root.querySelectorAll('[data-filter]').forEach(control => control.addEventListener(control.type === 'search' ? 'input' : 'change', () => { filters[control.dataset.filter] = control.type === 'checkbox' ? control.checked : control.value; limit = 12; renderCards(); }));
  root.querySelector('[data-clear]').addEventListener('click', () => {
    for (const key of Object.keys(filters)) filters[key] = '';
    filters.favorites = false;
    root.querySelectorAll('[data-filter]').forEach(control => { if (control.type === 'checkbox') control.checked = false; else control.value = ''; }); limit = 12; renderCards();
  });
  more.addEventListener('click', () => { limit += 12; renderCards(); });
  document.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const link = event.target.closest('a[href^="#"]'); if (!link) return;
    const view = link.getAttribute('href').slice(1);
    if (!panels[view]) return;
    event.preventDefault(); showView(view, true);
  });
  window.addEventListener('popstate', () => { if (ready) showView(location.hash.slice(1), true, false); });
  document.addEventListener('visibilitychange', () => { if (ready && document.visibilityState === 'hidden') write('last-visit', String(Date.now())); });
  window.addEventListener('pagehide', () => { if (ready) write('last-visit', String(Date.now())); });
  return {
    refreshReviews() { if (!ready) return; updateOptions(); renderCards(); renderHome(); updateUnreadReminder(); },
    refreshSessions() { enhanceSessions(); if (ready) renderHome(); },
    ready() {
      ready = true;
      root.querySelector('[data-filter="favorites"]').disabled = getData().preferencesLoaded === false;
      sessionCollection.querySelector('input').disabled = getData().preferencesLoaded === false;
      try {
        const saved = JSON.parse(read('opened-reviews') || '[]');
        if (Array.isArray(saved)) for (const reference of saved) {
          if (typeof reference === 'string' && /^(analysis|video)-[1-9]\d*$/.test(reference)) openedHere.add(reference);
        }
      } catch {}
      const storedVisit = Number(read('last-visit')); previousVisit = Number.isFinite(storedVisit) && storedVisit > 0 ? storedVisit : null;
      updateOptions(); renderCards(); renderHome();
      updateSessionPreferences();
      updateUnreadReminder();
      showView(location.hash.slice(1));
    },
    async openLinkedReview() {
      const reference = new URLSearchParams(location.search).get('review');
      if (!/^(analysis|video)-[1-9]\d*$/.test(reference || '')) return;
      showView('tradeReviewsSection');
      if (reviewsSection.classList.contains('is-collapsed')) reviewsSection.querySelector('button[aria-expanded="false"]')?.click();
      if (!await openReview(reference)) { results.textContent = 'Esta revisão não está disponível para seu acesso neste momento.'; reviewsSection.scrollIntoView({block: 'start'}); }
    }
  };
}
