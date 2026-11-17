export const preferenceKey = (kind, id) => kind + '-' + id;
export const MAX_STUDY_NOTE_LENGTH = 10000;
const star = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2L12 17.3l-5.7 2.9 1.1-6.2L3 9.6l6.2-.9Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function createPersonalStudy({getPreferences, getPreferencesReady = () => true, savePreference, onChange, onError}) {
  const drafts = new Map(), saving = new Set(), editors = new Map();
  const entry = (kind, id) => getPreferences().get(preferenceKey(kind, id)) || {favorited: false, notes: ''};
  function favoriteMarkup(kind, id, compact = false) {
    const selected = entry(kind, id).favorited === true;
    const label = selected ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    return '<button type="button" class="study-favorite-button' + (compact ? ' is-compact' : '') + '" data-study-favorite="' + escape(preferenceKey(kind, id)) + '" aria-label="' + label + '" aria-pressed="' + selected + '" title="' + label + '"' + (!getPreferencesReady() || saving.has('favorite:' + preferenceKey(kind, id)) ? ' disabled' : '') + '>'
      + star + (compact ? '' : '<span>' + (selected ? 'Nos favoritos' : 'Favoritar') + '</span>') + '</button>';
  }
  function updateFavoriteButtons(kind, id) {
    const key = preferenceKey(kind, id), selected = entry(kind, id).favorited === true;
    document.querySelectorAll('[data-study-favorite]').forEach(button => {
      if (button.dataset.studyFavorite !== key) return;
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', selected ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
      button.title = selected ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
      button.disabled = !getPreferencesReady() || saving.has('favorite:' + key);
      const label = button.querySelector('span');
      if (label) label.textContent = selected ? 'Nos favoritos' : 'Favoritar';
    });
  }
  async function toggleFavorite(kind, id) {
    if (!getPreferencesReady()) {
      onError?.('Seus favoritos não foram carregados. Atualize a página antes de alterar.');
      return false;
    }
    const key = preferenceKey(kind, id), lock = 'favorite:' + key;
    if (saving.has(lock)) return;
    saving.add(lock); updateFavoriteButtons(kind, id);
    try {
      await savePreference(kind, id, {favorited: entry(kind, id).favorited !== true});
      onChange?.(kind, id);
      return true;
    } catch {
      onError?.('Não foi possível atualizar o favorito. Tente novamente.');
      return false;
    } finally {
      saving.delete(lock); updateFavoriteButtons(kind, id);
    }
  }
  function mountEditor(host, kind, id) {
    if (!getPreferencesReady()) {
      host.innerHTML = '<p class="study-note-status">Não foi possível carregar seus favoritos e anotações. Atualize a página para tentar novamente.</p>';
      return;
    }
    const key = preferenceKey(kind, id), saved = entry(kind, id).notes || '';
    host.innerHTML = '<div class="study-personal-heading"><h3>Seu espaço de estudo</h3>' + favoriteMarkup(kind, id) + '</div>'
      + '<label class="study-note-label" for="personalStudyNote">Minhas anotações</label>'
      + '<p class="study-note-privacy">Visíveis apenas para você na plataforma. Registre o aprendizado e como pretende aplicá-lo.</p>'
      + '<textarea id="personalStudyNote" class="study-note-input" maxlength="' + MAX_STUDY_NOTE_LENGTH + '" placeholder="O que aprendi? O que quero colocar em prática?"></textarea>'
      + '<div class="study-note-footer"><button type="button" class="study-button secondary" data-save-note>Salvar anotação</button><span data-note-count></span></div>'
      + '<p class="study-note-status" role="status" aria-live="polite"></p>';
    const field = host.querySelector('textarea'), status = host.querySelector('.study-note-status'), button = host.querySelector('[data-save-note]');
    field.value = drafts.has(key) ? drafts.get(key) : saved;
    const update = () => {
      host.querySelector('[data-note-count]').textContent = field.value.length.toLocaleString('pt-BR') + ' / 10.000 caracteres';
      const dirty = field.value !== (entry(kind, id).notes || '');
      button.disabled = saving.has('note:' + key) || !dirty;
      if (dirty) { drafts.set(key, field.value); status.textContent = 'Rascunho não salvo. Ele permanece ao reabrir este conteúdo nesta página.'; }
      else { drafts.delete(key); status.textContent = entry(kind, id).notes ? 'Anotação salva.' : ''; }
    };
    field.addEventListener('input', update);
    editors.set(key, {host, update});
    update();
    host.querySelector('[data-study-favorite]').addEventListener('click', async () => {
      if (await toggleFavorite(kind, id) === false && host.isConnected) status.textContent = 'Não foi possível atualizar o favorito. Tente novamente.';
    });
    button.addEventListener('click', async () => {
      const value = field.value, lock = 'note:' + key;
      if (saving.has(lock) || value.length > MAX_STUDY_NOTE_LENGTH) return;
      saving.add(lock); button.disabled = true; status.textContent = 'Salvando…';
      try {
        await savePreference(kind, id, {notes: value});
        if (drafts.get(key) === value) drafts.delete(key);
        onChange?.(kind, id);
        if (!host.isConnected) return;
        status.textContent = field.value === value ? 'Anotação salva.' : 'A versão anterior foi salva. Há novas alterações para salvar.';
      } catch {
        if (host.isConnected) status.textContent = 'Não foi possível salvar. Seu rascunho foi mantido. Tente novamente.';
      } finally {
        saving.delete(lock);
        if (host.isConnected) button.disabled = field.value === (entry(kind, id).notes || '');
        const active = editors.get(key);
        if (active?.host !== host && active?.host.isConnected) active.update();
      }
    });
  }
  window.addEventListener('beforeunload', event => {
    if (drafts.size) { event.preventDefault(); event.returnValue = ''; }
  });
  return {entry, favoriteMarkup, toggleFavorite, mountEditor};
}
