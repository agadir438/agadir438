/* Vues de la plateforme. Chaque vue reçoit le conteneur et le remplit. */
(function () {
  'use strict';
  const A = window.App;
  const { esc, chip, bar, pct, fmtD, fmtDT, opts, can } = A;
  const S = () => A.Store.state;
  const ui = A.ui = A.ui || { selStream: null, gScale: 'week', gStream: '', gHideDone: false, collapsed: new Set(), lf: { q: '', stream: '', status: '', crit: '', valid: '' }, valTab: 'pending', hq: '' };
  const userNames = () => S().users.map((u) => u.name);
  const streamOpts = (sel, blank) => opts(S().streams.map((s) => ({ v: s.id, l: `${s.id} – ${s.name}` })), sel, blank);
  const stepOpts = (sel) => opts(S().steps.map((s) => ({ v: s.n, l: `${s.n}. ${s.name}` })), sel);
  const sdot = (id) => { const s = A.streamById(id); return `<i class="sdot" style="background:${esc(s ? s.color : '#94a3b8')}"></i>`; };
  const sname = (id) => { const s = A.streamById(id); return s ? s.name : id; };
  const dis = (cond) => (cond ? '' : 'disabled');
  const statusColor = (i, n) => { const t = n > 1 ? i / (n - 1) : 1; return t >= 1 ? 'var(--ok)' : `hsl(${215 - t * 40}, 75%, ${70 - t * 22}%)`; };

  function stepper(streamId) {
    return `<div class="stepper" title="Workflow de validation">${A.stepsOf(streamId).map((v) => {
      const st = A.stepLockState(v);
      const cls = { done: 'done', active: 'cur', submitted: 'sub', rejected: 'rej' }[st] || '';
      return `<span class="st ${cls}" title="${v.step}. ${esc((A.stepByN(v.step) || {}).name)} : ${esc(v.status)}"></span>`;
    }).join('')}</div>`;
  }

  // =================================================================== DASHBOARD
  function dashboard(el) {
    const s = S(); const g = A.globalStats();
    const today = A.todayIso(); const in14 = A.addDays(today, 14);
    const late = s.tasks.filter((t) => A.taskStatus(t) === 'En retard').sort((a, b) => (a.end < b.end ? -1 : 1));
    const upcoming = s.tasks.filter((t) => t.progress < 1 && t.end >= today && t.end <= in14).sort((a, b) => (a.end < b.end ? -1 : 1));
    const pend = A.pendingValidations();
    const nStat = s.logStatuses.length;
    const maxStat = Math.max(1, ...s.logStatuses.map((x) => s.logs.filter((l) => l.status === x.name).length));
    el.innerHTML = `
      <div class="grid g-kpi">
        ${kpi('Avancement global', pct(g.taskPct), `${g.tasksDone}/${g.tasks} tâches terminées`)}
        ${kpi('Workflow validé', pct(g.wfPct), `${g.streamsValidated}/${g.streams} streams entièrement validés`)}
        ${kpi('Onboarding des logs', pct(g.logsPct), `${g.logsValidated}/${g.logs} logs validés`)}
        ${kpi('Tâches en retard', g.late, 'échéance dépassée, non terminées', g.late ? 'bad' : '')}
        ${kpi('Validations en attente', g.pending, 'étapes, tâches et logs soumis', g.pending ? 'warn' : '')}
        ${kpi('Volumétrie cible', `${(g.volume / 1024).toFixed(1)} Go/j`, `${g.logs} sources de logs`)}
      </div>
      <div class="grid g-2 mt">
        <div class="card"><div class="card-h"><h2>Avancement par stream</h2><div class="spacer"></div><a class="btn sm" href="#/streams">Workflow ›</a></div>
          <div class="card-b" style="padding-top:4px">
            ${s.streams.map((st) => { const x = A.streamStats(st); return `
              <div class="srow" data-stream="${esc(st.id)}">
                <div><div class="row" style="gap:8px;font-weight:650">${sdot(st.id)}${esc(st.name)}</div>
                  <div class="small muted">${x.cur ? `Étape ${x.cur.step} : ${esc(A.stepByN(x.cur.step).name)}` : '✔ Toutes les étapes validées'}</div></div>
                <div>${stepper(st.id)}<div class="lbl">${x.validated}/${x.total} étapes validées</div></div>
                <div><div class="lbl">Tâches</div>${bar(x.taskPct)}</div>
                <div><div class="lbl">Logs (${x.logs})</div>${bar(x.logsPct, 'ok')}</div>
                <div>${chip(x.status)}</div>
              </div>`; }).join('') || '<div class="empty">Aucun stream</div>'}
          </div></div>
        <div class="grid">
          <div class="card"><div class="card-h"><h2>Logs par statut d’onboarding</h2><div class="spacer"></div><a class="btn sm" href="#/logs">Inventaire ›</a></div>
            <div class="card-b">${s.logStatuses.map((x, i) => { const n = s.logs.filter((l) => l.status === x.name).length; return `
              <div class="hbar"><span>${esc(x.name)}</span><div class="track"><i style="width:${(n / maxStat) * 100}%;background:${statusColor(i, nStat)}"></i></div><b class="pct">${n}</b></div>`; }).join('')}
            </div></div>
          <div class="card"><div class="card-h"><h2>Streams ayant validé chaque étape</h2></div>
            <div class="card-b">${s.steps.map((sp) => { const n = s.validations.filter((v) => v.step === sp.n && v.status === 'Validé').length; return `
              <div class="hbar"><span class="small">${sp.n}. ${esc(sp.name)}</span><div class="track"><i style="width:${s.streams.length ? (n / s.streams.length) * 100 : 0}%;background:var(--ok)"></i></div><b class="pct">${n}/${s.streams.length}</b></div>`; }).join('')}
            </div></div>
        </div>
      </div>
      <div class="grid g-kpi mt" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
        <div class="card"><div class="card-h"><h3>⚠️ En retard</h3><span class="chip bad">${late.length}</span></div><div class="card-b" style="padding-top:4px">
          ${late.slice(0, 8).map((t) => taskLine(t, `<span class="chip bad">${A.daysBetween(t.end, today)} j</span>`)).join('') || '<div class="empty">Aucune tâche en retard 🎉</div>'}</div></div>
        <div class="card"><div class="card-h"><h3>📅 Échéances à 14 jours</h3><span class="chip info">${upcoming.length}</span></div><div class="card-b" style="padding-top:4px">
          ${upcoming.slice(0, 8).map((t) => taskLine(t, `<span class="chip">${fmtD(t.end)}</span>`)).join('') || '<div class="empty">Rien à échéance</div>'}</div></div>
        <div class="card"><div class="card-h"><h3>✅ En attente de validation</h3><span class="chip warn">${pend.length}</span><div class="spacer"></div><a class="btn sm" href="#/validations">Traiter ›</a></div><div class="card-b" style="padding-top:4px">
          ${pend.slice(0, 8).map(pendLine).join('') || '<div class="empty">Aucune validation en attente</div>'}</div></div>
        <div class="card"><div class="card-h"><h3>🕘 Activité récente</h3></div><div class="card-b" style="padding-top:4px">
          ${s.history.slice(0, 7).map(histLine).join('') || '<div class="empty">Pas encore d’activité</div>'}</div></div>
      </div>`;
    el.querySelectorAll('[data-stream]').forEach((r) => r.onclick = () => { ui.selStream = r.dataset.stream; location.hash = '#/streams'; });
    el.querySelectorAll('[data-task]').forEach((r) => r.onclick = () => taskModal(r.dataset.task));
    el.querySelectorAll('[data-pend]').forEach((r) => r.onclick = () => openPending(r.dataset.pend));
  }
  const kpi = (lab, val, sub, cls = '') => `<div class="card kpi ${cls}"><div class="lab">${esc(lab)}</div><div class="val">${esc(val)}</div><div class="sub">${esc(sub)}</div></div>`;
  const taskLine = (t, right) => `<div class="list-item" style="cursor:pointer" data-task="${esc(t.id)}">${sdot(t.streamId)}<div class="grow"><div>${esc(t.name)}</div><div class="small muted">${esc(sname(t.streamId))} · ${esc(t.owner || '—')} · ${pct(t.progress)}</div></div>${right}</div>`;
  function pendLine(p) {
    const o = p.obj;
    if (p.kind === 'step') return `<div class="list-item" style="cursor:pointer" data-pend="step|${esc(o.streamId)}|${o.step}">${sdot(o.streamId)}<div class="grow"><div><b>Étape ${o.step}</b> – ${esc(A.stepByN(o.step).name)}</div><div class="small muted">${esc(sname(o.streamId))}</div></div>${chip('Soumis')}</div>`;
    if (p.kind === 'task') return `<div class="list-item" style="cursor:pointer" data-pend="task|${esc(o.id)}">${sdot(o.streamId)}<div class="grow"><div>Tâche ${esc(o.id)} – ${esc(o.name)}</div><div class="small muted">${esc(sname(o.streamId))}</div></div>${chip('Soumise')}</div>`;
    return `<div class="list-item" style="cursor:pointer" data-pend="log|${esc(o.id)}">${sdot(o.streamId)}<div class="grow"><div>Log ${esc(o.id)} – ${esc(o.application)}</div><div class="small muted">${esc(o.sourcetype)} · ${esc(sname(o.streamId))}</div></div>${chip('Soumise')}</div>`;
  }
  function openPending(key) {
    const [k, a, b] = key.split('|');
    if (k === 'step') { ui.selStream = a; location.hash = '#/streams'; } else if (k === 'task') taskModal(a); else logModal(a);
  }
  const actIcon = { 'Validé': '✅', 'Rejeté': '⛔', 'Soumis': '📤', 'Avancé': '▶️', 'Recul': '◀️', 'Créé': '➕', 'Modifié': '✏️', 'Supprimé': '🗑️', 'Réouvert': '↩️', 'Import': '⇅', 'Repris': '🔁' };
  const histLine = (h) => `<div class="list-item"><span>${actIcon[h.action] || '•'}</span><div class="grow"><div><b>${esc(h.user)}</b> · ${esc(h.action)} · ${esc(h.ref)}</div><div class="small muted">${esc(h.comment)}</div></div><span class="small muted">${fmtDT(h.date)}</span></div>`;

  // =================================================================== STREAMS & WORKFLOW
  function streams(el) {
    const s = S();
    if (!ui.selStream || !A.streamById(ui.selStream)) ui.selStream = s.streams[0] && s.streams[0].id;
    const st = A.streamById(ui.selStream);
    el.innerHTML = `
      <div class="toolbar"><div class="muted small">Chaque stream suit ${s.steps.length} étapes. Une étape doit être <b>validée</b> pour passer à la suivante.</div><div class="spacer"></div>
        <button class="btn" id="addStream" ${dis(can('admin'))}>＋ Nouveau stream</button></div>
      <div class="grid" style="grid-template-columns:minmax(240px,320px) 1fr;align-items:start" id="strGrid">
        <div class="stream-list">${s.streams.map((x) => { const k = A.streamStats(x); return `
          <div class="stream-item ${x.id === ui.selStream ? 'sel' : ''}" data-sel="${esc(x.id)}">
            <div class="name">${sdot(x.id)}${esc(x.name)}</div>
            <div class="row" style="justify-content:space-between">${stepper(x.id)}${chip(k.status)}</div>
            ${bar(k.pctWf, 'ok')}
          </div>`; }).join('') || '<div class="empty">Aucun stream – créez-en un.</div>'}</div>
        <div>${st ? streamDetail(st) : ''}</div>
      </div>`;
    if (window.matchMedia('(max-width: 1100px)').matches) el.querySelector('#strGrid').style.gridTemplateColumns = '1fr';
    el.querySelectorAll('[data-sel]').forEach((n) => n.onclick = () => { ui.selStream = n.dataset.sel; streams(el); });
    el.querySelector('#addStream').onclick = () => streamModal(null);
    if (!st) return;
    const q = (sel) => el.querySelector(sel);
    q('#editStream') && (q('#editStream').onclick = () => streamModal(st.id));
    el.querySelectorAll('[data-task]').forEach((n) => n.onclick = () => taskModal(n.dataset.task));
    el.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => stepAction(st, Number(b.dataset.step), b.dataset.act));
    q('#goGantt').onclick = () => { ui.gStream = st.id; location.hash = '#/gantt'; };
    q('#goLogs').onclick = () => { ui.lf = { q: '', stream: st.id, status: '', crit: '', valid: '' }; location.hash = '#/logs'; };
  }

  function streamDetail(st) {
    const s = S(); const k = A.streamStats(st); const u = A.currentUser();
    const logs = A.logsOf(st.id);
    return `
      <div class="card">
        <div class="card-h">${sdot(st.id)}<h2>${esc(st.name)}</h2><span class="muted small">${esc(st.id)}</span>${chip(k.status)}<div class="spacer"></div>
          <button class="btn sm" id="goGantt">📅 Gantt</button><button class="btn sm" id="goLogs">🗂️ Logs (${logs.length})</button>
          <button class="btn sm" id="editStream" ${dis(can('admin'))}>✏️</button></div>
        <div class="card-b">
          <div class="grid g-kpi" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:18px">
            <div><div class="small muted">Responsable</div><b>${esc(st.owner || '—')}</b></div>
            <div><div class="small muted">Validateur</div><b>${esc(st.validator || '—')}</b></div>
            <div><div class="small muted">Période</div><b>${fmtD(k.start)} → ${fmtD(k.end)}</b></div>
            <div><div class="small muted">Workflow</div>${bar(k.pctWf, 'ok')}</div>
            <div><div class="small muted">Tâches</div>${bar(k.taskPct)}</div>
            <div><div class="small muted">Logs onboardés</div>${bar(k.logsPct, 'ok')}</div>
          </div>
          ${k.late ? `<div class="notice bad">⚠️ ${k.late} tâche(s) en retard sur ce stream.</div>` : ''}
          ${st.validator && u.name !== st.validator && can('validate') && !can('admin') ? `<div class="notice warn small">Le validateur désigné de ce stream est <b>${esc(st.validator)}</b>.</div>` : ''}
          <div class="wf">${A.stepsOf(st.id).map((v) => stepBlock(st, v)).join('')}</div>
          <h3 style="font-size:14px;margin:8px 0">Logs du stream par statut</h3>
          <div class="row wrap">${s.logStatuses.map((x) => `<span class="chip ${x.pct >= 1 ? 'ok' : ''}">${esc(x.name)} : ${logs.filter((l) => l.status === x.name).length}</span>`).join('')}</div>
        </div>
      </div>`;
  }

  function stepBlock(st, v) {
    const sp = A.stepByN(v.step) || { name: '?', criteria: '' };
    const lock = A.stepLockState(v);
    const tasks = A.tasksOf(st.id, v.step);
    const tp = A.avg(tasks.map((t) => t.progress));
    const lastValidated = A.stepsOf(st.id).filter((x) => x.status === 'Validé').pop();
    let actions = '';
    if (lock === 'active' || lock === 'rejected') {
      if (lock === 'rejected') actions += `<button class="btn" data-act="restart" data-step="${v.step}" ${dis(can('edit'))}>🔁 Reprendre l’étape</button>`;
      actions += `<button class="btn primary" data-act="submit" data-step="${v.step}" ${dis(can('edit'))}>📤 Soumettre pour validation</button>`;
      actions += `<button class="btn ok" data-act="validate" data-step="${v.step}" ${dis(can('validate'))}>✔ Valider & passer à l’étape suivante</button>`;
    } else if (lock === 'submitted') {
      actions += `<button class="btn ok" data-act="validate" data-step="${v.step}" ${dis(can('validate'))}>✔ Valider & passer à l’étape suivante</button>`;
      actions += `<button class="btn bad" data-act="reject" data-step="${v.step}" ${dis(can('validate'))}>✖ Rejeter</button>`;
    } else if (lock === 'done' && lastValidated && lastValidated.step === v.step && can('admin')) {
      actions += `<button class="btn sm" data-act="reopen" data-step="${v.step}">↩️ Réouvrir (admin)</button>`;
    }
    const statusChip = lock === 'locked' ? '<span class="chip">🔒 Verrouillée</span>' : chip(v.status);
    return `
      <div class="wf-step ${lock}">
        <div class="wf-num">${lock === 'done' ? '✓' : v.step}</div>
        <div class="wf-body">
          <div class="wf-title">${esc(sp.name)} ${statusChip}${lock === 'active' ? '<span class="chip info">▶ Étape active</span>' : ''}
            <span class="spacer" style="flex:1"></span><span class="small muted">${tasks.length} tâche(s) · ${pct(tp)}</span></div>
          <div class="wf-crit"><b>Critères de passage :</b> ${esc(sp.criteria)}</div>
          ${v.status === 'Validé' ? `<div class="small" style="color:var(--ok)">Validée par <b>${esc(v.validatedBy)}</b> le ${fmtD(v.validatedOn)}${v.comment ? ` — « ${esc(v.comment)} »` : ''}</div>` : ''}
          ${v.status === 'Rejeté' || (v.comment && v.status !== 'Validé') ? `<div class="notice ${v.status === 'Rejeté' ? 'bad' : 'warn'} small" style="margin:6px 0">💬 ${esc(v.comment)}</div>` : ''}
          ${lock !== 'locked' || tasks.some((t) => t.progress > 0) ? `<div class="wf-tasks">${tasks.map((t) => `
            <div class="row" data-task="${esc(t.id)}" style="cursor:pointer"><span class="grow" style="flex:1">${esc(t.name)} <span class="muted small">· ${esc(t.owner || '')} · ${fmtD(t.end)}</span></span>
              ${t.validation !== 'Non soumise' ? chip(t.validation) : ''} ${A.taskStatus(t) === 'En retard' ? chip('En retard') : ''}<div style="width:140px">${bar(t.progress)}</div></div>`).join('') || '<span class="muted small">Aucune tâche planifiée pour cette étape.</span>'}</div>` : ''}
          ${actions ? `<div class="wf-actions">${actions}</div>` : ''}
        </div>
      </div>`;
  }

  function stepAction(st, n, act) {
    const sp = A.stepByN(n);
    const tp = A.avg(A.tasksOf(st.id, n).map((t) => t.progress));
    const warn = tp < 1 ? `<div class="notice warn small">⚠️ Les tâches de cette étape ne sont pas toutes à 100 % (${pct(tp)}).</div>` : '';
    if (act === 'submit') A.ask({ title: `Soumettre « ${sp.name} »`, label: 'Commentaire pour le validateur', info: warn, confirmLabel: 'Soumettre' }, (c) => A.Actions.submitStep(st.id, n, c).then((ok) => ok && A.toast('Étape soumise pour validation.', 'ok')));
    if (act === 'validate') {
      const next = A.stepByN(n + 1);
      A.ask({ title: `Valider « ${sp.name} »`, label: 'Commentaire de validation', kind: 'ok', confirmLabel: 'Valider l’étape',
        info: `${warn}<div class="notice small">Critères : ${esc(sp.criteria)}<br>Après validation : ${next ? `passage à l’étape <b>${next.n}. ${esc(next.name)}</b>` : '<b>stream entièrement validé</b>'}. Les tâches à 100 % de l’étape seront validées.</div>` },
        (c) => A.Actions.validateStep(st.id, n, c).then((ok) => ok && A.toast(next ? `Étape validée → étape ${next.n} : ${next.name}` : 'Stream entièrement validé 🎉', 'ok')));
    }
    if (act === 'reject') A.ask({ title: `Rejeter « ${sp.name} »`, label: 'Motif du rejet', required: true, kind: 'bad', confirmLabel: 'Rejeter' }, (c) => A.Actions.rejectStep(st.id, n, c).then((ok) => ok && A.toast('Étape rejetée.', 'bad')));
    if (act === 'restart') A.Actions.restartStep(st.id, n);
    if (act === 'reopen') A.ask({ title: `Réouvrir « ${sp.name} »`, label: 'Motif de la réouverture', required: true, kind: 'bad', confirmLabel: 'Réouvrir' }, (c) => A.Actions.reopenStep(st.id, n, c));
  }

  function streamModal(id) {
    const s = S(); const st = id ? A.streamById(id) : { id: A.nextId('ST', s.streams, 2), name: '', owner: '', validator: '', color: '#2563eb' };
    A.modal({
      title: id ? `Stream ${esc(st.id)}` : 'Nouveau stream',
      body: `<div class="form">
        <label>ID<input class="input" id="f_id" value="${esc(st.id)}" ${id ? 'disabled' : ''}></label>
        <label>Nom<input class="input" id="f_name" value="${esc(st.name)}"></label>
        <label>Responsable<select class="input" id="f_owner">${opts(userNames(), st.owner, '—')}</select></label>
        <label>Validateur<select class="input" id="f_val">${opts(userNames(), st.validator, '—')}</select></label>
        <label>Couleur<input class="input" type="color" id="f_color" value="${esc(st.color || '#2563eb')}"></label></div>`,
      footer: `${id ? '<button class="btn bad" id="del">Supprimer</button><span style="flex:1"></span>' : ''}<button class="btn" data-close>Annuler</button><button class="btn primary" id="save">Enregistrer</button>`,
      onMount(ov) {
        const g = (x) => ov.querySelector(x).value.trim();
        ov.querySelector('#save').onclick = () => {
          const o = { id: g('#f_id'), name: g('#f_name'), owner: g('#f_owner'), validator: g('#f_val'), color: g('#f_color') };
          if (!o.id || !o.name) return A.toast('ID et nom obligatoires', 'bad');
          if (!id && s.streams.some((x) => x.id === o.id)) return A.toast('ID déjà utilisé', 'bad');
          A.closeModal(); A.Actions.upsert('streams', o, 'Stream'); ui.selStream = o.id;
        };
        const d = ov.querySelector('#del');
        if (d) d.onclick = () => { if (confirm(`Supprimer le stream ${st.id} ainsi que ses tâches, logs et validations ?`)) { A.closeModal(); A.Actions.remove('streams', st.id, 'Stream'); } };
      },
    });
  }

  // =================================================================== GANTT
  function gantt(el) {
    const s = S();
    const pxDay = { week: 20, month: 7, quarter: 2.6 }[ui.gScale];
    const streams = s.streams.filter((x) => !ui.gStream || x.id === ui.gStream);
    const allTasks = s.tasks.filter((t) => t.start && t.end && streams.some((x) => x.id === t.streamId));
    const dates = allTasks.flatMap((t) => [t.start, t.end]).sort();
    const today = A.todayIso();
    let start = dates[0] || today; let end = dates[dates.length - 1] || A.addDays(today, 60);
    if (today < start) start = today; if (today > end) end = today;
    const d0 = A.parseD(start); d0.setDate(d0.getDate() - ((d0.getDay() + 6) % 7) - 7);
    start = A.isoDate(d0); end = A.addDays(end, 21);
    const totalDays = A.daysBetween(start, end);
    const W = Math.round(totalDays * pxDay);
    const x = (d) => Math.round(A.daysBetween(start, d) * pxDay);
    // échelle
    let months = ''; let weeks = ''; let grid = '';
    const cur = A.parseD(start);
    while (cur <= A.parseD(end)) {
      const iso = A.isoDate(cur);
      if (cur.getDate() === 1 || iso === start) {
        const nm = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
        const wpx = Math.min(x(A.isoDate(nm)), W) - x(iso);
        months += `<div class="m" style="left:${x(iso)}px;width:${wpx}px">${cur.toLocaleDateString('fr-FR', { month: ui.gScale === 'quarter' ? 'short' : 'long', year: 'numeric' })}</div>`;
        if (ui.gScale !== 'week') grid += `<div class="g-grid" style="left:${x(iso)}px"></div>`;
      }
      if (cur.getDay() === 1 && ui.gScale !== 'quarter') {
        weeks += `<div class="w" style="left:${x(iso)}px;width:${7 * pxDay}px">${ui.gScale === 'week' ? `S${weekNo(cur)} · ${String(cur.getDate()).padStart(2, '0')}/${String(cur.getMonth() + 1).padStart(2, '0')}` : cur.getDate()}</div>`;
        if (ui.gScale === 'week') grid += `<div class="g-grid" style="left:${x(iso)}px"></div>`;
      }
      cur.setDate(cur.getDate() + 1);
    }
    let left = '<div class="g-row hdr"><span class="tn">Stream / tâche</span><span style="width:70px">Resp.</span><span style="width:44px;text-align:right">%</span></div>';
    let right = '';
    streams.forEach((st) => {
      const k = A.streamStats(st);
      const coll = ui.collapsed.has(st.id);
      left += `<div class="g-row grp" data-toggle="${esc(st.id)}">${coll ? '▸' : '▾'} ${sdot(st.id)}<span class="tn" title="${esc(st.name)}">${esc(st.name)}</span><span class="small muted">${k.validated}/${k.total} ✓</span><span style="width:44px;text-align:right">${pct(k.taskPct)}</span></div>`;
      right += `<div class="g-lane grp">${k.start ? `<div class="g-bar sum" title="${esc(st.name)} : ${fmtD(k.start)} → ${fmtD(k.end)}" style="left:${x(k.start)}px;width:${Math.max(4, x(A.addDays(k.end, 1)) - x(k.start))}px;background:${esc(st.color)}"><div class="fill" style="width:${k.taskPct * 100}%"></div></div>` : ''}</div>`;
      if (coll) return;
      let tasks = allTasks.filter((t) => t.streamId === st.id).sort((a, b) => a.step - b.step || (a.start < b.start ? -1 : 1));
      if (ui.gHideDone) tasks = tasks.filter((t) => !(t.progress >= 1 && t.validation === 'Validée'));
      tasks.forEach((t) => {
        const status = A.taskStatus(t);
        const isMs = t.start === t.end;
        left += `<div class="g-row task" data-task="${esc(t.id)}" title="${esc(t.name)}"><span class="small muted" style="width:20px">${t.step}</span><span class="tn">${t.validation === 'Validée' ? '✅ ' : t.validation === 'Soumise' ? '📤 ' : t.validation === 'Rejetée' ? '⛔ ' : ''}${esc(t.name)}</span><span class="small muted" style="width:70px;overflow:hidden;text-overflow:ellipsis">${esc((t.owner || '').split(' ')[0])}</span><span style="width:44px;text-align:right" class="${status === 'En retard' ? '' : 'muted'}">${status === 'En retard' ? '<b style="color:var(--bad)">' + pct(t.progress) + '</b>' : pct(t.progress)}</span></div>`;
        const bw = Math.max(isMs ? 14 : 6, x(A.addDays(t.end, 1)) - x(t.start));
        right += `<div class="g-lane"><div class="g-bar ${status === 'En retard' ? 'late' : ''} ${isMs ? 'ms' : ''}" data-task="${esc(t.id)}" title="${esc(t.name)}\n${fmtD(t.start)} → ${fmtD(t.end)} · ${pct(t.progress)} · ${status} · ${t.validation}" style="left:${x(t.start)}px;width:${bw}px;background:${esc(st.color)}">${isMs ? '' : `<div class="fill" style="width:${t.progress * 100}%"></div><div class="lbl">${t.validation === 'Validée' ? '✓ ' : ''}${bw > 60 ? pct(t.progress) : ''}</div>`}</div></div>`;
      });
    });
    el.innerHTML = `
      <div class="toolbar">
        <select class="input" id="gStream">${streamOpts(ui.gStream, 'Tous les streams')}</select>
        <select class="input" id="gScale">${opts([{ v: 'week', l: 'Vue semaines' }, { v: 'month', l: 'Vue mois' }, { v: 'quarter', l: 'Vue trimestre' }], ui.gScale)}</select>
        <label class="row small"><input type="checkbox" id="gHide" ${ui.gHideDone ? 'checked' : ''}> Masquer les tâches validées</label>
        <button class="btn sm" id="gColl">Tout replier / déplier</button>
        <div class="spacer"></div>
        <button class="btn sm" id="gToday">Aujourd’hui</button>
        <button class="btn primary" id="gAdd" ${dis(can('edit'))}>＋ Tâche</button>
      </div>
      <div class="card">
        <div class="card-h legend"><span><i class="sdot" style="background:#2563eb"></i>Planifié (couleur du stream)</span><span><i class="sdot" style="background:#1e3a8a"></i>Réalisé (partie foncée)</span><span><i class="sdot" style="outline:2px solid var(--bad);background:transparent"></i>En retard</span><span><i class="sdot" style="background:var(--bad);width:3px"></i>Aujourd’hui</span><span>✅ validée · 📤 soumise · ⛔ rejetée</span><span class="spacer" style="flex:1"></span><span>${allTasks.length} tâches</span></div>
        <div class="gantt">
          <div class="g-left">${left}</div>
          <div class="g-right" id="gRight"><div class="g-canvas" style="width:${W}px">
            <div class="g-scale">${months}${weeks}</div>
            <div style="position:relative">${grid}<div class="g-today" style="left:${x(today)}px"><span>Auj.</span></div>${right}</div>
          </div></div>
        </div>
      </div>`;
    const q = (id) => el.querySelector(id);
    q('#gStream').onchange = (e) => { ui.gStream = e.target.value; gantt(el); };
    q('#gScale').onchange = (e) => { ui.gScale = e.target.value; gantt(el); };
    q('#gHide').onchange = (e) => { ui.gHideDone = e.target.checked; gantt(el); };
    q('#gColl').onclick = () => { if (ui.collapsed.size) ui.collapsed.clear(); else streams.forEach((st) => ui.collapsed.add(st.id)); gantt(el); };
    q('#gAdd').onclick = () => taskModal(null, ui.gStream || undefined);
    const scrollToday = () => { const r = q('#gRight'); r.scrollLeft = Math.max(0, x(today) - r.clientWidth / 3); };
    q('#gToday').onclick = scrollToday;
    scrollToday();
    el.querySelectorAll('[data-toggle]').forEach((n) => n.onclick = () => { const id = n.dataset.toggle; ui.collapsed.has(id) ? ui.collapsed.delete(id) : ui.collapsed.add(id); gantt(el); });
    el.querySelectorAll('[data-task]').forEach((n) => n.onclick = () => taskModal(n.dataset.task));
  }
  function weekNo(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
    return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
  }

  function taskModal(id, streamId) {
    const s = S();
    const t = id ? s.tasks.find((x) => x.id === id) : { id: A.nextId('T', s.tasks), streamId: streamId || (s.streams[0] || {}).id, step: (A.currentStepOf(streamId || (s.streams[0] || {}).id) || { step: 1 }).step, name: '', owner: A.currentUser().name, start: A.todayIso(), end: A.addDays(A.todayIso(), 7), progress: 0, validation: 'Non soumise', comment: '' };
    if (!t) return;
    const ed = can('edit');
    A.modal({
      title: id ? `Tâche ${esc(t.id)} ${chip(A.taskStatus(t))} ${chip(t.validation)}` : 'Nouvelle tâche',
      body: `<div class="form">
        <label class="full">Libellé<input class="input" id="f_name" value="${esc(t.name)}" ${ed ? '' : 'disabled'}></label>
        <label>Stream<select class="input" id="f_stream" ${ed ? '' : 'disabled'}>${streamOpts(t.streamId)}</select></label>
        <label>Étape du workflow<select class="input" id="f_step" ${ed ? '' : 'disabled'}>${stepOpts(t.step)}</select></label>
        <label>Responsable<select class="input" id="f_owner" ${ed ? '' : 'disabled'}>${opts(userNames(), t.owner, '—')}</select></label>
        <label>Avancement : <b id="pv">${pct(t.progress)}</b><input type="range" min="0" max="100" step="5" id="f_prog" value="${Math.round(t.progress * 100)}" ${ed ? '' : 'disabled'}></label>
        <label>Début<input class="input" type="date" id="f_start" value="${esc(t.start)}" ${ed ? '' : 'disabled'}></label>
        <label>Fin<input class="input" type="date" id="f_end" value="${esc(t.end)}" ${ed ? '' : 'disabled'}></label>
        <label class="full">Commentaire<textarea class="input" id="f_com" ${ed ? '' : 'disabled'}>${esc(t.comment || '')}</textarea></label>
        ${t.validatedBy ? `<div class="full small" style="color:var(--ok)">Validée par <b>${esc(t.validatedBy)}</b> le ${fmtD(t.validatedOn)}</div>` : ''}
      </div>`,
      footer: `${id && can('admin') ? '<button class="btn bad" id="del">Supprimer</button>' : ''}<span style="flex:1"></span>
        ${id && t.validation !== 'Validée' && t.validation !== 'Soumise' ? `<button class="btn" id="sub" ${dis(ed)}>📤 Soumettre</button>` : ''}
        ${id && t.validation !== 'Validée' ? `<button class="btn ok" id="val" ${dis(can('validate'))}>✔ Valider</button>` : ''}
        ${id && t.validation === 'Soumise' ? `<button class="btn bad" id="rej" ${dis(can('validate'))}>✖ Rejeter</button>` : ''}
        <button class="btn" data-close>Fermer</button><button class="btn primary" id="save" ${dis(ed)}>Enregistrer</button>`,
      onMount(ov) {
        const g = (x) => ov.querySelector(x).value;
        ov.querySelector('#f_prog').oninput = (e) => { ov.querySelector('#pv').textContent = e.target.value + ' %'; };
        const collect = () => ({ ...t, name: g('#f_name').trim(), streamId: g('#f_stream'), step: Number(g('#f_step')), owner: g('#f_owner'), progress: Number(g('#f_prog')) / 100, start: g('#f_start'), end: g('#f_end'), comment: g('#f_com') });
        const save = async () => {
          const o = collect();
          if (!o.name) { A.toast('Libellé obligatoire', 'bad'); return false; }
          if (o.end < o.start) { A.toast('La date de fin précède la date de début', 'bad'); return false; }
          if (o.validation === 'Validée' && o.progress < 1) { o.validation = 'Non soumise'; o.validatedBy = ''; o.validatedOn = ''; }
          return A.Actions.upsert('tasks', o, 'Tâche');
        };
        ov.querySelector('#save').onclick = async () => { if (await save()) A.closeModal(); };
        const b = (sel, fn) => { const n = ov.querySelector(sel); if (n) n.onclick = fn; };
        b('#sub', async () => { if (Number(g('#f_prog')) < 100 && !confirm('La tâche n’est pas à 100 %. Soumettre quand même ?')) return; if (await save()) { A.closeModal(); A.Actions.setItemValidation('task', t.id, 'Soumise'); } });
        b('#val', async () => { if (await save()) { A.closeModal(); A.ask({ title: 'Valider la tâche', label: 'Commentaire', kind: 'ok', confirmLabel: 'Valider' }, (c) => A.Actions.setItemValidation('task', t.id, 'Validée', c)); } });
        b('#rej', () => { A.closeModal(); A.ask({ title: 'Rejeter la tâche', label: 'Motif', required: true, kind: 'bad', confirmLabel: 'Rejeter' }, (c) => A.Actions.setItemValidation('task', t.id, 'Rejetée', c)); });
        b('#del', () => { if (confirm('Supprimer cette tâche ?')) { A.closeModal(); A.Actions.remove('tasks', t.id, 'Tâche'); } });
      },
    });
  }

  // =================================================================== LOGS
  function logs(el) {
    const s = S(); const f = ui.lf;
    const q = f.q.toLowerCase();
    const rows = s.logs.filter((l) => (!f.stream || l.streamId === f.stream) && (!f.status || l.status === f.status) && (!f.crit || l.criticity === f.crit) && (!f.valid || l.validation === f.valid)
      && (!q || [l.id, l.application, l.source, l.sourcetype, l.index, l.hosts, l.owner, l.type, l.method].join(' ').toLowerCase().includes(q)));
    const lastIdx = s.logStatuses.length - 1;
    el.innerHTML = `
      <div class="toolbar">
        <input class="input" id="lq" placeholder="🔎 Rechercher (application, sourcetype, index, hôte…)" value="${esc(f.q)}" style="min-width:260px;flex:1">
        <select class="input" id="ls">${streamOpts(f.stream, 'Tous les streams')}</select>
        <select class="input" id="lst">${opts(s.logStatuses.map((x) => x.name), f.status, 'Tous les statuts')}</select>
        <select class="input" id="lc">${opts(A.C.CRITICITIES, f.crit, 'Criticité')}</select>
        <select class="input" id="lv">${opts(A.C.VALID_STATUSES, f.valid, 'Validation')}</select>
        <button class="btn sm" id="lreset">Réinitialiser</button>
        <button class="btn primary" id="ladd" ${dis(can('edit'))}>＋ Log</button>
      </div>
      <div class="pipeline">${s.logStatuses.map((x, i) => { const n = rows.filter((l) => l.status === x.name).length; return `<div class="p ${f.status === x.name ? 'cur' : ''} ${i === lastIdx && n ? 'done' : ''}" data-fs="${esc(x.name)}" style="cursor:pointer">${esc(x.name)}<br><b style="font-size:15px">${n}</b></div>`; }).join('')}</div>
      <div class="card"><div class="tablewrap"><table class="t">
        <thead><tr><th>ID</th><th>Application</th><th>Stream</th><th>Type</th><th>Collecte</th><th>Index / sourcetype</th><th style="text-align:right">Mo/j</th><th>Criticité</th><th>Statut onboarding</th><th>Validation</th><th>Responsable</th><th></th></tr></thead>
        <tbody>${rows.map((l) => { const p = A.logPct(l); const idx = s.logStatuses.findIndex((x) => x.name === l.status); return `
          <tr class="click" data-log="${esc(l.id)}">
            <td class="mono">${esc(l.id)}</td><td><b>${esc(l.application)}</b><div class="small muted" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.source)}</div></td>
            <td><span class="row" style="gap:6px">${sdot(l.streamId)}<span class="small">${esc(sname(l.streamId))}</span></span></td>
            <td class="small">${esc(l.type)}</td><td class="small">${esc(l.method)}</td>
            <td class="mono">${esc(l.index)}<br><span class="muted">${esc(l.sourcetype)}</span></td>
            <td style="text-align:right;font-variant-numeric:tabular-nums">${Number(l.volume || 0).toLocaleString('fr-FR')}</td>
            <td>${chip(l.criticity)}</td>
            <td style="min-width:170px"><div class="small" style="margin-bottom:3px">${esc(l.status)}</div>${bar(p, p >= 1 ? 'ok' : '')}</td>
            <td>${l.validation === 'Non soumise' ? '<span class="muted small">—</span>' : chip(l.validation)}</td>
            <td class="small">${esc(l.owner)}</td>
            <td><button class="btn sm" data-adv="${esc(l.id)}" title="Passer au statut suivant" ${dis(can('edit') && idx < lastIdx && l.validation !== 'Soumise')}>▶</button></td>
          </tr>`; }).join('') || '<tr><td colspan="12" class="empty">Aucun log ne correspond aux filtres.</td></tr>'}</tbody>
      </table></div></div>
      <div class="small muted" style="margin-top:8px">${rows.length} log(s) affiché(s) sur ${s.logs.length} · volumétrie filtrée : ${(rows.reduce((a, l) => a + (Number(l.volume) || 0), 0) / 1024).toFixed(1)} Go/j</div>`;
    const set = (k) => (e) => { ui.lf[k] = e.target.value; logs(el); };
    el.querySelector('#lq').oninput = (e) => { ui.lf.q = e.target.value; clearTimeout(ui._t); ui._t = setTimeout(() => { logs(el); const n = el.querySelector('#lq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
    el.querySelector('#ls').onchange = set('stream'); el.querySelector('#lst').onchange = set('status');
    el.querySelector('#lc').onchange = set('crit'); el.querySelector('#lv').onchange = set('valid');
    el.querySelector('#lreset').onclick = () => { ui.lf = { q: '', stream: '', status: '', crit: '', valid: '' }; logs(el); };
    el.querySelector('#ladd').onclick = () => logModal(null);
    el.querySelectorAll('[data-fs]').forEach((n) => n.onclick = () => { ui.lf.status = ui.lf.status === n.dataset.fs ? '' : n.dataset.fs; logs(el); });
    el.querySelectorAll('[data-log]').forEach((n) => n.onclick = (e) => { if (!e.target.closest('[data-adv]')) logModal(n.dataset.log); });
    el.querySelectorAll('[data-adv]').forEach((n) => n.onclick = (e) => { e.stopPropagation(); A.Actions.advanceLog(n.dataset.adv, 1); });
  }

  function splunkConf(l) {
    const st = l.sourcetype || 'mon:sourcetype'; const idx = l.index || 'main';
    const m = (l.method || '').toLowerCase();
    let inputs;
    if (m.includes('forwarder')) inputs = l.source && /^(win|xmlwin)/i.test(l.source) ? `[WinEventLog://${l.source.replace(/^WinEventLog:/i, '').split(/[/,]/)[0]}]\nindex = ${idx}\nrenderXml = true\ndisabled = 0` : `[monitor://${l.source || '/chemin/vers/*.log'}]\nindex = ${idx}\nsourcetype = ${st}\ndisabled = 0`;
    else if (m.includes('hec')) inputs = `[http://${(l.application || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '_')}]\ntoken = <généré par Splunk>\nindex = ${idx}\nindexes = ${idx}\nsourcetype = ${st}\ndisabled = 0`;
    else if (m.includes('syslog')) inputs = `# SC4S (splunk_metadata.csv)\n${st.split(':')[0]}_${st.split(':')[1] || 'log'},index,${idx}\n${st.split(':')[0]}_${st.split(':')[1] || 'log'},sourcetype,${st}`;
    else if (m.includes('db connect')) inputs = `# db_inputs.conf (Splunk DB Connect)\n[${(l.application || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '_')}]\nconnection = <connexion>\nmode = rising\nindex = ${idx}\nsourcetype = ${st}\ninterval = 300`;
    else inputs = `# Configuration via l'add-on / l'API (${l.method || 'à définir'})\nindex = ${idx}\nsourcetype = ${st}`;
    const multi = /multi|log4j|trc|catalina/i.test((l.format || '') + (l.source || ''));
    const json = /json/i.test(l.format || '');
    const props = `[${st}]\n${json ? 'KV_MODE = json\nINDEXED_EXTRACTIONS = \n' : ''}SHOULD_LINEMERGE = false\nLINE_BREAKER = ${multi ? '([\\r\\n]+)(?=\\d{4}-\\d{2}-\\d{2})' : '([\\r\\n]+)'}\nTIME_PREFIX = ${json ? '"timestamp"\\s*:\\s*"' : '^'}\nTIME_FORMAT = %Y-%m-%d %H:%M:%S.%3N\nMAX_TIMESTAMP_LOOKAHEAD = 30\nTRUNCATE = 10000\nTZ = Europe/Paris`;
    const spl = `index=${idx} sourcetype="${st}" earliest=-24h\n| stats count, latest(_time) as dernier_evenement by host\n| eval dernier_evenement=strftime(dernier_evenement, "%d/%m/%Y %H:%M:%S")`;
    const vol = `index=_internal source=*license_usage.log type=Usage idx=${idx} st="${st}" earliest=-7d\n| timechart span=1d sum(b) as octets\n| eval Mo=round(octets/1024/1024,1) | fields - octets`;
    return { inputs, props, spl, vol };
  }

  function logModal(id) {
    const s = S();
    const l = id ? s.logs.find((x) => x.id === id) : { id: A.nextId('LOG', s.logs), application: '', streamId: ui.lf.stream || (s.streams[0] || {}).id, type: 'Applicatif', source: '', method: 'Universal Forwarder', index: '', sourcetype: '', hosts: '', format: '', volume: 0, retention: 180, criticity: 'Moyenne', cim: 'À vérifier', status: s.logStatuses[0].name, owner: A.currentUser().name, taskId: '', validation: 'Non soumise', comment: '' };
    if (!l) return;
    const ed = can('edit'); const D = ed ? '' : 'disabled';
    const idx = s.logStatuses.findIndex((x) => x.name === l.status);
    const lastIdx = s.logStatuses.length - 1;
    const conf = splunkConf(l);
    const tasks = s.tasks.filter((t) => t.streamId === l.streamId);
    const field = (label, key, extra = '') => `<label>${label}<input class="input" id="f_${key}" value="${esc(l[key] == null ? '' : l[key])}" ${D} ${extra}></label>`;
    A.modal({
      size: 'lg',
      title: id ? `Log ${esc(l.id)} – ${esc(l.application)} ${l.validation !== 'Non soumise' ? chip(l.validation) : ''}` : 'Nouveau log',
      body: `
        ${id ? `<div class="pipeline">${s.logStatuses.map((x, i) => `<div class="p ${i < idx ? 'done' : ''} ${i === idx ? (i === lastIdx ? 'done' : 'cur') : ''}">${i < idx ? '✓ ' : ''}${esc(x.name)}</div>`).join('')}</div>` : ''}
        ${l.validatedBy ? `<div class="notice small">✅ Validé par <b>${esc(l.validatedBy)}</b> le ${fmtD(l.validatedOn)}</div>` : ''}
        <div class="form f3">
          ${field('Application', 'application')}
          <label>Stream<select class="input" id="f_streamId" ${D}>${streamOpts(l.streamId)}</select></label>
          <label>Type de log<select class="input" id="f_type" ${D}>${opts(A.C.LOG_TYPES, l.type, '—')}</select></label>
          <label class="full">Source / chemin<input class="input" id="f_source" value="${esc(l.source)}" ${D}></label>
          <label>Méthode de collecte<select class="input" id="f_method" ${D}>${opts(A.C.METHODS, l.method, '—')}</select></label>
          ${field('Index Splunk', 'index')}${field('Sourcetype', 'sourcetype')}
          ${field('Hôte(s)', 'hosts')}${field('Format', 'format')}${field('Volume (Mo/j)', 'volume', 'type="number" min="0"')}
          ${field('Rétention (jours)', 'retention', 'type="number" min="0"')}
          <label>Criticité<select class="input" id="f_criticity" ${D}>${opts(A.C.CRITICITIES, l.criticity)}</select></label>
          <label>Conformité CIM<select class="input" id="f_cim" ${D}>${opts(A.C.CIM, l.cim)}</select></label>
          <label>Statut onboarding<select class="input" id="f_status" ${D}>${opts(s.logStatuses.map((x, i) => ({ v: x.name, l: x.name, i })).filter((x) => x.i < lastIdx || can('validate') || x.v === l.status), l.status)}</select></label>
          <label>Responsable<select class="input" id="f_owner" ${D}>${opts(userNames(), l.owner, '—')}</select></label>
          <label>Tâche liée<select class="input" id="f_taskId" ${D}>${opts(tasks.map((t) => ({ v: t.id, l: `${t.id} – ${t.name}` })), l.taskId, '—')}</select></label>
          <label class="full">Commentaire<textarea class="input" id="f_comment" ${D}>${esc(l.comment || '')}</textarea></label>
        </div>
        ${id ? `<h3 style="font-size:14px;margin:18px 0 4px">⚙️ Configuration Splunk proposée</h3><div class="small muted">Générée à partir des champs ci-dessus – à adapter.</div>
          <div class="grid g-2e"><div><b class="small">inputs.conf</b><pre class="code">${esc(conf.inputs)}</pre></div><div><b class="small">props.conf</b><pre class="code">${esc(conf.props)}</pre></div></div>
          <div class="grid g-2e"><div><b class="small">SPL – contrôle de réception</b><pre class="code">${esc(conf.spl)}</pre></div><div><b class="small">SPL – volumétrie licence (7 j)</b><pre class="code">${esc(conf.vol)}</pre></div></div>` : ''}`,
      footer: `${id && can('admin') ? '<button class="btn bad" id="del">Supprimer</button>' : ''}<span style="flex:1"></span>
        ${id ? `<button class="btn" id="back" ${dis(ed && idx > 0 && l.validation !== 'Validée')}>◀ Statut précédent</button>
        <button class="btn primary" id="fwd" ${dis(ed && idx < lastIdx && l.validation !== 'Soumise')}>Statut suivant ▶</button>
        ${l.validation !== 'Validée' && l.validation !== 'Soumise' ? `<button class="btn" id="sub" ${dis(ed)}>📤 Soumettre</button>` : ''}
        ${l.validation !== 'Validée' ? `<button class="btn ok" id="val" ${dis(can('validate'))}>✔ Valider</button>` : ''}
        ${l.validation === 'Soumise' ? `<button class="btn bad" id="rej" ${dis(can('validate'))}>✖ Rejeter</button>` : ''}` : ''}
        <button class="btn" data-close>Fermer</button><button class="btn primary" id="save" ${dis(ed)}>Enregistrer</button>`,
      onMount(ov) {
        const g = (k) => { const n = ov.querySelector('#f_' + k); return n ? n.value : ''; };
        const collect = () => { const o = { ...l }; ['application', 'streamId', 'type', 'source', 'method', 'index', 'sourcetype', 'hosts', 'format', 'criticity', 'cim', 'status', 'owner', 'taskId', 'comment'].forEach((k) => { o[k] = g(k).trim(); }); o.volume = Number(g('volume')) || 0; o.retention = Number(g('retention')) || ''; return o; };
        const save = () => { const o = collect(); if (!o.application) { A.toast('Application obligatoire', 'bad'); return Promise.resolve(false); } return A.Actions.upsert('logs', o, 'Log'); };
        const b = (sel, fn) => { const n = ov.querySelector(sel); if (n) n.onclick = fn; };
        b('#save', async () => { if (await save()) A.closeModal(); });
        b('#fwd', async () => { if (await save()) { await A.Actions.advanceLog(l.id, 1); logModal(l.id); } });
        b('#back', async () => { if (await save()) { await A.Actions.advanceLog(l.id, -1); logModal(l.id); } });
        b('#sub', async () => { if (await save()) { A.closeModal(); A.Actions.setItemValidation('log', l.id, 'Soumise'); } });
        b('#val', async () => { if (await save()) { A.closeModal(); A.ask({ title: 'Valider le log', label: 'Commentaire', kind: 'ok', confirmLabel: 'Valider' }, (c) => A.Actions.setItemValidation('log', l.id, 'Validée', c)); } });
        b('#rej', () => { A.closeModal(); A.ask({ title: 'Rejeter le log', label: 'Motif', required: true, kind: 'bad', confirmLabel: 'Rejeter' }, (c) => A.Actions.setItemValidation('log', l.id, 'Rejetée', c)); });
        b('#del', () => { if (confirm('Supprimer ce log ?')) { A.closeModal(); A.Actions.remove('logs', l.id, 'Log'); } });
      },
    });
  }

  // =================================================================== VALIDATIONS
  function validations(el) {
    const s = S(); const u = A.currentUser();
    const pend = A.pendingValidations();
    // actions à mener par l'utilisateur courant
    const mine = [];
    s.streams.forEach((st) => {
      const cur = A.currentStepOf(st.id);
      if (!cur) return;
      const tp = A.avg(A.tasksOf(st.id, cur.step).map((t) => t.progress));
      if (st.owner === u.name && cur.status === 'Rejeté') mine.push({ html: `${sdot(st.id)} <b>${esc(st.name)}</b> – étape ${cur.step} rejetée : ${esc(cur.comment)}`, go: `step|${st.id}|${cur.step}`, chip: 'Rejeté' });
      else if (st.owner === u.name && cur.status === 'En cours' && tp >= 1) mine.push({ html: `${sdot(st.id)} <b>${esc(st.name)}</b> – étape ${cur.step} prête à être soumise`, go: `step|${st.id}|${cur.step}`, chip: 'À soumettre' });
      if (st.validator === u.name && cur.status === 'Soumis') mine.push({ html: `${sdot(st.id)} <b>${esc(st.name)}</b> – étape ${cur.step} à valider`, go: `step|${st.id}|${cur.step}`, chip: 'Soumis' });
    });
    s.tasks.filter((t) => t.owner === u.name).forEach((t) => {
      if (t.validation === 'Rejetée') mine.push({ html: `Tâche <b>${esc(t.id)}</b> rejetée – ${esc(t.name)}`, go: `task|${t.id}`, chip: 'Rejetée' });
      else if (t.progress >= 1 && t.validation === 'Non soumise') mine.push({ html: `Tâche <b>${esc(t.id)}</b> terminée à soumettre – ${esc(t.name)}`, go: `task|${t.id}`, chip: 'À soumettre' });
      else if (A.taskStatus(t) === 'En retard') mine.push({ html: `Tâche <b>${esc(t.id)}</b> en retard – ${esc(t.name)} (fin ${fmtD(t.end)})`, go: `task|${t.id}`, chip: 'En retard' });
    });
    s.logs.filter((l) => l.owner === u.name && l.validation === 'Rejetée').forEach((l) => mine.push({ html: `Log <b>${esc(l.id)}</b> rejeté – ${esc(l.application)}`, go: `log|${l.id}`, chip: 'Rejetée' }));
    const hq = ui.hq.toLowerCase();
    const hist = s.history.filter((h) => !hq || [h.user, h.type, h.ref, h.action, h.comment].join(' ').toLowerCase().includes(hq));
    const tab = ui.valTab;
    el.innerHTML = `
      <div class="toolbar">
        <button class="btn ${tab === 'pending' ? 'primary' : ''}" data-tab="pending">À valider (${pend.length})</button>
        <button class="btn ${tab === 'mine' ? 'primary' : ''}" data-tab="mine">Mes actions (${mine.length})</button>
        <button class="btn ${tab === 'hist' ? 'primary' : ''}" data-tab="hist">Historique (${s.history.length})</button>
        <div class="spacer"></div><span class="small muted">Connecté : <b>${esc(u.name)}</b> (${esc(u.role)})</span>
      </div>
      ${tab === 'pending' ? `<div class="card">
        ${!can('validate') ? '<div class="card-b"><div class="notice warn" style="margin:0">Votre rôle ne permet pas de valider. Sélectionnez un utilisateur « Validateur » ou « Admin » en haut à droite.</div></div>' : ''}
        <table class="t"><thead><tr><th>Type</th><th>Élément</th><th>Stream</th><th>Validateur désigné</th><th style="text-align:right">Actions</th></tr></thead><tbody>
        ${pend.map((p) => { const o = p.obj; const st = A.streamById(o.streamId) || {}; const key = p.kind === 'step' ? `step|${o.streamId}|${o.step}` : `${p.kind}|${o.id}`;
          const label = p.kind === 'step' ? `Étape ${o.step} – ${esc(A.stepByN(o.step).name)}` : p.kind === 'task' ? `${esc(o.id)} – ${esc(o.name)} (${pct(o.progress)})` : `${esc(o.id)} – ${esc(o.application)} <span class="muted mono">${esc(o.sourcetype)}</span>`;
          return `<tr><td>${chip({ step: 'Étape stream', task: 'Tâche', log: 'Log' }[p.kind])}</td><td><a href="javascript:void 0" data-open="${esc(key)}">${label}</a>${o.comment ? `<div class="small muted">💬 ${esc(o.comment)}</div>` : ''}</td>
            <td><span class="row" style="gap:6px">${sdot(o.streamId)}${esc(st.name || '')}</span></td><td class="small">${esc(st.validator || '—')}</td>
            <td style="text-align:right;white-space:nowrap"><button class="btn sm ok" data-v="${esc(key)}" ${dis(can('validate'))}>✔ Valider</button> <button class="btn sm bad" data-r="${esc(key)}" ${dis(can('validate'))}>✖ Rejeter</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">Rien à valider pour le moment ✅</td></tr>'}
        </tbody></table></div>` : ''}
      ${tab === 'mine' ? `<div class="card"><div class="card-b">${mine.map((m) => `<div class="list-item" style="cursor:pointer" data-open="${esc(m.go)}"><div class="grow">${m.html}</div>${chip(m.chip)}</div>`).join('') || '<div class="empty">Aucune action en attente pour vous.</div>'}</div></div>` : ''}
      ${tab === 'hist' ? `<div class="toolbar"><input class="input" id="hq" placeholder="🔎 Filtrer l’historique…" value="${esc(ui.hq)}" style="flex:1"></div>
        <div class="card"><div class="tablewrap"><table class="t"><thead><tr><th>Date</th><th>Utilisateur</th><th>Objet</th><th>Référence</th><th>Action</th><th>Commentaire</th></tr></thead><tbody>
        ${hist.slice(0, 500).map((h) => `<tr><td class="small" style="white-space:nowrap">${fmtDT(h.date)}</td><td>${esc(h.user)}</td><td class="small">${esc(h.type)}</td><td class="small">${esc(h.ref)}</td><td>${actIcon[h.action] || ''} ${chip(h.action)}</td><td class="small">${esc(h.comment)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Aucune entrée</td></tr>'}
        </tbody></table></div></div>` : ''}`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { ui.valTab = b.dataset.tab; validations(el); });
    el.querySelectorAll('[data-open]').forEach((n) => n.onclick = () => openPending(n.dataset.open));
    const hqI = el.querySelector('#hq');
    if (hqI) hqI.oninput = (e) => { ui.hq = e.target.value; clearTimeout(ui._t); ui._t = setTimeout(() => { validations(el); const n = el.querySelector('#hq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
    const act = (key, ok) => {
      const [k, a, b] = key.split('|');
      if (k === 'step') {
        const st = A.streamById(a);
        return stepAction(st, Number(b), ok ? 'validate' : 'reject');
      }
      if (ok) A.ask({ title: 'Valider', label: 'Commentaire', kind: 'ok', confirmLabel: 'Valider' }, (c) => A.Actions.setItemValidation(k, a, 'Validée', c));
      else A.ask({ title: 'Rejeter', label: 'Motif du rejet', required: true, kind: 'bad', confirmLabel: 'Rejeter' }, (c) => A.Actions.setItemValidation(k, a, 'Rejetée', c));
    };
    el.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => act(b.dataset.v, true));
    el.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => act(b.dataset.r, false));
  }

  // =================================================================== IMPORT / EXPORT
  function data(el) {
    const st = A.Store;
    el.innerHTML = `
      <div class="notice ${st.mode === 'server' ? '' : 'warn'}">${st.mode === 'server'
        ? `🟢 <b>Mode partagé</b> : les données sont stockées sur le serveur et partagées entre tous les utilisateurs (version ${st.version}, dernière modification par ${esc(st.updatedBy || '—')} le ${fmtDT(st.updatedAt)}).`
        : '🟠 <b>Mode local</b> : les données sont enregistrées uniquement dans ce navigateur. Pour un usage multi-utilisateurs, lancez le serveur (<span class="mono">node server/server.js</span>) ou échangez les fichiers Excel / JSON.'}</div>
      <div class="grid g-2e">
        <div class="card"><div class="card-h"><h2>⬆️ Importer un fichier Excel</h2></div><div class="card-b">
          <p class="small muted" style="margin-top:0">Formats reconnus : le classeur de suivi <b>Suivi_Logs_Splunk.xlsx</b> (feuilles Streams, Validations, Tâches, Logs, Historique), votre <b>fichier Excel d’inventaire des logs</b> et votre <b>planning Gantt par stream</b>. Les colonnes sont détectées automatiquement (Application, Sourcetype, Index, Stream, Tâche, Début, Fin, % avancement…). Dans un Gantt sans colonne « Stream », les lignes sans dates sont lues comme des en-têtes de stream.</p>
          <div class="row" style="margin-bottom:10px"><label class="row small"><input type="radio" name="mode" value="merge" checked> Fusionner (mise à jour par ID)</label><label class="row small"><input type="radio" name="mode" value="replace"> Remplacer les données importées</label></div>
          <div class="dropzone" id="drop">Déposez un ou plusieurs fichiers .xlsx / .xls / .csv ici<br><span class="small">ou cliquez pour parcourir</span></div>
          <input type="file" id="file" accept=".xlsx,.xls,.xlsm,.csv" multiple hidden ${can('edit') ? '' : 'disabled'}>
        </div></div>
        <div class="card"><div class="card-h"><h2>⬇️ Exporter</h2></div><div class="card-b" style="display:grid;gap:10px">
          <button class="btn primary" id="xls">📗 Exporter tout en Excel (synthèse, streams, validations, tâches, logs, historique)</button>
          <button class="btn" id="json">💾 Sauvegarde complète JSON</button>
          ${st.mode === 'server' ? '<a class="btn" href="excel/Suivi_Logs_Splunk.xlsx" download>📊 Classeur de suivi mis en forme (modèle avec formules)</a>' : ''}
          <p class="small muted" style="margin:0">Le classeur mis en forme (formules, Gantt, tableaux de bord) peut être régénéré avec vos données : <span class="mono">python tools/generate_excel.py sauvegarde.json</span></p>
          <hr style="border:0;border-top:1px solid var(--border);width:100%">
          <label class="btn" style="justify-content:center">📂 Restaurer une sauvegarde JSON<input type="file" id="jfile" accept=".json" hidden></label>
          <button class="btn bad" id="reset" ${dis(can('admin'))}>↺ Réinitialiser avec les données d’exemple</button>
        </div></div>
      </div>`;
    const drop = el.querySelector('#drop'); const file = el.querySelector('#file');
    drop.onclick = () => { if (!can('edit')) return A.toast('Droit de modification requis', 'bad'); file.click(); };
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); if (can('edit')) handleFiles([...e.dataTransfer.files]); };
    file.onchange = () => handleFiles([...file.files]);
    el.querySelector('#xls').onclick = () => ExcelIO.exportWorkbook(S());
    el.querySelector('#json').onclick = () => ExcelIO.downloadJson(S());
    el.querySelector('#jfile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        const state = j.state && j.state.streams ? j.state : j;
        if (!Array.isArray(state.streams)) throw new Error('format inattendu');
        if (!confirm(`Remplacer toutes les données par la sauvegarde « ${f.name} » ?`)) return;
        await A.Store.commit((s, u) => { Object.keys(s).forEach((k) => delete s[k]); Object.assign(s, A.normalize(state)); s.history.unshift({ date: A.nowIso(), user: u.name, type: 'Données', ref: f.name, action: 'Import', comment: 'Restauration de sauvegarde JSON' }); });
        A.toast('Sauvegarde restaurée', 'ok');
      } catch (err) { A.toast('Fichier JSON invalide : ' + err.message, 'bad'); }
    };
    el.querySelector('#reset').onclick = async () => {
      if (!confirm('Remplacer TOUTES les données par le jeu d’exemple ?')) return;
      await A.Store.commit((s) => { Object.keys(s).forEach((k) => delete s[k]); Object.assign(s, A.normalize(A.clone(window.SAMPLE_DATA))); });
      A.toast('Données d’exemple rechargées', 'ok');
    };
    async function handleFiles(files) {
      if (!files.length) return;
      const mode = el.querySelector('input[name=mode]:checked').value;
      const merged = { streams: [], validations: [], tasks: [], logs: [], history: [], report: [] };
      for (const f of files) {
        try {
          const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
          const p = ExcelIO.parseWorkbook(wb, S());
          ['streams', 'validations', 'tasks', 'logs', 'history'].forEach((k) => merged[k].push(...p[k]));
          p.report.forEach((r) => merged.report.push({ file: f.name, ...r }));
        } catch (err) { A.toast(`${f.name} : lecture impossible (${err.message})`, 'bad'); }
      }
      const kindName = { logs: 'Logs', tasks: 'Tâches / Gantt', streams: 'Streams', validations: 'Validations', history: 'Historique' };
      A.modal({
        title: 'Aperçu de l’import', size: 'lg',
        body: `<table class="t"><thead><tr><th>Fichier</th><th>Feuille</th><th>Détecté comme</th><th>Lignes</th><th>Colonnes reconnues</th></tr></thead><tbody>
          ${merged.report.map((r) => `<tr><td class="small">${esc(r.file)}</td><td>${esc(r.sheet)}</td><td>${r.kind ? chip(kindName[r.kind], '') : '<span class="muted small">ignorée</span>'}</td><td>${r.rows}</td><td class="small muted">${esc(r.cols.join(', '))}</td></tr>`).join('')}
          </tbody></table>
          <div class="notice" style="margin-top:12px">Mode : <b>${mode === 'merge' ? 'fusion (mise à jour par ID, ajout des nouveaux)' : 'remplacement des données des types importés'}</b> · ${merged.streams.length} streams, ${merged.tasks.length} tâches, ${merged.logs.length} logs, ${merged.validations.length} validations.</div>`,
        footer: '<button class="btn" data-close>Annuler</button><button class="btn primary" id="go">Importer</button>',
        onMount(ov) {
          ov.querySelector('#go').onclick = async () => {
            A.closeModal();
            const ok = await A.Store.commit((s, u) => {
              ExcelIO.applyImport(s, A.clone(merged), mode);
              s.history.unshift({ date: A.nowIso(), user: u.name, type: 'Données', ref: files.map((f) => f.name).join(', '), action: 'Import', comment: `${merged.tasks.length} tâches, ${merged.logs.length} logs, ${merged.streams.length} streams (${mode === 'merge' ? 'fusion' : 'remplacement'})` });
            });
            if (ok) A.toast('Import terminé', 'ok');
          };
        },
      });
    }
  }

  // =================================================================== PARAMÈTRES
  function settings(el) {
    const s = S(); const adm = can('admin');
    el.innerHTML = `
      ${!adm ? '<div class="notice warn">Lecture seule : seuls les administrateurs peuvent modifier les paramètres.</div>' : ''}
      <div class="grid g-2e">
        <div class="card"><div class="card-h"><h2>👥 Utilisateurs & rôles</h2><div class="spacer"></div><button class="btn sm" id="addU" ${dis(adm)}>＋ Ajouter</button></div>
          <table class="t"><thead><tr><th>Nom</th><th>Fonction</th><th>Rôle</th><th></th></tr></thead><tbody>
          ${s.users.map((u) => `<tr><td><span class="row"><span class="avatar" style="width:26px;height:26px;font-size:11px">${esc(A.initials(u.name))}</span>${esc(u.name)}</span></td><td class="small">${esc(u.title || '')}</td><td>${chip(u.role)}</td><td style="text-align:right"><button class="btn sm" data-u="${esc(u.id)}" ${dis(adm)}>✏️</button></td></tr>`).join('')}
          </tbody></table>
          <div class="card-b small muted"><b>Admin</b> : tout, y compris paramètres et réouverture d’étape · <b>Validateur</b> : valide / rejette étapes, tâches et logs · <b>Contributeur</b> : saisit, fait avancer et soumet · <b>Lecteur</b> : consultation.</div></div>
        <div class="card"><div class="card-h"><h2>🧭 Streams</h2><div class="spacer"></div><button class="btn sm" id="addS" ${dis(adm)}>＋ Ajouter</button></div>
          <table class="t"><thead><tr><th>Stream</th><th>Responsable</th><th>Validateur</th><th></th></tr></thead><tbody>
          ${s.streams.map((x) => `<tr><td><span class="row">${sdot(x.id)}<span class="mono">${esc(x.id)}</span> ${esc(x.name)}</span></td><td class="small">${esc(x.owner)}</td><td class="small">${esc(x.validator)}</td><td style="text-align:right"><button class="btn sm" data-s="${esc(x.id)}" ${dis(adm)}>✏️</button></td></tr>`).join('')}
          </tbody></table></div>
      </div>
      <div class="grid g-2e mt">
        <div class="card"><div class="card-h"><h2>🪜 Étapes du workflow de validation</h2><div class="spacer"></div><button class="btn sm primary" id="saveSteps" ${dis(adm)}>Enregistrer</button></div>
          <div class="card-b" style="display:grid;gap:10px">${s.steps.map((sp) => `
            <div class="row" style="align-items:flex-start"><b style="width:22px;padding-top:7px">${sp.n}.</b><div style="flex:1;display:grid;gap:4px">
              <input class="input" data-stn="${sp.n}" value="${esc(sp.name)}" ${adm ? '' : 'disabled'}>
              <textarea class="input" data-stc="${sp.n}" style="min-height:44px" ${adm ? '' : 'disabled'}>${esc(sp.criteria)}</textarea></div></div>`).join('')}</div></div>
        <div class="card"><div class="card-h"><h2>📶 Statuts d’onboarding des logs</h2><div class="spacer"></div><button class="btn sm primary" id="saveStat" ${dis(adm)}>Enregistrer</button></div>
          <div class="card-b" style="display:grid;gap:8px">
            <div class="small muted">Ordre = progression étape par étape. Le dernier statut est réservé aux validateurs. Le % alimente l’avancement des logs.</div>
            ${s.logStatuses.map((x, i) => `<div class="row"><b style="width:22px">${i + 1}.</b><input class="input" style="flex:1" data-lsn="${i}" value="${esc(x.name)}" ${adm ? '' : 'disabled'}><input class="input" style="width:80px" type="number" min="0" max="100" data-lsp="${i}" value="${Math.round(x.pct * 100)}" ${adm ? '' : 'disabled'}> %</div>`).join('')}
            <label class="form" style="margin-top:10px"><span class="small muted full">Nom du projet</span></label><input class="input" id="pname" value="${esc(s.meta.project || '')}" ${adm ? '' : 'disabled'}>
          </div></div>
      </div>`;
    el.querySelector('#addU').onclick = () => userModal(null);
    el.querySelector('#addS').onclick = () => streamModal(null);
    el.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => userModal(b.dataset.u));
    el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => streamModal(b.dataset.s));
    el.querySelector('#saveSteps').onclick = () => A.Store.commit((st, u) => {
      st.steps.forEach((sp) => { sp.name = el.querySelector(`[data-stn="${sp.n}"]`).value.trim() || sp.name; sp.criteria = el.querySelector(`[data-stc="${sp.n}"]`).value.trim(); });
      st.history.unshift({ date: A.nowIso(), user: u.name, type: 'Paramètres', ref: 'Étapes', action: 'Modifié', comment: '' });
    }).then((ok) => ok && A.toast('Étapes enregistrées', 'ok'));
    el.querySelector('#saveStat').onclick = () => A.Store.commit((st, u) => {
      st.logStatuses.forEach((x, i) => {
        const nn = el.querySelector(`[data-lsn="${i}"]`).value.trim() || x.name;
        st.logs.forEach((l) => { if (l.status === x.name) l.status = nn; });
        x.name = nn; x.pct = Math.max(0, Math.min(100, Number(el.querySelector(`[data-lsp="${i}"]`).value) || 0)) / 100;
      });
      st.meta.project = el.querySelector('#pname').value.trim();
      st.history.unshift({ date: A.nowIso(), user: u.name, type: 'Paramètres', ref: 'Statuts logs', action: 'Modifié', comment: '' });
    }).then((ok) => ok && A.toast('Paramètres enregistrés', 'ok'));
  }

  function userModal(id) {
    const s = S(); const u = id ? s.users.find((x) => x.id === id) : { id: A.nextId('u', s.users, 1), name: '', role: 'Contributeur', title: '' };
    A.modal({
      title: id ? 'Modifier l’utilisateur' : 'Nouvel utilisateur',
      body: `<div class="form"><label>Nom<input class="input" id="u_n" value="${esc(u.name)}"></label><label>Rôle<select class="input" id="u_r">${opts(A.C.ROLES, u.role)}</select></label><label class="full">Fonction<input class="input" id="u_t" value="${esc(u.title || '')}"></label></div>`,
      footer: `${id ? '<button class="btn bad" id="del">Supprimer</button><span style="flex:1"></span>' : ''}<button class="btn" data-close>Annuler</button><button class="btn primary" id="save">Enregistrer</button>`,
      onMount(ov) {
        ov.querySelector('#save').onclick = () => {
          const o = { id: u.id, name: ov.querySelector('#u_n').value.trim(), role: ov.querySelector('#u_r').value, title: ov.querySelector('#u_t').value.trim() };
          if (!o.name) return A.toast('Nom obligatoire', 'bad');
          if (id && u.role === 'Admin' && o.role !== 'Admin' && s.users.filter((x) => x.role === 'Admin').length < 2) return A.toast('Il doit rester au moins un administrateur', 'bad');
          A.closeModal(); A.Actions.upsert('users', o, 'Utilisateur');
        };
        const d = ov.querySelector('#del');
        if (d) d.onclick = () => {
          if (u.role === 'Admin' && s.users.filter((x) => x.role === 'Admin').length < 2) return A.toast('Il doit rester au moins un administrateur', 'bad');
          if (confirm('Supprimer cet utilisateur ?')) { A.closeModal(); A.Actions.remove('users', u.id, 'Utilisateur'); }
        };
      },
    });
  }

  window.Views = { dashboard, streams, gantt, logs, validations, data, settings, taskModal, logModal };
})();
