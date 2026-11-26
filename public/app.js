/* Magiscom Terrain — application des commerciaux et tableau de bord de la direction.
   Fonctionne hors ligne : tout est enregistré sur le téléphone puis envoyé dès que le réseau revient. */
(() => {
'use strict';

// =================================================================== textes
const T = {
  fr: {
    fullName: 'Nom complet', newSheet: 'Nouvelle fiche', setupCode: 'Code de mise en service', clients: 'Clients', agenda: 'Agenda', map: 'Carte', me: 'Moi', dashboard: 'Tableau de bord', team: 'Commerciaux', export: 'Export Excel', journal: 'Journal', settings: 'Réglages', newClient: 'Nouveau',
    login: 'Identifiant', password: 'Mot de passe', signIn: 'Se connecter', setupT: 'Première configuration', setupP: 'Créez le compte du responsable (administrateur).', company: 'Société', yourName: 'Votre nom', create: 'Créer', phone: 'Téléphone',
    search: 'Rechercher : nom, code, ville, téléphone…', all: 'Tous', client: 'Client', prospect: 'Prospect', clientsN: '{n} fiche(s)', none: 'Aucune fiche pour le moment.', noneSearch: 'Aucun résultat.',
    located: 'Localisé', notLocated: 'Pas encore localisé', lastVisit: 'Dernière visite : {d}', neverVisited: 'Jamais visité', owner: 'Commercial', allOwners: 'Tous les commerciaux', city: 'Ville', allCities: 'Toutes les villes',
    call: 'Appeler', whatsapp: 'WhatsApp', route: 'Itinéraire', edit: 'Modifier', infos: 'Infos', visits: 'Visites', documents: 'Documents',
    geoHere: 'Enregistrer la position ici', geoUpdate: 'Mettre à jour la position', geoSaved: 'Position enregistrée (précision {m} m)', geoTitle: 'Position du client', geoNone: 'Position non enregistrée', geoHint: 'Sur place, touchez le bouton pour enregistrer l’emplacement exact.', geoWait: 'Recherche de la position…', geoErr: 'Position indisponible : activez la localisation du téléphone. ({e})', geoConfirm: 'Vous êtes chez le client ? La position actuelle remplacera l’ancienne.', geoPoor: 'Précision faible ({m} m). Sortez à l’extérieur et réessayez si possible.', openMaps: 'Ouvrir dans Google Maps',
    code: 'Code', codeAuto: 'Automatique', name: 'Nom / Raison sociale', kind: 'Type', contact: 'Personne à contacter', phone2: 'Téléphone 2', email: 'E-mail', address: 'Adresse', sector: 'Secteur d’activité', ice: 'ICE', notes: 'Notes', save: 'Enregistrer', cancel: 'Annuler', delete: 'Supprimer', createdBy: 'Créé par {u} le {d}', required: 'Champ obligatoire',
    newVisit: 'Compte-rendu de visite', newRdv: 'Planifier un rendez-vous', visite: 'Visite', rdv: 'Rendez-vous', appel: 'Appel', planned: 'Prévu', done: 'Fait', cancelled: 'Annulé', date: 'Date et heure', status: 'Statut',
    agreed: 'Ce qui a été convenu', notDone: 'Ce qui n’a pas été fait', demands: 'Demandes du client', nextStep: 'Prochaine étape', nextDate: 'Prochain rendez-vous', agreedPh: 'Ex. : devis pour 10 filtres, livraison mardi', notDonePh: 'Ex. : pas de décision pour les pneus', demandsPh: 'Ex. : plaquettes Bosch, catalogue 2027', checkIn: 'Position de la visite enregistrée', noVisits: 'Aucune visite enregistrée.', by: 'par {u}',
    addPhoto: 'Photo', addVideo: 'Vidéo', addFile: 'Fichier', category: 'Catégorie', photo: 'Photo', video: 'Vidéo', document: 'Document', devis: 'Devis', noDocs: 'Aucun document. Photographiez le local, les pièces demandées, ou joignez un devis.', pending: 'en attente', tooBig: 'Fichier trop lourd (4 Go maximum)',
    today: 'Aujourd’hui', upcoming: 'À venir', overdue: 'En retard', recent: 'Visites récentes', nothingPlanned: 'Aucun rendez-vous prévu.', markDone: 'Faire le compte-rendu',
    syncOk: 'À jour', syncing: 'Envoi…', offline: 'Hors ligne', toSend: '{n} à envoyer', syncErr: 'Erreur d’envoi', lastSync: 'Dernière synchronisation : {d}', syncNow: 'Synchroniser maintenant', savedOffline: 'Enregistré sur le téléphone, envoi dès que le réseau revient', saved: 'Enregistré',
    language: 'Langue', changePw: 'Changer le mot de passe', currentPw: 'Mot de passe actuel', newPw: 'Nouveau mot de passe (8 caractères minimum)', logout: 'Se déconnecter', mustChange: 'Choisissez votre propre mot de passe avant de continuer.', install: 'Installer l’application', installHelp: 'Android : menu ⋮ du navigateur › « Ajouter à l’écran d’accueil ». iPhone : bouton Partager › « Sur l’écran d’accueil ».', failedOps: 'Éléments refusés par le serveur', retry: 'Réessayer', discard: 'Abandonner',
    kpiClients: 'Clients', kpiProspects: 'Prospects', kpiVisits7: 'Visites (7 jours)', kpiVisits30: 'Visites (30 jours)', kpiPlanned: 'RDV à venir', kpiLocated: 'Fiches localisées', kpiFiles: 'Documents', kpiNew: 'Nouvelles fiches (30 j)', visits30: 'Visites par jour (30 derniers jours)', perUser: 'Activité par commercial', topCities: 'Villes', lastSeen: 'Vu', lastVisitCol: 'Dernière visite', files: 'Fichiers',
    addUser: 'Ajouter un utilisateur', role: 'Rôle', admin: 'Administrateur', commercial: 'Commercial', active: 'Actif', disabled: 'Désactivé', scopeAll: 'Voit toutes les fiches de la société', scopeOwn: 'Voit seulement ses fiches', permEdit: 'Peut modifier toutes les fiches visibles', permExport: 'Peut exporter vers Excel', tempPw: 'Mot de passe provisoire', tempPwHelp: 'Communiquez-le à la personne. Elle devra le changer à la première connexion.', resetPw: 'Nouveau mot de passe', transfer: 'Transférer son portefeuille', transferTo: 'Transférer tous ses clients vers', transferDone: '{n} fiche(s) transférée(s)', disable: 'Désactiver', enable: 'Réactiver', disableQ: 'Désactiver ce compte ? La personne ne pourra plus se connecter. Ses fiches restent dans la base.',
    expClients: 'Clients et prospects', expVisits: 'Visites et comptes-rendus', from: 'Du', to: 'Au', download: 'Télécharger (.xlsx)', expHelp: 'Le fichier s’ouvre dans Excel, Google Sheets ou LibreOffice.',
    companyName: 'Nom de la société', prefixC: 'Préfixe des codes clients', prefixP: 'Préfixe des codes prospects',
    mapAll: 'Fiches', mapDay: 'Tournée du jour', dayOf: 'Jour', noGeo: 'Aucune fiche localisée pour ces filtres.', openSheet: 'Ouvrir la fiche',
    loadMore: 'Afficher plus', reassignOwner: 'Commercial responsable', deleteQ: 'Supprimer cette fiche ? Elle sera masquée (récupérable par l’administrateur).', deleted: 'Supprimé', confirm: 'Confirmer', loading: 'Chargement…', error: 'Erreur : {e}', offlineAdmin: 'Connexion nécessaire pour cette page.',
    a_login: 'Connexion', a_setup: 'Configuration', 'a_client.create': 'Fiche créée', 'a_client.update': 'Fiche modifiée', 'a_client.geo': 'Position enregistrée', 'a_client.kind': 'Type changé', 'a_client.reassign': 'Fiches transférées', 'a_client.delete': 'Fiche supprimée', 'a_visit.create': 'Compte-rendu', 'a_visit.plan': 'RDV planifié', 'a_visit.update': 'Visite modifiée', 'a_visit.delete': 'Visite supprimée', 'a_file.upload': 'Document ajouté', 'a_file.delete': 'Document supprimé', 'a_export.clients': 'Export clients', 'a_export.visits': 'Export visites', 'a_user.create': 'Utilisateur créé', 'a_user.update': 'Utilisateur modifié', 'a_user.disable': 'Utilisateur désactivé', 'a_user.password_reset': 'Mot de passe réinitialisé', 'a_settings.update': 'Réglages',
  },
  ar: {
    fullName: 'الاسم الكامل', newSheet: 'ملف جديد', setupCode: 'رمز التفعيل', clients: 'الزبناء', agenda: 'المواعيد', map: 'الخريطة', me: 'حسابي', dashboard: 'لوحة القيادة', team: 'المناديب', export: 'تصدير Excel', journal: 'السجل', settings: 'الإعدادات', newClient: 'جديد',
    login: 'اسم المستخدم', password: 'كلمة المرور', signIn: 'تسجيل الدخول', setupT: 'الإعداد الأول', setupP: 'أنشئ حساب المسؤول (المدير).', company: 'الشركة', yourName: 'اسمك', create: 'إنشاء', phone: 'الهاتف',
    search: 'بحث: الاسم، الرمز، المدينة، الهاتف…', all: 'الكل', client: 'زبون', prospect: 'زبون محتمل', clientsN: '{n} ملف', none: 'لا توجد ملفات بعد.', noneSearch: 'لا نتائج.',
    located: 'محدد الموقع', notLocated: 'الموقع غير مسجل', lastVisit: 'آخر زيارة: {d}', neverVisited: 'لم تتم زيارته', owner: 'المندوب', allOwners: 'كل المناديب', city: 'المدينة', allCities: 'كل المدن',
    call: 'اتصال', whatsapp: 'واتساب', route: 'الطريق', edit: 'تعديل', infos: 'المعلومات', visits: 'الزيارات', documents: 'الوثائق',
    geoHere: 'سجّل الموقع هنا', geoUpdate: 'تحديث الموقع', geoSaved: 'تم تسجيل الموقع (الدقة {m} م)', geoTitle: 'موقع الزبون', geoNone: 'الموقع غير مسجل', geoHint: 'عند وصولك إلى الزبون اضغط الزر لتسجيل الموقع بدقة.', geoWait: 'جارٍ تحديد الموقع…', geoErr: 'الموقع غير متاح: فعّل تحديد الموقع في الهاتف. ({e})', geoConfirm: 'هل أنت عند الزبون؟ سيعوض الموقع الحالي الموقع القديم.', geoPoor: 'الدقة ضعيفة ({m} م). اخرج إلى الخارج وأعد المحاولة إن أمكن.', openMaps: 'فتح في خرائط Google',
    code: 'الرمز', codeAuto: 'تلقائي', name: 'الاسم / الاسم التجاري', kind: 'النوع', contact: 'الشخص المسؤول', phone2: 'هاتف 2', email: 'البريد الإلكتروني', address: 'العنوان', sector: 'النشاط', ice: 'ICE', notes: 'ملاحظات', save: 'حفظ', cancel: 'إلغاء', delete: 'حذف', createdBy: 'أنشأه {u} في {d}', required: 'حقل إلزامي',
    newVisit: 'تقرير زيارة', newRdv: 'تحديد موعد', visite: 'زيارة', rdv: 'موعد', appel: 'مكالمة', planned: 'مبرمج', done: 'تم', cancelled: 'ملغى', date: 'التاريخ والساعة', status: 'الحالة',
    agreed: 'ما تم الاتفاق عليه', notDone: 'ما لم يتم إنجازه', demands: 'طلبات الزبون', nextStep: 'الخطوة التالية', nextDate: 'الموعد القادم', agreedPh: 'مثال: عرض سعر لـ 10 فلاتر، التسليم يوم الثلاثاء', notDonePh: 'مثال: لم يُحسم أمر العجلات', demandsPh: 'مثال: صفائح فرامل Bosch، كتالوج 2027', checkIn: 'تم تسجيل موقع الزيارة', noVisits: 'لا توجد زيارات.', by: 'بواسطة {u}',
    addPhoto: 'صورة', addVideo: 'فيديو', addFile: 'ملف', category: 'الفئة', photo: 'صورة', video: 'فيديو', document: 'وثيقة', devis: 'عرض سعر', noDocs: 'لا توجد وثائق. صوّر المحل أو القطع المطلوبة، أو أرفق عرض سعر.', pending: 'في الانتظار', tooBig: 'الملف ثقيل جدًا (4 جيغا كحد أقصى)',
    today: 'اليوم', upcoming: 'القادمة', overdue: 'متأخرة', recent: 'آخر الزيارات', nothingPlanned: 'لا توجد مواعيد.', markDone: 'كتابة التقرير',
    syncOk: 'محدّث', syncing: 'جارٍ الإرسال…', offline: 'بدون إنترنت', toSend: '{n} للإرسال', syncErr: 'خطأ في الإرسال', lastSync: 'آخر مزامنة: {d}', syncNow: 'مزامنة الآن', savedOffline: 'تم الحفظ في الهاتف، سيُرسل عند عودة الإنترنت', saved: 'تم الحفظ',
    language: 'اللغة', changePw: 'تغيير كلمة المرور', currentPw: 'كلمة المرور الحالية', newPw: 'كلمة المرور الجديدة (8 أحرف على الأقل)', logout: 'تسجيل الخروج', mustChange: 'اختر كلمة مرور خاصة بك قبل المتابعة.', install: 'تثبيت التطبيق', installHelp: 'أندرويد: قائمة ⋮ في المتصفح › «إضافة إلى الشاشة الرئيسية». آيفون: زر المشاركة › «إضافة إلى الشاشة الرئيسية».', failedOps: 'عناصر رفضها الخادم', retry: 'إعادة المحاولة', discard: 'تجاهل',
    kpiClients: 'الزبناء', kpiProspects: 'المحتملون', kpiVisits7: 'زيارات (7 أيام)', kpiVisits30: 'زيارات (30 يومًا)', kpiPlanned: 'مواعيد قادمة', kpiLocated: 'ملفات بموقع', kpiFiles: 'الوثائق', kpiNew: 'ملفات جديدة (30 يومًا)', visits30: 'الزيارات اليومية (آخر 30 يومًا)', perUser: 'نشاط المناديب', topCities: 'المدن', lastSeen: 'آخر ظهور', lastVisitCol: 'آخر زيارة', files: 'الملفات',
    addUser: 'إضافة مستخدم', role: 'الدور', admin: 'مدير', commercial: 'مندوب', active: 'نشط', disabled: 'معطّل', scopeAll: 'يرى كل ملفات الشركة', scopeOwn: 'يرى ملفاته فقط', permEdit: 'يمكنه تعديل كل الملفات المرئية', permExport: 'يمكنه التصدير إلى Excel', tempPw: 'كلمة مرور مؤقتة', tempPwHelp: 'أعطها للشخص، وسيغيرها عند أول دخول.', resetPw: 'كلمة مرور جديدة', transfer: 'نقل محفظته', transferTo: 'نقل كل زبنائه إلى', transferDone: 'تم نقل {n} ملف', disable: 'تعطيل', enable: 'إعادة التفعيل', disableQ: 'تعطيل هذا الحساب؟ لن يتمكن من الدخول. تبقى ملفاته في القاعدة.',
    expClients: 'الزبناء والمحتملون', expVisits: 'الزيارات والتقارير', from: 'من', to: 'إلى', download: 'تحميل (.xlsx)', expHelp: 'يفتح الملف في Excel أو Google Sheets أو LibreOffice.',
    companyName: 'اسم الشركة', prefixC: 'بادئة رموز الزبناء', prefixP: 'بادئة رموز المحتملين',
    mapAll: 'الملفات', mapDay: 'جولة اليوم', dayOf: 'اليوم', noGeo: 'لا توجد ملفات بموقع لهذه الاختيارات.', openSheet: 'فتح الملف',
    loadMore: 'عرض المزيد', reassignOwner: 'المندوب المسؤول', deleteQ: 'حذف هذا الملف؟ سيُخفى (يمكن للمدير استرجاعه).', deleted: 'تم الحذف', confirm: 'تأكيد', loading: 'جارٍ التحميل…', error: 'خطأ: {e}', offlineAdmin: 'هذه الصفحة تحتاج إلى الإنترنت.',
  },
  en: {
    fullName: 'Full name', newSheet: 'New record', setupCode: 'Setup code', clients: 'Clients', agenda: 'Agenda', map: 'Map', me: 'Me', dashboard: 'Dashboard', team: 'Sales reps', export: 'Excel export', journal: 'Activity log', settings: 'Settings', newClient: 'New',
    login: 'Username', password: 'Password', signIn: 'Sign in', setupT: 'First setup', setupP: 'Create the manager (administrator) account.', company: 'Company', yourName: 'Your name', create: 'Create', phone: 'Phone',
    search: 'Search: name, code, city, phone…', all: 'All', client: 'Client', prospect: 'Prospect', clientsN: '{n} record(s)', none: 'No records yet.', noneSearch: 'No results.',
    located: 'Located', notLocated: 'Not located yet', lastVisit: 'Last visit: {d}', neverVisited: 'Never visited', owner: 'Sales rep', allOwners: 'All reps', city: 'City', allCities: 'All cities',
    call: 'Call', whatsapp: 'WhatsApp', route: 'Directions', edit: 'Edit', infos: 'Details', visits: 'Visits', documents: 'Documents',
    geoHere: 'Save location here', geoUpdate: 'Update location', geoSaved: 'Location saved (accuracy {m} m)', geoTitle: 'Client location', geoNone: 'Location not saved', geoHint: 'When you are at the client, tap the button to save the exact spot.', geoWait: 'Finding your location…', geoErr: 'Location unavailable: turn on location on the phone. ({e})', geoConfirm: 'Are you at the client? The current position will replace the old one.', geoPoor: 'Low accuracy ({m} m). Step outside and try again if you can.', openMaps: 'Open in Google Maps',
    code: 'Code', codeAuto: 'Automatic', name: 'Name / Company name', kind: 'Type', contact: 'Contact person', phone2: 'Phone 2', email: 'Email', address: 'Address', sector: 'Business sector', ice: 'ICE', notes: 'Notes', save: 'Save', cancel: 'Cancel', delete: 'Delete', createdBy: 'Created by {u} on {d}', required: 'Required',
    newVisit: 'Visit report', newRdv: 'Schedule an appointment', visite: 'Visit', rdv: 'Appointment', appel: 'Call', planned: 'Planned', done: 'Done', cancelled: 'Cancelled', date: 'Date and time', status: 'Status',
    agreed: 'What was agreed', notDone: 'What was not done', demands: 'Client requests', nextStep: 'Next step', nextDate: 'Next appointment', agreedPh: 'E.g. quote for 10 filters, delivery Tuesday', notDonePh: 'E.g. no decision on tyres', demandsPh: 'E.g. Bosch brake pads, 2027 catalogue', checkIn: 'Visit location saved', noVisits: 'No visits yet.', by: 'by {u}',
    addPhoto: 'Photo', addVideo: 'Video', addFile: 'File', category: 'Category', photo: 'Photo', video: 'Video', document: 'Document', devis: 'Quote', noDocs: 'No documents. Photograph the shop or the parts requested, or attach a quote.', pending: 'pending', tooBig: 'File too large (4 GB max)',
    today: 'Today', upcoming: 'Upcoming', overdue: 'Overdue', recent: 'Recent visits', nothingPlanned: 'No appointments planned.', markDone: 'Write the report',
    syncOk: 'Up to date', syncing: 'Sending…', offline: 'Offline', toSend: '{n} to send', syncErr: 'Send error', lastSync: 'Last sync: {d}', syncNow: 'Sync now', savedOffline: 'Saved on the phone, will be sent when the network is back', saved: 'Saved',
    language: 'Language', changePw: 'Change password', currentPw: 'Current password', newPw: 'New password (at least 8 characters)', logout: 'Sign out', mustChange: 'Choose your own password before continuing.', install: 'Install the app', installHelp: 'Android: browser menu ⋮ › “Add to Home screen”. iPhone: Share button › “Add to Home Screen”.', failedOps: 'Items refused by the server', retry: 'Retry', discard: 'Discard',
    kpiClients: 'Clients', kpiProspects: 'Prospects', kpiVisits7: 'Visits (7 days)', kpiVisits30: 'Visits (30 days)', kpiPlanned: 'Upcoming appointments', kpiLocated: 'Located records', kpiFiles: 'Documents', kpiNew: 'New records (30 d)', visits30: 'Visits per day (last 30 days)', perUser: 'Activity per rep', topCities: 'Cities', lastSeen: 'Seen', lastVisitCol: 'Last visit', files: 'Files',
    addUser: 'Add a user', role: 'Role', admin: 'Administrator', commercial: 'Sales rep', active: 'Active', disabled: 'Disabled', scopeAll: 'Sees all company records', scopeOwn: 'Sees only own records', permEdit: 'Can edit all visible records', permExport: 'Can export to Excel', tempPw: 'Temporary password', tempPwHelp: 'Give it to the person. They must change it at first sign-in.', resetPw: 'New password', transfer: 'Transfer portfolio', transferTo: 'Transfer all their clients to', transferDone: '{n} record(s) transferred', disable: 'Disable', enable: 'Enable', disableQ: 'Disable this account? The person can no longer sign in. Their records stay in the database.',
    expClients: 'Clients and prospects', expVisits: 'Visits and reports', from: 'From', to: 'To', download: 'Download (.xlsx)', expHelp: 'Opens in Excel, Google Sheets or LibreOffice.',
    companyName: 'Company name', prefixC: 'Client code prefix', prefixP: 'Prospect code prefix',
    mapAll: 'Records', mapDay: 'Day route', dayOf: 'Day', noGeo: 'No located records for these filters.', openSheet: 'Open record',
    loadMore: 'Show more', reassignOwner: 'Responsible rep', deleteQ: 'Delete this record? It will be hidden (the administrator can restore it).', deleted: 'Deleted', confirm: 'Confirm', loading: 'Loading…', error: 'Error: {e}', offlineAdmin: 'This page needs a connection.',
  },
};
let lang = (() => { try { return localStorage.getItem('lang'); } catch (e) { return null; } })() || 'fr';
const t = (k, v) => { let s = (T[lang] && T[lang][k]) || T.fr[k] || k; if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]); return s; };
function setLang(l) { lang = T[l] ? l : 'fr'; try { localStorage.setItem('lang', lang); } catch (e) {} document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; }

// =================================================================== outils
const $ = (s, el = document) => el.querySelector(s);
function h(tag, a = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in a) {
    const v = a[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(5)) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const P = {
  back: '<path d="M14.5 5 7.5 12l7 7"/>', chev: '<path d="M9.5 5l7 7-7 7"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', map: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/>',
  me: '<circle cx="12" cy="8.5" r="4"/><path d="M4 20.5a8 8 0 0 1 16 0"/>', plus: '<path d="M12 5v14M5 12h14"/>', home: '<path d="M4 11 12 4l8 7"/><path d="M6 9.5V20h12V9.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>', xls: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 12l5 6M14 12l-5 6"/>', log: '<path d="M5 4h14v16H5z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  phone: '<path d="M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.1 6.1l1.4-2.3L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>',
  wa: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-1.8-1-1 .8a4 4 0 0 1-2-2l.8-1-1-1.8z"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>', edit: '<path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19z"/><path d="M13 7.5l3.5 3.5"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.6"/>', cam: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8.5 7l1.5-2.5h4L15.5 7"/><circle cx="12" cy="13.5" r="3.5"/>',
  vid: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3"/>', file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  sync: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M20 4v5h-5M4 20v-5h5"/>', note: '<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h6M9 8h3"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', trash: '<path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13"/>',
};
function ic(k, s = 22) { const e = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); e.setAttribute('viewBox', '0 0 24 24'); e.setAttribute('width', s); e.setAttribute('height', s); e.setAttribute('fill', 'none'); e.setAttribute('stroke', 'currentColor'); e.setAttribute('stroke-width', '2'); e.setAttribute('stroke-linecap', 'round'); e.setAttribute('stroke-linejoin', 'round'); e.setAttribute('aria-hidden', 'true'); e.innerHTML = P[k] || ''; if (k === 'back' || k === 'chev') e.classList.add(k); return e; }
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(16) + Math.random().toString(16).slice(2, 14));
const locale = () => (lang === 'ar' ? 'ar-MA' : lang === 'en' ? 'en-GB' : 'fr-FR');
const fdate = (ms) => (ms ? new Date(ms).toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fdt = (ms) => (ms ? new Date(ms).toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const ftime = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const fsize = (b) => (b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' Ko' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' Mo' : (b / 1073741824).toFixed(2) + ' Go');
const ago = (ms) => { if (!ms) return '—'; const d = (Date.now() - ms) / 60000; if (d < 2) return lang === 'ar' ? 'الآن' : lang === 'en' ? 'now' : 'à l’instant'; if (d < 60) return Math.round(d) + ' min'; if (d < 1440) return Math.round(d / 60) + ' h'; return Math.round(d / 1440) + (lang === 'ar' ? ' ي' : lang === 'en' ? ' d' : ' j'); };
const localInput = (ms) => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const fromInput = (v) => (v ? new Date(v).getTime() : null);
const initials = (s) => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const telHref = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '');
const waHref = (p) => { let d = String(p).replace(/\D/g, ''); if (d.startsWith('0')) d = '212' + d.slice(1); return 'https://wa.me/' + d; };
const gmaps = (c) => `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
const gdir = (c) => `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
function toast(msg, ms = 2800) { document.querySelectorAll('.toast').forEach((x) => x.remove()); const e = h('div', { class: 'toast', role: 'status' }, msg); document.body.append(e); setTimeout(() => e.remove(), ms); }
function modal(...kids) {
  const m = h('div', { class: 'modal' }, h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, ...kids));
  m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  document.body.append(m);
  return m;
}
function confirmBox(text, okLabel, danger) {
  return new Promise((res) => {
    const m = modal(h('p', { style: 'margin:0' }, text), h('div', { class: 'row', style: 'justify-content:flex-end' },
      h('button', { class: 'btn ghost', onclick: () => { m.remove(); res(false); } }, t('cancel')),
      h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { m.remove(); res(true); } }, okLabel || t('confirm'))));
  });
}

// =================================================================== base locale (IndexedDB)
const DB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((ok, ko) => {
      const r = indexedDB.open('terrain', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of ['clients', 'visits', 'files', 'users']) d.createObjectStore(s, { keyPath: 'id' });
        d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        d.createObjectStore('blobs');
        d.createObjectStore('meta');
      };
      r.onsuccess = () => { this.db = r.result; ok(this.db); };
      r.onerror = () => ko(r.error);
    });
  },
  async run(stores, mode, fn) {
    const d = await this.open();
    return new Promise((ok, ko) => {
      const tx = d.transaction(stores, mode);
      let out;
      Promise.resolve(fn(tx)).then((v) => (out = v));
      tx.oncomplete = () => ok(out);
      tx.onerror = () => ko(tx.error);
      tx.onabort = () => ko(tx.error);
    });
  },
  req(r) { return new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }); },
  all(store) { return this.run([store], 'readonly', (tx) => this.req(tx.objectStore(store).getAll())); },
  get(store, key) { return this.run([store], 'readonly', (tx) => this.req(tx.objectStore(store).get(key))); },
  put(store, val, key) { return this.run([store], 'readwrite', (tx) => { key === undefined ? tx.objectStore(store).put(val) : tx.objectStore(store).put(val, key); }); },
  del(store, key) { return this.run([store], 'readwrite', (tx) => { tx.objectStore(store).delete(key); }); },
  putMany(store, vals) { return this.run([store], 'readwrite', (tx) => { const s = tx.objectStore(store); for (const v of vals) s.put(v); }); },
  delMany(store, keys) { return this.run([store], 'readwrite', (tx) => { const s = tx.objectStore(store); for (const k of keys) s.delete(k); }); },
  async wipe() { return this.run(['clients', 'visits', 'files', 'users', 'outbox', 'blobs', 'meta'], 'readwrite', (tx) => { for (const s of ['clients', 'visits', 'files', 'users', 'outbox', 'blobs', 'meta']) tx.objectStore(s).clear(); }); },
};

// =================================================================== serveur
class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function api(method, path, body, headers = {}) {
  const h2 = { 'X-Requested-With': 'terrain', ...headers };
  let b = body;
  if (body !== undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) { b = JSON.stringify(body); h2['Content-Type'] = 'application/json'; }
  let r;
  try { r = await fetch(path, { method, headers: h2, body: b, credentials: 'same-origin' }); }
  catch (e) { throw new ApiError(0, 'network'); }
  if (r.status === 401 && !path.startsWith('/api/auth')) { S.user = null; showLogin(); throw new ApiError(401, 'Non connecté'); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : r;
  if (!r.ok) throw new ApiError(r.status, (data && data.error) || r.statusText);
  return data;
}

// =================================================================== état + synchronisation
const S = { user: null, settings: { company: 'Magiscom Tech' }, users: new Map(), syncing: false, lastSync: 0, pending: 0, failed: [], online: navigator.onLine, lastError: '' };
const admin = () => S.user && S.user.role === 'admin';
const canExport = () => S.user && S.user.perms && S.user.perms.export;
const userName = (id) => (S.users.get(id) || {}).name || '—';

async function queue(op) { await DB.put('outbox', { ...op, at: Date.now(), tries: 0 }); await refreshPending(); kick(); }
async function refreshPending() {
  const ops = await DB.all('outbox');
  S.pending = ops.filter((o) => !o.failed).length;
  S.failed = ops.filter((o) => o.failed);
  paintSync();
}
let kickTimer = null;
function kick(delay = 300) { clearTimeout(kickTimer); kickTimer = setTimeout(() => syncNow(), delay); }

async function sendOp(op) {
  if (op.type === 'client') return api('PUT', '/api/clients/' + op.id, op.body);
  if (op.type === 'visit') return api('PUT', '/api/visits/' + op.id, op.body);
  if (op.type === 'file') {
    const blob = await DB.get('blobs', op.id);
    if (!blob) return null;   // déjà envoyé puis nettoyé
    const meta = op.body;
    if (blob.size <= 90 * 1048576) {
      return api('PUT', '/api/files/' + op.id, blob, { 'Content-Type': meta.mime || 'application/octet-stream', 'X-Client-Id': meta.client_id, 'X-Visit-Id': meta.visit_id || '', 'X-File-Name': encodeURIComponent(meta.name), 'X-Category': meta.category, 'X-Created-At': String(meta.created_at) });
    }
    // longue vidéo : envoi en morceaux de 50 Mo
    const st = await api('POST', '/api/files/mp', { id: op.id, client_id: meta.client_id, visit_id: meta.visit_id, name: meta.name, mime: meta.mime, category: meta.category });
    if (st.done) return st;
    const PART = 50 * 1048576, parts = op.parts || [];
    for (let i = parts.length; i * PART < blob.size; i++) {
      const p = await api('PUT', `/api/files/mp/${op.id}/${i + 1}`, blob.slice(i * PART, (i + 1) * PART));
      parts.push(p);
      op.parts = parts;
      await DB.put('outbox', op);
      paintSync(Math.round((i + 1) * PART / blob.size * 100));
    }
    return api('POST', `/api/files/mp/${op.id}/complete`, { parts });
  }
}

async function syncNow(force) {
  if (S.syncing || !S.user) return;
  if (!navigator.onLine && !force) { S.online = false; paintSync(); return; }
  S.syncing = true; S.lastError = ''; paintSync();
  let changed = false;
  try {
    // 1) envoi de ce qui a été fait sur le téléphone, dans l'ordre
    const ops = (await DB.all('outbox')).filter((o) => !o.failed).sort((a, b) => a.seq - b.seq);
    for (const op of ops) {
      try {
        const res = await sendOp(op);
        await DB.del('outbox', op.seq);
        if (res && res.client) await DB.put('clients', res.client);
        if (res && res.visit) await DB.put('visits', res.visit);
        if (op.type === 'file') {
          await DB.del('blobs', op.id);
          if (res && res.file) await DB.put('files', { ...res.file, local: false });
        }
        changed = true;
      } catch (e) {
        if (e.status === 0) throw e;                        // plus de réseau : on réessaiera
        if (e.status === 401) throw e;
        if (e.status >= 500 || e.status === 429 || e.status === 408) { op.tries++; await DB.put('outbox', op); throw e; }
        op.failed = e.message; await DB.put('outbox', op);   // refus définitif : affiché dans « Moi »
      }
    }
    // 2) réception des nouveautés
    const since = (await DB.get('meta', 'since')) || 0;
    const d = await api('GET', '/api/sync?since=' + since);
    if (d.clients.length) await DB.putMany('clients', d.clients);
    if (d.gone && d.gone.length) await DB.delMany('clients', d.gone);
    if (d.visits.length) await DB.putMany('visits', d.visits);
    if (d.files.length) await DB.putMany('files', d.files);
    await DB.putMany('users', d.users);
    S.users = new Map(d.users.map((u) => [u.id, u]));
    S.user = d.me; S.settings = d.settings;
    await DB.put('meta', S.user, 'me');
    await DB.put('meta', S.settings, 'settings');
    await DB.put('meta', Math.max(0, d.now - 10000), 'since');
    S.lastSync = Date.now();
    await DB.put('meta', S.lastSync, 'lastSync');
    changed = changed || d.clients.length || d.visits.length || d.files.length || (d.gone && d.gone.length);
    S.online = true;
  } catch (e) {
    if (e.status === 0) S.online = false; else if (e.status !== 401) S.lastError = e.message;
  } finally {
    S.syncing = false;
    await refreshPending();
    if (changed && !document.querySelector('.modal') && !document.activeElement?.matches('input,textarea,select')) render();
  }
}
window.addEventListener('online', () => { S.online = true; kick(100); });
window.addEventListener('offline', () => { S.online = false; paintSync(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(200); });
setInterval(() => { if (!document.hidden) syncNow(); }, 60000);

function paintSync(pct) {
  const el = document.getElementById('sync');
  if (!el) return;
  let cls = 'syncbar ok', label = t('syncOk');
  if (S.syncing) { cls = 'syncbar'; label = t('syncing') + (pct ? ` ${pct}%` : ''); }
  else if (!S.online) { cls = 'syncbar off'; label = t('offline') + (S.pending ? ' · ' + t('toSend', { n: S.pending }) : ''); }
  else if (S.failed.length || S.lastError) { cls = 'syncbar err'; label = t('syncErr'); }
  else if (S.pending) { cls = 'syncbar'; label = t('toSend', { n: S.pending }); }
  el.className = cls;
  el.replaceChildren(S.syncing ? h('span', { class: 'spinner' }) : h('span', { class: 'd' }), label);
}

// =================================================================== données locales
async function loadData() {
  const [clients, visits, files, users] = await Promise.all([DB.all('clients'), DB.all('visits'), DB.all('files'), DB.all('users')]);
  S.users = new Map(users.map((u) => [u.id, u]));
  return { clients: clients.filter((c) => !c.deleted_at), visits: visits.filter((v) => !v.deleted_at), files: files.filter((f) => !f.deleted_at) };
}
async function saveClient(id, fields, isNew) {
  const old = (await DB.get('clients', id)) || {};
  const local = { ...old, ...fields, id, updated_at: Date.now() };
  if (isNew) Object.assign(local, { code: fields.code || '…', owner_id: fields.owner_id || S.user.id, created_by: S.user.id, created_at: Date.now(), pendingCode: !fields.code });
  await DB.put('clients', local);
  // on fusionne avec un envoi encore en attente pour la même fiche
  const ops = await DB.all('outbox');
  const prev = ops.find((o) => o.type === 'client' && o.id === id && !o.failed);
  if (prev) { prev.body = { ...prev.body, ...fields }; await DB.put('outbox', prev); kick(); }
  else await queue({ type: 'client', id, body: isNew ? { ...fields, created_at: local.created_at } : fields });
  await refreshPending();
  return local;
}
async function saveVisit(id, fields, isNew) {
  const old = (await DB.get('visits', id)) || {};
  const local = { ...old, ...fields, id, updated_at: Date.now() };
  if (isNew) Object.assign(local, { user_id: S.user.id, created_at: Date.now() });
  await DB.put('visits', local);
  const ops = await DB.all('outbox');
  const prev = ops.find((o) => o.type === 'visit' && o.id === id && !o.failed);
  if (prev) { prev.body = { ...prev.body, ...fields }; await DB.put('outbox', prev); kick(); }
  else await queue({ type: 'visit', id, body: isNew ? { ...fields, created_at: local.created_at } : fields });
  return local;
}
async function compressImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (e) { return file; }
}
async function addFiles(clientId, visitId, list, category) {
  let n = 0;
  for (let f of list) {
    if (f.size > 4096 * 1048576) { toast(t('tooBig')); continue; }
    if (f.type.startsWith('image/')) f = await compressImage(f);
    const id = uuid();
    const cat = category || (f.type.startsWith('image/') ? 'photo' : f.type.startsWith('video/') ? 'video' : 'document');
    const meta = { id, client_id: clientId, visit_id: visitId || null, user_id: S.user.id, name: f.name || (cat + '-' + Date.now()), mime: f.type || 'application/octet-stream', size: f.size, category: cat, created_at: Date.now(), updated_at: Date.now(), local: true };
    await DB.put('blobs', f, id);
    await DB.put('files', meta);
    await DB.put('outbox', { type: 'file', id, body: meta, at: Date.now(), tries: 0 });
    n++;
  }
  await refreshPending();
  kick();
  return n;
}
function pickFiles(accept, capture, multiple = true) {
  return new Promise((res) => {
    const i = h('input', { type: 'file', accept, capture, multiple, style: 'position:fixed;left:-999px' });
    i.onchange = () => { res([...i.files]); i.remove(); };
    document.body.append(i);
    i.click();
  });
}
function getPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('GPS'));
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }), (e) => rej(new Error(e.message || 'GPS')), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

// =================================================================== écrans : connexion
const app = () => $('#app');
async function showLogin() {
  let st = { setup_needed: false, settings: S.settings };
  try { st = await (await fetch('/api/status')).json(); } catch (e) {}
  const setup = st.setup_needed;
  const err = h('p', { class: 'small', style: 'color:var(--red);margin:0;min-height:1.2em', role: 'alert' });
  const f = {};
  const field = (k, label, type = 'text', ac) => h('label', { class: 'f' }, label, (f[k] = h('input', { class: 'input', type, autocomplete: ac, required: true, dir: type === 'password' || k === 'login' ? 'ltr' : null })));
  const langSel = h('select', { class: 'input', style: 'width:auto;min-height:38px', 'aria-label': t('language'), onchange: (e) => { setLang(e.target.value); showLogin(); } },
    ...[['fr', 'Français'], ['ar', 'العربية'], ['en', 'English']].map(([v, l]) => { const o = h('option', { value: v }, l); if (v === lang) o.selected = true; return o; }));
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const d = setup
        ? await api('POST', '/api/setup', { setup_code: f.code ? f.code.value : '', name: f.name.value, company: f.company.value, login: f.login.value, password: f.password.value })
        : await api('POST', '/api/auth/login', { login: f.login.value, password: f.password.value });
      const prev = await DB.get('meta', 'me');
      if (prev && prev.id !== d.user.id) await DB.wipe();   // autre personne sur ce téléphone
      S.user = d.user; if (d.settings) S.settings = d.settings;
      await DB.put('meta', S.user, 'me');
      start();
    } catch (x) { err.textContent = x.status === 0 ? t('offline') : x.message; btn.disabled = false; }
  } },
    setup ? [h('h2', { style: 'margin:0' }, t('setupT')), h('p', { class: 'muted', style: 'margin:0' }, t('setupP')), st.setup_code ? field('code', t('setupCode'), 'text', 'off') : null, field('company', t('company'), 'text', 'organization'), field('name', t('yourName'), 'text', 'name')] : null,
    field('login', t('login'), 'text', 'username'), field('password', t('password'), 'password', setup ? 'new-password' : 'current-password'), err,
    h('button', { class: 'btn primary block', type: 'submit' }, setup ? t('create') : t('signIn')));
  if (setup) f.company.value = 'Magiscom Tech';
  app().replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' },
    h('div', { class: 'brand' }, h('img', { src: '/logo.png', alt: '' }), h('div', { class: 'grow' }, h('b', { style: 'font-size:19px;display:block' }, 'Magiscom Terrain'), h('span', { class: 'muted small' }, (st.settings && st.settings.company) || 'Magiscom Tech')), langSel),
    form)));
  setTimeout(() => (setup ? f.code || f.company : f.login).focus(), 50);
}

// =================================================================== mise en page
function nav() {
  const items = admin()
    ? [['#/dashboard', 'chart', 'dashboard'], ['#/clients', 'users', 'clients'], ['#/agenda', 'cal', 'agenda'], ['#/map', 'map', 'map'], ['#/team', 'me', 'team'], ['#/export', 'xls', 'export'], ['#/journal', 'log', 'journal'], ['#/settings', 'gear', 'settings']]
    : [['#/clients', 'users', 'clients'], ['#/agenda', 'cal', 'agenda'], ['#/map', 'map', 'map'], ...(canExport() ? [['#/export', 'xls', 'export']] : [])];
  return items;
}
function layout(title, body, opts = {}) {
  const cur = location.hash || '#/';
  const top = h('header', { class: 'top' },
    opts.back ? h('button', { class: 'back', 'aria-label': 'Retour', onclick: () => (history.length > 1 ? history.back() : go(opts.back)) }, ic('back')) : null,
    h('h1', {}, title), opts.right || null, h('span', { id: 'sync', role: 'status', onclick: () => syncNow(true), style: 'cursor:pointer' }));
  const side = h('nav', { class: 'side', 'aria-label': 'Menu' },
    h('div', { class: 'brand' }, h('img', { src: '/logo.png', alt: '' }), h('div', {}, h('b', {}, 'Magiscom Terrain'), h('small', {}, S.settings.company))),
    ...nav().map(([href, icn, k]) => h('a', { href, class: cur.startsWith(href) ? 'on' : null }, ic(icn, 20), t(k))),
    h('div', { class: 'grow' }),
    h('a', { href: '#/me', class: cur.startsWith('#/me') ? 'on' : null }, ic('me', 20), S.user.name));
  const tabs = admin()
    ? [['#/dashboard', 'chart', 'dashboard'], ['#/clients', 'users', 'clients'], ['#/new', 'plus', 'newClient'], ['#/map', 'map', 'map'], ['#/me', 'me', 'me']]
    : [['#/clients', 'users', 'clients'], ['#/agenda', 'cal', 'agenda'], ['#/new', 'plus', 'newClient'], ['#/map', 'map', 'map'], ['#/me', 'me', 'me']];
  const bottom = h('nav', { class: 'tabs-bottom', 'aria-label': 'Menu' }, ...tabs.map(([href, icn, k]) => h('a', { href, class: (cur.startsWith(href) ? 'on' : '') + (icn === 'plus' ? ' plus' : '') }, icn === 'plus' ? h('span', {}, ic('plus', 24)) : ic(icn), t(k))));
  app().replaceChildren(h('div', { class: 'shell' }, side, h('div', { class: 'main' }, top, h('main', { class: 'content' }, body)), bottom));
  paintSync();
}
const go = (hash) => { location.hash = hash; };

// =================================================================== écran : liste des clients
const listState = { q: '', kind: '', owner: '', city: '', limit: 60 };
async function viewClients() {
  const { clients, visits } = await loadData();
  const lastV = new Map();
  for (const v of visits) if (v.status === 'done' && (!lastV.get(v.client_id) || v.date > lastV.get(v.client_id))) lastV.set(v.client_id, v.date);
  const cities = [...new Set(clients.map((c) => c.city).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const owners = [...new Set(clients.map((c) => c.owner_id).filter(Boolean))];
  const listEl = h('div', { class: 'list' });
  const countEl = h('p', { class: 'muted small', style: 'margin:0 2px 8px' });
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function paint() {
    const q = norm(listState.q);
    let rows = clients.filter((c) => (!listState.kind || c.kind === listState.kind) && (!listState.owner || c.owner_id === listState.owner) && (!listState.city || c.city === listState.city)
      && (!q || norm([c.name, c.code, c.city, c.phone, c.contact, c.address, c.sector].join(' ')).includes(q)));
    rows.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    countEl.textContent = t('clientsN', { n: rows.length });
    listEl.replaceChildren();
    if (!rows.length) { listEl.append(h('div', { class: 'empty' }, clients.length ? t('noneSearch') : t('none'))); return; }
    for (const c of rows.slice(0, listState.limit)) {
      const lv = lastV.get(c.id);
      listEl.append(h('a', { class: 'item', href: '#/client/' + c.id },
        h('span', { class: 'av', style: c.kind === 'client' ? 'background:var(--green-s);color:var(--green)' : 'background:var(--orange-s);color:var(--orange)' }, initials(c.name)),
        h('div', { class: 'grow' },
          h('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, h('span', { class: 't' }, c.name), h('span', { class: 'badge b-' + c.kind }, t(c.kind))),
          h('div', { class: 's' }, [c.code, c.city, admin() || S.user.perms.all ? userName(c.owner_id) : null].filter(Boolean).join(' · ')),
          h('div', { class: 's' }, lv ? t('lastVisit', { d: fdate(lv) }) : t('neverVisited'))),
        h('span', { class: c.lat != null ? 'pin' : 'nopin', title: c.lat != null ? t('located') : t('notLocated') }, ic('pin', 20))));
    }
    if (rows.length > listState.limit) listEl.append(h('button', { class: 'btn ghost more', onclick: () => { listState.limit += 100; paint(); } }, t('loadMore')));
  }
  const search = h('input', { class: 'input', type: 'search', placeholder: t('search'), value: listState.q, 'aria-label': t('search'), oninput: (e) => { listState.q = e.target.value; listState.limit = 60; paint(); } });
  const chip = (label, active, on) => h('button', { class: 'chip' + (active ? ' on' : ''), onclick: on }, label);
  const filters = h('div', { class: 'filters' },
    chip(t('all'), !listState.kind, () => { listState.kind = ''; viewClients(); }),
    chip(t('client'), listState.kind === 'client', () => { listState.kind = 'client'; viewClients(); }),
    chip(t('prospect'), listState.kind === 'prospect', () => { listState.kind = 'prospect'; viewClients(); }),
    cities.length ? h('select', { class: 'chip', 'aria-label': t('city'), onchange: (e) => { listState.city = e.target.value; paint(); } }, h('option', { value: '' }, t('allCities')), ...cities.map((c) => { const o = h('option', { value: c }, c); if (c === listState.city) o.selected = true; return o; })) : null,
    owners.length > 1 ? h('select', { class: 'chip', 'aria-label': t('owner'), onchange: (e) => { listState.owner = e.target.value; paint(); } }, h('option', { value: '' }, t('allOwners')), ...owners.map((id) => { const o = h('option', { value: id }, userName(id)); if (id === listState.owner) o.selected = true; return o; })) : null);
  layout(t('clients'), [h('div', { class: 'search' }, search, h('a', { class: 'btn primary', href: '#/new' }, ic('plus', 20), h('span', {}, t('newClient')))), filters, countEl, listEl]);
  paint();
}

// =================================================================== écran : fiche client
let clientTab = 'infos';
async function viewClient(id) {
  const c = await DB.get('clients', id);
  if (!c || c.deleted_at) { layout(t('clients'), h('div', { class: 'empty' }, t('noneSearch')), { back: '#/clients' }); return; }
  const { visits, files } = await loadData();
  const vs = visits.filter((v) => v.client_id === id).sort((a, b) => b.date - a.date);
  const fs = files.filter((f) => f.client_id === id).sort((a, b) => b.created_at - a.created_at);
  const editable = admin() || S.user.perms.edit_all || c.owner_id === S.user.id || (c.created_by === S.user.id && !c.owner_id);

  const geoBox = h('div', { class: 'geo' + (c.lat == null ? ' none' : '') });
  function paintGeo(cc) {
    geoBox.className = 'geo' + (cc.lat == null ? ' none' : '');
    geoBox.replaceChildren(
      h('span', { style: 'color:' + (cc.lat == null ? 'var(--orange)' : 'var(--green)') }, ic('pin', 26)),
      h('div', { class: 'grow' },
        h('b', {}, cc.lat == null ? t('geoNone') : t('geoTitle')),
        h('span', { class: 'small muted' }, cc.lat == null ? t('geoHint') : `${cc.lat.toFixed(5)}, ${cc.lng.toFixed(5)} · ${fdt(cc.geo_at)}` + (cc.geo_acc ? ` · ±${Math.round(cc.geo_acc)} m` : ''))),
      cc.lat != null ? h('a', { class: 'btn sm ghost', href: gmaps(cc), target: '_blank', rel: 'noopener' }, 'Maps') : null);
  }
  paintGeo(c);
  const geoBtn = editable ? h('button', { class: 'btn ' + (c.lat == null ? 'green' : 'ghost') + ' block', style: 'margin-top:10px', onclick: async () => {
    if (c.lat != null && !(await confirmBox(t('geoConfirm'), t('geoUpdate')))) return;
    geoBtn.disabled = true; geoBtn.replaceChildren(h('span', { class: 'spinner' }), t('geoWait'));
    try {
      const p = await getPosition();
      const cc = await saveClient(id, { lat: p.lat, lng: p.lng, geo_acc: p.acc, geo_at: Date.now() });
      paintGeo(cc);
      toast(p.acc > 80 ? t('geoPoor', { m: p.acc }) : t('geoSaved', { m: p.acc }), 4000);
      geoBtn.className = 'btn ghost block';
    } catch (e) { toast(t('geoErr', { e: e.message }), 5000); }
    geoBtn.disabled = false; geoBtn.replaceChildren(ic('pin', 20), c.lat == null && geoBtn.className.includes('green') ? t('geoHere') : t('geoUpdate'));
  } }, ic('pin', 20), c.lat == null ? t('geoHere') : t('geoUpdate')) : null;

  const act = (href, icn, label, extra = {}) => h(href ? 'a' : 'button', { href, ...extra }, ic(icn, 22), label);
  const hero = h('section', { class: 'card hero' },
    h('div', { class: 'row', style: 'gap:6px' }, h('span', { class: 'badge b-' + c.kind }, t(c.kind)), h('span', { class: 'badge b-muted tnum' }, c.pendingCode ? t('codeAuto') : c.code)),
    h('h2', {}, c.name),
    h('div', { class: 'muted small' }, [c.city, c.address].filter(Boolean).join(' · ') || '—'),
    h('div', { class: 'muted small' }, t('owner') + ' : ' + userName(c.owner_id)),
    h('div', { class: 'actions' },
      c.phone ? act(telHref(c.phone), 'phone', t('call')) : act(null, 'phone', t('call'), { disabled: true, style: 'opacity:.4' }),
      c.phone ? act(waHref(c.phone), 'wa', t('whatsapp'), { target: '_blank', rel: 'noopener' }) : act(null, 'wa', t('whatsapp'), { disabled: true, style: 'opacity:.4' }),
      c.lat != null ? act(gdir(c), 'route', t('route'), { target: '_blank', rel: 'noopener' }) : act(c.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.name, c.address, c.city].filter(Boolean).join(', '))}` : null, 'route', t('route'), c.address ? { target: '_blank', rel: 'noopener' } : { disabled: true, style: 'opacity:.4' }),
      editable ? act('#/client/' + id + '/edit', 'edit', t('edit')) : act(null, 'edit', t('edit'), { disabled: true, style: 'opacity:.4' })),
    geoBox, geoBtn);

  const tabBody = h('div', {});
  const tabs = h('div', { class: 'tabbar', role: 'tablist' });
  const TABS = [['infos', t('infos')], ['visits', `${t('visits')} (${vs.length})`], ['docs', `${t('documents')} (${fs.length})`]];
  function showTab(k) {
    clientTab = k;
    tabs.replaceChildren(...TABS.map(([key, label]) => h('button', { role: 'tab', class: key === k ? 'on' : null, 'aria-selected': key === k ? 'true' : 'false', onclick: () => showTab(key) }, label)));
    if (k === 'infos') tabBody.replaceChildren(infosTab(c));
    else if (k === 'visits') tabBody.replaceChildren(visitsTab(c, vs, fs));
    else tabBody.replaceChildren(docsTab(c, fs, null));
  }
  showTab(clientTab);
  layout(c.name, [hero, tabs, tabBody], { back: '#/clients' });
}
function infosTab(c) {
  const rows = [['code', c.pendingCode ? t('codeAuto') : c.code], ['contact', c.contact], ['phone', c.phone], ['phone2', c.phone2], ['email', c.email], ['city', c.city], ['address', c.address], ['sector', c.sector], ['ice', c.ice], ['notes', c.notes]];
  const dl = h('dl', { class: 'info' });
  for (const [k, v] of rows) if (v) dl.append(h('dt', {}, t(k)), h('dd', { dir: ['phone', 'phone2', 'email', 'ice'].includes(k) ? 'ltr' : null }, k === 'phone' || k === 'phone2' ? h('a', { href: telHref(v) }, v) : k === 'email' ? h('a', { href: 'mailto:' + v }, v) : v));
  const box = h('div', { class: 'card pad stack' }, dl, h('p', { class: 'small muted', style: 'margin:0' }, t('createdBy', { u: userName(c.created_by), d: fdate(c.created_at) })));
  if (admin()) {
    const sel = h('select', { class: 'input', 'aria-label': t('reassignOwner') }, ...[...S.users.values()].filter((u) => u.active).map((u) => { const o = h('option', { value: u.id }, u.name); if (u.id === c.owner_id) o.selected = true; return o; }));
    box.append(h('label', { class: 'f' }, t('reassignOwner'), h('div', { class: 'row', style: 'flex-wrap:nowrap' }, sel, h('button', { class: 'btn', onclick: async () => { await saveClient(c.id, { owner_id: sel.value }); toast(t('saved')); render(); } }, t('save')))));
    box.append(h('button', { class: 'btn danger', onclick: async () => {
      if (!(await confirmBox(t('deleteQ'), t('delete'), true))) return;
      try { await api('DELETE', '/api/clients/' + c.id); await DB.put('clients', { ...c, deleted_at: Date.now() }); toast(t('deleted')); go('#/clients'); }
      catch (e) { toast(e.status === 0 ? t('offlineAdmin') : t('error', { e: e.message })); }
    } }, ic('trash', 18), t('delete')));
  }
  return box;
}
function visitsTab(c, vs, fs) {
  const box = h('div', { class: 'stack' },
    h('div', { class: 'grid2' },
      h('a', { class: 'btn primary', href: `#/visit/new?client=${c.id}&kind=visite` }, ic('note', 20), t('newVisit')),
      h('a', { class: 'btn', href: `#/visit/new?client=${c.id}&kind=rdv&status=planned` }, ic('cal', 20), t('newRdv'))));
  if (!vs.length) box.append(h('div', { class: 'empty' }, t('noVisits')));
  for (const v of vs) box.append(visitCard(v, fs, false));
  return box;
}
function visitCard(v, fs, withClient, clientName) {
  const photos = (fs || []).filter((f) => f.visit_id === v.id);
  const sec = (label, text) => (text ? [h('div', { class: 'lab' }, label), h('p', {}, text)] : null);
  return h('a', { class: 'card visit ' + v.status, href: '#/visit/' + v.id, style: 'text-decoration:none;color:inherit;display:block' },
    h('div', { class: 'row', style: 'gap:6px' }, h('span', { class: 'badge b-' + v.status }, t(v.status)), h('b', {}, t(v.kind)), h('span', { class: 'muted small grow' }, fdt(v.date)), h('span', { class: 'muted small' }, t('by', { u: userName(v.user_id) }))),
    withClient ? h('div', { style: 'font-weight:700;margin-top:6px' }, clientName || '') : null,
    sec(t('agreed'), v.agreed), sec(t('notDone'), v.not_done), sec(t('demands'), v.demands), sec(t('nextStep'), v.next_step),
    v.next_date ? h('div', { class: 'small', style: 'margin-top:8px' }, '→ ' + t('nextDate') + ' : ' + fdt(v.next_date)) : null,
    v.lat != null ? h('div', { class: 'small muted', style: 'margin-top:6px' }, '📍 ' + t('checkIn')) : null,
    photos.length ? h('div', { class: 'small muted', style: 'margin-top:6px' }, `📎 ${photos.length}`) : null);
}
function docsTab(c, fs, visitId) {
  const add = async (accept, capture, category) => {
    const files = await pickFiles(accept, capture);
    if (!files.length) return;
    const n = await addFiles(c.id, visitId, files, category);
    if (n) toast(navigator.onLine ? t('saved') : t('savedOffline'));
    render();
  };
  const box = h('div', { class: 'stack' },
    h('div', { class: 'adds' },
      h('button', { class: 'btn primary', onclick: () => add('image/*', 'environment', 'photo') }, ic('cam', 20), t('addPhoto')),
      h('button', { class: 'btn', onclick: () => add('video/*', 'environment', 'video') }, ic('vid', 20), t('addVideo')),
      h('button', { class: 'btn', onclick: () => {
        const m = modal(h('h3', {}, t('addFile')),
          h('button', { class: 'btn block', onclick: () => { m.remove(); add('.pdf,.xls,.xlsx,.csv,.doc,.docx,.ppt,.pptx,.odt,.ods,.txt,.zip,.rar,image/*', null, 'devis'); } }, ic('file', 20), t('devis')),
          h('button', { class: 'btn block', onclick: () => { m.remove(); add('*/*', null, null); } }, ic('file', 20), t('document')));
      } }, ic('file', 20), t('addFile'))));
  const list = fs.filter((f) => !visitId || f.visit_id === visitId);
  if (!list.length) { box.append(h('div', { class: 'empty' }, t('noDocs'))); return box; }
  const grid = h('div', { class: 'docs' });
  for (const f of list) grid.append(docTile(f));
  box.append(grid);
  return box;
}
function docTile(f) {
  const isImg = /^image\/(jpeg|png|webp|gif)/.test(f.mime);
  const tile = h('a', { class: 'doc', href: f.local ? '#' : '/api/files/' + f.id, target: f.local ? null : '_blank', rel: 'noopener', title: f.name },
    h('span', { class: 'badge b-muted tag' }, t(f.category)),
    f.local ? h('span', { class: 'pend' }, t('pending')) : null,
    !isImg ? ic(f.category === 'video' ? 'vid' : 'file', 30) : null,
    !isImg ? h('span', { class: 'nm' }, f.name) : null,
    !isImg ? h('span', { class: 'muted' }, fsize(f.size)) : null);
  if (isImg) {
    const img = h('img', { alt: f.name, loading: 'lazy' });
    if (f.local) DB.get('blobs', f.id).then((b) => { if (b) img.src = URL.createObjectURL(b); });
    else img.src = '/api/files/' + f.id;
    tile.prepend(img);
  }
  if (f.local) tile.addEventListener('click', async (e) => { e.preventDefault(); const b = await DB.get('blobs', f.id); if (b) window.open(URL.createObjectURL(b), '_blank'); });
  return tile;
}

// =================================================================== écran : création / modification d'une fiche
async function viewClientForm(id) {
  const isNew = !id;
  const c = isNew ? { kind: 'prospect' } : await DB.get('clients', id);
  if (!c) return go('#/clients');
  const f = {};
  const inp = (k, type = 'text', extra = {}) => (f[k] = h(type === 'textarea' ? 'textarea' : 'input', { class: 'input', type: type === 'textarea' ? null : type, value: c[k] || '', ...extra }));
  const field = (k, el, req) => h('label', { class: 'f' }, t(k) + (req ? ' *' : ''), el);
  let kind = c.kind || 'prospect';
  const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': t('kind') });
  const paintSeg = () => seg.replaceChildren(...['prospect', 'client'].map((k) => h('button', { type: 'button', role: 'radio', 'aria-checked': k === kind ? 'true' : 'false', class: k === kind ? 'on' : null, onclick: () => { kind = k; paintSeg(); } }, t(k))));
  paintSeg();
  const cities = [...new Set((await DB.all('clients')).map((x) => x.city).filter(Boolean))].sort();
  const dl = h('datalist', { id: 'cities' }, ...['Casablanca', 'Mohammedia', 'Rabat', 'Salé', 'Témara', 'Kénitra', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Meknès', 'Oujda', 'El Jadida', 'Settat', 'Berrechid', 'Nador', 'Tétouan', 'Béni Mellal', 'Safi', 'Khouribga', ...cities].filter((v, i, a) => a.indexOf(v) === i).map((v) => h('option', { value: v })));
  let gps = null;
  const gpsBtn = isNew ? h('button', { type: 'button', class: 'btn green', onclick: async () => {
    gpsBtn.disabled = true; gpsBtn.replaceChildren(h('span', { class: 'spinner' }), t('geoWait'));
    try { gps = await getPosition(); gpsBtn.replaceChildren(ic('check', 20), t('geoSaved', { m: gps.acc })); gpsBtn.className = 'btn ghost'; }
    catch (e) { toast(t('geoErr', { e: e.message }), 5000); gpsBtn.replaceChildren(ic('pin', 20), t('geoHere')); }
    gpsBtn.disabled = false;
  } }, ic('pin', 20), t('geoHere')) : null;
  const err = h('p', { role: 'alert', style: 'color:var(--red);margin:0;min-height:1em', class: 'small' });
  const form = h('form', { class: 'card pad stack', onsubmit: async (e) => {
    e.preventDefault();
    const name = f.name.value.trim();
    if (name.length < 2) { err.textContent = t('name') + ' : ' + t('required'); f.name.focus(); return; }
    const fields = { name, kind };
    for (const k of ['contact', 'phone', 'phone2', 'email', 'city', 'address', 'sector', 'ice', 'notes']) fields[k] = f[k].value.trim();
    const code = f.code.value.trim().toUpperCase();
    if (code && code !== c.code) fields.code = code;
    if (gps) Object.assign(fields, { lat: gps.lat, lng: gps.lng, geo_acc: gps.acc, geo_at: Date.now() });
    const newId = id || uuid();
    await saveClient(newId, fields, isNew);
    toast(navigator.onLine ? t('saved') : t('savedOffline'));
    clientTab = 'infos';
    location.replace('#/client/' + newId);
  } },
    field('name', inp('name', 'text', { required: true, autocomplete: 'organization' }), true),
    h('div', { class: 'f' }, h('span', {}, t('kind')), seg),
    h('div', { class: 'grid2' }, field('code', inp('code', 'text', { placeholder: t('codeAuto'), dir: 'ltr', style: 'text-transform:uppercase' })), field('contact', inp('contact', 'text', { autocomplete: 'name' }))),
    h('div', { class: 'grid2' }, field('phone', inp('phone', 'tel', { dir: 'ltr', autocomplete: 'tel' })), field('phone2', inp('phone2', 'tel', { dir: 'ltr' }))),
    h('div', { class: 'grid2' }, field('city', inp('city', 'text', { list: 'cities' })), field('email', inp('email', 'email', { dir: 'ltr' }))),
    dl,
    field('address', inp('address', 'text', { autocomplete: 'street-address' })),
    h('div', { class: 'grid2' }, field('sector', inp('sector')), field('ice', inp('ice', 'text', { dir: 'ltr', inputmode: 'numeric' }))),
    field('notes', inp('notes', 'textarea')),
    gpsBtn, err,
    h('div', { class: 'row' }, h('button', { class: 'btn primary grow', type: 'submit' }, ic('check', 20), t('save')), h('button', { type: 'button', class: 'btn ghost', onclick: () => history.back() }, t('cancel'))));
  layout(isNew ? t('newSheet') : t('edit') + ' : ' + c.name, form, { back: isNew ? '#/clients' : '#/client/' + id });
  if (isNew) setTimeout(() => f.name.focus(), 50);
}

// =================================================================== écran : visite / rendez-vous / compte-rendu
async function viewVisitForm(id, params) {
  let v = id ? await DB.get('visits', id) : null;
  const isNew = !v;
  if (isNew) v = { client_id: params.get('client'), kind: params.get('kind') || 'visite', status: params.get('status') || 'done', date: Date.now() };
  const c = await DB.get('clients', v.client_id);
  if (!c) return go('#/clients');
  const mine = admin() || v.user_id === S.user.id || isNew;
  const vid = id || uuid();
  let kind = v.kind, status = v.status;
  const seg = (vals, get, set) => { const s = h('div', { class: 'seg' }); const paint = () => s.replaceChildren(...vals.map((k) => h('button', { type: 'button', class: get() === k ? 'on' : null, 'aria-pressed': get() === k ? 'true' : 'false', disabled: !mine, onclick: () => { set(k); paint(); } }, t(k)))); paint(); return s; };
  const f = {};
  const ta = (k, ph) => (f[k] = h('textarea', { class: 'input', placeholder: ph || '', disabled: !mine, value: v[k] || '' }));
  f.date = h('input', { class: 'input', type: 'datetime-local', value: localInput(v.date), disabled: !mine });
  f.next_date = h('input', { class: 'input', type: 'datetime-local', value: v.next_date ? localInput(v.next_date) : '', disabled: !mine });
  const { files } = await loadData();
  const docsBox = h('div', {});
  const paintDocs = async () => { const fs = (await loadData()).files.filter((x) => x.client_id === c.id); docsBox.replaceChildren(docsTab(c, fs, vid)); };
  const form = h('form', { class: 'card pad stack', onsubmit: async (e) => {
    e.preventDefault();
    if (!mine) return history.back();
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    const fields = { client_id: c.id, kind, status, date: fromInput(f.date.value) || Date.now(), agreed: f.agreed.value.trim(), not_done: f.not_done.value.trim(), demands: f.demands.value.trim(), next_step: f.next_step.value.trim(), next_date: fromInput(f.next_date.value) };
    // position au moment du compte-rendu (preuve de passage), sans bloquer si le GPS ne répond pas
    if (status === 'done' && (isNew || v.status !== 'done')) {
      try { const p = await Promise.race([getPosition(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))]); Object.assign(fields, { lat: p.lat, lng: p.lng, geo_acc: p.acc }); } catch (x) {}
    }
    await saveVisit(vid, fields, isNew);
    // le prochain rendez-vous devient un rendez-vous dans l'agenda
    if (fields.next_date && isNew && fields.next_date > Date.now()) await saveVisit(uuid(), { client_id: c.id, kind: 'rdv', status: 'planned', date: fields.next_date, next_step: fields.next_step }, true);
    toast(navigator.onLine ? t('saved') : t('savedOffline'));
    clientTab = 'visits';
    location.replace('#/client/' + c.id);
  } },
    h('div', { class: 'item', style: 'border:0;padding:0' }, h('span', { class: 'av' }, initials(c.name)), h('div', { class: 'grow' }, h('div', { class: 't' }, c.name), h('div', { class: 's' }, [c.code, c.city].filter(Boolean).join(' · ')))),
    h('div', { class: 'f' }, h('span', {}, t('kind')), seg(['visite', 'rdv', 'appel'], () => kind, (x) => (kind = x))),
    h('div', { class: 'f' }, h('span', {}, t('status')), seg(['planned', 'done', 'cancelled'], () => status, (x) => (status = x))),
    h('label', { class: 'f' }, t('date'), f.date),
    h('label', { class: 'f' }, t('agreed'), ta('agreed', t('agreedPh'))),
    h('label', { class: 'f' }, t('notDone'), ta('not_done', t('notDonePh'))),
    h('label', { class: 'f' }, t('demands'), ta('demands', t('demandsPh'))),
    h('div', { class: 'grid2' }, h('label', { class: 'f' }, t('nextStep'), (f.next_step = h('input', { class: 'input', value: v.next_step || '', disabled: !mine }))), h('label', { class: 'f' }, t('nextDate'), f.next_date)),
    v.lat != null ? h('p', { class: 'small muted', style: 'margin:0' }, '📍 ' + t('checkIn') + ' · ' + t('by', { u: userName(v.user_id) })) : null,
    mine ? h('div', { class: 'row' }, h('button', { class: 'btn primary grow', type: 'submit' }, ic('check', 20), t('save')), h('button', { type: 'button', class: 'btn ghost', onclick: () => history.back() }, t('cancel'))) : null,
    admin() && !isNew ? h('button', { type: 'button', class: 'btn danger', onclick: async () => {
      if (!(await confirmBox(t('deleteQ'), t('delete'), true))) return;
      try { await api('DELETE', '/api/visits/' + vid); await DB.put('visits', { ...v, deleted_at: Date.now() }); go('#/client/' + c.id); } catch (e) { toast(e.status === 0 ? t('offlineAdmin') : t('error', { e: e.message })); }
    } }, ic('trash', 18), t('delete')) : null);
  layout(isNew ? (kind === 'rdv' ? t('newRdv') : t('newVisit')) : t(v.kind) + ' — ' + fdate(v.date), [form, h('h2', { class: 'sec' }, t('documents')), docsBox], { back: '#/client/' + c.id });
  paintDocs();
}

// =================================================================== écran : agenda
const agendaState = { user: '' };
async function viewAgenda() {
  const { clients, visits } = await loadData();
  const cm = new Map(clients.map((c) => [c.id, c]));
  const mineOnly = (v) => (!agendaState.user || v.user_id === agendaState.user) && cm.has(v.client_id);
  const now = Date.now(), d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const today0 = d0.getTime(), today1 = today0 + 86400000;
  const planned = visits.filter((v) => v.status === 'planned' && mineOnly(v)).sort((a, b) => a.date - b.date);
  const overdue = planned.filter((v) => v.date < today0), today = planned.filter((v) => v.date >= today0 && v.date < today1), next = planned.filter((v) => v.date >= today1);
  const recent = visits.filter((v) => v.status === 'done' && mineOnly(v)).sort((a, b) => b.date - a.date).slice(0, 40);
  const rdvItem = (v) => {
    const c = cm.get(v.client_id);
    return h('div', { class: 'item' },
      h('div', { style: 'text-align:center;min-width:52px' }, h('b', { class: 'tnum', style: 'display:block' }, ftime(v.date)), h('span', { class: 'small muted' }, new Date(v.date).toLocaleDateString(locale(), { day: '2-digit', month: 'short' }))),
      h('a', { class: 'grow', href: '#/client/' + c.id, style: 'color:inherit;text-decoration:none;min-width:0' }, h('div', { class: 't' }, c.name), h('div', { class: 's' }, [t(v.kind), c.city, userName(v.user_id)].filter(Boolean).join(' · '))),
      h('a', { class: 'btn sm primary', href: '#/visit/' + v.id }, t('markDone')));
  };
  const sec = (title, arr, empty) => [h('h2', { class: 'sec' }, `${title} (${arr.length})`), arr.length ? h('div', { class: 'list' }, ...arr.map(rdvItem)) : empty ? h('div', { class: 'empty' }, empty) : null];
  const users = [...S.users.values()].filter((u) => u.active);
  const filt = (admin() || S.user.perms.all) && users.length > 1 ? h('select', { class: 'input', style: 'max-width:280px', 'aria-label': t('owner'), onchange: (e) => { agendaState.user = e.target.value; viewAgenda(); } },
    h('option', { value: '' }, t('allOwners')), ...users.map((u) => { const o = h('option', { value: u.id }, u.name); if (u.id === agendaState.user) o.selected = true; return o; })) : null;
  layout(t('agenda'), [filt,
    overdue.length ? sec(t('overdue'), overdue) : null,
    sec(t('today'), today, t('nothingPlanned')),
    next.length ? sec(t('upcoming'), next) : null,
    h('h2', { class: 'sec' }, t('recent')),
    recent.length ? h('div', { class: 'stack' }, ...recent.map((v) => visitCard(v, null, true, (cm.get(v.client_id) || {}).name))) : h('div', { class: 'empty' }, t('noVisits'))]);
}

// =================================================================== écran : carte
const mapState = { mode: 'all', user: '', kind: '', day: '' };
let mapObj = null;
async function viewMap() {
  const { clients, visits } = await loadData();
  const users = [...S.users.values()].filter((u) => u.active);
  const cm = new Map(clients.map((c) => [c.id, c]));
  if (!mapState.day) mapState.day = localInput(Date.now()).slice(0, 10);
  const el = h('div', { class: 'map', id: 'map' });
  const info = h('p', { class: 'small muted', style: 'margin:8px 2px 0' });
  const controls = h('div', { class: 'filters', style: 'flex-wrap:wrap' },
    h('button', { class: 'chip' + (mapState.mode === 'all' ? ' on' : ''), onclick: () => { mapState.mode = 'all'; viewMap(); } }, t('mapAll')),
    h('button', { class: 'chip' + (mapState.mode === 'day' ? ' on' : ''), onclick: () => { mapState.mode = 'day'; viewMap(); } }, t('mapDay')),
    mapState.mode === 'all' ? h('select', { class: 'chip', 'aria-label': t('kind'), onchange: (e) => { mapState.kind = e.target.value; viewMap(); } }, ...[['', t('all')], ['client', t('client')], ['prospect', t('prospect')]].map(([v, l]) => { const o = h('option', { value: v }, l); if (v === mapState.kind) o.selected = true; return o; })) : null,
    mapState.mode === 'day' ? h('input', { class: 'chip', type: 'date', value: mapState.day, 'aria-label': t('dayOf'), onchange: (e) => { mapState.day = e.target.value; viewMap(); } }) : null,
    users.length > 1 && (admin() || S.user.perms.all) ? h('select', { class: 'chip', 'aria-label': t('owner'), onchange: (e) => { mapState.user = e.target.value; viewMap(); } }, h('option', { value: '' }, t('allOwners')), ...users.map((u) => { const o = h('option', { value: u.id }, u.name); if (u.id === mapState.user) o.selected = true; return o; })) : null);
  layout(t('map'), [controls, el, info]);
  if (!window.L) { el.replaceChildren(h('div', { class: 'empty', style: 'margin:20px' }, t('offlineAdmin'))); return; }
  if (mapObj) { try { mapObj.remove(); } catch (e) {} }
  mapObj = L.map(el, { zoomControl: true }).setView([33.6866, -7.383], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapObj);
  const pts = [];
  const pop = (c, extra) => { const d = h('div', {}, h('b', {}, c.name), h('div', {}, [c.code, c.city].filter(Boolean).join(' · ')), extra ? h('div', {}, extra) : null, h('a', { href: '#/client/' + c.id }, t('openSheet')), ' · ', h('a', { href: gdir(c), target: '_blank', rel: 'noopener' }, t('route'))); return d; };
  if (mapState.mode === 'all') {
    const list = clients.filter((c) => c.lat != null && (!mapState.kind || c.kind === mapState.kind) && (!mapState.user || c.owner_id === mapState.user));
    for (const c of list) {
      L.circleMarker([c.lat, c.lng], { radius: 8, weight: 2, color: '#fff', fillColor: c.kind === 'client' ? '#14945A' : '#E07B0B', fillOpacity: 1 }).addTo(mapObj).bindPopup(pop(c, userName(c.owner_id)));
      pts.push([c.lat, c.lng]);
    }
    info.textContent = list.length ? `${list.length} · ● ${t('client')} (vert) · ● ${t('prospect')} (orange)` : t('noGeo');
  } else {
    // tournée : positions des comptes-rendus du jour, dans l'ordre, par commercial
    const day0 = new Date(mapState.day + 'T00:00').getTime(), day1 = day0 + 86400000;
    const vs = visits.filter((v) => v.status === 'done' && v.date >= day0 && v.date < day1 && (!mapState.user || v.user_id === mapState.user)).sort((a, b) => a.date - b.date);
    const colors = ['#0B4FD6', '#C62D3D', '#14945A', '#8E44AD', '#E07B0B', '#00838F', '#6D4C41'];
    const byUser = new Map();
    for (const v of vs) { const c = cm.get(v.client_id); const lat = v.lat ?? c?.lat, lng = v.lng ?? c?.lng; if (lat == null) continue; if (!byUser.has(v.user_id)) byUser.set(v.user_id, []); byUser.get(v.user_id).push({ v, c, lat, lng }); }
    let i = 0;
    const legend = [];
    for (const [uidv, arr] of byUser) {
      const col = colors[i++ % colors.length];
      legend.push(`${userName(uidv)} : ${arr.length}`);
      L.polyline(arr.map((x) => [x.lat, x.lng]), { color: col, weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(mapObj);
      arr.forEach((x, n) => {
        L.marker([x.lat, x.lng], { icon: L.divIcon({ className: '', html: `<div style="background:${col};color:#fff;border:2px solid #fff;border-radius:50%;width:26px;height:26px;display:grid;place-items:center;font:700 12px system-ui;box-shadow:0 1px 4px rgba(0,0,0,.4)">${n + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
          .addTo(mapObj).bindPopup(pop(x.c || { id: x.v.client_id, name: '—', lat: x.lat, lng: x.lng }, `${ftime(x.v.date)} · ${t(x.v.kind)} · ${userName(uidv)}`));
        pts.push([x.lat, x.lng]);
      });
    }
    info.textContent = legend.length ? legend.join(' · ') : t('noGeo');
  }
  if (pts.length) mapObj.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
  setTimeout(() => mapObj.invalidateSize(), 100);
}

// =================================================================== écran : tableau de bord (admin)
async function viewDashboard() {
  layout(t('dashboard'), h('p', { class: 'muted' }, t('loading')));
  let d;
  try { d = await api('GET', '/api/stats'); } catch (e) { layout(t('dashboard'), h('div', { class: 'empty' }, e.status === 0 ? t('offlineAdmin') : t('error', { e: e.message }))); return; }
  const T0 = d.totals;
  const kpi = (v, l, sub) => h('div', { class: 'card kpi' }, h('div', { class: 'v tnum' }, v), h('div', { class: 'l' }, l), sub ? h('div', { class: 'd' }, sub) : null);
  const days = new Array(30).fill(0);
  for (const r of d.daily) if (r.d >= 0 && r.d < 30) days[r.d] = r.n;
  const max = Math.max(1, ...days);
  const chart = h('div', { class: 'bar-chart', role: 'img', 'aria-label': t('visits30') }, ...days.map((n, i) => h('i', { style: `height:${Math.max(2, n / max * 100)}%`, title: `${new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString(locale(), { day: '2-digit', month: 'short' })} : ${n}` })));
  const rows = d.per_user.map((u) => h('tr', {},
    h('td', {}, h('span', { class: 'dot', style: 'background:' + (u.active ? (u.last_seen && Date.now() - u.last_seen < 86400000 ? 'var(--green)' : '#B4BCCB') : 'var(--red)') }), h('a', { href: '#/team' }, u.name), u.role === 'admin' ? h('span', { class: 'badge b-muted', style: 'margin-inline-start:6px' }, t('admin')) : null),
    h('td', { class: 'tnum' }, u.clients - u.prospects), h('td', { class: 'tnum' }, u.prospects), h('td', { class: 'tnum' }, h('b', {}, u.visits_7)), h('td', { class: 'tnum' }, u.visits_30),
    h('td', {}, u.last_visit ? fdate(u.last_visit) : '—'), h('td', { class: 'tnum' }, u.files), h('td', {}, ago(u.last_seen))));
  layout(t('dashboard'), [
    h('div', { class: 'kpis' }, kpi(T0.clients, t('kpiClients')), kpi(T0.prospects, t('kpiProspects')), kpi(T0.visits_7, t('kpiVisits7')), kpi(T0.planned, t('kpiPlanned')),
      kpi(T0.visits_30, t('kpiVisits30')), kpi(`${T0.located}/${T0.clients + T0.prospects}`, t('kpiLocated')), kpi(T0.files, t('kpiFiles'), fsize(T0.storage)), kpi(T0.new_30, t('kpiNew'))),
    h('div', { class: 'cols', style: 'margin-top:12px' },
      h('section', { class: 'card pad' }, h('b', {}, t('visits30')), chart),
      h('section', { class: 'card pad' }, h('b', {}, t('topCities')), h('div', { class: 'stack', style: 'gap:6px;margin-top:10px' }, ...d.cities.map((c) => h('div', { class: 'row', style: 'flex-wrap:nowrap' }, h('span', { class: 'grow' }, c.city), h('b', { class: 'tnum' }, c.n)))))),
    h('h2', { class: 'sec' }, t('perUser')),
    h('div', { class: 'card tablewrap' }, h('table', { class: 't' },
      h('thead', {}, h('tr', {}, ...[t('owner'), t('kpiClients'), t('kpiProspects'), t('kpiVisits7'), t('kpiVisits30'), t('lastVisitCol'), t('files'), t('lastSeen')].map((x) => h('th', {}, x)))),
      h('tbody', {}, ...rows)))]);
}

// =================================================================== écran : équipe (admin)
async function viewTeam() {
  layout(t('team'), h('p', { class: 'muted' }, t('loading')));
  let users, stats;
  try { [users, stats] = await Promise.all([api('GET', '/api/users'), api('GET', '/api/stats')]); } catch (e) { layout(t('team'), h('div', { class: 'empty' }, e.status === 0 ? t('offlineAdmin') : t('error', { e: e.message }))); return; }
  const st = new Map(stats.per_user.map((u) => [u.id, u]));
  const list = h('div', { class: 'list' }, ...users.users.map((u) => {
    const s = st.get(u.id) || {};
    return h('button', { class: 'item', onclick: () => userSheet(u, users.users) },
      h('span', { class: 'av', style: u.active ? null : 'background:var(--red-s);color:var(--red)' }, initials(u.name)),
      h('div', { class: 'grow' }, h('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, h('span', { class: 't' }, u.name), h('span', { class: 'badge ' + (u.role === 'admin' ? 'b-planned' : 'b-muted') }, t(u.role)), u.active ? null : h('span', { class: 'badge b-cancelled' }, t('disabled'))),
        h('div', { class: 's', dir: 'ltr', style: 'text-align:start' }, u.login + (u.phone ? ' · ' + u.phone : '')),
        h('div', { class: 's' }, `${s.clients || 0} ${t('clients').toLowerCase()} · ${s.visits_30 || 0} ${t('visits').toLowerCase()} / 30 j · ${t('lastSeen')} ${ago(u.last_seen)}`)),
      ic('chev', 18));
  }));
  layout(t('team'), [h('div', { class: 'row', style: 'margin-bottom:12px' }, h('button', { class: 'btn primary', onclick: () => userSheet(null, users.users) }, ic('plus', 20), t('addUser'))), list]);
}
function userSheet(u, all) {
  const isNew = !u;
  const f = {};
  const p = u ? u.perms : { all: false, export: false, edit_all: false };
  f.name = h('input', { class: 'input', value: u ? u.name : '', required: true });
  f.login = h('input', { class: 'input', value: u ? u.login : '', dir: 'ltr', autocapitalize: 'none', required: true });
  f.phone = h('input', { class: 'input', value: u ? u.phone || '' : '', dir: 'ltr', type: 'tel' });
  f.role = h('select', { class: 'input' }, ...['commercial', 'admin'].map((r) => { const o = h('option', { value: r }, t(r)); if (u && u.role === r) o.selected = true; return o; }));
  f.all = h('input', { type: 'checkbox', checked: p.all });
  f.edit = h('input', { type: 'checkbox', checked: p.edit_all });
  f.exp = h('input', { type: 'checkbox', checked: p.export });
  const err = h('p', { class: 'small', role: 'alert', style: 'color:var(--red);margin:0' });
  const body = () => ({ name: f.name.value, login: f.login.value, phone: f.phone.value, role: f.role.value, perms: { scope: f.all.checked ? 'all' : 'own', edit_all: f.edit.checked, export: f.exp.checked } });
  const m = modal(h('h3', {}, isNew ? t('addUser') : u.name),
    h('label', { class: 'f' }, t('fullName'), f.name), h('div', { class: 'grid2' }, h('label', { class: 'f' }, t('login'), f.login), h('label', { class: 'f' }, t('phone'), f.phone)),
    h('label', { class: 'f' }, t('role'), f.role),
    h('label', { class: 'check' }, f.all, t('scopeAll')), h('label', { class: 'check' }, f.edit, t('permEdit')), h('label', { class: 'check' }, f.exp, t('permExport')),
    err,
    h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { class: 'btn ghost', onclick: () => m.remove() }, t('cancel')),
      h('button', { class: 'btn primary', onclick: async () => {
        try {
          if (isNew) { const d = await api('POST', '/api/users', body()); m.remove(); showPw(d.user.name, d.password); }
          else { await api('PATCH', '/api/users/' + u.id, body()); m.remove(); toast(t('saved')); }
          viewTeam();
        } catch (e) { err.textContent = e.status === 0 ? t('offlineAdmin') : e.message; }
      } }, t('save'))),
    !isNew ? h('hr', { style: 'border:0;border-top:1px solid var(--line);width:100%' }) : null,
    !isNew ? h('div', { class: 'stack' },
      h('button', { class: 'btn', onclick: async () => { try { const d = await api('POST', `/api/users/${u.id}/password`); m.remove(); showPw(u.name, d.password); } catch (e) { err.textContent = e.message; } } }, t('resetPw')),
      h('div', { class: 'stack', style: 'gap:6px' }, h('span', { class: 'small muted' }, t('transferTo')),
        h('div', { class: 'row', style: 'flex-wrap:nowrap' }, (f.to = h('select', { class: 'input' }, ...all.filter((x) => x.active && x.id !== u.id).map((x) => h('option', { value: x.id }, x.name)))),
          h('button', { class: 'btn', onclick: async () => { if (!f.to.value) return; try { const d = await api('POST', '/api/clients/reassign', { from: u.id, to: f.to.value }); toast(t('transferDone', { n: d.moved })); kick(); } catch (e) { err.textContent = e.message; } } }, t('transfer')))),
      h('button', { class: 'btn ' + (u.active ? 'danger' : 'green'), onclick: async () => {
        if (u.active && !(await confirmBox(t('disableQ'), t('disable'), true))) return;
        try { await api('PATCH', '/api/users/' + u.id, { active: !u.active }); m.remove(); viewTeam(); } catch (e) { err.textContent = e.message; }
      } }, u.active ? t('disable') : t('enable'))) : null);
}
function showPw(name, pw) {
  const m = modal(h('h3', {}, name), h('p', { class: 'muted', style: 'margin:0' }, t('tempPw')), h('div', { class: 'pw', dir: 'ltr' }, pw), h('p', { class: 'small muted', style: 'margin:0' }, t('tempPwHelp')),
    h('button', { class: 'btn primary', onclick: () => { try { navigator.clipboard.writeText(pw).catch(() => {}); } catch (e) {} m.remove(); } }, 'OK'));
}

// =================================================================== écran : export
async function viewExport() {
  const users = [...S.users.values()];
  const { clients } = await loadData();
  const cities = [...new Set(clients.map((c) => c.city).filter(Boolean))].sort();
  const sel = (opts, all) => h('select', { class: 'input' }, h('option', { value: '' }, all), ...opts.map(([v, l]) => h('option', { value: v }, l)));
  const ck = sel([['client', t('client')], ['prospect', t('prospect')]], t('all')), co = sel(users.map((u) => [u.id, u.name]), t('allOwners')), cc = sel(cities.map((c) => [c, c]), t('allCities'));
  const vfrom = h('input', { class: 'input', type: 'date', value: localInput(Date.now() - 30 * 86400000).slice(0, 10) }), vto = h('input', { class: 'input', type: 'date', value: localInput(Date.now()).slice(0, 10) });
  const vu = sel(users.map((u) => [u.id, u.name]), t('allOwners'));
  const dl = (url) => { if (!navigator.onLine) return toast(t('offlineAdmin')); const a = h('a', { href: url, download: '' }); document.body.append(a); a.click(); a.remove(); };
  layout(t('export'), h('div', { class: 'stack' },
    h('section', { class: 'card pad stack' }, h('h3', { style: 'margin:0' }, t('expClients')),
      h('div', { class: 'grid2' }, h('label', { class: 'f' }, t('kind'), ck), h('label', { class: 'f' }, t('city'), cc)), admin() || S.user.perms.all ? h('label', { class: 'f' }, t('owner'), co) : null,
      h('button', { class: 'btn primary', onclick: () => { const q = new URLSearchParams(); if (ck.value) q.set('kind', ck.value); if (co.value) q.set('owner', co.value); if (cc.value) q.set('city', cc.value); dl('/api/export/clients.xlsx?' + q); } }, ic('xls', 20), t('download'))),
    h('section', { class: 'card pad stack' }, h('h3', { style: 'margin:0' }, t('expVisits')),
      h('div', { class: 'grid2' }, h('label', { class: 'f' }, t('from'), vfrom), h('label', { class: 'f' }, t('to'), vto)), admin() || S.user.perms.all ? h('label', { class: 'f' }, t('owner'), vu) : null,
      h('button', { class: 'btn primary', onclick: () => { const q = new URLSearchParams(); if (vfrom.value) q.set('from', new Date(vfrom.value + 'T00:00').getTime()); if (vto.value) q.set('to', new Date(vto.value + 'T23:59:59').getTime()); if (vu.value) q.set('user', vu.value); dl('/api/export/visits.xlsx?' + q); } }, ic('xls', 20), t('download'))),
    h('p', { class: 'small muted' }, t('expHelp'))));
}

// =================================================================== écran : journal (admin)
async function viewJournal() {
  layout(t('journal'), h('p', { class: 'muted' }, t('loading')));
  const list = h('div', { class: 'card tablewrap' });
  const tbody = h('tbody');
  let before = 0;
  async function more() {
    try {
      const d = await api('GET', '/api/audit' + (before ? '?before=' + before : ''));
      for (const e of d.entries) tbody.append(h('tr', {}, h('td', { class: 'tnum' }, fdt(e.at)), h('td', {}, userName(e.user_id)), h('td', {}, t('a_' + e.action) !== 'a_' + e.action ? t('a_' + e.action) : e.action), h('td', { style: 'white-space:normal;min-width:220px' }, e.detail || '')));
      if (d.entries.length) before = d.entries[d.entries.length - 1].at;
      btn.hidden = d.entries.length < 100;
    } catch (e) { toast(e.status === 0 ? t('offlineAdmin') : t('error', { e: e.message })); }
  }
  const btn = h('button', { class: 'btn ghost more', onclick: more }, t('loadMore'));
  list.append(h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, t('date')), h('th', {}, t('owner')), h('th', {}, 'Action'), h('th', {}, ''))), tbody));
  layout(t('journal'), [list, btn]);
  await more();
}

// =================================================================== écran : réglages (admin)
function viewSettings() {
  const f = { company: h('input', { class: 'input', value: S.settings.company }), cp: h('input', { class: 'input', value: S.settings.client_prefix, dir: 'ltr', maxlength: 6 }), pp: h('input', { class: 'input', value: S.settings.prospect_prefix, dir: 'ltr', maxlength: 6 }) };
  layout(t('settings'), h('form', { class: 'card pad stack', onsubmit: async (e) => {
    e.preventDefault();
    try { const d = await api('PATCH', '/api/settings', { company: f.company.value, client_prefix: f.cp.value, prospect_prefix: f.pp.value }); S.settings = d.settings; await DB.put('meta', S.settings, 'settings'); toast(t('saved')); render(); }
    catch (x) { toast(x.status === 0 ? t('offlineAdmin') : t('error', { e: x.message })); }
  } }, h('label', { class: 'f' }, t('companyName'), f.company), h('div', { class: 'grid2' }, h('label', { class: 'f' }, t('prefixC'), f.cp), h('label', { class: 'f' }, t('prefixP'), f.pp)), h('button', { class: 'btn primary', type: 'submit' }, t('save'))));
}

// =================================================================== écran : moi
async function viewMe() {
  const lastSync = (await DB.get('meta', 'lastSync')) || 0;
  const langSel = h('select', { class: 'input', onchange: (e) => { setLang(e.target.value); render(); } }, ...[['fr', 'Français'], ['ar', 'العربية'], ['en', 'English']].map(([v, l]) => { const o = h('option', { value: v }, l); if (v === lang) o.selected = true; return o; }));
  const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', dir: 'ltr' }), nw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', dir: 'ltr', minlength: 8 });
  const failed = S.failed.length ? h('section', { class: 'card pad stack' }, h('b', { style: 'color:var(--red)' }, t('failedOps')),
    ...S.failed.map((o) => h('div', { class: 'row' }, h('span', { class: 'grow small' }, `${o.type} · ${o.body && (o.body.name || o.body.agreed || o.body.client_id) || o.id} — ${o.failed}`),
      h('button', { class: 'btn sm', onclick: async () => { delete o.failed; await DB.put('outbox', o); await refreshPending(); kick(); viewMe(); } }, t('retry')),
      h('button', { class: 'btn sm danger', onclick: async () => { await DB.del('outbox', o.seq); if (o.type === 'file') { await DB.del('blobs', o.id); await DB.del('files', o.id); } await refreshPending(); viewMe(); } }, t('discard'))))) : null;
  layout(t('me'), h('div', { class: 'stack' },
    S.user.must_change ? h('div', { class: 'card pad', style: 'background:var(--orange-s);border-color:transparent' }, t('mustChange')) : null,
    h('section', { class: 'card pad' }, h('div', { class: 'item', style: 'border:0;padding:0' }, h('span', { class: 'av' }, initials(S.user.name)), h('div', { class: 'grow' }, h('div', { class: 't' }, S.user.name), h('div', { class: 's', dir: 'ltr', style: 'text-align:start' }, S.user.login), h('div', { class: 's' }, t(S.user.role) + ' · ' + S.settings.company)))),
    h('section', { class: 'card pad stack' }, h('div', { class: 'row' }, h('span', { id: 'sync2', class: 'grow small muted' }, t('lastSync', { d: lastSync ? fdt(lastSync) : '—' }) + (S.pending ? ' · ' + t('toSend', { n: S.pending }) : '')), h('button', { class: 'btn sm', onclick: async () => { await syncNow(true); viewMe(); } }, ic('sync', 18), t('syncNow')))),
    failed,
    h('section', { class: 'card pad stack' }, h('label', { class: 'f' }, t('language'), langSel)),
    h('form', { class: 'card pad stack', onsubmit: async (e) => {
      e.preventDefault();
      try { await api('POST', '/api/me/password', { current: cur.value, password: nw.value }); S.user.must_change = false; await DB.put('meta', S.user, 'me'); toast(t('saved')); render(); }
      catch (x) { toast(x.status === 0 ? t('offlineAdmin') : x.message); }
    } }, h('b', {}, t('changePw')), h('label', { class: 'f' }, t('currentPw'), cur), h('label', { class: 'f' }, t('newPw'), nw), h('button', { class: 'btn primary', type: 'submit' }, t('save'))),
    h('section', { class: 'card pad stack' }, h('b', {}, t('install')), h('p', { class: 'small muted', style: 'margin:0' }, t('installHelp'))),
    h('button', { class: 'btn danger', onclick: async () => {
      if (S.pending && !(await confirmBox(t('toSend', { n: S.pending }) + ' — ' + t('logout') + ' ?', t('logout'), true))) return;
      try { await api('POST', '/api/auth/logout', {}); } catch (e) {}
      await DB.wipe(); try { await caches.delete('terrain-files-v1'); } catch (e) {} S.user = null; showLogin();
    } }, t('logout')),
    h('p', { class: 'small muted', style: 'text-align:center' }, 'Magiscom Terrain · ' + S.settings.company)));
}

// =================================================================== routeur
async function render() {
  if (!S.user) return showLogin();
  const hash = location.hash || '';
  const [path, qs] = hash.slice(1).split('?');
  const params = new URLSearchParams(qs || '');
  const seg = (path || '/').split('/').filter(Boolean);
  if (mapObj && seg[0] !== 'map') { try { mapObj.remove(); } catch (e) {} mapObj = null; }
  if (S.user.must_change && seg[0] !== 'me') return go('#/me');
  try {
    if (!seg.length) return go(admin() ? '#/dashboard' : '#/clients');
    switch (seg[0]) {
      case 'clients': return viewClients();
      case 'new': return viewClientForm(null);
      case 'client': return seg[2] === 'edit' ? viewClientForm(seg[1]) : viewClient(seg[1]);
      case 'visit': return viewVisitForm(seg[1] === 'new' ? null : seg[1], params);
      case 'agenda': return viewAgenda();
      case 'map': return viewMap();
      case 'me': return viewMe();
      case 'export': return canExport() ? viewExport() : go('#/clients');
      case 'dashboard': return admin() ? viewDashboard() : go('#/clients');
      case 'team': return admin() ? viewTeam() : go('#/clients');
      case 'journal': return admin() ? viewJournal() : go('#/clients');
      case 'settings': return admin() ? viewSettings() : go('#/clients');
      default: return go('#/');
    }
  } catch (e) { console.error(e); toast(t('error', { e: e.message })); }
}
window.addEventListener('hashchange', () => { if (S.user) render(); });

async function start() {
  await refreshPending();
  const first = !(await DB.get('meta', 'since'));
  if (first) { layout(t('clients'), h('p', { class: 'muted' }, t('loading'))); await syncNow(true); }
  render();
  if (!first) kick(500);
}
async function boot() {
  setLang(lang);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try { await DB.open(); } catch (e) {}
  const me = await DB.get('meta', 'me').catch(() => null);
  const st = await DB.get('meta', 'settings').catch(() => null);
  if (st) S.settings = st;
  if (me) {
    // déjà connecté sur ce téléphone : on ouvre tout de suite, même sans réseau
    S.user = me;
    const users = await DB.all('users');
    S.users = new Map(users.map((u) => [u.id, u]));
    S.lastSync = (await DB.get('meta', 'lastSync')) || 0;
    return start();
  }
  try {
    const d = await api('GET', '/api/me');
    S.user = d.user; S.settings = d.settings;
    await DB.put('meta', S.user, 'me');
    start();
  } catch (e) { if (e.status !== 401) showLogin(); }
}
boot();
})();
