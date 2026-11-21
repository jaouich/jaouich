/* Rekordo Studio pour Pi Network : enregistrer (caméra + micro), monter, exporter en vidéo ou GIF.
   Tout se passe sur le téléphone ; rien n'est envoyé à un serveur. Created by Jaouich. */
(() => {
'use strict';

// ------------------------------------------------------------------ textes
const T = {
  en: {
    tagline: 'Created by Jaouich', signin: 'Sign in with Pi', hello: 'Hi @{u}', openPi: 'Open in Pi Browser to sign in',
    record: 'Record', recordSub: 'Camera and microphone', open: 'Open a video', openSub: 'From your phone',
    library: 'My videos', empty: 'Your recordings and exports will appear here. They stay on your phone.',
    androidT: 'Record your phone screen', androidP: 'Pi Browser cannot film the screen. Rekordo for Android can: screen, sound, camera bubble, drawing.', androidB: 'Get the Android app',
    privacy: 'Privacy', terms: 'Terms', back: 'Back', flip: 'Switch camera', camError: 'Camera or microphone not available: {e}',
    edit: 'Edit', export: 'Export', cut: 'Cut', crop: 'Crop', filters: 'Filters', adjust: 'Adjust', text: 'Text', music: 'Music', speed: 'Speed', sound: 'Sound', size: 'Size',
    start: 'Start', end: 'End', original: 'Original', bright: 'Brightness', contrast: 'Contrast', sat: 'Saturation',
    textHint: 'Text shown on the video', bottom: 'Bottom', top: 'Top', center: 'Center',
    musicPick: 'Choose music', musicChange: 'Change', remove: 'Remove', musicVol: 'Music', videoVol: 'Video sound', musicNote: 'Pick an audio file. It repeats if shorter than the video and fades out at the end.',
    speedNote: 'At a speed other than 1×, the video sound is removed.', keep: 'Keep sound', mute: 'Mute',
    cropNote: '9:16 for TikTok, Reels and Shorts · 1:1 for posts · 16:9 for YouTube', quality: 'Quality', low: 'Small', std: 'Standard', high: 'High',
    result: 'Result: {d} · ≈ {s}', exportVideo: 'Video', exportGif: 'Animated GIF (up to 15 s)', exporting: 'Creating…', exportNote: 'Keep this screen open. The video is played once to create the new file.',
    done: 'Done', share: 'Share', download: 'Save to phone', delete: 'Delete', deleteQ: 'Delete this file?', cancel: 'Cancel', play: 'Play', failed: 'Something went wrong: {e}',
    f: ['Original', 'B&W', 'Sepia', 'Vivid', 'Warm', 'Cool', 'Fade', 'Noir', 'Vintage'], noShare: 'Sharing is not available here. Use “Save to phone”.', saved: 'Saved',
  },
  fr: {
    tagline: 'Créé par Jaouich', signin: 'Se connecter avec Pi', hello: 'Salut @{u}', openPi: 'Ouvrez dans Pi Browser pour vous connecter',
    record: 'Enregistrer', recordSub: 'Caméra et micro', open: 'Ouvrir une vidéo', openSub: 'Depuis votre téléphone',
    library: 'Mes vidéos', empty: 'Vos enregistrements et exports apparaîtront ici. Ils restent sur votre téléphone.',
    androidT: "Filmer l'écran du téléphone", androidP: "Pi Browser ne peut pas filmer l'écran. Rekordo pour Android le fait : écran, son, bulle caméra, dessin.", androidB: "Obtenir l'appli Android",
    privacy: 'Confidentialité', terms: 'Conditions', back: 'Retour', flip: 'Changer de caméra', camError: 'Caméra ou micro indisponible : {e}',
    edit: 'Modifier', export: 'Exporter', cut: 'Couper', crop: 'Recadrer', filters: 'Filtres', adjust: 'Réglages', text: 'Texte', music: 'Musique', speed: 'Vitesse', sound: 'Son', size: 'Taille',
    start: 'Début', end: 'Fin', original: 'Original', bright: 'Luminosité', contrast: 'Contraste', sat: 'Saturation',
    textHint: 'Texte affiché sur la vidéo', bottom: 'Bas', top: 'Haut', center: 'Centre',
    musicPick: 'Choisir une musique', musicChange: 'Changer', remove: 'Retirer', musicVol: 'Musique', videoVol: 'Son de la vidéo', musicNote: "Choisissez un fichier audio. Il se répète s'il est plus court que la vidéo et baisse à la fin.",
    speedNote: 'À une vitesse autre que 1×, le son de la vidéo est retiré.', keep: 'Garder le son', mute: 'Couper le son',
    cropNote: '9:16 pour TikTok, Reels et Shorts · 1:1 pour les publications · 16:9 pour YouTube', quality: 'Qualité', low: 'Légère', std: 'Standard', high: 'Haute',
    result: 'Résultat : {d} · ≈ {s}', exportVideo: 'Vidéo', exportGif: 'GIF animé (15 s maximum)', exporting: 'Création…', exportNote: "Gardez cet écran ouvert. La vidéo est lue une fois pour créer le nouveau fichier.",
    done: 'Terminé', share: 'Partager', download: 'Enregistrer sur le téléphone', delete: 'Supprimer', deleteQ: 'Supprimer ce fichier ?', cancel: 'Annuler', play: 'Lire', failed: 'Un problème est survenu : {e}',
    f: ['Original', 'N&B', 'Sépia', 'Éclatant', 'Chaud', 'Froid', 'Délavé', 'Noir', 'Vintage'], noShare: 'Le partage n’est pas disponible ici. Utilisez « Enregistrer sur le téléphone ».', saved: 'Enregistré',
  },
  ar: {
    tagline: 'Created by Jaouich', signin: 'تسجيل الدخول بـ Pi', hello: 'مرحبًا @{u}', openPi: 'افتح التطبيق في Pi Browser لتسجيل الدخول',
    record: 'تسجيل', recordSub: 'الكاميرا والميكروفون', open: 'فتح فيديو', openSub: 'من هاتفك',
    library: 'فيديوهاتي', empty: 'ستظهر هنا تسجيلاتك والفيديوهات التي تصدّرها. تبقى على هاتفك.',
    androidT: 'تسجيل شاشة الهاتف', androidP: 'لا يستطيع Pi Browser تصوير الشاشة. تطبيق Rekordo لأندرويد يفعل ذلك: الشاشة والصوت وفقاعة الكاميرا والرسم.', androidB: 'تحميل تطبيق أندرويد',
    privacy: 'الخصوصية', terms: 'الشروط', back: 'رجوع', flip: 'تبديل الكاميرا', camError: 'الكاميرا أو الميكروفون غير متاح: {e}',
    edit: 'تعديل', export: 'تصدير', cut: 'قص', crop: 'الإطار', filters: 'فلاتر', adjust: 'ضبط', text: 'نص', music: 'موسيقى', speed: 'السرعة', sound: 'الصوت', size: 'الحجم',
    start: 'البداية', end: 'النهاية', original: 'الأصل', bright: 'الإضاءة', contrast: 'التباين', sat: 'التشبع',
    textHint: 'نص يظهر على الفيديو', bottom: 'أسفل', top: 'أعلى', center: 'الوسط',
    musicPick: 'اختر موسيقى', musicChange: 'تغيير', remove: 'إزالة', musicVol: 'الموسيقى', videoVol: 'صوت الفيديو', musicNote: 'اختر ملفًا صوتيًا. يتكرر إن كان أقصر من الفيديو ويخفت في النهاية.',
    speedNote: 'عند سرعة غير 1× يُحذف صوت الفيديو.', keep: 'الإبقاء على الصوت', mute: 'كتم الصوت',
    cropNote: '9:16 لتيك توك وريلز وشورتس · 1:1 للمنشورات · 16:9 ليوتيوب', quality: 'الجودة', low: 'خفيفة', std: 'عادية', high: 'عالية',
    result: 'النتيجة: {d} · ≈ {s}', exportVideo: 'فيديو', exportGif: 'صورة GIF متحركة (15 ثانية كحد أقصى)', exporting: 'جارٍ الإنشاء…', exportNote: 'أبقِ هذه الشاشة مفتوحة. يُشغَّل الفيديو مرة واحدة لإنشاء الملف الجديد.',
    done: 'تم', share: 'مشاركة', download: 'حفظ في الهاتف', delete: 'حذف', deleteQ: 'حذف هذا الملف؟', cancel: 'إلغاء', play: 'تشغيل', failed: 'حدث خطأ: {e}',
    f: ['الأصل', 'أبيض وأسود', 'بني قديم', 'زاهي', 'دافئ', 'بارد', 'باهت', 'نوار', 'عتيق'], noShare: 'المشاركة غير متاحة هنا. استعمل «حفظ في الهاتف».', saved: 'تم الحفظ',
  },
};
const FILTERS = ['', 'grayscale(1)', 'sepia(.85)', 'saturate(1.6) contrast(1.12)', 'sepia(.25) saturate(1.25) hue-rotate(-8deg)',
  'saturate(.9) hue-rotate(15deg) brightness(1.03)', 'saturate(.75) contrast(.8) brightness(1.08)', 'grayscale(1) contrast(1.45)', 'sepia(.4) saturate(.7) contrast(.9) brightness(1.05)'];
const CROPS = [0, 9 / 16, 1, 16 / 9, 4 / 5];
const CROP_LABELS = [null, '9:16', '1:1', '16:9', '4:5'];

let lang = (() => { try { return localStorage.getItem('lang'); } catch (e) { return null; } })()
  || ((navigator.language || 'en').slice(0, 2) === 'fr' ? 'fr' : (navigator.language || '').startsWith('ar') ? 'ar' : 'en');
const t = (k, v) => { let s = (T[lang] && T[lang][k]) || T.en[k] || k; if (v) for (const x in v) s = s.replace('{' + x + '}', v[x]); return s; };
let user = null;

// ------------------------------------------------------------------ outils
const $ = (sel, el = document) => el.querySelector(sel);
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v; else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const ICON = {
  back: '<path d="M14.5 5 7.5 12l7 7"/>', rec: '<circle cx="12" cy="12" r="7" fill="currentColor" stroke="none"/>',
  open: '<path d="M4 7.5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
  flip: '<path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2"/><path d="M20 4v4h-4M4 20v-4h4"/>',
  cut: '<circle cx="6.5" cy="17.5" r="2.8"/><circle cx="17.5" cy="17.5" r="2.8"/><path d="M8.5 15.5 17 4M15.5 15.5 7 4"/>',
  crop: '<path d="M7 3v14h14M3 7h14v14"/>', filter: '<circle cx="9" cy="10" r="5.5"/><circle cx="15" cy="10" r="5.5"/><circle cx="12" cy="15" r="5.5"/>',
  adjust: '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="7" cy="17" r="2" fill="currentColor"/>',
  text: '<path d="M5 6h14M12 6v13M9 19h6"/>', music: '<path d="M9 17.5v-12l10-2v12"/><circle cx="6.5" cy="17.5" r="2.6" fill="currentColor"/><circle cx="16.5" cy="15.5" r="2.6" fill="currentColor"/>',
  speed: '<path d="M4.5 17a8 8 0 1 1 15 0"/><path d="M12 13.5 16.5 8.5"/>', sound: '<path d="M4 9.5h4l4.5-4v13L8 14.5H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  size: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8.5 15.5l7-7M11.5 8.5h4v4"/>', share: '<circle cx="17" cy="6" r="2.5"/><circle cx="7" cy="12" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="M9.2 10.8l5.6-3.6M9.2 13.2l5.6 3.6"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13"/>', down: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>', play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
};
const svg = (k, size = 24) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.innerHTML = ICON[k]; return s; };
const fmt = (s) => { s = Math.max(0, Math.round(s)); return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const size = (b) => b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
function toast(msg) { const e = h('div', { class: 'toast', role: 'status' }, msg); document.body.append(e); setTimeout(() => e.remove(), 2800); }
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const extOf = (type) => type.includes('gif') ? 'gif' : type.includes('mp4') ? 'mp4' : 'webm';

// ------------------------------------------------------------------ bibliothèque (IndexedDB, sur le téléphone)
const DB = {
  db: null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((ok, ko) => {
      try {
        const r = indexedDB.open('rekordo', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' });
        r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
      } catch (e) { ko(e); }
    });
    return this.db;
  },
  async tx(mode, fn) { const db = await this.open(); return new Promise((ok, ko) => { const x = db.transaction('files', mode); const s = x.objectStore('files'); const r = fn(s); x.oncomplete = () => ok(r && r.result); x.onerror = () => ko(x.error); }); },
  async all() { try { const r = await this.tx('readonly', (s) => s.getAll()); return (r || []).sort((a, b) => b.date - a.date); } catch (e) { return []; } },
  async put(item) { try { await this.tx('readwrite', (s) => s.put(item)); } catch (e) { toast(t('failed', { e: e.message })); } },
  async del(id) { try { await this.tx('readwrite', (s) => s.delete(id)); } catch (e) {} },
};

async function thumbOf(blob) {
  if (blob.type.includes('gif')) return await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob.size < 1500000 ? blob : new Blob()); });
  const v = h('video', { muted: true, playsinline: true, preload: 'auto' });
  v.muted = true; v.src = URL.createObjectURL(blob);
  try {
    await fixDuration(v);
    v.currentTime = Math.min(0.5, (v.duration || 1) / 3);
    await once(v, 'seeked', 4000);
    const c = document.createElement('canvas'), k = 240 / Math.max(v.videoWidth, v.videoHeight, 1);
    c.width = Math.max(1, v.videoWidth * k); c.height = Math.max(1, v.videoHeight * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } catch (e) { return ''; } finally { URL.revokeObjectURL(v.src); }
}

async function saveToLibrary(blob, duration) {
  const item = { id: Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: 'Rekordo_' + stamp() + '.' + extOf(blob.type), type: blob.type, blob, date: Date.now(), duration: duration || 0, thumb: await thumbOf(blob) };
  await DB.put(item);
  return item;
}

function once(el, ev, ms) {
  return new Promise((ok, ko) => {
    const tm = ms ? setTimeout(() => { el.removeEventListener(ev, f); ko(new Error(ev + ' timeout')); }, ms) : null;
    const f = () => { clearTimeout(tm); el.removeEventListener(ev, f); ok(); };
    el.addEventListener(ev, f);
  });
}

/** Les vidéos de MediaRecorder n'ont pas de durée : on la force en allant à la fin. */
async function fixDuration(v) {
  if (v.readyState < 1) await once(v, 'loadedmetadata', 8000);
  if (v.duration === Infinity || isNaN(v.duration)) {
    v.currentTime = 1e7;
    await Promise.race([once(v, 'durationchange'), new Promise((r) => setTimeout(r, 3000))]);
    v.currentTime = 0;
    await Promise.race([once(v, 'seeked'), new Promise((r) => setTimeout(r, 2000))]);
  }
  return v.duration;
}

// ------------------------------------------------------------------ Pi
const inPi = /PiBrowser/i.test(navigator.userAgent);
function piInit() { try { if (window.Pi) window.Pi.init({ version: '2.0' }); } catch (e) {} }
async function signIn(silent) {
  if (!window.Pi) { if (!silent) toast(t('openPi')); return; }
  try {
    const auth = await Promise.race([
      window.Pi.authenticate(['username'], () => {}),
      new Promise((_, ko) => setTimeout(() => ko(new Error('timeout')), 20000)),
    ]);
    user = auth && auth.user ? auth.user.username : null;
    renderHome();
  } catch (e) { if (!silent) toast(inPi ? t('failed', { e: e.message }) : t('openPi')); }
}

// ------------------------------------------------------------------ accueil
const app = () => $('#app');
function setLang(l) { lang = l; try { localStorage.setItem('lang', l); } catch (e) {} document.documentElement.lang = l; document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'; }

async function renderHome() {
  const root = app();
  root.innerHTML = '';
  const langSel = h('select', { class: 'lang', 'aria-label': 'Language', onchange: (e) => { setLang(e.target.value); renderHome(); } },
    ...[['en', 'EN'], ['fr', 'FR'], ['ar', 'ع']].map(([v, l]) => { const o = h('option', { value: v }, l); if (v === lang) o.selected = true; return o; }));
  const who = user ? h('span', { class: 'chip pi' }, t('hello', { u: user })) : h('button', { class: 'chip pi', onclick: () => signIn(false) }, 'π ' + t('signin'));
  const file = h('input', { type: 'file', accept: 'video/*', hidden: true, onchange: (e) => { const f = e.target.files[0]; if (f) openEditor(f); } });
  const wrap = h('div', { class: 'wrap' },
    h('header', {}, h('img', { src: '/icon-192.png', alt: '' }), h('div', { class: 't' }, h('h1', {}, 'Rekordo Studio'), h('small', {}, t('tagline'))), langSel),
    h('div', { style: 'display:flex;justify-content:flex-end;margin:-4px 0 12px' }, who),
    h('div', { class: 'hero' },
      h('button', { class: 'big primary', onclick: openRecorder }, h('span', { class: 'ic' }, svg('rec', 30)), h('div', {}, h('b', {}, t('record')), h('span', {}, t('recordSub')))),
      h('button', { class: 'big', onclick: () => file.click() }, h('span', { class: 'ic alt' }, svg('open', 26)), h('div', {}, h('b', {}, t('open')), h('span', {}, t('openSub')))),
      file),
    h('h2', {}, t('library')),
    h('div', { id: 'lib' }),
    h('div', { class: 'android' }, h('span', { class: 'big', style: 'width:auto;padding:0;background:none' }, h('span', { class: 'ic alt', style: 'width:48px;height:48px' }, svg('phone'))),
      h('div', { style: 'flex:1;min-width:0' }, h('b', {}, t('androidT')), h('p', {}, t('androidP')),
        h('a', { class: 'btn primary', href: '/rekordo.apk', style: 'margin-top:8px;padding:8px 14px;font-size:14px' }, svg('down', 18), t('androidB')))),
    h('p', { class: 'foot' }, 'Rekordo Studio · ', t('tagline'), ' · ', h('a', { href: '/privacy.html' }, t('privacy')), ' · ', h('a', { href: '/terms.html' }, t('terms'))),
  );
  root.append(wrap);
  const items = await DB.all();
  const lib = $('#lib');
  if (!items.length) { lib.append(h('div', { class: 'empty' }, t('empty'))); return; }
  const g = h('div', { class: 'grid' });
  for (const it of items) {
    g.append(h('button', { class: 'item', onclick: () => showItem(it) },
      it.thumb ? h('img', { class: 'th', src: it.thumb, alt: it.name }) : h('div', { class: 'th' }),
      h('div', { class: 'meta' }, h('span', {}, it.type.includes('gif') ? 'GIF' : fmt(it.duration)), h('span', {}, size(it.blob.size)))));
  }
  lib.append(g);
}

function modal(content) {
  const m = h('div', { class: 'modal', onclick: (e) => { if (e.target === m) close(); } }, h('div', { class: 'sheet' }, content));
  const close = () => { m.remove(); m.dispatchEvent(new Event('closed')); };
  m.close = close;
  document.body.append(m);
  return m;
}

function shareOrDownload(blob, name, share) {
  const f = new File([blob], name, { type: blob.type });
  if (share) {
    if (navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: name }).catch(() => {}); return; }
    toast(t('noShare'));
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

function showItem(it) {
  const url = URL.createObjectURL(it.blob);
  const gif = it.type.includes('gif');
  const media = gif ? h('img', { src: url, alt: it.name }) : h('video', { src: url, controls: true, playsinline: true });
  const m = modal(h('div', { class: 'result', style: 'display:grid;gap:12px' },
    media,
    h('div', { class: 'chips' },
      h('button', { onclick: () => shareOrDownload(it.blob, it.name, true) }, t('share')),
      h('button', { onclick: () => shareOrDownload(it.blob, it.name, false) }, t('download'))),
    h('div', { class: 'chips' },
      gif ? null : h('button', { class: 'on', onclick: () => { m.close(); openEditor(it.blob); } }, t('edit')),
      h('button', { onclick: async () => { if (confirmBox()) { await DB.del(it.id); m.close(); renderHome(); } } }, t('delete')))));
  m.addEventListener('closed', () => URL.revokeObjectURL(url));
  let armed = false;
  function confirmBox() { if (armed) return true; armed = true; toast(t('deleteQ')); setTimeout(() => (armed = false), 3000); return false; }
}

// ------------------------------------------------------------------ enregistreur (caméra + micro)
async function openRecorder() {
  let facing = 'user', stream = null, rec = null, chunks = [], t0 = 0, tick = null;
  const video = h('video', { autoplay: true, playsinline: true, muted: true });
  video.muted = true;
  const timer = h('div', { class: 'timer' }, '0:00');
  const btn = h('button', { class: 'recbtn', 'aria-label': t('record'), onclick: toggle }, h('i'));
  const scr = h('div', { class: 'screen' },
    h('div', { class: 'bar' }, h('button', { class: 'icon back', 'aria-label': t('back'), onclick: close }, svg('back')), h('div', { class: 'title' }, t('record'))),
    h('div', { class: 'stage' }, video, timer),
    h('div', { class: 'recctl' }, h('span', { style: 'width:44px' }), btn, h('button', { class: 'icon', 'aria-label': t('flip'), onclick: flip }, svg('flip'))));
  document.body.append(scr);
  await start();

  async function start() {
    if (stream) stream.getTracks().forEach((x) => x.stop());
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: { echoCancellation: true, noiseSuppression: true } });
      video.srcObject = stream;
      video.style.transform = facing === 'user' ? 'scaleX(-1)' : '';
    } catch (e) { toast(t('camError', { e: e.message || e.name })); }
  }
  async function flip() { if (rec) return; facing = facing === 'user' ? 'environment' : 'user'; await start(); }
  function pickMime() {
    for (const m of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    return '';
  }
  function toggle() {
    if (!stream) return;
    if (!rec) {
      chunks = [];
      const mime = pickMime();
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 3_000_000 } : {});
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunks, { type: (rec.mimeType || 'video/webm').split(';')[0] });
        const dur = (Date.now() - t0) / 1000;
        rec = null;
        stop();
        scr.remove();
        await saveToLibrary(blob, dur);
        openEditor(blob, dur);
      };
      rec.start(1000);
      t0 = Date.now();
      btn.classList.add('on'); timer.classList.add('on');
      tick = setInterval(() => (timer.textContent = fmt((Date.now() - t0) / 1000)), 500);
    } else {
      rec.stop();
      clearInterval(tick);
    }
  }
  function stop() { if (stream) stream.getTracks().forEach((x) => x.stop()); stream = null; clearInterval(tick); }
  function close() { if (rec) { rec.onstop = null; rec.stop(); rec = null; } stop(); scr.remove(); renderHome(); }
}

// ------------------------------------------------------------------ éditeur
async function openEditor(blob, knownDur) {
  const url = URL.createObjectURL(blob);
  const video = h('video', { playsinline: true, preload: 'auto' });
  video.src = url;
  const S = { start: 0, end: 0, filter: 0, bright: 0, contrast: 0, sat: 0, text: '', textPos: 0, crop: 0, speed: 1, mute: false, music: null, musicName: '', musicVol: 80, origVol: 100, maxShort: 0, quality: 1, rotate: 0 };
  const canvas = h('canvas');
  const ctx = canvas.getContext('2d');
  let tool = 'cut';
  const panel = h('div', { class: 'panel' });
  const est = h('div', { class: 'est' });
  const pos = h('input', { type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'position' });
  const posT = h('span', {}, '0:00');
  const playBtn = h('button', { class: 'icon', 'aria-label': t('play'), onclick: () => (video.paused ? video.play() : video.pause()) }, svg('play'));
  const toolsBar = h('div', { class: 'tools', role: 'tablist' });
  const scr = h('div', { class: 'screen' },
    h('div', { class: 'bar' }, h('button', { class: 'icon back', 'aria-label': t('back'), onclick: close }, svg('back')), h('div', { class: 'title' }, t('edit')),
      h('button', { class: 'btn primary', onclick: exportMenu }, t('export'))),
    h('div', { class: 'stage', onclick: () => (video.paused ? video.play() : video.pause()) }, canvas),
    h('div', { class: 'scrub' }, playBtn, pos, posT),
    panel, est, toolsBar);
  document.body.append(scr);

  let dur = 0;
  try { dur = await fixDuration(video); } catch (e) {}
  if (!isFinite(dur) || !dur) dur = knownDur || 1;
  S.end = dur;
  video.currentTime = 0;

  const TOOLS = [['cut', 'cut'], ['crop', 'crop'], ['filters', 'filter'], ['adjust', 'adjust'], ['text', 'text'], ['music', 'music'], ['speed', 'speed'], ['sound', 'sound'], ['size', 'size']];
  for (const [k, ic] of TOOLS) toolsBar.append(h('button', { class: 'tool', 'data-k': k, role: 'tab', onclick: () => show(k) }, svg(ic, 22), t(k)));

  // ---- dessin d'une image (aperçu et export partagent le même code)
  function geom(vw, vh) {
    const r = ((S.rotate % 360) + 360) % 360, side = r % 180 !== 0;
    const dw = side ? vh : vw, dh = side ? vw : vh;
    let kw = 1, kh = 1;
    if (S.crop) { const target = CROPS[S.crop], cur = dw / dh; if (cur > target) kw = target / cur; else kh = cur / target; }
    return { r, dw, dh, cw: dw * kw, ch: dh * kh };
  }
  function filterStr() {
    const parts = [FILTERS[S.filter]];
    if (S.bright) parts.push(`brightness(${1 + S.bright / 100})`);
    if (S.contrast) parts.push(`contrast(${1 + S.contrast / 100})`);
    if (S.sat) parts.push(`saturate(${1 + S.sat / 100})`);
    return parts.filter(Boolean).join(' ') || 'none';
  }
  function draw(c, x, W, H, src) {
    const vw = src.videoWidth || W, vh = src.videoHeight || H, g = geom(vw, vh);
    const k = W / g.cw;
    x.save();
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    x.filter = filterStr();
    x.translate(W / 2, H / 2);
    x.rotate(g.r * Math.PI / 180);
    x.scale(k, k);
    x.drawImage(src, -vw / 2, -vh / 2, vw, vh);
    x.restore();
    if (S.text.trim()) {
      const fs = Math.max(12, Math.min(W, H) * 0.07);
      x.save();
      x.font = `700 ${fs}px system-ui, sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineJoin = 'round'; x.lineWidth = fs * 0.16; x.strokeStyle = 'rgba(0,0,0,.85)'; x.fillStyle = '#fff';
      const lines = wrapText(x, S.text, W * 0.9);
      const lh = fs * 1.2, total = lines.length * lh;
      let y = S.textPos === 1 ? H * 0.06 + lh / 2 : S.textPos === 2 ? H / 2 - total / 2 + lh / 2 : H - H * 0.07 - total + lh / 2;
      for (const l of lines) { x.strokeText(l, W / 2, y); x.fillText(l, W / 2, y); y += lh; }
      x.restore();
    }
  }
  function wrapText(x, s, max) {
    const out = [];
    for (const para of s.split('\n')) {
      let line = '';
      for (const w of para.split(' ')) { const tr = line ? line + ' ' + w : w; if (x.measureText(tr).width > max && line) { out.push(line); line = w; } else line = tr; }
      out.push(line);
    }
    return out.slice(0, 4);
  }
  function previewSize() {
    const g = geom(video.videoWidth || 16, video.videoHeight || 9), k = 720 / Math.max(g.cw, g.ch);
    canvas.width = Math.round(g.cw * k); canvas.height = Math.round(g.ch * k);
  }
  function paint() { previewSize(); draw(canvas, ctx, canvas.width, canvas.height, video); }

  let raf = 0;
  function loop() {
    paint();
    pos.value = Math.round(video.currentTime / dur * 1000);
    posT.textContent = fmt(video.currentTime);
    if (!video.paused && video.currentTime >= S.end) { video.pause(); video.currentTime = S.start; }
    if (!video.paused) raf = requestAnimationFrame(loop);
  }
  video.addEventListener('play', () => { playBtn.innerHTML = ''; playBtn.append(pauseIcon()); if (video.currentTime < S.start || video.currentTime >= S.end) video.currentTime = S.start; raf = requestAnimationFrame(loop); });
  video.addEventListener('pause', () => { playBtn.innerHTML = ''; playBtn.append(svg('play')); cancelAnimationFrame(raf); });
  video.addEventListener('seeked', () => loop());
  video.addEventListener('loadeddata', () => loop());
  pos.addEventListener('input', () => { video.currentTime = pos.value / 1000 * dur; });
  function pauseIcon() { const s = svg('play'); s.innerHTML = '<rect x="6.5" y="5" width="4" height="14" rx="1.5" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1.5" fill="currentColor" stroke="none"/>'; return s; }

  // ---- panneaux
  function chips(labels, values, cur, set, note) {
    const box = h('div', {});
    const row = h('div', { class: 'chips' });
    labels.forEach((l, i) => row.append(h('button', { class: values[i] === cur ? 'on' : '', onclick: (e) => { set(values[i]); [...row.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); update(); } }, l)));
    box.append(row);
    if (note) box.append(h('p', { class: 'note' }, note));
    return box;
  }
  function slider(label, min, max, val, set, unit = '') {
    const out = h('output', {}, val + unit);
    const r = h('input', { type: 'range', min, max, value: val, 'aria-label': label, oninput: (e) => { set(+e.target.value); out.textContent = e.target.value + unit; update(); } });
    return h('div', { class: 'row' }, h('label', {}, label), r, out);
  }
  function show(k) {
    tool = k;
    [...toolsBar.children].forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    panel.innerHTML = '';
    if (k === 'cut') {
      const lab = h('div', { style: 'font-weight:600' });
      const s = h('input', { type: 'range', min: 0, max: 1000, value: Math.round(S.start / dur * 1000), 'aria-label': t('start') });
      const e = h('input', { type: 'range', min: 0, max: 1000, value: Math.round(S.end / dur * 1000), 'aria-label': t('end') });
      const upd = () => (lab.textContent = `${fmt(S.start)} → ${fmt(S.end)}`);
      s.oninput = () => { S.start = Math.min(s.value / 1000 * dur, S.end - 0.5); if (S.start < 0) S.start = 0; video.currentTime = S.start; upd(); update(); };
      e.oninput = () => { S.end = Math.max(e.value / 1000 * dur, S.start + 0.5); if (S.end > dur) S.end = dur; video.currentTime = S.end; upd(); update(); };
      upd();
      panel.append(lab, h('div', { class: 'row' }, h('label', {}, t('start')), s), h('div', { class: 'row' }, h('label', {}, t('end')), e));
    } else if (k === 'crop') {
      panel.append(chips([t('original'), ...CROP_LABELS.slice(1)], [0, 1, 2, 3, 4], S.crop, (v) => (S.crop = v), t('cropNote')));
      panel.append(h('div', { class: 'chips', style: 'margin-top:10px' }, h('button', { onclick: () => { S.rotate = (S.rotate + 90) % 360; update(); } }, '↻ 90°')));
    } else if (k === 'filters') {
      const row = h('div', { class: 'filters' });
      T[lang].f.forEach((name, i) => {
        const c = h('canvas', { width: 64, height: 64 });
        const x = c.getContext('2d');
        try { x.filter = FILTERS[i] || 'none'; const vw = video.videoWidth || 1, vh = video.videoHeight || 1, kk = 64 / Math.min(vw, vh); x.drawImage(video, (64 - vw * kk) / 2, (64 - vh * kk) / 2, vw * kk, vh * kk); } catch (e) {}
        row.append(h('button', { class: S.filter === i ? 'on' : '', onclick: () => { S.filter = i; update(); show('filters'); } }, c, name));
      });
      panel.append(row);
    } else if (k === 'adjust') {
      panel.append(slider(t('bright'), -100, 100, S.bright, (v) => (S.bright = v)), slider(t('contrast'), -100, 100, S.contrast, (v) => (S.contrast = v)), slider(t('sat'), -100, 100, S.sat, (v) => (S.sat = v)));
    } else if (k === 'text') {
      const ta = h('textarea', { class: 'txt', rows: 2, placeholder: t('textHint'), oninput: (e) => { S.text = e.target.value; update(); } });
      ta.value = S.text;
      panel.append(ta, chips([t('bottom'), t('top'), t('center')], [0, 1, 2], S.textPos, (v) => (S.textPos = v)));
    } else if (k === 'music') {
      const f = h('input', { type: 'file', accept: 'audio/*', hidden: true, onchange: (e) => { const x = e.target.files[0]; if (x) { S.music = x; S.musicName = x.name; show('music'); update(); } } });
      const row = h('div', { class: 'row' }, h('button', { class: 'btn ' + (S.music ? '' : 'primary'), onclick: () => f.click() }, svg('music', 18), S.music ? t('musicChange') : t('musicPick')), f);
      if (S.music) row.append(h('span', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px' }, '♪ ' + S.musicName), h('button', { style: 'color:var(--accent);font-weight:600', onclick: () => { S.music = null; show('music'); update(); } }, t('remove')));
      panel.append(row);
      if (S.music) panel.append(slider(t('musicVol'), 0, 100, S.musicVol, (v) => (S.musicVol = v), '%'), slider(t('videoVol'), 0, 100, S.origVol, (v) => (S.origVol = v), '%'));
      else panel.append(h('p', { class: 'note' }, t('musicNote')));
    } else if (k === 'speed') {
      panel.append(chips(['0.5×', '1×', '1.5×', '2×'], [0.5, 1, 1.5, 2], S.speed, (v) => (S.speed = v), t('speedNote')));
    } else if (k === 'sound') {
      panel.append(chips([t('keep'), t('mute')], [false, true], S.mute, (v) => (S.mute = v)));
    } else if (k === 'size') {
      panel.append(chips([t('original'), '720p', '480p', '360p'], [0, 720, 480, 360], S.maxShort, (v) => (S.maxShort = v)));
      panel.append(h('p', { class: 'note' }, t('quality')), chips([t('low'), t('std'), t('high')], [0, 1, 2], S.quality, (v) => (S.quality = v)));
    }
    update();
  }
  function outSize() {
    const g = geom(video.videoWidth || 1280, video.videoHeight || 720);
    let w = g.cw, hh = g.ch;
    const cap = S.maxShort || 720;   // les navigateurs encodent mal au-dessus de 720p
    const sh = Math.min(w, hh);
    if (sh > cap) { const k = cap / sh; w *= k; hh *= k; }
    return [Math.max(2, Math.round(w / 2) * 2), Math.max(2, Math.round(hh / 2) * 2)];
  }
  const bitrate = (w, hh) => Math.max(600_000, Math.min(6_000_000, w * hh * 30 * [0.05, 0.09, 0.14][S.quality]));
  function update() {
    paint();
    const [w, hh] = outSize(), len = (S.end - S.start) / S.speed;
    est.textContent = t('result', { d: fmt(len), s: size((bitrate(w, hh) + 128000) * len / 8) });
  }
  show(tool);
  video.addEventListener('loadedmetadata', update);
  setTimeout(update, 300);

  function close() { video.pause(); cancelAnimationFrame(raf); URL.revokeObjectURL(url); scr.remove(); renderHome(); }

  // ---- export
  function exportMenu() {
    video.pause();
    const m = modal(h('div', { style: 'display:grid;gap:10px' }, h('h3', {}, t('export')),
      h('button', { class: 'btn primary', onclick: () => { m.close(); exportVideo(); } }, t('exportVideo')),
      h('button', { class: 'btn', onclick: () => { m.close(); exportGif(); } }, t('exportGif')),
      h('button', { class: 'btn', onclick: () => m.close() }, t('cancel'))));
  }
  function progressBox() {
    const bar = h('i'), pct = h('span', {}, '0 %');
    let cancelled = false;
    const m = modal(h('div', { style: 'display:grid;gap:12px' }, h('h3', {}, t('exporting')), h('div', { class: 'progress' }, bar), pct, h('p', {}, t('exportNote')),
      h('button', { class: 'btn', onclick: () => { cancelled = true; m.close(); } }, t('cancel'))));
    return { set: (f) => { bar.style.width = Math.round(f * 100) + '%'; pct.textContent = Math.round(f * 100) + ' %'; }, close: () => m.close(), get cancelled() { return cancelled; } };
  }

  async function exportVideo() {
    const p = progressBox();
    let wake = null;
    try { wake = await navigator.wakeLock?.request('screen'); } catch (e) {}
    const src = h('video', { playsinline: true, preload: 'auto' });
    src.src = url;
    const out = h('canvas'); const [W, H] = outSize(); out.width = W; out.height = H;
    const x = out.getContext('2d');
    let ac = null, musicEl = null, rec = null;
    try {
      await fixDuration(src);
      const stream = out.captureStream(30);
      const keepOrig = !S.mute && S.speed === 1 && (S.origVol > 0 || !S.music);
      if (keepOrig || S.music) {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const dest = ac.createMediaStreamDestination();
        if (keepOrig) { const g = ac.createGain(); g.gain.value = S.music ? S.origVol / 100 : 1; ac.createMediaElementSource(src).connect(g).connect(dest); }
        else src.muted = true;
        if (S.music) {
          musicEl = h('audio', { loop: true, preload: 'auto' }); musicEl.src = URL.createObjectURL(S.music);
          const g = ac.createGain(); g.gain.value = S.musicVol / 100;
          ac.createMediaElementSource(musicEl).connect(g).connect(dest);
          const len = (S.end - S.start) / S.speed, now = ac.currentTime;
          if (len > 3) { g.gain.setValueAtTime(S.musicVol / 100, now + len - 2); g.gain.linearRampToValueAtTime(0, now + len); }
        }
        dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
      } else src.muted = true;
      let mime = '';
      for (const m of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
        if (MediaRecorder.isTypeSupported(m)) { mime = m; break; }
      rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: bitrate(W, H), audioBitsPerSecond: 128000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise((r) => (rec.onstop = r));
      src.currentTime = S.start;
      await once(src, 'seeked', 5000);
      draw(out, x, W, H, src);
      src.playbackRate = S.speed;
      if (ac && ac.state === 'suspended') await ac.resume();
      rec.start(500);
      await src.play();
      if (musicEl) await musicEl.play().catch(() => {});
      await new Promise((resolve) => {
        const step = () => {
          if (p.cancelled) return resolve();
          draw(out, x, W, H, src);
          p.set(Math.min(1, (src.currentTime - S.start) / (S.end - S.start)));
          if (src.currentTime >= S.end || src.ended) return resolve();
          if (src.requestVideoFrameCallback) src.requestVideoFrameCallback(step); else requestAnimationFrame(step);
        };
        step();
        src.addEventListener('ended', resolve, { once: true });
      });
      src.pause(); if (musicEl) musicEl.pause();
      rec.stop();
      await stopped;
      if (p.cancelled) return;
      const blob = new Blob(chunks, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] });
      const item = await saveToLibrary(blob, (S.end - S.start) / S.speed);
      p.close();
      done(item);
    } catch (e) {
      p.close();
      toast(t('failed', { e: e.message || e }));
    } finally {
      try { wake && wake.release(); } catch (e) {}
      try { ac && ac.close(); } catch (e) {}
      if (musicEl) URL.revokeObjectURL(musicEl.src);
    }
  }

  async function exportGif() {
    const p = progressBox();
    const src = h('video', { playsinline: true, preload: 'auto', muted: true }); src.muted = true; src.src = url;
    try {
      await fixDuration(src);
      const g = geom(src.videoWidth, src.videoHeight);
      const k = Math.min(1, 400 / Math.max(g.cw, g.ch), 320 / Math.min(g.cw, g.ch));
      const W = Math.max(2, Math.round(g.cw * k)), H = Math.max(2, Math.round(g.ch * k));
      const c = h('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true });
      const gw = new window.GifWriter(W, H);
      const end = Math.min(S.end, S.start + 15 * S.speed), step = 0.1 * S.speed;
      const n = Math.max(1, Math.floor((end - S.start) / step));
      for (let i = 0; i < n; i++) {
        if (p.cancelled) return;
        src.currentTime = S.start + i * step;
        await once(src, 'seeked', 5000).catch(() => {});
        draw(c, x, W, H, src);
        gw.frame(x.getImageData(0, 0, W, H).data, 10);
        p.set((i + 1) / n);
        if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
      }
      const blob = gw.finish();
      const item = await saveToLibrary(blob, n / 10);
      p.close();
      done(item);
    } catch (e) { p.close(); toast(t('failed', { e: e.message || e })); }
  }

  function done(item) {
    const u = URL.createObjectURL(item.blob);
    const gif = item.type.includes('gif');
    const m = modal(h('div', { class: 'result', style: 'display:grid;gap:12px' },
      h('h3', {}, '✓ ' + t('done')),
      gif ? h('img', { src: u, alt: item.name }) : h('video', { src: u, controls: true, playsinline: true }),
      h('p', {}, item.name + ' · ' + size(item.blob.size)),
      h('div', { class: 'chips' },
        h('button', { class: 'on', onclick: () => shareOrDownload(item.blob, item.name, true) }, t('share')),
        h('button', { onclick: () => shareOrDownload(item.blob, item.name, false) }, t('download')))));
    m.addEventListener('closed', () => URL.revokeObjectURL(u));
  }
}

// ------------------------------------------------------------------ démarrage
setLang(lang);
piInit();
renderHome();
if (inPi) signIn(true);
})();
