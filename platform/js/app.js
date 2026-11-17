/* Routeur, barre supérieure, sélection de l'utilisateur, indicateur de synchronisation. */
(function () {
  'use strict';
  const A = window.App;
  const TITLES = { dashboard: 'Tableau de bord', streams: 'Streams & workflow de validation', gantt: 'Planning Gantt par stream', logs: 'Inventaire des logs applicatifs', validations: 'Validations & historique', data: 'Import / Export', settings: 'Paramètres' };
  const view = document.getElementById('view');
  const route = () => { const r = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'dashboard'; return TITLES[r] ? r : 'dashboard'; };

  function renderHeader() {
    const s = A.Store.state; const u = A.currentUser();
    const sel = document.getElementById('userSelect');
    sel.innerHTML = s.users.map((x) => `<option value="${A.esc(x.id)}" ${x.id === u.id ? 'selected' : ''}>${A.esc(x.name)} · ${A.esc(x.role)}</option>`).join('');
    document.getElementById('userAvatar').textContent = A.initials(u.name);
    const n = A.pendingValidations().length;
    const badge = document.getElementById('navBadge');
    badge.hidden = !n; badge.textContent = n;
    const sync = document.getElementById('sync');
    const st = A.Store;
    sync.className = 'sync ' + (st.mode === 'server' ? (st.online === false ? '' : 'online') : 'local');
    sync.querySelector('.txt').textContent = st.mode === 'server' ? (st.online === false ? 'Serveur injoignable' : 'Partagé · v' + st.version) : 'Mode local';
    sync.title = st.mode === 'server' ? `Dernière modification : ${st.updatedBy || '—'} – ${A.fmtDT(st.updatedAt)}` : 'Données stockées dans ce navigateur uniquement';
    document.getElementById('sideFoot').textContent = s.meta.project || '';
  }

  function render() {
    const r = route();
    document.getElementById('pageTitle').textContent = TITLES[r];
    document.title = `${TITLES[r]} · Suivi Logs Splunk`;
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === r));
    renderHeader();
    const y = window.scrollY;
    window.Views[r](view);
    window.scrollTo(0, y);
  }

  async function start() {
    view.innerHTML = '<div class="empty">Chargement…</div>';
    await A.Store.init();
    A.Store.onChange((reason) => {
      if (reason === 'offline') return renderHeader();
      // ne pas écraser une fenêtre de saisie ouverte lors d'une mise à jour distante
      if (reason === 'remote' && document.getElementById('overlay')) { renderHeader(); A.toast('Données mises à jour par un autre utilisateur.'); return; }
      render();
    });
    document.getElementById('userSelect').onchange = (e) => { A.setCurrentUser(e.target.value); render(); A.toast(`Connecté en tant que ${A.currentUser().name} (${A.currentUser().role})`); };
    document.getElementById('menuBtn').onclick = () => document.getElementById('sidebar').classList.toggle('open');
    document.querySelectorAll('#nav a').forEach((a) => a.addEventListener('click', () => document.getElementById('sidebar').classList.remove('open')));
    const root = document.documentElement;
    try { const t = localStorage.getItem('splunkLogs.theme'); if (t) root.dataset.theme = t; } catch (e) { /* */ }
    document.getElementById('themeBtn').onclick = () => {
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('splunkLogs.theme', root.dataset.theme); } catch (e) { /* */ }
    };
    window.addEventListener('hashchange', render);
    render();
  }
  start();
})();
