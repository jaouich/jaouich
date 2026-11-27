// =================================================================== prospects : magazine de la direction
// Inséré dans app.js (portée de l'IIFE : h, api, layout, t, toast, confirmBox, go, ic, S, T, syncNow, admin sont disponibles).
Object.assign(T.fr, {
  prospects: 'Prospects', prNew: 'Nouveau', prSearch: 'Rechercher une société, une ville…', prAll: 'Tous', prCount: '{n} prospect(s)',
  prStatus_new: 'Nouveaux', prStatus_seen: 'Vus', prStatus_contacted: 'Contactés', prStatus_converted: 'Fiches créées', prStatus_archived: 'Archivés',
  prTag_distribution: 'Distribution / commerce', prTag_new_company: 'Société récente / nouvelle agence', prTag_accounting: 'Cabinet comptable', prTag_sage: 'Utilisateur Sage',
  prSource: 'Source', prSeen: 'Marquer vu', prContacted: 'Contacté', prConvert: 'Créer la fiche', prConvertQ: 'Créer une fiche prospect pour « {n} » dans le CRM ?', prConverted: 'Fiche prospect créée',
  prArchive: 'Archiver', prRestore: 'Remettre en nouveau', prMarkAll: 'Tout marquer comme vu', prEmpty: 'Aucun prospect pour le moment.', prEmptyHelp: 'Les prospects trouvés apparaissent ici, du plus récent au plus ancien.',
  permProspects: 'Peut voir le magazine des prospects',
});
Object.assign(T.ar, {
  prospects: 'الزبناء المحتملون', prNew: 'جديد', prSearch: 'ابحث عن شركة أو مدينة…', prAll: 'الكل', prCount: '{n} زبون محتمل',
  prStatus_new: 'جديدة', prStatus_seen: 'تمت مشاهدتها', prStatus_contacted: 'تم الاتصال', prStatus_converted: 'ملفات منشأة', prStatus_archived: 'مؤرشفة',
  prTag_distribution: 'توزيع / تجارة', prTag_new_company: 'شركة حديثة / فرع جديد', prTag_accounting: 'مكتب محاسبة', prTag_sage: 'مستخدم Sage',
  prSource: 'المصدر', prSeen: 'تمت المشاهدة', prContacted: 'تم الاتصال', prConvert: 'إنشاء ملف', prConvertQ: 'هل تنشئ ملف زبون محتمل لـ «{n}» في النظام؟', prConverted: 'تم إنشاء الملف',
  prArchive: 'أرشفة', prRestore: 'إعادة إلى الجديدة', prMarkAll: 'تعليم الكل كمشاهد', prEmpty: 'لا يوجد زبناء محتملون حاليًا.', prEmptyHelp: 'تظهر هنا الشركات التي نجدها، من الأحدث إلى الأقدم.',
  permProspects: 'يمكنه رؤية مجلة الزبناء المحتملين',
});
Object.assign(T.en, {
  prospects: 'Prospects', prNew: 'New', prSearch: 'Search a company or a city…', prAll: 'All', prCount: '{n} prospect(s)',
  prStatus_new: 'New', prStatus_seen: 'Seen', prStatus_contacted: 'Contacted', prStatus_converted: 'Records created', prStatus_archived: 'Archived',
  prTag_distribution: 'Distribution / trade', prTag_new_company: 'New company / new branch', prTag_accounting: 'Accounting firm', prTag_sage: 'Sage user',
  prSource: 'Source', prSeen: 'Mark seen', prContacted: 'Contacted', prConvert: 'Create record', prConvertQ: 'Create a prospect record for "{n}" in the CRM?', prConverted: 'Prospect record created',
  prArchive: 'Archive', prRestore: 'Move back to new', prMarkAll: 'Mark all as seen', prEmpty: 'No prospects yet.', prEmptyHelp: 'Prospects we find appear here, newest first.',
  permProspects: 'Can see the prospects magazine',
});
(() => {
  const st = document.createElement('style');
  st.textContent = '.pr-pill{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:38px;min-height:38px;padding:0 8px;border-radius:99px;background:var(--soft);color:var(--fg);text-decoration:none;gap:4px;font-weight:700}'
    + '.pr-pill b{background:var(--red);color:#fff;border-radius:99px;font-size:11px;min-width:18px;height:18px;line-height:18px;text-align:center;padding:0 4px}'
    + '.pr-day{margin:18px 0 8px;font-size:13px;text-transform:capitalize;color:var(--muted);font-weight:800}'
    + '.pr-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:10px}'
    + '.pr-card.is-new{border-inline-start:5px solid var(--blue)}'
    + '.pr-top{display:flex;gap:8px;align-items:center;justify-content:space-between}'
    + '.pr-top b{font-size:16px;overflow-wrap:anywhere}'
    + '.pr-signal{margin:8px 0;line-height:1.5}'
    + '.pr-act{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}'
    + '.pr-act .btn{min-height:36px;padding:6px 12px;font-size:13px}'
    + '.pr-chips{display:flex;gap:6px;overflow-x:auto;margin:10px 0;padding-bottom:4px}';
  document.head.append(st);
})();

const PR = { q: '', status: '', tag: '', count: 0, at: 0 };
const PR_TAGS = ['distribution', 'new_company', 'accounting', 'sage'];
const PR_ST = ['new', 'seen', 'contacted', 'converted', 'archived'];
function paintPrBadge() {
  document.querySelectorAll('.pr-pill').forEach((a) => {
    const old = a.querySelector('b'); if (old) old.remove();
    if (PR.count > 0) a.append(h('b', {}, String(PR.count > 99 ? '99+' : PR.count)));
  });
}
async function refreshPrCount() {
  if (!canProspects() || Date.now() - PR.at < 60000) return;
  PR.at = Date.now();
  try { const d = await api('GET', '/api/prospects?limit=1'); PR.count = (d.counts && d.counts.new) || 0; paintPrBadge(); } catch (e) {}
}
function prospectsBtn() {
  if (!canProspects()) return null;
  refreshPrCount();
  return h('a', { class: 'pr-pill', href: '#/prospects', 'aria-label': t('prospects'), title: t('prospects') }, ic('spark', 18), PR.count > 0 ? h('b', {}, String(PR.count > 99 ? '99+' : PR.count)) : null);
}
async function viewProspects() {
  layout(t('prospects'), h('p', { class: 'muted' }, t('loading')));
  const qs = new URLSearchParams({ limit: '200' });
  for (const k of ['q', 'status', 'tag']) if (PR[k]) qs.set(k, PR[k]);
  let d;
  try { d = await api('GET', '/api/prospects?' + qs.toString()); }
  catch (e) { layout(t('prospects'), h('div', { class: 'empty' }, e.status === 0 ? t('offlineAdmin') : t('error', { e: e.message }))); return; }
  PR.count = (d.counts && d.counts.new) || 0; PR.at = Date.now();
  const reload = () => viewProspects();
  const setStatus = async (x, status) => {
    try { await api('POST', '/api/prospects/' + x.id + '/status', { status }); reload(); } catch (e) { toast(t('error', { e: e.message })); }
  };
  const convert = async (x) => {
    if (!(await confirmBox(t('prConvertQ', { n: x.company }), t('prConvert')))) return;
    try { const r = await api('POST', '/api/prospects/' + x.id + '/convert'); toast(t('prConverted')); await syncNow(true); go('#/client/' + r.client_id); }
    catch (e) { toast(t('error', { e: e.message })); }
  };
  const chip = (label, on, fn) => h('button', { class: 'chip' + (on ? ' on' : ''), onclick: fn }, label);
  const total = Object.values(d.counts || {}).reduce((a, b) => a + b, 0);
  const search = h('input', { class: 'input', type: 'search', placeholder: t('prSearch'), value: PR.q, 'aria-label': t('prSearch'),
    onchange: (e) => { PR.q = e.target.value.trim(); reload(); } });
  const stChips = h('div', { class: 'pr-chips' }, chip(t('prAll') + ' (' + total + ')', !PR.status, () => { PR.status = ''; reload(); }),
    ...PR_ST.filter((s) => (d.counts || {})[s]).map((s) => chip(t('prStatus_' + s) + ' (' + d.counts[s] + ')', PR.status === s, () => { PR.status = s; reload(); })));
  const tagChips = h('div', { class: 'pr-chips' }, chip(t('prAll'), !PR.tag, () => { PR.tag = ''; reload(); }),
    ...PR_TAGS.map((g) => chip(t('prTag_' + g), PR.tag === g, () => { PR.tag = g; reload(); })));
  const dayLabel = (ts) => new Date(ts).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const list = [];
  let lastDay = '';
  for (const x of d.items) {
    const day = dayLabel(x.created_at);
    if (day !== lastDay) { list.push(h('h3', { class: 'pr-day' }, day)); lastDay = day; }
    const href = /^https?:\/\//i.test(x.source_url || '') ? x.source_url : null;
    const acts = [];
    if (x.status === 'new') acts.push(h('button', { class: 'btn ghost', onclick: () => setStatus(x, 'seen') }, t('prSeen')));
    if (x.status !== 'contacted' && x.status !== 'converted') acts.push(h('button', { class: 'btn ghost', onclick: () => setStatus(x, 'contacted') }, t('prContacted')));
    if (x.status !== 'converted') acts.push(h('button', { class: 'btn primary', onclick: () => convert(x) }, t('prConvert')));
    else if (x.client_id) acts.push(h('a', { class: 'btn ghost', href: '#/client/' + x.client_id }, t('prStatus_converted')));
    acts.push(x.status === 'archived' ? h('button', { class: 'btn ghost', onclick: () => setStatus(x, 'new') }, t('prRestore')) : h('button', { class: 'btn ghost', onclick: () => setStatus(x, 'archived') }, t('prArchive')));
    list.push(h('article', { class: 'pr-card' + (x.status === 'new' ? ' is-new' : '') },
      h('div', { class: 'pr-top' }, h('b', {}, x.company), x.status === 'new' ? h('span', { class: 'badge b-planned' }, t('prNew')) : h('span', { class: 'badge b-muted' }, t('prStatus_' + x.status))),
      h('div', { class: 'small muted' }, [x.city, x.sector, x.tag ? t('prTag_' + x.tag) : null].filter(Boolean).join(' · ')),
      x.signal ? h('p', { class: 'pr-signal' }, x.signal) : null,
      x.contact ? h('p', { class: 'small' }, x.contact) : null,
      href ? h('a', { class: 'small', href, target: '_blank', rel: 'noopener noreferrer' }, t('prSource') + ' : ' + (x.source_name || href.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0])) : (x.source_name ? h('span', { class: 'small muted' }, t('prSource') + ' : ' + x.source_name) : null),
      h('div', { class: 'pr-act' }, ...acts)));
  }
  const right = (d.counts && d.counts.new) ? h('button', { class: 'btn ghost', onclick: async () => { try { await api('POST', '/api/prospects/seen-all'); reload(); } catch (e) { toast(t('error', { e: e.message })); } } }, t('prMarkAll')) : null;
  layout(t('prospects'), h('div', {}, search, stChips, tagChips,
    list.length ? h('p', { class: 'small muted' }, t('prCount', { n: d.items.length })) : null,
    list.length ? list : h('div', { class: 'empty' }, h('b', {}, t('prEmpty')), h('p', { class: 'small muted' }, t('prEmptyHelp'))),
    right ? h('div', { style: 'margin-top:12px' }, right) : null));
  paintPrBadge();
}

