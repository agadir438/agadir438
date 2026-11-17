/* Import / export Excel (SheetJS) – compatible avec le classeur de suivi « Suivi_Logs_Splunk.xlsx »
   et tolérant aux fichiers Excel existants (inventaire de logs, planning Gantt par stream). */
(function () {
  'use strict';
  const A = window.App;
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%]/g, '');

  const MAPS = {
    logs: {
      id: ['idlog', 'id', 'ref', 'reference', 'identifiant', 'idsource'],
      application: ['application', 'appli', 'app', 'nomapplication', 'applicatif', 'solution'],
      streamId: ['idstream', 'streamid', 'codestream'],
      streamName: ['stream', 'nomstream', 'domaine', 'lot', 'perimetre'],
      type: ['typedelog', 'typelog', 'type', 'categorie', 'typesource'],
      source: ['sourcechemin', 'source', 'chemin', 'path', 'fichier', 'sourcelog', 'emplacement', 'cheminlog', 'sourcedelog'],
      method: ['methodedecollecte', 'methodecollecte', 'collecte', 'methode', 'modecollecte', 'modedecollecte', 'input'],
      index: ['indexsplunk', 'index', 'indexcible'],
      sourcetype: ['sourcetype', 'st'],
      hosts: ['hotes', 'hote', 'host', 'hosts', 'serveur', 'serveurs', 'machine'],
      format: ['format', 'formatlog'],
      volume: ['volumemoj', 'volume', 'volumetrie', 'volumejour', 'volumemo', 'volumetriemoj'],
      retention: ['retentionj', 'retention', 'dureeretention'],
      criticity: ['criticite', 'criticity', 'priorite', 'sensibilite'],
      cim: ['conformitecim', 'cim', 'datamodel'],
      status: ['statutonboarding', 'statut', 'status', 'etat', 'avancementonboarding'],
      owner: ['responsable', 'owner', 'porteur', 'referent'],
      taskId: ['tacheliee', 'idtache'],
      validation: ['validation', 'statutvalidation'],
      validatedBy: ['validepar', 'validateur'],
      validatedOn: ['datevalidation', 'validele'],
      comment: ['commentaire', 'commentaires', 'remarques', 'remarque', 'notes'],
    },
    tasks: {
      id: ['idtache', 'id', 'ref', 'wbs'],
      streamId: ['idstream', 'streamid', 'codestream'],
      streamName: ['stream', 'nomstream', 'lot', 'domaine'],
      name: ['tache', 'libelle', 'nomtache', 'activite', 'task', 'taches', 'nomdelatache', 'action', 'jalon'],
      step: ['netape', 'etape', 'numetape', 'phase'],
      owner: ['responsable', 'owner', 'porteur', 'ressource', 'assigne'],
      start: ['debut', 'datedebut', 'start', 'datededebut', 'debutprevu'],
      end: ['fin', 'datefin', 'end', 'echeance', 'datedefin', 'finprevue'],
      progress: ['%avancement', 'avancement', 'progression', '%', '%realise', 'progress', 'realise'],
      validation: ['validation', 'statutvalidation'],
      validatedBy: ['validepar', 'validateur'],
      validatedOn: ['datevalidation'],
      comment: ['commentaire', 'commentaires', 'remarques'],
    },
    streams: {
      id: ['idstream', 'id', 'code'],
      name: ['stream', 'nom', 'nomstream', 'libelle'],
      owner: ['responsable', 'owner', 'porteur'],
      validator: ['validateur', 'validator'],
      color: ['couleur', 'color'],
    },
    validations: {
      streamId: ['idstream', 'streamid'],
      step: ['netape', 'numetape', 'etapen'],
      status: ['statut', 'status'],
      validatedBy: ['validepar'],
      validatedOn: ['datevalidation'],
      comment: ['commentairemotifderejet', 'commentaire', 'motif'],
    },
    history: {
      date: ['dateheure', 'date'], user: ['utilisateur', 'user'], type: ['objet'], ref: ['reference'], action: ['action'], comment: ['commentaire'],
    },
  };

  function sheetKind(name) {
    const n = norm(name);
    if (['listes', 'guide', 'tableaudebord', 'synthese', 'readme'].includes(n)) return 'skip';
    if (n.includes('historique') || n.includes('journal')) return 'history';
    if (n.includes('validation')) return 'validations';
    if (n.includes('stream') && !n.includes('gantt') && !n.includes('planning')) return 'streams';
    if (n.includes('tache') || n.includes('gantt') || n.includes('planning') || n.includes('planif') || n.includes('task')) return 'tasks';
    if (n.includes('log') || n.includes('inventaire') || n.includes('source')) return 'logs';
    return null;
  }

  function findHeader(rows, map) {
    let best = { idx: -1, score: 0, cols: {} };
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const cols = {};
      let score = 0;
      (rows[i] || []).forEach((h, j) => {
        const n = norm(h);
        if (!n) return;
        for (const [k, aliases] of Object.entries(map)) {
          if (cols[k] == null && aliases.includes(n)) { cols[k] = j; score++; break; }
        }
      });
      if (score > best.score) best = { idx: i, score, cols };
    }
    return best;
  }

  function toIso(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return A.isoDate(new Date(v.getTime() + 12 * 3600e3));
    if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400e3)); return A.isoDate(new Date(d.getTime() + 12 * 3600e3)); }
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`; }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : '';
  }
  function toPct(v) {
    if (v == null || v === '') return 0;
    let n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.').replace('%', ''));
    if (isNaN(n)) return 0;
    if (n > 1) n /= 100;
    return Math.max(0, Math.min(1, n));
  }
  const str = (v) => (v == null ? '' : v instanceof Date ? A.isoDate(v) : String(v).trim());

  /** Analyse un classeur et renvoie les objets détectés (sans modifier l'état). */
  function parseWorkbook(wb, state) {
    const res = { streams: [], validations: [], tasks: [], logs: [], history: [], report: [] };
    wb.SheetNames.forEach((name) => {
      const ws = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      let kind = sheetKind(name);
      if (kind === 'skip') { res.report.push({ sheet: name, kind: null, rows: 0, cols: [] }); return; }
      // détection par en-têtes si le nom n'est pas parlant
      let best = null;
      if (!kind) {
        for (const k of ['logs', 'tasks']) {
          const h = findHeader(rows, MAPS[k]);
          if (h.score >= 3 && (!best || h.score > best.h.score)) best = { k, h };
        }
        if (!best) { res.report.push({ sheet: name, kind: null, rows: 0, cols: [] }); return; }
        kind = best.k;
      }
      const h = best ? best.h : findHeader(rows, MAPS[kind]);
      if (h.score < 2) { res.report.push({ sheet: name, kind: null, rows: 0, cols: [] }); return; }
      const get = (r, k) => (h.cols[k] != null ? r[h.cols[k]] : null);
      let groupStream = '';
      let count = 0;
      for (let i = h.idx + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        if (!r.some((x) => x != null && String(x).trim() !== '')) continue;
        if (kind === 'logs') {
          const app = str(get(r, 'application')); const src = str(get(r, 'source'));
          if (!app && !src) continue;
          res.logs.push({
            id: str(get(r, 'id')), application: app || src, streamId: str(get(r, 'streamId')), streamName: str(get(r, 'streamName')),
            type: str(get(r, 'type')), source: src, method: str(get(r, 'method')), index: str(get(r, 'index')), sourcetype: str(get(r, 'sourcetype')),
            hosts: str(get(r, 'hosts')), format: str(get(r, 'format')), volume: Number(get(r, 'volume')) || 0, retention: Number(get(r, 'retention')) || '',
            criticity: str(get(r, 'criticity')), cim: str(get(r, 'cim')), status: str(get(r, 'status')), owner: str(get(r, 'owner')), taskId: str(get(r, 'taskId')),
            validation: str(get(r, 'validation')), validatedBy: str(get(r, 'validatedBy')), validatedOn: toIso(get(r, 'validatedOn')), comment: str(get(r, 'comment')),
          });
          count++;
        } else if (kind === 'tasks') {
          const nm = str(get(r, 'name'));
          if (!nm) continue;
          const start = toIso(get(r, 'start')); const end = toIso(get(r, 'end'));
          const sid = str(get(r, 'streamId')); const sname = str(get(r, 'streamName'));
          // ligne de regroupement (stream) dans un Gantt sans colonne stream
          if (!start && !end && !sid && !sname) { groupStream = nm; continue; }
          res.tasks.push({
            id: str(get(r, 'id')), streamId: sid, streamName: sname || groupStream, name: nm, stepRaw: get(r, 'step'),
            owner: str(get(r, 'owner')), start: start || end, end: end || start, progress: toPct(get(r, 'progress')),
            validation: str(get(r, 'validation')), validatedBy: str(get(r, 'validatedBy')), validatedOn: toIso(get(r, 'validatedOn')), comment: str(get(r, 'comment')),
          });
          count++;
        } else if (kind === 'streams') {
          const id = str(get(r, 'id')); const nm = str(get(r, 'name'));
          if (!id && !nm) continue;
          res.streams.push({ id, name: nm || id, owner: str(get(r, 'owner')), validator: str(get(r, 'validator')), color: str(get(r, 'color')) });
          count++;
        } else if (kind === 'validations') {
          const sid = str(get(r, 'streamId')); const n = Number(get(r, 'step'));
          if (!sid || !n) continue;
          res.validations.push({ streamId: sid, step: n, status: str(get(r, 'status')) || 'À faire', validatedBy: str(get(r, 'validatedBy')), validatedOn: toIso(get(r, 'validatedOn')), comment: str(get(r, 'comment')) });
          count++;
        } else if (kind === 'history') {
          if (!get(r, 'action')) continue;
          let d = get(r, 'date');
          d = d instanceof Date ? A.isoDate(d) + 'T00:00:00' : String(d || '').replace(' ', 'T');
          res.history.push({ date: d, user: str(get(r, 'user')), type: str(get(r, 'type')), ref: str(get(r, 'ref')), action: str(get(r, 'action')), comment: str(get(r, 'comment')) });
          count++;
        }
      }
      res.report.push({ sheet: name, kind, rows: count, cols: Object.keys(h.cols) });
    });
    return res;
  }

  const PALETTE = ['#2563eb', '#7c3aed', '#0891b2', '#db2777', '#dc2626', '#16a34a', '#ea580c', '#0d9488', '#4f46e5', '#ca8a04'];

  /** Fusionne (ou remplace) les données importées dans l'état s. */
  function applyImport(s, parsed, mode) {
    const kinds = ['streams', 'validations', 'tasks', 'logs', 'history'].filter((k) => parsed[k].length);
    if (mode === 'replace') {
      kinds.forEach((k) => { s[k] = []; });
      if (kinds.includes('streams')) { if (!kinds.includes('validations')) s.validations = []; if (!kinds.includes('tasks')) s.tasks = []; if (!kinds.includes('logs')) s.logs = []; }
    }
    const resolveStream = (id, name) => {
      if (id && s.streams.some((x) => x.id === id)) return id;
      if (name) {
        const f = s.streams.find((x) => norm(x.name) === norm(name) || norm(x.id) === norm(name));
        if (f) return f.id;
      }
      if (!id && !name) return s.streams[0] ? s.streams[0].id : resolveStream('', 'Stream par défaut');
      const nid = id || A.nextId('ST', s.streams, 2);
      s.streams.push({ id: nid, name: name || nid, owner: '', validator: '', color: PALETTE[s.streams.length % PALETTE.length] });
      A.ensureValidations(s, nid);
      return nid;
    };
    parsed.streams.forEach((st) => {
      if (!st.id) st.id = A.nextId('ST', s.streams, 2);
      const i = s.streams.findIndex((x) => x.id === st.id);
      const obj = { ...st, color: st.color || (i >= 0 ? s.streams[i].color : PALETTE[s.streams.length % PALETTE.length]) };
      if (i >= 0) s.streams[i] = { ...s.streams[i], ...obj }; else s.streams.push(obj);
    });
    parsed.validations.forEach((v) => {
      if (!s.streams.some((x) => x.id === v.streamId)) return;
      const i = s.validations.findIndex((x) => x.streamId === v.streamId && x.step === v.step);
      if (i >= 0) s.validations[i] = v; else s.validations.push(v);
    });
    s.streams.forEach((st) => A.ensureValidations(s, st.id));
    parsed.tasks.forEach((t) => {
      const streamId = resolveStream(t.streamId, t.streamName);
      let step = Number(t.stepRaw);
      if (!step && t.stepRaw) { const f = s.steps.find((x) => norm(x.name).includes(norm(t.stepRaw)) || norm(t.stepRaw).includes(norm(x.name))); step = f ? f.n : 0; }
      if (!step) { const f = s.steps.find((x) => norm(t.name).includes(norm(x.name.split(' ')[0]))); step = f ? f.n : s.steps[0].n; }
      const obj = { id: t.id || A.nextId('T', s.tasks), streamId, step, name: t.name, owner: t.owner, start: t.start, end: t.end, progress: t.progress,
        validation: A.C.VALID_STATUSES.includes(t.validation) ? t.validation : 'Non soumise', validatedBy: t.validatedBy, validatedOn: t.validatedOn, comment: t.comment };
      const i = s.tasks.findIndex((x) => x.id === obj.id);
      if (i >= 0) s.tasks[i] = obj; else s.tasks.push(obj);
    });
    parsed.logs.forEach((l) => {
      const streamId = resolveStream(l.streamId, l.streamName);
      const st = s.logStatuses.find((x) => norm(x.name) === norm(l.status)) || s.logStatuses.find((x) => l.status && norm(x.name).startsWith(norm(l.status).slice(0, 5)));
      const { streamName, ...rest } = l;
      const obj = { ...rest, id: l.id || A.nextId('LOG', s.logs), streamId, status: st ? st.name : s.logStatuses[0].name,
        criticity: A.C.CRITICITIES.find((c) => norm(c) === norm(l.criticity)) || l.criticity || 'Moyenne',
        validation: A.C.VALID_STATUSES.includes(l.validation) ? l.validation : 'Non soumise' };
      const i = s.logs.findIndex((x) => x.id === obj.id);
      if (i >= 0) s.logs[i] = obj; else s.logs.push(obj);
    });
    if (parsed.history.length) {
      const keys = new Set(s.history.map((h) => h.date + h.ref + h.action));
      parsed.history.forEach((h) => { if (!keys.has(h.date + h.ref + h.action)) s.history.push(h); });
      s.history.sort((a, b) => (a.date < b.date ? 1 : -1));
    }
    return A.normalize(s);
  }

  // ------------------------------------------------------------ export
  function sheet(rows, widths) {
    const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true, dateNF: 'dd/mm/yyyy' });
    ws['!cols'] = widths.map((w) => ({ wch: w }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length - 1, 1), c: rows[0].length - 1 } }) };
    return ws;
  }
  const D = (s) => (s ? A.parseD(s) : null);

  function exportWorkbook(s) {
    const wb = XLSX.utils.book_new();
    const g = A.globalStats(s);
    const synth = [
      ['Synthèse – ' + (s.meta.project || 'Suivi logs Splunk')], ['Export du', new Date()], [],
      ['Indicateur', 'Valeur'],
      ['Streams', g.streams], ['Streams validés', g.streamsValidated], ['Avancement global tâches', g.taskPct], ['Avancement workflow validation', g.wfPct],
      ['Tâches', g.tasks], ['Tâches terminées', g.tasksDone], ['Tâches en retard', g.late], ['Validations en attente', g.pending],
      ['Logs inventoriés', g.logs], ['Logs validés', g.logsValidated], ['Avancement onboarding logs', g.logsPct], ['Volume total (Mo/j)', g.volume],
      [], ['Stream', 'Étapes validées', '% workflow', 'Étape courante', 'Avancement tâches', 'Nb logs', '% logs', 'Tâches en retard', 'Statut'],
      ...s.streams.map((st) => { const x = A.streamStats(st, s); return [st.name, `${x.validated}/${x.total}`, x.pctWf, x.cur ? `${x.cur.step} – ${A.stepByN(x.cur.step, s).name}` : 'Stream validé', x.taskPct, x.logs, x.logsPct, x.late, x.status]; }),
    ];
    XLSX.utils.book_append_sheet(wb, sheet(synth, [34, 16, 12, 36, 14, 10, 10, 12, 18]), 'Synthèse');
    XLSX.utils.book_append_sheet(wb, sheet([
      ['ID stream', 'Stream', 'Responsable', 'Validateur', 'Couleur', 'Début', 'Fin', 'Étapes validées', 'Étape courante', 'Statut stream'],
      ...s.streams.map((st) => { const x = A.streamStats(st, s); return [st.id, st.name, st.owner, st.validator, st.color, D(x.start), D(x.end), x.validated, x.cur ? A.stepByN(x.cur.step, s).name : 'Validé', x.status]; }),
    ], [10, 28, 18, 18, 10, 12, 12, 12, 32, 18]), 'Streams');
    XLSX.utils.book_append_sheet(wb, sheet([
      ['ID stream', 'Stream', 'N° étape', 'Étape', 'Critères de passage', 'Statut', 'Validé par', 'Date validation', 'Commentaire / motif de rejet'],
      ...s.validations.slice().sort((a, b) => (a.streamId === b.streamId ? a.step - b.step : a.streamId < b.streamId ? -1 : 1)).map((v) => {
        const st = A.streamById(v.streamId, s) || {}; const sp = A.stepByN(v.step, s) || {};
        return [v.streamId, st.name, v.step, sp.name, sp.criteria, v.status, v.validatedBy, D(v.validatedOn), v.comment];
      }),
    ], [10, 26, 8, 32, 50, 12, 18, 13, 40]), 'Validations');
    XLSX.utils.book_append_sheet(wb, sheet([
      ['ID tâche', 'ID stream', 'Stream', 'Tâche', 'N° étape', 'Responsable', 'Début', 'Fin', '% avancement', 'Statut', 'Validation', 'Validé par', 'Date validation', 'Commentaire'],
      ...s.tasks.map((t) => [t.id, t.streamId, (A.streamById(t.streamId, s) || {}).name, t.name, t.step, t.owner, D(t.start), D(t.end), t.progress, A.taskStatus(t), t.validation, t.validatedBy, D(t.validatedOn), t.comment]),
    ], [9, 9, 22, 44, 7, 17, 11, 11, 10, 12, 12, 16, 12, 28]), 'Tâches');
    XLSX.utils.book_append_sheet(wb, sheet([
      ['ID log', 'Application', 'ID stream', 'Stream', 'Type de log', 'Source / chemin', 'Méthode de collecte', 'Index Splunk', 'Sourcetype', 'Hôte(s)', 'Format', 'Volume (Mo/j)', 'Rétention (j)', 'Criticité', 'Conformité CIM', 'Statut onboarding', '% avancement', 'Responsable', 'Tâche liée', 'Validation', 'Validé par', 'Date validation', 'Commentaire'],
      ...s.logs.map((l) => [l.id, l.application, l.streamId, (A.streamById(l.streamId, s) || {}).name, l.type, l.source, l.method, l.index, l.sourcetype, l.hosts, l.format, l.volume, l.retention, l.criticity, l.cim, l.status, A.logPct(l, s), l.owner, l.taskId, l.validation, l.validatedBy, D(l.validatedOn), l.comment]),
    ], [9, 22, 9, 22, 12, 32, 20, 14, 18, 15, 16, 10, 9, 10, 11, 20, 10, 16, 9, 12, 16, 12, 28]), 'Logs');
    XLSX.utils.book_append_sheet(wb, sheet([
      ['Date / heure', 'Utilisateur', 'Objet', 'Référence', 'Action', 'Commentaire'],
      ...s.history.map((h) => [String(h.date).replace('T', ' ').slice(0, 16), h.user, h.type, h.ref, h.action, h.comment]),
    ], [18, 18, 16, 26, 12, 70]), 'Historique');
    // formats % pour les colonnes concernées
    const fmtCol = (name, col) => { const ws = wb.Sheets[name]; const r = XLSX.utils.decode_range(ws['!ref']); for (let i = 1; i <= r.e.r; i++) { const c = ws[XLSX.utils.encode_cell({ r: i, c: col })]; if (c && typeof c.v === 'number') c.z = '0%'; } };
    fmtCol('Tâches', 8); fmtCol('Logs', 16);
    XLSX.writeFile(wb, `Suivi_Logs_Splunk_${A.todayIso()}.xlsx`, { cellDates: true });
  }

  function downloadJson(s) {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `suivi_logs_splunk_${A.todayIso()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  window.ExcelIO = { parseWorkbook, applyImport, exportWorkbook, downloadJson, norm };
})();
