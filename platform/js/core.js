/* Noyau : stockage partagé, règles métier (workflow de validation), utilitaires. */
(function () {
  'use strict';
  const LS_STATE = 'splunkLogs.state.v1';
  const LS_USER = 'splunkLogs.user';
  const STEP_STATUSES = ['À faire', 'En cours', 'Soumis', 'Validé', 'Rejeté'];
  const VALID_STATUSES = ['Non soumise', 'Soumise', 'Validée', 'Rejetée'];
  const ROLES = ['Admin', 'Validateur', 'Contributeur', 'Lecteur'];
  const CRITICITIES = ['Haute', 'Moyenne', 'Basse'];
  const METHODS = ['Universal Forwarder', 'HEC', 'HEC (OTel Collector)', 'Syslog (SC4S)', 'DB Connect', 'Add-on API', 'Fichier batch'];
  const CIM = ['Oui', 'Partiel', 'Non', 'À vérifier'];
  const LOG_TYPES = ['Applicatif', 'Audit', 'Accès web', 'Sécurité', 'Système', 'Réseau', 'Interface', 'Middleware'];

  // ------------------------------------------------------------ utilitaires
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => isoDate(new Date());
  const parseD = (s) => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
  const fmtD = (s) => { const d = parseD(s); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—'; };
  const fmtDT = (s) => s ? `${fmtD(s)} ${String(s).slice(11, 16)}` : '—';
  const pct = (x) => `${Math.round((x || 0) * 100)} %`;
  const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
  const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return isoDate(d); };
  const nowIso = () => { const d = new Date(); return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const initials = (n) => String(n || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  // ------------------------------------------------------------ magasin
  const Store = {
    state: null, version: 0, mode: 'local', updatedAt: null, updatedBy: null,
    listeners: [], busy: false,
    onChange(fn) { this.listeners.push(fn); },
    emit(reason) { this.listeners.forEach((fn) => fn(reason)); },

    async init() {
      try {
        const r = await fetch('api/state', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          this.mode = 'server'; this.apply(j);
          setInterval(() => this.poll(), 8000);
          return;
        }
      } catch (e) { /* pas de serveur : mode local */ }
      this.mode = 'local';
      let st = null;
      try { st = JSON.parse(localStorage.getItem(LS_STATE) || 'null'); } catch (e) { st = null; }
      this.state = normalize(st || clone(window.SAMPLE_DATA));
    },
    apply(j) { this.state = normalize(j.state); this.version = j.version; this.updatedAt = j.updatedAt; this.updatedBy = j.updatedBy; },

    async poll() {
      if (this.busy) return;
      try {
        const r = await fetch('api/version', { cache: 'no-store' });
        const j = await r.json();
        if (j.version !== this.version) {
          const s = await (await fetch('api/state', { cache: 'no-store' })).json();
          this.apply(s);
          this.emit('remote');
        }
        this.online = true;
      } catch (e) { this.online = false; this.emit('offline'); }
    },

    /** Applique une mutation puis la persiste. En cas de conflit serveur, la mutation est rejouée sur l'état le plus récent. */
    async commit(mutator, opts = {}) {
      const user = currentUser();
      if (this.mode === 'local') {
        const res = mutator(this.state, user);
        if (res === false) return false;
        try { localStorage.setItem(LS_STATE, JSON.stringify(this.state)); } catch (e) { toast('Stockage local indisponible : exportez vos données.', 'bad'); }
        this.emit('local');
        return true;
      }
      this.busy = true;
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const draft = clone(this.state);
          const res = mutator(draft, user);
          if (res === false) return false;
          const r = await fetch('api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseVersion: this.version, user: user.name, state: draft, force: !!opts.force }) });
          if (r.ok) {
            const j = await r.json();
            this.state = draft; this.version = j.version; this.updatedAt = j.updatedAt; this.updatedBy = j.updatedBy;
            this.emit('saved');
            return true;
          }
          if (r.status === 409) { this.apply(await r.json()); continue; }
          throw new Error((await r.json()).error || r.statusText);
        }
        toast('Conflit d’édition persistant : réessayez.', 'bad');
        this.emit('remote');
        return false;
      } catch (e) {
        toast('Enregistrement impossible : ' + e.message, 'bad');
        return false;
      } finally { this.busy = false; }
    },
  };

  function normalize(s) {
    s.meta = s.meta || { project: 'Onboarding des logs applicatifs dans Splunk' };
    ['steps', 'logStatuses', 'users', 'streams', 'validations', 'tasks', 'logs', 'history'].forEach((k) => { s[k] = Array.isArray(s[k]) ? s[k] : []; });
    if (!s.steps.length) s.steps = clone(window.SAMPLE_DATA.steps);
    if (!s.logStatuses.length) s.logStatuses = clone(window.SAMPLE_DATA.logStatuses);
    if (!s.users.length) s.users = clone(window.SAMPLE_DATA.users);
    // chaque stream doit avoir une ligne de validation par étape
    s.streams.forEach((st) => ensureValidations(s, st.id));
    s.tasks.forEach((t) => { t.progress = Math.max(0, Math.min(1, Number(t.progress) || 0)); t.step = Number(t.step) || 1; t.validation = t.validation || 'Non soumise'; });
    s.logs.forEach((l) => { l.validation = l.validation || 'Non soumise'; if (!s.logStatuses.some((x) => x.name === l.status)) l.status = s.logStatuses[0].name; });
    return s;
  }
  function ensureValidations(s, streamId) {
    s.steps.forEach((step) => {
      if (!s.validations.some((v) => v.streamId === streamId && Number(v.step) === step.n)) {
        const first = step.n === s.steps[0].n;
        s.validations.push({ streamId, step: step.n, status: first ? 'En cours' : 'À faire', validatedBy: '', validatedOn: '', comment: '' });
      }
    });
  }

  // ------------------------------------------------------------ utilisateurs & droits
  function currentUser() {
    const users = Store.state ? Store.state.users : [];
    let id = null;
    try { id = localStorage.getItem(LS_USER); } catch (e) { /* */ }
    return users.find((u) => u.id === id) || users[0] || { id: 'anon', name: 'Anonyme', role: 'Lecteur' };
  }
  function setCurrentUser(id) { try { localStorage.setItem(LS_USER, id); } catch (e) { /* */ } }
  function can(action, user = currentUser()) {
    const r = user.role;
    if (action === 'admin') return r === 'Admin';
    if (action === 'validate') return r === 'Admin' || r === 'Validateur';
    if (action === 'edit') return r !== 'Lecteur';
    return true;
  }

  // ------------------------------------------------------------ règles métier
  const S = () => Store.state;
  const streamById = (id, s = S()) => s.streams.find((x) => x.id === id);
  const stepByN = (n, s = S()) => s.steps.find((x) => x.n === Number(n));
  const stepsOf = (streamId, s = S()) => s.validations.filter((v) => v.streamId === streamId).sort((a, b) => a.step - b.step);
  const currentStepOf = (streamId, s = S()) => stepsOf(streamId, s).find((v) => v.status !== 'Validé') || null;
  const tasksOf = (streamId, step, s = S()) => s.tasks.filter((t) => t.streamId === streamId && (step == null || t.step === Number(step)));
  const logsOf = (streamId, s = S()) => s.logs.filter((l) => l.streamId === streamId);
  const logPct = (l, s = S()) => (s.logStatuses.find((x) => x.name === l.status) || { pct: 0 }).pct;

  function taskStatus(t) {
    const today = todayIso();
    if (t.progress >= 1) return 'Terminée';
    if (t.end && t.end < today) return 'En retard';
    if (t.progress > 0) return 'En cours';
    if (t.start && t.start <= today) return 'À démarrer';
    return 'Planifiée';
  }
  function streamStats(st, s = S()) {
    const steps = stepsOf(st.id, s);
    const validated = steps.filter((v) => v.status === 'Validé').length;
    const tasks = tasksOf(st.id, null, s);
    const logs = logsOf(st.id, s);
    const late = tasks.filter((t) => taskStatus(t) === 'En retard').length;
    const cur = steps.find((v) => v.status !== 'Validé') || null;
    const starts = tasks.map((t) => t.start).filter(Boolean).sort();
    const ends = tasks.map((t) => t.end).filter(Boolean).sort();
    let status;
    if (validated === steps.length && steps.length) status = 'Validé';
    else if (cur && cur.status === 'Rejeté') status = 'Rejet à traiter';
    else if (late > 0) status = 'À risque (retard)';
    else if (cur && cur.status === 'Soumis') status = 'En validation';
    else if (!tasks.some((t) => t.progress > 0) && validated === 0) status = 'Non démarré';
    else status = 'En cours';
    return {
      steps, validated, total: steps.length, pctWf: steps.length ? validated / steps.length : 0,
      taskPct: avg(tasks.map((t) => t.progress)), logs: logs.length, logsValidated: logs.filter((l) => l.validation === 'Validée').length,
      logsPct: avg(logs.map((l) => logPct(l, s))), late, cur, status,
      start: starts[0] || null, end: ends[ends.length - 1] || null,
      curTaskPct: cur ? avg(tasksOf(st.id, cur.step, s).map((t) => t.progress)) : 1,
    };
  }
  function globalStats(s = S()) {
    const all = s.streams.map((st) => streamStats(st, s));
    return {
      streams: s.streams.length, streamsValidated: all.filter((x) => x.status === 'Validé').length,
      taskPct: avg(s.tasks.map((t) => t.progress)),
      wfPct: s.validations.length ? s.validations.filter((v) => v.status === 'Validé').length / s.validations.length : 0,
      tasks: s.tasks.length, tasksDone: s.tasks.filter((t) => t.progress >= 1).length,
      late: s.tasks.filter((t) => taskStatus(t) === 'En retard').length,
      logs: s.logs.length, logsValidated: s.logs.filter((l) => l.validation === 'Validée').length,
      logsPct: avg(s.logs.map((l) => logPct(l, s))), volume: s.logs.reduce((a, l) => a + (Number(l.volume) || 0), 0),
      pending: pendingValidations(s).length,
    };
  }
  function pendingValidations(s = S()) {
    const out = [];
    s.validations.filter((v) => v.status === 'Soumis').forEach((v) => out.push({ kind: 'step', obj: v }));
    s.tasks.filter((t) => t.validation === 'Soumise').forEach((t) => out.push({ kind: 'task', obj: t }));
    s.logs.filter((l) => l.validation === 'Soumise').forEach((l) => out.push({ kind: 'log', obj: l }));
    return out;
  }
  function stepLockState(v, s = S()) {
    if (v.status === 'Validé') return 'done';
    const cur = currentStepOf(v.streamId, s);
    if (!cur || cur.step !== v.step) return 'locked';
    return { 'Soumis': 'submitted', 'Rejeté': 'rejected' }[v.status] || 'active';
  }

  function log(s, user, type, ref, action, comment) {
    s.history.unshift({ date: nowIso(), user: user.name, type, ref, action, comment: comment || '' });
    if (s.history.length > 3000) s.history.length = 3000;
  }

  // Actions du workflow (mutateurs purs appliqués via Store.commit)
  const Actions = {
    submitStep(streamId, stepN, comment) {
      return Store.commit((s, u) => {
        const v = s.validations.find((x) => x.streamId === streamId && x.step === stepN);
        const cur = currentStepOf(streamId, s);
        if (!v || !cur || cur.step !== stepN) { toast('Seule l’étape active peut être soumise.', 'bad'); return false; }
        v.status = 'Soumis'; v.comment = comment || v.comment;
        tasksOf(streamId, stepN, s).forEach((t) => { if (t.progress >= 1 && t.validation !== 'Validée') t.validation = 'Soumise'; });
        log(s, u, 'Étape stream', `${streamId} / étape ${stepN}`, 'Soumis', comment || `${stepByN(stepN, s).name} soumise pour validation`);
      });
    },
    validateStep(streamId, stepN, comment) {
      return Store.commit((s, u) => {
        if (!can('validate', u)) { toast('Droit de validation requis.', 'bad'); return false; }
        const v = s.validations.find((x) => x.streamId === streamId && x.step === stepN);
        const cur = currentStepOf(streamId, s);
        if (!v || !cur || cur.step !== stepN) { toast('L’étape précédente doit être validée d’abord.', 'bad'); return false; }
        v.status = 'Validé'; v.validatedBy = u.name; v.validatedOn = todayIso(); v.comment = comment || '';
        tasksOf(streamId, stepN, s).forEach((t) => { if (t.progress >= 1) { t.validation = 'Validée'; t.validatedBy = u.name; t.validatedOn = todayIso(); } });
        const next = currentStepOf(streamId, s);
        if (next && next.status === 'À faire') next.status = 'En cours';
        const st = stepByN(stepN, s);
        log(s, u, 'Étape stream', `${streamId} / étape ${stepN}`, 'Validé',
          (comment ? comment + ' — ' : '') + `${st.name} validée` + (next ? ` → passage à l’étape ${next.step} (${stepByN(next.step, s).name})` : ' → stream entièrement validé'));
      });
    },
    rejectStep(streamId, stepN, comment) {
      return Store.commit((s, u) => {
        if (!can('validate', u)) { toast('Droit de validation requis.', 'bad'); return false; }
        const v = s.validations.find((x) => x.streamId === streamId && x.step === stepN);
        if (!v || v.status === 'Validé') return false;
        v.status = 'Rejeté'; v.comment = comment;
        tasksOf(streamId, stepN, s).forEach((t) => { if (t.validation === 'Soumise') t.validation = 'Rejetée'; });
        log(s, u, 'Étape stream', `${streamId} / étape ${stepN}`, 'Rejeté', comment);
      });
    },
    restartStep(streamId, stepN) {
      return Store.commit((s, u) => {
        const v = s.validations.find((x) => x.streamId === streamId && x.step === stepN);
        if (!v) return false;
        v.status = 'En cours';
        log(s, u, 'Étape stream', `${streamId} / étape ${stepN}`, 'Repris', 'Reprise après rejet');
      });
    },
    reopenStep(streamId, stepN, comment) {
      return Store.commit((s, u) => {
        if (!can('admin', u)) return false;
        stepsOf(streamId, s).forEach((v) => {
          if (v.step === stepN) { v.status = 'En cours'; v.validatedBy = ''; v.validatedOn = ''; v.comment = comment; }
          else if (v.step > stepN) { v.status = 'À faire'; v.validatedBy = ''; v.validatedOn = ''; }
        });
        log(s, u, 'Étape stream', `${streamId} / étape ${stepN}`, 'Réouvert', comment);
      });
    },
    setItemValidation(kind, id, status, comment) {
      return Store.commit((s, u) => {
        const coll = kind === 'task' ? s.tasks : s.logs;
        const it = coll.find((x) => x.id === id);
        if (!it) return false;
        if ((status === 'Validée' || status === 'Rejetée') && !can('validate', u)) { toast('Droit de validation requis.', 'bad'); return false; }
        if (status === 'Validée' && kind === 'task' && it.progress < 1) { toast('La tâche doit être à 100 % pour être validée.', 'bad'); return false; }
        it.validation = status;
        if (status === 'Validée') {
          it.validatedBy = u.name; it.validatedOn = todayIso();
          if (kind === 'log') it.status = s.logStatuses[s.logStatuses.length - 1].name;
        } else { it.validatedBy = ''; it.validatedOn = ''; }
        if (comment) it.comment = comment;
        const label = kind === 'task' ? 'Tâche' : 'Log';
        const act = { 'Soumise': 'Soumis', 'Validée': 'Validé', 'Rejetée': 'Rejeté', 'Non soumise': 'Réinitialisé' }[status];
        log(s, u, label, `${id} – ${kind === 'task' ? it.name : it.application}`, act, comment);
      });
    },
    advanceLog(id, dir = 1) {
      return Store.commit((s, u) => {
        const l = s.logs.find((x) => x.id === id);
        if (!l) return false;
        const idx = s.logStatuses.findIndex((x) => x.name === l.status);
        const lastIdx = s.logStatuses.length - 1;
        const ni = idx + dir;
        if (ni < 0 || ni > lastIdx) return false;
        if (ni === lastIdx && !can('validate', u)) {
          l.validation = 'Soumise';
          log(s, u, 'Log', `${id} – ${l.application}`, 'Soumis', 'Dernière étape atteinte : soumis pour validation');
          toast('Statut final réservé au validateur : log soumis pour validation.', 'ok');
          return;
        }
        const from = l.status;
        l.status = s.logStatuses[ni].name;
        if (ni === lastIdx) { l.validation = 'Validée'; l.validatedBy = u.name; l.validatedOn = todayIso(); }
        else if (l.validation === 'Validée') { l.validation = 'Non soumise'; l.validatedBy = ''; l.validatedOn = ''; }
        log(s, u, 'Log', `${id} – ${l.application}`, dir > 0 ? 'Avancé' : 'Recul', `${from} → ${l.status}`);
      });
    },
    upsert(collection, obj, label) {
      return Store.commit((s, u) => {
        const arr = s[collection];
        const i = arr.findIndex((x) => x.id === obj.id);
        if (i >= 0) arr[i] = { ...arr[i], ...obj }; else arr.push(obj);
        if (collection === 'streams') ensureValidations(s, obj.id);
        log(s, u, label, `${obj.id} – ${obj.name || obj.application || ''}`, i >= 0 ? 'Modifié' : 'Créé', '');
      });
    },
    remove(collection, id, label) {
      return Store.commit((s, u) => {
        s[collection] = s[collection].filter((x) => x.id !== id);
        if (collection === 'streams') {
          s.validations = s.validations.filter((v) => v.streamId !== id);
          s.tasks = s.tasks.filter((t) => t.streamId !== id);
          s.logs = s.logs.filter((l) => l.streamId !== id);
        }
        log(s, u, label, id, 'Supprimé', '');
      });
    },
  };

  function nextId(prefix, arr, width = 3) {
    let max = 0;
    arr.forEach((x) => { const m = String(x.id || '').match(/(\d+)$/); if (m && String(x.id).startsWith(prefix)) max = Math.max(max, Number(m[1])); });
    return prefix + String(max + 1).padStart(width, '0');
  }

  // ------------------------------------------------------------ UI génériques
  function toast(msg, kind = '') {
    const z = document.getElementById('toasts');
    if (!z) return;
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    z.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
  function modal({ title, body, footer, size = '', onMount }) {
    closeModal();
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'overlay';
    ov.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true"><div class="modal-h"><h3>${title}</h3><button class="btn ghost sm" data-close aria-label="Fermer">✕</button></div><div class="modal-b">${body}</div>${footer ? `<div class="modal-f">${footer}</div>` : ''}</div>`;
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) closeModal(); });
    document.body.appendChild(ov);
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    ov._onKey = onKey;
    if (onMount) onMount(ov);
    return ov;
  }
  function closeModal() {
    const ov = document.getElementById('overlay');
    if (ov) { document.removeEventListener('keydown', ov._onKey); ov.remove(); }
  }
  /** Demande un commentaire (obligatoire ou non) puis appelle cb(texte). */
  function ask({ title, label, required, confirmLabel = 'Confirmer', kind = 'primary', info = '' }, cb) {
    modal({
      title: esc(title),
      body: `${info}<label class="form"><span class="full small muted">${esc(label)}${required ? ' (obligatoire)' : ''}</span></label><textarea class="input" id="askTxt" placeholder="Commentaire…"></textarea>`,
      footer: `<button class="btn" data-close>Annuler</button><button class="btn ${kind}" id="askOk">${esc(confirmLabel)}</button>`,
      onMount(ov) {
        const ta = ov.querySelector('#askTxt'); ta.focus();
        ov.querySelector('#askOk').onclick = () => {
          const v = ta.value.trim();
          if (required && !v) { ta.style.borderColor = 'var(--bad)'; ta.focus(); return; }
          closeModal(); cb(v);
        };
      },
    });
  }

  const chipClass = (st) => ({
    'Validé': 'ok', 'Validée': 'ok', 'Terminée': 'ok', 'Soumis': 'warn', 'Soumise': 'warn', 'En validation': 'warn',
    'Rejeté': 'bad', 'Rejetée': 'bad', 'En retard': 'bad', 'À risque (retard)': 'bad', 'Rejet à traiter': 'bad',
    'En cours': 'info', 'Haute': 'bad', 'Moyenne': 'warn', 'Basse': '',
  }[st] || '');
  const chip = (st, extra = '') => `<span class="chip ${chipClass(st)}">${extra}${esc(st)}</span>`;
  const bar = (p, cls = '') => `<div class="row" style="gap:8px"><div class="bar ${cls}" style="flex:1"><i style="width:${Math.round((p || 0) * 100)}%"></i></div><span class="pct">${pct(p)}</span></div>`;
  const opts = (list, sel, blank) => (blank ? `<option value="">${esc(blank)}</option>` : '') + list.map((x) => { const v = typeof x === 'object' ? x.v : x; const l = typeof x === 'object' ? x.l : x; return `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`; }).join('');

  window.App = {
    Store, Actions, currentUser, setCurrentUser, can, normalize, ensureValidations,
    streamById, stepByN, stepsOf, currentStepOf, tasksOf, logsOf, logPct, taskStatus, streamStats, globalStats,
    pendingValidations, stepLockState, nextId,
    esc, clone, isoDate, todayIso, parseD, fmtD, fmtDT, pct, daysBetween, addDays, nowIso, avg, initials,
    toast, modal, closeModal, ask, chip, chipClass, bar, opts,
    C: { STEP_STATUSES, VALID_STATUSES, ROLES, CRITICITIES, METHODS, CIM, LOG_TYPES, LS_STATE },
  };
})();
