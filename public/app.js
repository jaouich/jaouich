/* Magiscom CRM — fiches clients, notes vocales et réunions transcrites par l'IA, tableau de bord de la direction.
   Fonctionne hors ligne : tout est enregistré sur le téléphone puis envoyé dès que le réseau revient. */
(() => {
'use strict';

// =================================================================== textes
const T = {
  fr: {
    fullName: 'Nom complet', newSheet: 'Nouvelle fiche', setupCode: 'Code de mise en service', demoT: 'Version de démonstration', demoP: 'Données fictives, remises à zéro chaque nuit. Choisissez un profil pour entrer :', demoAdmin: 'Entrer comme Direction', demoRep: 'Entrer comme Commercial', demoChip: 'DÉMO', clients: 'Clients', agenda: 'Agenda', map: 'Carte', me: 'Moi', dashboard: 'Tableau de bord', team: 'Commerciaux', export: 'Export Excel', journal: 'Journal', settings: 'Réglages', newClient: 'Nouveau',
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
    fullName: 'الاسم الكامل', newSheet: 'ملف جديد', setupCode: 'رمز التفعيل', demoT: 'نسخة تجريبية', demoP: 'معطيات وهمية كتّعاود من الصفر كل ليلة. اختر حساب للدخول:', demoAdmin: 'الدخول كمدير', demoRep: 'الدخول كمندوب', demoChip: 'تجريبي', clients: 'الزبناء', agenda: 'المواعيد', map: 'الخريطة', me: 'حسابي', dashboard: 'لوحة القيادة', team: 'المناديب', export: 'تصدير Excel', journal: 'السجل', settings: 'الإعدادات', newClient: 'جديد',
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
    fullName: 'Full name', newSheet: 'New record', setupCode: 'Setup code', demoT: 'Demo version', demoP: 'Sample data, reset every night. Pick a profile to sign in:', demoAdmin: 'Sign in as Manager', demoRep: 'Sign in as Sales rep', demoChip: 'DEMO', clients: 'Clients', agenda: 'Agenda', map: 'Map', me: 'Me', dashboard: 'Dashboard', team: 'Sales reps', export: 'Excel export', journal: 'Activity log', settings: 'Settings', newClient: 'New',
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
// textes propres au CRM
Object.assign(T.fr, {
  phone: 'GSM', phone2: 'Téléphone fixe', notes: 'Remarques et commentaires', companyF: 'Nom de la société', website: 'Site web', sector: 'Secteur / activité', visits: 'Activité', activity: 'Activité',
  note: 'Note', vocal: 'Note vocale', reunion: 'Réunion', newNote: 'Note', newVocal: 'Note vocale', newMeeting: 'Réunion IA', noteTxt: 'Remarque', notePh: 'Besoin du client, action effectuée, à faire…',
  rec: 'Enregistrer', recStop: 'Arrêter', recImport: 'Importer un fichier audio', recLang: 'Langue parlée', langAuto: 'Automatique', langFr: 'Français', langAr: 'Arabe', recMax: 'Durée maximale : {m} minutes',
  recHint: 'Parlez normalement, le texte sera écrit automatiquement dans la fiche du client.', recDenied: 'Microphone inaccessible : autorisez le micro pour ce site. ({e})', recUnsupported: 'Ce navigateur ne permet pas d’enregistrer. Utilisez Chrome (Android) ou Safari (iPhone).',
  meetT: 'Réunion avec le client', meetP: 'L’échange est enregistré, puis l’IA écrit la transcription (qui a dit quoi) et le compte-rendu.', meetConsent: 'Le client a accepté que la réunion soit enregistrée', meetStart: 'Commencer la réunion', meetEnd: 'Terminer la réunion', meetRec: 'Enregistrement en cours', meetKeep: 'Gardez l’écran allumé et le téléphone près des interlocuteurs.', meetLeave: 'Une réunion est en cours d’enregistrement. Quitter quand même ?', meetSaved: 'Réunion enregistrée : analyse par l’IA en cours',
  aiPending: 'Analyse par l’IA en cours…', aiWaitNet: 'En attente de réseau : l’analyse sera faite à l’envoi', aiError: 'L’analyse n’a pas abouti : {e}', aiRetry: 'Relancer l’analyse', aiRegen: 'Régénérer le compte-rendu', aiNone: 'Pas encore analysé', aiAnalyze: 'Analyser avec l’IA',
  transcript: 'Transcription', transcriptWho: 'Transcription (qui a dit quoi)', summary: 'Résumé', recordings: 'Enregistrements', part: 'Partie {n}', duration: 'Durée', editText: 'Modifier le texte', aiTooBig: 'Fichier audio trop lourd pour la transcription (24 Mo maximum)', audio: 'Audio',
  pipeline: 'Pipeline', deals: 'Affaires', deal: 'Affaire', newDeal: 'Nouvelle affaire', dealTitle: 'Objet de l’affaire', dealTitlePh: 'Ex. : équipement de 3 postes', amount: 'Montant estimé (MAD HT)', closeDate: 'Signature prévue', stage: 'Étape',
  nouveau: 'Nouveau', devis: 'Devis envoyé', negociation: 'Négociation', gagne: 'Gagné', perdu: 'Perdu', noDeals: 'Aucune affaire. Ajoutez-en une dès qu’un besoin chiffrable apparaît.', openDeals: 'En cours', wonDeals: 'Gagnées (30 j)', weighted: 'Total en cours', moveTo: 'Passer à',
  tache: 'Tâche', tasks: 'Tâches', newTask: 'Tâche', taskTxt: 'À faire', taskPh: 'Ex. : envoyer le devis peinture', dueDate: 'Échéance', taskDone: 'Faite', noTasks: 'Aucune tâche en attente.',
  brief: 'Préparer la visite', briefT: 'Préparation de visite', briefWait: 'L’assistant relit la fiche, les affaires et l’historique…', bSituation: 'Situation', bKnow: 'À savoir', bPending: 'En attente', bPropose: 'À proposer', bQuestions: 'Questions à poser', aiOffline: 'Connexion nécessaire pour l’assistant.',
  followup: 'Message de suivi', followupWait: 'Rédaction du message…', copy: 'Copier', copied: 'Copié', sendWa: 'Ouvrir WhatsApp', sendMail: 'Ouvrir l’e-mail', subject: 'Objet', email: 'E-mail',
  dupQ: 'Une fiche semblable existe déjà : « {n} ». Créer quand même ?', dupOpen: 'Ouvrir la fiche existante', dupCreate: 'Créer quand même',
  importT: 'Importer des clients', importP: 'Fichier Excel (.xlsx) ou CSV exporté de Sage, EBP ou autre. Les colonnes sont reconnues par leur titre (code, nom, téléphone, e-mail, ville…). Un code déjà présent met la fiche à jour.', importPick: 'Choisir le fichier', importRows: '{n} ligne(s) lues · colonnes reconnues : {c}', importGo: 'Importer {n} fiche(s)', importKind: 'Importer comme', importOwner: 'Attribuer à', importDone: '{c} créée(s), {u} mise(s) à jour', importErr: 'Fichier illisible : {e}', importNone: 'Aucune colonne « nom » trouvée dans le fichier.', expDeals: 'Affaires (pipeline)',
  'a_deal.create': 'Affaire créée', 'a_deal.update': 'Affaire modifiée', 'a_deal.stage': 'Étape d’affaire', 'a_deal.delete': 'Affaire supprimée', 'a_client.import': 'Import de clients', 'a_export.deals': 'Export affaires',
  theme: 'Thème', themeHelp: 'L’apparence de l’application sur cet appareil.', themeDefault: 'Thème par défaut de la société', themeCompany: 'Celui de la société', capture: 'Enregistrer', captureT: 'Enregistrer un échange', pickClient: 'Pour quel client ?', newClientShort: 'Nouveau client', searchShort: 'Rechercher un client…',
  speakerC: 'Commercial', speakerK: 'Client', 'a_ai.transcribe': 'Note vocale transcrite', 'a_ai.meeting': 'Réunion analysée', expVisits: 'Activités et comptes-rendus', kpiVisits7: 'Activités (7 jours)', kpiVisits30: 'Activités (30 jours)', visits30: 'Activités par jour (30 derniers jours)', lastVisitCol: 'Dernière activité', recent: 'Activité récente', noVisits: 'Aucune activité pour le moment.',
});
Object.assign(T.ar, {
  phone: 'الهاتف المحمول', phone2: 'الهاتف الثابت', notes: 'ملاحظات وتعليقات', companyF: 'اسم الشركة', website: 'الموقع الإلكتروني', sector: 'القطاع / النشاط', visits: 'النشاط', activity: 'النشاط',
  note: 'ملاحظة', vocal: 'ملاحظة صوتية', reunion: 'اجتماع', newNote: 'ملاحظة', newVocal: 'ملاحظة صوتية', newMeeting: 'اجتماع بالذكاء الاصطناعي', noteTxt: 'ملاحظة', notePh: 'حاجة الزبون، ما تم القيام به، ما يجب فعله…',
  rec: 'تسجيل', recStop: 'إيقاف', recImport: 'استيراد ملف صوتي', recLang: 'لغة الكلام', langAuto: 'تلقائي', langFr: 'الفرنسية', langAr: 'العربية', recMax: 'المدة القصوى: {m} دقيقة',
  recHint: 'تكلم بشكل عادي، وسيُكتب النص تلقائيًا في ملف الزبون.', recDenied: 'لا يمكن الوصول إلى الميكروفون: اسمح به لهذا الموقع. ({e})', recUnsupported: 'هذا المتصفح لا يسمح بالتسجيل. استعمل Chrome أو Safari.',
  meetT: 'اجتماع مع الزبون', meetP: 'يُسجَّل الحوار، ثم يكتب الذكاء الاصطناعي النص (من قال ماذا) والتقرير.', meetConsent: 'وافق الزبون على تسجيل الاجتماع', meetStart: 'بدء الاجتماع', meetEnd: 'إنهاء الاجتماع', meetRec: 'التسجيل جارٍ', meetKeep: 'اترك الشاشة مضاءة والهاتف قريبًا من المتحدثين.', meetLeave: 'هناك اجتماع قيد التسجيل. الخروج رغم ذلك؟', meetSaved: 'تم حفظ الاجتماع: التحليل جارٍ',
  aiPending: 'التحليل بالذكاء الاصطناعي جارٍ…', aiWaitNet: 'في انتظار الشبكة: سيتم التحليل عند الإرسال', aiError: 'لم ينجح التحليل: {e}', aiRetry: 'إعادة التحليل', aiRegen: 'إعادة إنشاء التقرير', aiNone: 'لم يُحلَّل بعد', aiAnalyze: 'تحليل بالذكاء الاصطناعي',
  transcript: 'النص', transcriptWho: 'النص (من قال ماذا)', summary: 'الملخص', recordings: 'التسجيلات', part: 'الجزء {n}', duration: 'المدة', editText: 'تعديل النص', aiTooBig: 'الملف الصوتي ثقيل جدًا (24 ميغا كحد أقصى)', audio: 'صوت',
  pipeline: 'الصفقات', deals: 'الصفقات', deal: 'صفقة', newDeal: 'صفقة جديدة', dealTitle: 'موضوع الصفقة', dealTitlePh: 'مثال: تجهيز 3 مكاتب', amount: 'المبلغ التقديري (درهم)', closeDate: 'تاريخ التوقيع المتوقع', stage: 'المرحلة',
  nouveau: 'جديدة', devis: 'عرض مرسل', negociation: 'تفاوض', gagne: 'رابحة', perdu: 'خاسرة', noDeals: 'لا توجد صفقات بعد.', openDeals: 'جارية', wonDeals: 'رابحة (30 يومًا)', weighted: 'المجموع الجاري', moveTo: 'نقل إلى',
  tache: 'مهمة', tasks: 'المهام', newTask: 'مهمة', taskTxt: 'ما يجب فعله', taskPh: 'مثال: إرسال عرض السعر', dueDate: 'الأجل', taskDone: 'منجزة', noTasks: 'لا توجد مهام.',
  brief: 'التحضير للزيارة', briefT: 'تحضير الزيارة', briefWait: 'المساعد يراجع الملف والصفقات والسجل…', bSituation: 'الوضعية', bKnow: 'يجب معرفته', bPending: 'في الانتظار', bPropose: 'ما يمكن اقتراحه', bQuestions: 'أسئلة مفيدة', aiOffline: 'يلزم الاتصال بالإنترنت.',
  followup: 'رسالة متابعة', followupWait: 'جارٍ تحرير الرسالة…', copy: 'نسخ', copied: 'تم النسخ', sendWa: 'فتح واتساب', sendMail: 'فتح البريد', subject: 'الموضوع',
  dupQ: 'يوجد ملف مشابه: «{n}». إنشاء رغم ذلك؟', dupOpen: 'فتح الملف الموجود', dupCreate: 'إنشاء رغم ذلك',
  importT: 'استيراد الزبناء', importP: 'ملف Excel أو CSV مُصدَّر من Sage أو EBP. تُعرف الأعمدة من عناوينها. الرمز الموجود يُحدِّث الملف.', importPick: 'اختيار الملف', importRows: '{n} سطر · أعمدة معروفة: {c}', importGo: 'استيراد {n} ملف', importKind: 'استيراد كـ', importOwner: 'إسناد إلى', importDone: '{c} جديد، {u} محدَّث', importErr: 'ملف غير مقروء: {e}', importNone: 'لم يتم العثور على عمود الاسم.', expDeals: 'الصفقات',
  theme: 'المظهر', themeHelp: 'مظهر التطبيق على هذا الجهاز.', themeDefault: 'المظهر الافتراضي للشركة', themeCompany: 'مظهر الشركة', capture: 'تسجيل', captureT: 'تسجيل محادثة', pickClient: 'لأي زبون؟', newClientShort: 'زبون جديد', searchShort: 'ابحث عن زبون…',
  speakerC: 'المندوب', speakerK: 'الزبون', 'a_ai.transcribe': 'تم تحويل ملاحظة صوتية', 'a_ai.meeting': 'تم تحليل اجتماع', expVisits: 'الأنشطة والتقارير', recent: 'آخر الأنشطة', noVisits: 'لا يوجد نشاط بعد.',
});
Object.assign(T.en, {
  phone: 'Mobile', phone2: 'Landline', notes: 'Remarks and comments', companyF: 'Company name', website: 'Website', sector: 'Sector / activity', visits: 'Activity', activity: 'Activity',
  note: 'Note', vocal: 'Voice note', reunion: 'Meeting', newNote: 'Note', newVocal: 'Voice note', newMeeting: 'AI meeting', noteTxt: 'Remark', notePh: 'Client need, action taken, to do…',
  rec: 'Record', recStop: 'Stop', recImport: 'Import an audio file', recLang: 'Spoken language', langAuto: 'Automatic', langFr: 'French', langAr: 'Arabic', recMax: 'Maximum length: {m} minutes',
  recHint: 'Speak normally, the text will be written into the client record automatically.', recDenied: 'Microphone unavailable: allow the microphone for this site. ({e})', recUnsupported: 'This browser cannot record. Use Chrome (Android) or Safari (iPhone).',
  meetT: 'Meeting with the client', meetP: 'The conversation is recorded, then AI writes the transcript (who said what) and the report.', meetConsent: 'The client agreed to the meeting being recorded', meetStart: 'Start the meeting', meetEnd: 'End the meeting', meetRec: 'Recording', meetKeep: 'Keep the screen on and the phone close to the speakers.', meetLeave: 'A meeting is being recorded. Leave anyway?', meetSaved: 'Meeting saved: AI analysis in progress',
  aiPending: 'AI analysis in progress…', aiWaitNet: 'Waiting for network: analysis will run once sent', aiError: 'Analysis failed: {e}', aiRetry: 'Retry analysis', aiRegen: 'Regenerate the report', aiNone: 'Not analysed yet', aiAnalyze: 'Analyse with AI',
  transcript: 'Transcript', transcriptWho: 'Transcript (who said what)', summary: 'Summary', recordings: 'Recordings', part: 'Part {n}', duration: 'Duration', editText: 'Edit text', aiTooBig: 'Audio file too large for transcription (24 MB max)', audio: 'Audio',
  pipeline: 'Pipeline', deals: 'Deals', deal: 'Deal', newDeal: 'New deal', dealTitle: 'Deal name', dealTitlePh: 'E.g. equipment for 3 desks', amount: 'Estimated amount (MAD)', closeDate: 'Expected signature', stage: 'Stage',
  nouveau: 'New', devis: 'Quote sent', negociation: 'Negotiation', gagne: 'Won', perdu: 'Lost', noDeals: 'No deals yet.', openDeals: 'Open', wonDeals: 'Won (30 d)', weighted: 'Open total', moveTo: 'Move to',
  tache: 'Task', tasks: 'Tasks', newTask: 'Task', taskTxt: 'To do', taskPh: 'E.g. send the quote', dueDate: 'Due', taskDone: 'Done', noTasks: 'No pending task.',
  brief: 'Prepare the visit', briefT: 'Visit preparation', briefWait: 'The assistant is reading the record, deals and history…', bSituation: 'Situation', bKnow: 'Good to know', bPending: 'Pending', bPropose: 'To propose', bQuestions: 'Questions to ask', aiOffline: 'Connection needed for the assistant.',
  followup: 'Follow-up message', followupWait: 'Writing the message…', copy: 'Copy', copied: 'Copied', sendWa: 'Open WhatsApp', sendMail: 'Open e-mail', subject: 'Subject',
  dupQ: 'A similar record already exists: “{n}”. Create anyway?', dupOpen: 'Open the existing record', dupCreate: 'Create anyway',
  importT: 'Import clients', importP: 'Excel (.xlsx) or CSV file exported from Sage, EBP or other. Columns are matched by their title. An existing code updates the record.', importPick: 'Choose the file', importRows: '{n} row(s) · matched columns: {c}', importGo: 'Import {n} record(s)', importKind: 'Import as', importOwner: 'Assign to', importDone: '{c} created, {u} updated', importErr: 'Unreadable file: {e}', importNone: 'No “name” column found.', expDeals: 'Deals (pipeline)',
  theme: 'Theme', themeHelp: 'How the app looks on this device.', themeDefault: 'Company default theme', themeCompany: 'Company theme', capture: 'Record', captureT: 'Record a conversation', pickClient: 'Which client?', newClientShort: 'New client', searchShort: 'Search a client…',
  speakerC: 'Sales rep', speakerK: 'Client', 'a_ai.transcribe': 'Voice note transcribed', 'a_ai.meeting': 'Meeting analysed', expVisits: 'Activities and reports', recent: 'Recent activity', noVisits: 'No activity yet.',
});
// thèmes : choisis par chaque utilisateur sur son appareil, ou imposés par défaut par la direction
Object.assign(T.fr, {
  jobTitle: 'Fonction (titre affiché)', jobTitlePh: 'ex. Directrice commerciale, Chef d’équipe…', roleHelp: 'Le rôle donne les droits : « Administrateur » voit tout et gère l’équipe ; « Commercial » gère son portefeuille. La fonction est seulement le titre affiché.', forgot: 'Mot de passe oublié ?', forgotT: 'Mot de passe oublié', forgotRep: 'Commercial : demandez à votre direction. Elle ouvre « Commerciaux », touche votre nom puis « Nouveau mot de passe ».', forgotAdmin: 'Direction : entrez votre identifiant, le code de secours et un nouveau mot de passe.', recCode: 'Code de secours', recNew: 'Nouveau mot de passe', recGo: 'Changer le mot de passe', recSaveT: 'Votre nouveau code de secours', recSaveP: 'Notez-le et gardez-le en lieu sûr (papier, coffre). L’ancien ne marche plus. Sans ce code, seule l’assistance Magiscom peut débloquer un compte de direction.', recSec: 'Code de secours de la direction', recSecP: 'Si un directeur oublie son mot de passe, ce code permet d’en choisir un nouveau depuis l’écran de connexion. Gardez-le hors du téléphone.', recSecOk: 'Un code de secours existe.', recSecNone: 'Aucun code de secours : créez-en un maintenant.', recGen: 'Générer un nouveau code', recPw: 'Confirmez avec votre mot de passe', recTip: 'Conseil : créez au moins deux comptes « Administrateur ».', importShort: 'Importer', importLine: 'Ligne {n}', close: 'Fermer', magiOpenPage: 'Ouvrir cet écran', magiToday: 'Aujourd’hui : {x}.', magiRdv: '{n} rendez-vous / appel(s)', magiLate: '{n} en retard', magiSleep: '{n} client(s) sans visite depuis 30 jours', magiFree: 'rien de prévu', magiOffHelp: 'Sans internet, je peux ouvrir un écran, trouver un client ou résumer votre journée. Pour le reste, je reviens dès que le réseau est là.', magiFound: 'Voici ce que j’ai trouvé :', magiMarkDone: 'Marquer comme fait', magiMoveTo: 'Déplacer au', magiChanges: 'Modifications', magiAdd: 'à ajouter', magiOpenAct: 'Ouvrir l’activité', magiNoMeet: 'Pas encore de réunion ou de visite avec compte-rendu pour ce client.', aiToday: 'IA aujourd’hui', aiTodayD: '{a} questions à Magi · {s} transcriptions · {l} rapports', aiYest: 'Hier : {a} · {s} · {l}', magiMenu: 'Questions rapides', magi: 'Assistant Magi', magiHi: 'Bonjour {n} ! Je suis Magi. Écrivez ou parlez : je trouve un client, je planifie un rendez-vous, je crée une fiche ou une affaire, je réponds sur votre activité.',
  magiPh: 'Écrivez ou parlez…', magiSend: 'Envoyer', magiMic: 'Parler', magiListening: 'Je vous écoute… touchez pour arrêter', magiThinking: 'Magi réfléchit…', magiHear: 'Je transcris…',
  magiVoiceOn: 'Réponses à voix haute : activées', magiVoiceOff: 'Réponses à voix haute : désactivées', magiDone: 'C’est fait ✅', magiOpen: 'Ouvrir la fiche', magiNew: 'Nouvelle conversation',
  magiS1: 'Mes rendez-vous de demain', magiS2: 'Clients pas visités depuis 30 jours', magiS3: 'Où en est le pipeline ?', magiS4: 'Ouvre l’agenda', magiNeedNet: 'Magi a besoin d’internet pour comprendre votre demande.',
  magiSimilar: 'Attention : une fiche porte déjà ce nom', magiCall: 'Appeler', magiMail: 'Écrire un e-mail', magiGo: 'Itinéraire', magiNoPhone: 'Pas de numéro sur la fiche', magiNoGps: 'Pas de position GPS sur la fiche',
  magiStage: 'Nouvelle étape', magiWhen: 'Quand', magiWhat: 'Objet', magiMicLang: 'Langue parlée',
});
Object.assign(T.ar, {
  jobTitle: 'الوظيفة (الاسم المعروض)', jobTitlePh: 'مثلا: مديرة تجارية، رئيس فريق…', roleHelp: 'الدور يحدد الصلاحيات: «مدير» يرى كل شيء ويسيّر الفريق، و«مندوب» يسيّر محفظته. الوظيفة مجرد اسم معروض.', forgot: 'نسيت كلمة المرور؟', forgotT: 'نسيت كلمة المرور', forgotRep: 'المندوب: اطلب من الإدارة. تفتح «المناديب» ثم تضغط على اسمك ثم «كلمة مرور جديدة».', forgotAdmin: 'الإدارة: أدخل اسم المستخدم ورمز الطوارئ وكلمة مرور جديدة.', recCode: 'رمز الطوارئ', recNew: 'كلمة المرور الجديدة', recGo: 'تغيير كلمة المرور', recSaveT: 'رمز الطوارئ الجديد', recSaveP: 'اكتبه واحتفظ به في مكان آمن (ورقة، خزنة). الرمز القديم لم يعد يعمل. بدون هذا الرمز لا يمكن فتح حساب الإدارة إلا عبر دعم ماجيسكوم.', recSec: 'رمز الطوارئ للإدارة', recSecP: 'إذا نسي المدير كلمة المرور، يسمح هذا الرمز باختيار كلمة جديدة من شاشة الدخول. احتفظ به خارج الهاتف.', recSecOk: 'يوجد رمز طوارئ.', recSecNone: 'لا يوجد رمز طوارئ: أنشئ واحدا الآن.', recGen: 'إنشاء رمز جديد', recPw: 'أكد بكلمة المرور', recTip: 'نصيحة: أنشئ حسابين على الأقل بدور «مدير».', importShort: 'استيراد', importLine: 'السطر {n}', close: 'إغلاق', magiOpenPage: 'فتح هذه الشاشة', magiToday: 'اليوم: {x}.', magiRdv: '{n} موعد / اتصال', magiLate: '{n} متأخرة', magiSleep: '{n} زبون بدون زيارة منذ 30 يوما', magiFree: 'لا شيء مبرمج', magiOffHelp: 'بدون إنترنت يمكنني فتح شاشة، إيجاد زبون أو تلخيص يومك. والباقي عند عودة الشبكة.', magiFound: 'هذا ما وجدته:', magiMarkDone: 'تحديد كمنجز', magiMoveTo: 'تأجيل إلى', magiChanges: 'التعديلات', magiAdd: 'للإضافة', magiOpenAct: 'فتح النشاط', magiNoMeet: 'لا يوجد بعد اجتماع أو زيارة بتقرير لهذا الزبون.', aiToday: 'الذكاء الاصطناعي اليوم', aiTodayD: '{a} سؤال لماجي · {s} تحويل صوت · {l} تقرير', aiYest: 'أمس: {a} · {s} · {l}', magiMenu: 'أسئلة سريعة', magi: 'المساعد ماجي', magiHi: 'مرحبا {n}! أنا ماجي. اكتب أو تكلم: أجد زبونا، أبرمج موعدا، أنشئ ملفا أو صفقة، وأجيب عن نشاطك.',
  magiPh: 'اكتب أو تكلم…', magiSend: 'إرسال', magiMic: 'تكلم', magiListening: 'أنا أستمع… اضغط للتوقف', magiThinking: 'ماجي يفكر…', magiHear: 'جاري تحويل الصوت إلى نص…',
  magiVoiceOn: 'قراءة الأجوبة بالصوت: مفعلة', magiVoiceOff: 'قراءة الأجوبة بالصوت: متوقفة', magiDone: 'تم ✅', magiOpen: 'فتح الملف', magiNew: 'محادثة جديدة',
  magiS1: 'مواعيدي غدا', magiS2: 'الزبناء الذين لم أزرهم منذ 30 يوما', magiS3: 'كيف حال الصفقات؟', magiS4: 'افتح الأجندة', magiNeedNet: 'ماجي يحتاج إلى الإنترنت لفهم طلبك.',
  magiSimilar: 'تنبيه: يوجد ملف بنفس الاسم', magiCall: 'اتصال', magiMail: 'إرسال بريد', magiGo: 'الطريق', magiNoPhone: 'لا يوجد رقم في الملف', magiNoGps: 'لا يوجد موقع GPS في الملف',
  magiStage: 'المرحلة الجديدة', magiWhen: 'متى', magiWhat: 'الموضوع', magiMicLang: 'لغة الكلام',
});
Object.assign(T.en, {
  jobTitle: 'Job title (shown)', jobTitlePh: 'e.g. Sales director, Team leader…', roleHelp: 'The role sets the rights: “Administrator” sees everything and manages the team; “Sales rep” manages their own portfolio. The job title is only what is shown.', forgot: 'Forgot password?', forgotT: 'Forgot password', forgotRep: 'Sales rep: ask your manager. They open “Team”, tap your name, then “New password”.', forgotAdmin: 'Management: enter your login, the recovery code and a new password.', recCode: 'Recovery code', recNew: 'New password', recGo: 'Change password', recSaveT: 'Your new recovery code', recSaveP: 'Write it down and keep it safe. The old one no longer works. Without it, only Magiscom support can unlock a management account.', recSec: 'Management recovery code', recSecP: 'If a manager forgets their password, this code lets them choose a new one from the login screen. Keep it off the phone.', recSecOk: 'A recovery code exists.', recSecNone: 'No recovery code: create one now.', recGen: 'Generate a new code', recPw: 'Confirm with your password', recTip: 'Tip: create at least two “Administrator” accounts.', importShort: 'Import', importLine: 'Line {n}', close: 'Close', magiOpenPage: 'Open this screen', magiToday: 'Today: {x}.', magiRdv: '{n} meeting(s) / call(s)', magiLate: '{n} overdue', magiSleep: '{n} client(s) not visited for 30 days', magiFree: 'nothing planned', magiOffHelp: 'Offline I can open a screen, find a client or sum up your day. The rest as soon as the network is back.', magiFound: 'Here is what I found:', magiMarkDone: 'Mark as done', magiMoveTo: 'Move to', magiChanges: 'Changes', magiAdd: 'to add', magiOpenAct: 'Open activity', magiNoMeet: 'No meeting or visit with a report for this client yet.', aiToday: 'AI today', aiTodayD: '{a} Magi questions · {s} transcriptions · {l} reports', aiYest: 'Yesterday: {a} · {s} · {l}', magiMenu: 'Quick questions', magi: 'Magi assistant', magiHi: 'Hi {n}! I’m Magi. Type or talk: I find a client, schedule a meeting, create a record or a deal, and answer questions about your activity.',
  magiPh: 'Type or talk…', magiSend: 'Send', magiMic: 'Talk', magiListening: 'Listening… tap to stop', magiThinking: 'Magi is thinking…', magiHear: 'Transcribing…',
  magiVoiceOn: 'Spoken answers: on', magiVoiceOff: 'Spoken answers: off', magiDone: 'Done ✅', magiOpen: 'Open record', magiNew: 'New conversation',
  magiS1: 'My meetings tomorrow', magiS2: 'Clients not visited for 30 days', magiS3: 'How is the pipeline?', magiS4: 'Open the agenda', magiNeedNet: 'Magi needs internet to understand you.',
  magiSimilar: 'Careful: a record already has this name', magiCall: 'Call', magiMail: 'Send an e-mail', magiGo: 'Directions', magiNoPhone: 'No phone number on the record', magiNoGps: 'No GPS position on the record',
  magiStage: 'New stage', magiWhen: 'When', magiWhat: 'Subject', magiMicLang: 'Spoken language',
});
const THEMES = [['indigo', 'Indigo', '#4F2FD0', '#F3F2FA'], ['majorelle', 'Majorelle', '#2443C7', '#F2B705'], ['menthe', 'Menthe', '#0B7A5E', '#EFF6F2'], ['ocean', 'Océan', '#0A6C8F', '#EEF5F8'], ['nuit', 'Nuit', '#8E7BFF', '#100E19']];
function myTheme() { try { return localStorage.getItem('crm-theme') || ''; } catch (e) { return ''; } }
function applyTheme(settings) {
  const pick = myTheme() || (settings && settings.theme) || 'indigo';
  const th = THEMES.find((x) => x[0] === pick) || THEMES[0];
  document.documentElement.dataset.theme = th[0];
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = th[0] === 'nuit' ? '#100E19' : th[2];
}
const hueOf = (s) => { let x = 0; for (const ch of String(s || '')) x = (x * 31 + ch.charCodeAt(0)) % 360; return x; };
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
  pipe: '<rect x="3.5" y="4" width="4.5" height="16" rx="1.5"/><rect x="9.75" y="4" width="4.5" height="11" rx="1.5"/><rect x="16" y="4" width="4.5" height="7" rx="1.5"/>', spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>', vol: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  send: '<path d="M4 12 20 4l-4 16-4-6.5z"/><path d="M12 13.5 20 4"/>', box: '<rect x="4" y="4" width="16" height="16" rx="4"/>', boxok: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>', meet: '<circle cx="8" cy="9" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M2.5 19.5a5.5 5.5 0 0 1 11 0M13.5 19.5a4.5 4.5 0 0 1 8 -2.8"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>', web: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
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
      const r = indexedDB.open(BASE ? 'crm-demo' : 'crm', 2);
      r.onupgradeneeded = () => {
        const d = r.result, have = (n) => d.objectStoreNames.contains(n);
        for (const s of ['clients', 'visits', 'files', 'users', 'deals']) if (!have(s)) d.createObjectStore(s, { keyPath: 'id' });
        if (!have('outbox')) d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        if (!have('blobs')) d.createObjectStore('blobs');
        if (!have('meta')) d.createObjectStore('meta');
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
  async wipe() { const all = ['clients', 'visits', 'files', 'users', 'deals', 'outbox', 'blobs', 'meta']; return this.run(all, 'readwrite', (tx) => { for (const s of all) tx.objectStore(s).clear(); }); },
};

// =================================================================== serveur
// /demo : version de démonstration sur la même adresse (base, session et stockage séparés)
const BASE = /^\/demo(\/|$)/.test(location.pathname) ? '/demo' : '';
class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function api(method, path, body, headers = {}) {
  const h2 = { 'X-Requested-With': 'terrain', ...headers };
  let b = body;
  if (body !== undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) { b = JSON.stringify(body); h2['Content-Type'] = 'application/json'; }
  let r;
  try { r = await fetch(BASE + path, { method, headers: h2, body: b, credentials: 'same-origin' }); }
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
  if (op.type === 'deal') return api('PUT', '/api/deals/' + op.id, op.body);
  if (op.type === 'ai') {
    // l'analyse ne doit jamais bloquer les autres envois : en cas de refus, l'activité affiche « Relancer »
    try { return await api('POST', '/api/ai/process/' + op.id, op.body || {}); }
    catch (e) { if (e.status === 0 || e.status === 401) throw e; const v = await DB.get('visits', op.id); if (v) await DB.put('visits', { ...v, ai_status: 'error', ai_error: e.message }); return null; }
  }
  if (op.type === 'file') {
    const blob = await DB.get('blobs', op.id);
    if (!blob) return null;   // déjà envoyé puis nettoyé
    const meta = op.body;
    if (blob.size <= 90 * 1048576) {
      const hx = { 'Content-Type': meta.mime || 'application/octet-stream', 'X-Client-Id': meta.client_id, 'X-Visit-Id': meta.visit_id || '', 'X-File-Name': encodeURIComponent(meta.name), 'X-Category': meta.category, 'X-Created-At': String(meta.created_at) };
      if (meta.seq != null) hx['X-Seq'] = String(meta.seq);
      if (meta.transcribe) { hx['X-Transcribe'] = meta.transcribe; hx['X-Lang'] = meta.lang || ''; }
      return api('PUT', '/api/files/' + op.id, blob, hx);
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
        if (res && res.deal) await DB.put('deals', res.deal);
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
    if (d.deals && d.deals.length) await DB.putMany('deals', d.deals);
    await DB.putMany('users', d.users);
    S.users = new Map(d.users.map((u) => [u.id, u]));
    S.user = d.me; S.settings = d.settings;
    await DB.put('meta', S.user, 'me');
    await DB.put('meta', S.settings, 'settings');
    await DB.put('meta', Math.max(0, d.now - 10000), 'since');
    S.lastSync = Date.now();
    await DB.put('meta', S.lastSync, 'lastSync');
    changed = changed || d.clients.length || d.visits.length || d.files.length || (d.deals && d.deals.length) || (d.gone && d.gone.length);
    S.online = true;
  } catch (e) {
    if (e.status === 0) S.online = false; else if (e.status !== 401) S.lastError = e.message;
  } finally {
    S.syncing = false;
    await refreshPending();
    if (changed && !S.recording && !document.querySelector('.modal') && !document.activeElement?.matches('input,textarea,select')) render();
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
  const [clients, visits, files, users, deals] = await Promise.all([DB.all('clients'), DB.all('visits'), DB.all('files'), DB.all('users'), DB.all('deals')]);
  S.users = new Map(users.map((u) => [u.id, u]));
  return { clients: clients.filter((c) => !c.deleted_at), visits: visits.filter((v) => !v.deleted_at), files: files.filter((f) => !f.deleted_at), deals: deals.filter((x) => !x.deleted_at) };
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
async function saveDeal(id, fields, isNew) {
  const old = (await DB.get('deals', id)) || {};
  const local = { ...old, ...fields, id, updated_at: Date.now() };
  if (isNew) Object.assign(local, { user_id: S.user.id, created_at: Date.now() });
  await DB.put('deals', local);
  const prev = (await DB.all('outbox')).find((o) => o.type === 'deal' && o.id === id && !o.failed);
  if (prev) { prev.body = { ...prev.body, ...fields }; await DB.put('outbox', prev); kick(); }
  else await queue({ type: 'deal', id, body: isNew ? { ...fields, created_at: local.created_at } : fields });
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
function showRecovery(code) {
  const m = modal(h('h3', {}, t('recSaveT')), h('div', { class: 'pw', dir: 'ltr' }, code), h('p', { class: 'small muted', style: 'margin:0' }, t('recSaveP')),
    h('button', { class: 'btn primary', onclick: () => { try { navigator.clipboard.writeText(code).catch(() => {}); } catch (e) {} m.remove(); } }, 'OK'));
}
function forgotModal(login) {
  const err = h('p', { class: 'small', role: 'alert', style: 'color:var(--red);margin:0' });
  const lg = h('input', { class: 'input', value: login || '', dir: 'ltr', autocomplete: 'username', autocapitalize: 'none' });
  const code = h('input', { class: 'input', dir: 'ltr', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'XXXX-XXXX-XXXX' });
  const pw = h('input', { class: 'input', type: 'password', dir: 'ltr', autocomplete: 'new-password', minlength: 8 });
  const m = modal(h('h3', {}, t('forgotT')),
    h('div', { class: 'tipbox small' }, t('forgotRep')),
    h('p', { class: 'small', style: 'margin:0' }, t('forgotAdmin')),
    h('label', { class: 'f' }, t('login'), lg), h('label', { class: 'f' }, t('recCode'), code), h('label', { class: 'f' }, t('recNew') + ' (8+)', pw), err,
    h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { class: 'btn ghost', onclick: () => m.remove() }, t('cancel')),
      h('button', { class: 'btn primary', onclick: async (e) => {
        err.textContent = ''; e.target.disabled = true;
        try {
          const d = await api('POST', '/api/auth/recover', { login: lg.value, code: code.value, password: pw.value });
          const prev = await DB.get('meta', 'me');
          if (prev && prev.id !== d.user.id) await DB.wipe();
          S.user = d.user; if (d.settings) S.settings = d.settings;
          await DB.put('meta', S.user, 'me');
          m.remove(); start(); showRecovery(d.new_code);
        } catch (x) { err.textContent = x.status === 0 ? t('offline') : x.message; e.target.disabled = false; }
      } }, t('recGo'))));
  setTimeout(() => (login ? code : lg).focus(), 50);
}
async function showLogin() {
  let st = { setup_needed: false, settings: S.settings };
  try { st = await (await fetch(BASE + '/api/status')).json(); } catch (e) {}
  applyTheme(st.settings);
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
      if (d.recovery_code) showRecovery(d.recovery_code);
    } catch (x) { err.textContent = x.status === 0 ? t('offline') : x.message; btn.disabled = false; }
  } },
    setup ? [h('h2', { style: 'margin:0' }, t('setupT')), h('p', { class: 'muted', style: 'margin:0' }, t('setupP')), st.setup_code ? field('code', t('setupCode'), 'text', 'off') : null, field('company', t('company'), 'text', 'organization'), field('name', t('yourName'), 'text', 'name')] : null,
    field('login', t('login'), 'text', 'username'), field('password', t('password'), 'password', setup ? 'new-password' : 'current-password'), err,
    h('button', { class: 'btn primary block', type: 'submit' }, setup ? t('create') : t('signIn')),
    !setup && !st.demo ? h('button', { type: 'button', class: 'btn ghost block small', onclick: () => forgotModal(f.login.value) }, t('forgot')) : null);
  if (setup) f.company.value = 'Magiscom Tech';
  const demoBox = st.demo && !setup ? h('div', { class: 'demo-box stack' }, h('b', {}, t('demoT')), h('span', { class: 'small' }, t('demoP')),
    ...st.demo.accounts.map((a) => h('button', { type: 'button', class: 'btn ' + (a.role === 'admin' ? 'primary' : 'green') + ' block', onclick: () => { f.login.value = a.login; f.password.value = a.password; form.requestSubmit(); } },
      t(a.role === 'admin' ? 'demoAdmin' : 'demoRep'))),
    h('span', { class: 'small muted' }, `${st.demo.accounts.map((a) => a.login).join(' / ')} · ${st.demo.accounts[0].password}`)) : null;
  app().replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' },
    h('div', { class: 'brand' }, h('img', { src: '/logo.png', alt: '' }), h('div', { class: 'grow' }, h('b', { style: 'font-size:19px;display:block' }, 'Magiscom CRM'), h('span', { class: 'muted small' }, (st.settings && st.settings.company) || 'Magiscom Tech')), langSel),
    demoBox, form)));
  if (!demoBox) setTimeout(() => (setup ? f.code || f.company : f.login).focus(), 50);
}

// =================================================================== mise en page
function nav() {
  const items = admin()
    ? [['#/dashboard', 'chart', 'dashboard'], ['#/clients', 'users', 'clients'], ['#/pipeline', 'pipe', 'pipeline'], ['#/agenda', 'cal', 'agenda'], ['#/map', 'map', 'map'], ['#/team', 'me', 'team'], ['#/export', 'xls', 'export'], ['#/journal', 'log', 'journal'], ['#/settings', 'gear', 'settings']]
    : [['#/clients', 'users', 'clients'], ['#/pipeline', 'pipe', 'pipeline'], ['#/agenda', 'cal', 'agenda'], ['#/map', 'map', 'map'], ...(canExport() ? [['#/export', 'xls', 'export']] : [])];
  return items;
}
function layout(title, body, opts = {}) {
  applyTheme(S.settings);
  const cur = location.hash || '#/';
  const top = h('header', { class: 'top' },
    opts.back ? h('button', { class: 'back', 'aria-label': 'Retour', onclick: () => (history.length > 1 ? history.back() : go(opts.back)) }, ic('back')) : null,
    h('h1', {}, title), opts.right || null, S.settings && S.settings.demo ? h('span', { class: 'demo-chip' }, t('demoChip')) : null, h('span', { id: 'sync', role: 'status', onclick: () => syncNow(true), style: 'cursor:pointer' }));
  const side = h('nav', { class: 'side', 'aria-label': 'Menu' },
    h('div', { class: 'brand' }, h('img', { src: '/logo.png', alt: '' }), h('div', {}, h('b', {}, 'Magiscom CRM'), h('small', {}, S.settings.company))),
    h('button', { class: 'cap', onclick: quickCapture }, ic('mic', 20), t('capture')),
    h('button', { class: 'magi-side', onclick: openMagi }, robotIcon(), t('magi')),
    ...nav().map(([href, icn, k]) => h('a', { href, class: cur.startsWith(href) ? 'on' : null }, ic(icn, 20), t(k))),
    h('div', { class: 'grow' }),
    h('a', { href: '#/me', class: cur.startsWith('#/me') ? 'on' : null }, ic('me', 20), S.user.name));
  const tabs = admin()
    ? [['#/dashboard', 'chart', 'dashboard'], ['#/clients', 'users', 'clients'], ['cap', 'mic', 'capture'], ['#/agenda', 'cal', 'agenda'], ['#/me', 'me', 'me']]
    : [['#/clients', 'users', 'clients'], ['#/agenda', 'cal', 'agenda'], ['cap', 'mic', 'capture'], ['#/pipeline', 'pipe', 'pipeline'], ['#/me', 'me', 'me']];
  const bottom = h('nav', { class: 'tabs-bottom', 'aria-label': 'Menu' }, ...tabs.map(([href, icn, k]) => href === 'cap'
    ? h('button', { class: 'cap', onclick: quickCapture, 'aria-label': t('captureT') }, h('span', {}, ic('mic', 26)), t(k))
    : h('a', { href, class: cur.startsWith(href) ? 'on' : null }, ic(icn), t(k))));
  const fab = h('button', { class: 'magi-fab', 'aria-label': t('magi'), title: t('magi'), onclick: openMagi }, robotIcon());
  app().replaceChildren(h('div', { class: 'shell' }, side, h('div', { class: 'main' }, top, h('main', { class: 'content' }, body)), bottom, fab));
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
  const actText = new Map();
  for (const v of visits) actText.set(v.client_id, (actText.get(v.client_id) || '') + ' ' + [v.summary, v.agreed, v.demands, v.not_done, v.next_step, v.transcript].filter(Boolean).join(' '));
  const listEl = h('div', { class: 'list' });
  const countEl = h('p', { class: 'muted small', style: 'margin:0 2px 8px' });
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function paint() {
    const q = norm(listState.q);
    let rows = clients.filter((c) => (!listState.kind || c.kind === listState.kind) && (!listState.owner || c.owner_id === listState.owner) && (!listState.city || c.city === listState.city)
      && (!q || norm([c.name, c.code, c.city, c.phone, c.phone2, c.contact, c.address, c.sector, c.company, c.email, c.website].join(' ')).includes(q) || (q.length >= 3 && norm(actText.get(c.id)).includes(q))));
    rows.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    countEl.textContent = t('clientsN', { n: rows.length });
    listEl.replaceChildren();
    if (!rows.length) { listEl.append(h('div', { class: 'empty' }, clients.length ? t('noneSearch') : t('none'))); return; }
    for (const c of rows.slice(0, listState.limit)) {
      const lv = lastV.get(c.id);
      listEl.append(h('a', { class: 'item', href: '#/client/' + c.id },
        h('span', { class: 'av', style: '--h:' + hueOf(c.name) }, initials(c.name)),
        h('div', { class: 'grow' },
          h('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, h('span', { class: 't' }, c.name), h('span', { class: 'badge b-' + c.kind }, t(c.kind))),
          h('div', { class: 's' }, [c.company && c.company !== c.name ? c.company : null, c.city, c.code, admin() || S.user.perms.all ? userName(c.owner_id) : null].filter(Boolean).join(' · ')),
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
  const impBtn = h('button', { class: 'btn imp', title: t('importT'), 'aria-label': t('importT'), onclick: () => { const m = modal(importBox([...S.users.values()], () => m.remove())); m.classList.add('wide'); } }, ic('xls', 20), h('span', {}, t('importShort')));
  layout(t('clients'), [h('div', { class: 'search' }, search, impBtn, h('a', { class: 'btn primary', href: '#/new' }, ic('plus', 20), h('span', {}, t('newClient')))), filters, countEl, listEl]);
  paint();
}

// =================================================================== écran : fiche client
let clientTab = 'infos';
async function viewClient(id) {
  const c = await DB.get('clients', id);
  if (!c || c.deleted_at) { layout(t('clients'), h('div', { class: 'empty' }, t('noneSearch')), { back: '#/clients' }); return; }
  const { visits, files, deals } = await loadData();
  const ds = deals.filter((x) => x.client_id === id).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
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
      ...(cc.lat != null ? [h('a', { class: 'btn sm ghost', href: gmaps(cc), target: '_blank', rel: 'noopener' }, 'Maps')] : []));
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
    h('span', { class: 'hero-av', style: '--h:' + hueOf(c.name) }, initials(c.name)),
    h('div', { class: 'row', style: 'gap:6px' }, h('span', { class: 'badge b-' + c.kind }, t(c.kind)), h('span', { class: 'badge b-muted tnum' }, c.pendingCode ? t('codeAuto') : c.code)),
    h('h2', {}, c.name),
    c.company || c.sector ? h('div', { style: 'font-weight:600' }, [c.company, c.sector].filter(Boolean).join(' · ')) : null,
    h('div', { class: 'muted small' }, [c.city, c.address].filter(Boolean).join(' · ') || '—'),
    h('div', { class: 'muted small' }, t('owner') + ' : ' + userName(c.owner_id)),
    h('div', { class: 'actions' },
      c.phone ? act(telHref(c.phone), 'phone', t('call')) : act(null, 'phone', t('call'), { disabled: true, style: 'opacity:.4' }),
      c.phone ? act(waHref(c.phone), 'wa', t('whatsapp'), { target: '_blank', rel: 'noopener' }) : act(null, 'wa', t('whatsapp'), { disabled: true, style: 'opacity:.4' }),
      c.lat != null ? act(gdir(c), 'route', t('route'), { target: '_blank', rel: 'noopener' }) : act(c.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.name, c.address, c.city].filter(Boolean).join(', '))}` : null, 'route', t('route'), c.address ? { target: '_blank', rel: 'noopener' } : { disabled: true, style: 'opacity:.4' }),
      editable ? act('#/client/' + id + '/edit', 'edit', t('edit')) : act(null, 'edit', t('edit'), { disabled: true, style: 'opacity:.4' })),
    geoBox, geoBtn,
    h('button', { class: 'btn brief block', onclick: () => briefModal(c) }, ic('spark', 20), t('brief')));

  const tabBody = h('div', {});
  const tabs = h('div', { class: 'tabbar', role: 'tablist' });
  const TABS = [['infos', t('infos')], ['visits', `${t('activity')} (${vs.length})`], ['deals', `${t('deals')} (${ds.length})`], ['docs', `${t('documents')} (${fs.length})`]];
  function showTab(k) {
    clientTab = k;
    tabs.replaceChildren(...TABS.map(([key, label]) => h('button', { role: 'tab', class: key === k ? 'on' : null, 'aria-selected': key === k ? 'true' : 'false', onclick: () => showTab(key) }, label)));
    if (k === 'infos') tabBody.replaceChildren(infosTab(c));
    else if (k === 'visits') tabBody.replaceChildren(visitsTab(c, vs, fs));
    else if (k === 'deals') tabBody.replaceChildren(dealsTab(c, ds));
    else tabBody.replaceChildren(docsTab(c, fs, null));
  }
  showTab(clientTab);
  layout(c.name, [hero, tabs, tabBody], { back: '#/clients' });
}
function infosTab(c) {
  const rows = [['code', c.pendingCode ? t('codeAuto') : c.code], ['companyF', c.company], ['sector', c.sector], ['contact', c.contact], ['phone', c.phone], ['phone2', c.phone2], ['email', c.email], ['website', c.website], ['city', c.city], ['address', c.address], ['ice', c.ice], ['notes', c.notes]];
  const dl = h('dl', { class: 'info' });
  for (const [k, v] of rows) if (v) dl.append(h('dt', {}, t(k)), h('dd', { dir: ['phone', 'phone2', 'email', 'ice', 'website'].includes(k) ? 'ltr' : null, style: k === 'notes' ? 'white-space:pre-wrap' : null },
    k === 'phone' || k === 'phone2' ? h('a', { href: telHref(v) }, v) : k === 'email' ? h('a', { href: 'mailto:' + v }, v) : k === 'website' ? h('a', { href: /^https?:\/\//.test(v) ? v : 'https://' + v, target: '_blank', rel: 'noopener' }, v.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')) : v));
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
      h('a', { class: 'btn primary', href: `#/meeting?client=${c.id}` }, ic('meet', 20), t('newMeeting')),
      h('button', { class: 'btn primary', onclick: () => voiceNote(c) }, ic('mic', 20), t('newVocal'))),
    h('div', { class: 'grid4' },
      h('a', { class: 'btn', href: `#/visit/new?client=${c.id}&kind=note` }, ic('note', 20), t('newNote')),
      h('a', { class: 'btn', href: `#/visit/new?client=${c.id}&kind=tache&status=planned` }, ic('boxok', 20), t('newTask')),
      h('a', { class: 'btn', href: `#/visit/new?client=${c.id}&kind=visite` }, ic('check', 20), t('visite')),
      h('a', { class: 'btn', href: `#/visit/new?client=${c.id}&kind=rdv&status=planned` }, ic('cal', 20), t('rdv'))));
  if (!vs.length) box.append(h('div', { class: 'empty' }, t('noVisits')));
  for (const v of vs) box.append(visitCard(v, fs, false));
  return box;
}
function taskCard(v, clientName) {
  const done = v.status === 'done';
  const box = h('button', { class: 'tick' + (done ? ' on' : ''), 'aria-pressed': done ? 'true' : 'false', 'aria-label': t('taskDone'), onclick: async (e) => {
    e.preventDefault(); e.stopPropagation();
    await saveVisit(v.id, { status: done ? 'planned' : 'done' }, false);
    render();
  } }, ic(done ? 'boxok' : 'box', 24));
  const late = !done && v.date < Date.now();
  return h('a', { class: 'card task' + (done ? ' done' : ''), href: '#/visit/' + v.id },
    box, h('div', { class: 'grow' }, clientName ? h('div', { class: 'small muted' }, clientName) : null, h('div', { class: 'tt' }, v.summary || t('tache')),
      h('div', { class: 'small ' + (late ? 'late' : 'muted') }, t('dueDate') + ' : ' + fdt(v.date))));
}
function visitCard(v, fs, withClient, clientName) {
  if (v.kind === 'tache') return taskCard(v, withClient ? clientName : null);
  const photos = (fs || []).filter((f) => f.visit_id === v.id);
  const sec = (label, text) => (text ? [h('div', { class: 'lab' }, label), h('p', {}, text)] : null);
  return h('a', { class: 'card visit ' + v.status, href: '#/visit/' + v.id, style: 'text-decoration:none;color:inherit;display:block' },
    h('div', { class: 'row', style: 'gap:6px' }, ['note', 'vocal', 'reunion'].includes(v.kind) ? h('span', { class: 'badge b-ai' }, ic(v.kind === 'reunion' ? 'meet' : v.kind === 'vocal' ? 'mic' : 'note', 14)) : h('span', { class: 'badge b-' + v.status }, t(v.status)), h('b', {}, t(v.kind)), h('span', { class: 'muted small grow' }, fdt(v.date)), h('span', { class: 'muted small' }, t('by', { u: userName(v.user_id) }))),
    withClient ? h('div', { style: 'font-weight:700;margin-top:6px' }, clientName || '') : null,
    v.kind === 'note' ? h('p', { style: 'white-space:pre-wrap;margin:8px 0 0' }, v.summary || '') : null,
    v.kind === 'vocal' ? h('p', { class: 'clamp', style: 'margin:8px 0 0' }, v.transcript || '') : null,
    v.kind === 'reunion' ? sec(t('summary'), v.summary) : null,
    v.kind === 'vocal' || v.kind === 'reunion' ? aiBadge(v) : null,
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
  const tile = h('a', { class: 'doc', href: f.local ? '#' : BASE + '/api/files/' + f.id, target: f.local ? null : '_blank', rel: 'noopener', title: f.name },
    h('span', { class: 'badge b-muted tag' }, t(f.category)),
    f.local ? h('span', { class: 'pend' }, t('pending')) : null,
    !isImg ? ic(f.category === 'video' ? 'vid' : f.category === 'audio' ? 'mic' : 'file', 30) : null,
    !isImg ? h('span', { class: 'nm' }, f.name) : null,
    !isImg ? h('span', { class: 'muted' }, fsize(f.size)) : null);
  if (isImg) {
    const img = h('img', { alt: f.name, loading: 'lazy' });
    if (f.local) DB.get('blobs', f.id).then((b) => { if (b) img.src = URL.createObjectURL(b); });
    else img.src = BASE + '/api/files/' + f.id;
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
    if (isNew) {
      const { clients } = await loadData();
      const nn = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      const tel = (x) => String(x || '').replace(/\D/g, '').slice(-9);
      const p1 = tel(f.phone.value), p2 = tel(f.phone2.value);
      const dup = clients.find((x) => (nn(x.name) && nn(x.name) === nn(name)) || (p1.length >= 9 && [tel(x.phone), tel(x.phone2)].includes(p1)) || (p2.length >= 9 && [tel(x.phone), tel(x.phone2)].includes(p2)));
      if (dup) {
        const choice = await new Promise((res) => { const mm = modal(h('p', { style: 'margin:0' }, t('dupQ', { n: dup.name + (dup.city ? ' (' + dup.city + ')' : '') })),
          h('div', { class: 'row' }, h('button', { class: 'btn primary grow', onclick: () => { mm.remove(); res('open'); } }, t('dupOpen')), h('button', { class: 'btn ghost', onclick: () => { mm.remove(); res('create'); } }, t('dupCreate')))); });
        if (choice === 'open') return go('#/client/' + dup.id);
      }
    }
    const fields = { name, kind };
    for (const k of ['company', 'contact', 'phone', 'phone2', 'email', 'website', 'city', 'address', 'sector', 'ice', 'notes']) fields[k] = f[k].value.trim();
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
    h('div', { class: 'grid2' }, h('label', { class: 'f' }, t('companyF'), inp('company', 'text', { autocomplete: 'organization' })), field('sector', inp('sector'))),
    h('div', { class: 'grid2' }, field('phone', inp('phone', 'tel', { dir: 'ltr', autocomplete: 'tel' })), field('phone2', inp('phone2', 'tel', { dir: 'ltr' }))),
    h('div', { class: 'grid2' }, field('email', inp('email', 'email', { dir: 'ltr' })), field('website', inp('website', 'text', { dir: 'ltr', placeholder: 'www.exemple.ma', inputmode: 'url', autocapitalize: 'off' }))),
    h('div', { class: 'grid2' }, field('city', inp('city', 'text', { list: 'cities' })), field('ice', inp('ice', 'text', { dir: 'ltr', inputmode: 'numeric' }))),
    dl,
    field('address', inp('address', 'text', { autocomplete: 'street-address' })),
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
  if (v.kind === 'note' || v.kind === 'tache') return viewNote(v, c, isNew, mine);
  if (!isNew && (v.kind === 'vocal' || v.kind === 'reunion')) return viewAiActivity(v, c, mine);
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
    !isNew && v.status === 'done' ? h('button', { type: 'button', class: 'btn brief', onclick: () => followupModal(v) }, ic('send', 18), t('followup')) : null,
    mine ? h('div', { class: 'row' }, h('button', { class: 'btn primary grow', type: 'submit' }, ic('check', 20), t('save')), h('button', { type: 'button', class: 'btn ghost', onclick: () => history.back() }, t('cancel'))) : null,
    admin() && !isNew ? h('button', { type: 'button', class: 'btn danger', onclick: async () => {
      if (!(await confirmBox(t('deleteQ'), t('delete'), true))) return;
      try { await api('DELETE', '/api/visits/' + vid); await DB.put('visits', { ...v, deleted_at: Date.now() }); go('#/client/' + c.id); } catch (e) { toast(e.status === 0 ? t('offlineAdmin') : t('error', { e: e.message })); }
    } }, ic('trash', 18), t('delete')) : null);
  layout(isNew ? (kind === 'rdv' ? t('newRdv') : t('newVisit')) : t(v.kind) + ' — ' + fdate(v.date), [form, h('h2', { class: 'sec' }, t('documents')), docsBox], { back: '#/client/' + c.id });
  paintDocs();
}


// =================================================================== IA : notes, notes vocales, réunions
const AUDIO_CHUNK_MS = 3 * 60 * 1000;          // un fichier audio indépendant toutes les 3 minutes
const VOICE_MAX_S = 10 * 60, MEETING_MAX_S = 2 * 3600;
function audioMime() {
  if (!window.MediaRecorder || !navigator.mediaDevices) return null;
  for (const m of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} }
  return '';
}
const extFor = (mime) => (/mp4|aac|m4a/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : /mpeg|mp3/.test(mime) ? 'mp3' : /wav/.test(mime) ? 'wav' : 'webm');
const fdur = (s) => { s = Math.max(0, Math.round(s || 0)); const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0'); return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`; };
async function startRecorder({ onChunk, onLevel, chunkMs = AUDIO_CHUNK_MS }) {
  const mime = audioMime();
  if (mime === null) throw new Error(t('recUnsupported'));
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  let seq = 0, rec = null, stopped = false, wake = null, ctx = null, raf = 0;
  const pending = [], t0 = Date.now();
  const one = () => {
    const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : {});
    const parts = [], n = ++seq;
    r.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    pending.push(new Promise((res) => { r.onstop = async () => { const blob = new Blob(parts, { type: (r.mimeType || mime || 'audio/webm').split(';')[0] }); try { if (blob.size > 600) await onChunk(blob, n); } finally { res(); } }; }));
    r.start();
    return r;
  };
  rec = one();
  const timer = setInterval(() => { if (stopped) return; const old = rec; rec = one(); try { old.stop(); } catch (e) {} }, chunkMs);
  const lock = async () => { try { if (navigator.wakeLock && !stopped) wake = await navigator.wakeLock.request('screen'); } catch (e) {} };
  const onVis = () => { if (!document.hidden) lock(); };
  document.addEventListener('visibilitychange', onVis); lock();
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const loop = () => { an.getByteTimeDomainData(buf); let m = 0; for (const x of buf) m = Math.max(m, Math.abs(x - 128)); if (onLevel) onLevel(m / 128); raf = requestAnimationFrame(loop); };
    loop();
  } catch (e) {}
  return {
    elapsed: () => Math.round((Date.now() - t0) / 1000),
    async stop() {
      if (stopped) return; stopped = true;
      clearInterval(timer); cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis);
      try { rec.stop(); } catch (e) {}
      await Promise.all(pending);
      stream.getTracks().forEach((x) => x.stop());
      try { if (ctx) ctx.close(); } catch (e) {}
      try { if (wake) wake.release(); } catch (e) {}
    },
  };
}
async function saveAudio(c, visitId, blob, seq, mode, spoken, name) {
  const id = uuid(), mime = (blob.type || 'audio/webm').split(';')[0];
  const meta = { id, client_id: c.id, visit_id: visitId, user_id: S.user.id, name: name || `${mode === 'reunion' ? 'reunion' : 'note-vocale'}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${seq}.${extFor(mime)}`,
    mime, size: blob.size, category: 'audio', seq, transcribe: mode, lang: spoken || '', created_at: Date.now(), updated_at: Date.now(), local: true };
  await DB.put('blobs', blob, id);
  await DB.put('files', meta);
  await DB.put('outbox', { type: 'file', id, body: meta, at: Date.now(), tries: 0 });
  await refreshPending(); kick();
}
function langSelect() {
  let cur = 'fr'; try { cur = localStorage.getItem('crm-rec-lang') ?? 'fr'; } catch (e) {}
  const sel = h('select', { class: 'input', onchange: () => { try { localStorage.setItem('crm-rec-lang', sel.value); } catch (e) {} } },
    ...[['fr', t('langFr')], ['ar', t('langAr')], ['', t('langAuto')]].map(([v, l]) => { const o = h('option', { value: v }, l); if (v === cur) o.selected = true; return o; }));
  return sel;
}
async function askAi(v) {
  await saveVisit(v.id, { ai_status: 'pending' }, false);
  await queue({ type: 'ai', id: v.id, body: { lang } });
}
function aiBadge(v) {
  if (v.ai_status === 'pending') return h('div', { class: 'ai-st' }, h('span', { class: 'spinner' }), S.pending ? t('aiWaitNet') : t('aiPending'));
  if (v.ai_status === 'error') return h('div', { class: 'ai-st err' }, '⚠ ' + t('aiError', { e: v.ai_error || '' }));
  if (v.ai_status !== 'done' && !v.transcript) return h('div', { class: 'ai-st' }, t('aiNone'));
  return null;
}
function levelBar() { const i = h('i'); return { el: h('div', { class: 'lvl' }, i), set: (x) => { i.style.transform = `scaleX(${Math.min(1, x * 2.4).toFixed(3)})`; } }; }


// =================================================================== affaires (pipeline)
const STAGES = ['nouveau', 'devis', 'negociation', 'gagne', 'perdu'];
const money = (n) => (n == null || n === '' ? '—' : new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(n) + ' MAD');
function dealCard(d, clientName, onChange) {
  const sel = h('select', { class: 'stage-sel s-' + d.stage, 'aria-label': t('moveTo'), onclick: (e) => { e.preventDefault(); e.stopPropagation(); }, onchange: async (e) => {
    await saveDeal(d.id, { stage: e.target.value }, false);
    toast(t('saved')); onChange ? onChange() : render();
  } }, ...STAGES.map((k) => { const o = h('option', { value: k }, t(k)); if (k === d.stage) o.selected = true; return o; }));
  return h('div', { class: 'card deal', role: 'button', tabindex: '0', onclick: () => dealModal(null, d), onkeydown: (e) => { if (e.key === 'Enter') dealModal(null, d); } },
    clientName ? h('div', { class: 'small muted' }, clientName) : null, h('div', { class: 'tt' }, d.title),
    h('div', { class: 'row', style: 'margin-top:8px;justify-content:space-between' }, h('b', { class: 'tnum amt' }, money(d.amount)), sel),
    h('div', { class: 'row', style: 'margin-top:4px' }, d.close_date ? h('span', { class: 'small ' + (d.close_date < Date.now() && !['gagne', 'perdu'].includes(d.stage) ? 'late' : 'muted') }, t('closeDate') + ' : ' + fdate(d.close_date)) : null));
}
function dealsTab(c, ds) {
  const open = ds.filter((d) => !['gagne', 'perdu'].includes(d.stage));
  return h('div', { class: 'stack' },
    h('div', { class: 'row' }, h('div', { class: 'grow small muted' }, open.length ? `${t('openDeals')} : ${open.length} · ${money(open.reduce((a, d) => a + (d.amount || 0), 0))}` : ''),
      h('button', { class: 'btn primary', onclick: () => dealModal(c, null) }, ic('plus', 18), t('newDeal'))),
    ds.length ? h('div', { class: 'stack', style: 'gap:8px' }, ...ds.map((d) => dealCard(d))) : h('div', { class: 'empty' }, t('noDeals')));
}
async function dealModal(c, d) {
  const isNew = !d;
  if (!c) c = await DB.get('clients', d.client_id);
  d = d || { stage: 'nouveau' };
  const mine = isNew || admin() || d.user_id === S.user.id || S.user.perms.edit_all;
  const f = {
    title: h('input', { class: 'input', value: d.title || '', placeholder: t('dealTitlePh'), required: true, disabled: !mine }),
    amount: h('input', { class: 'input', type: 'number', min: 0, step: 100, inputmode: 'numeric', value: d.amount ?? '', dir: 'ltr', disabled: !mine }),
    close: h('input', { class: 'input', type: 'date', value: d.close_date ? localInput(d.close_date).slice(0, 10) : '', disabled: !mine }),
    notes: h('textarea', { class: 'input', rows: 3, value: d.notes || '', disabled: !mine }),
  };
  let stage = d.stage;
  const seg = h('div', { class: 'seg stages' });
  const paint = () => seg.replaceChildren(...STAGES.map((k) => h('button', { type: 'button', class: (stage === k ? 'on ' : '') + 's-' + k, disabled: !mine, onclick: () => { stage = k; paint(); } }, t(k))));
  paint();
  const m = modal(h('h3', {}, isNew ? t('newDeal') : t('deal')), h('p', { class: 'muted small', style: 'margin:0' }, c ? c.name : ''),
    h('label', { class: 'f' }, t('dealTitle'), f.title), h('div', { class: 'grid2' }, h('label', { class: 'f' }, t('amount'), f.amount), h('label', { class: 'f' }, t('closeDate'), f.close)),
    h('div', { class: 'f' }, h('span', {}, t('stage')), seg), h('label', { class: 'f' }, t('notes'), f.notes),
    h('div', { class: 'row' },
      mine ? h('button', { class: 'btn primary grow', onclick: async () => {
        const title = f.title.value.trim();
        if (title.length < 2) { f.title.focus(); return; }
        const id = d.id || uuid();
        await saveDeal(id, { client_id: c.id, title, amount: f.amount.value === '' ? null : Number(f.amount.value), stage, close_date: f.close.value ? new Date(f.close.value + 'T10:00').getTime() : null, notes: f.notes.value.trim() }, isNew);
        m.remove(); toast(navigator.onLine ? t('saved') : t('savedOffline'));
        if (location.hash.startsWith('#/client/')) clientTab = 'deals';
        render();
      } }, ic('check', 20), t('save')) : null,
      h('button', { class: 'btn ghost', onclick: () => m.remove() }, t('cancel'))),
    !isNew && (admin() || d.user_id === S.user.id) ? h('button', { class: 'btn danger', onclick: async () => {
      if (!(await confirmBox(t('deleteQ'), t('delete'), true))) return;
      try { await api('DELETE', '/api/deals/' + d.id); await DB.put('deals', { ...d, deleted_at: Date.now() }); m.remove(); render(); } catch (e) { toast(e.status === 0 ? t('offlineAdmin') : t('error', { e: e.message })); }
    } }, ic('trash', 18), t('delete')) : null);
  if (isNew) setTimeout(() => f.title.focus(), 50);
}
const pipeState = { user: '' };
async function viewPipeline() {
  const { clients, deals } = await loadData();
  const cm = new Map(clients.map((c) => [c.id, c]));
  const list = deals.filter((d) => cm.has(d.client_id) && (!pipeState.user || d.user_id === pipeState.user));
  const month = Date.now() - 30 * 86400000;
  const cols = STAGES.map((k) => {
    const ds = list.filter((d) => d.stage === k && (!['gagne', 'perdu'].includes(k) || (d.closed_at || d.updated_at) > month)).sort((a, b) => (a.close_date || 9e15) - (b.close_date || 9e15));
    return h('section', { class: 'pcol s-' + k },
      h('header', {}, h('b', {}, t(k)), h('span', { class: 'small muted tnum' }, `${ds.length} · ${money(ds.reduce((a, d) => a + (d.amount || 0), 0))}`)),
      ...ds.map((d) => dealCard(d, (cm.get(d.client_id) || {}).name)));
  });
  const open = list.filter((d) => !['gagne', 'perdu'].includes(d.stage));
  const won = list.filter((d) => d.stage === 'gagne' && (d.closed_at || 0) > month);
  const users = [...S.users.values()].filter((u) => u.active);
  const filt = (admin() || S.user.perms.all) && users.length > 1 ? h('select', { class: 'input', style: 'max-width:260px', onchange: (e) => { pipeState.user = e.target.value; viewPipeline(); } },
    h('option', { value: '' }, t('allOwners')), ...users.map((u) => { const o = h('option', { value: u.id }, u.name); if (u.id === pipeState.user) o.selected = true; return o; })) : null;
  layout(t('pipeline'), [
    h('div', { class: 'row', style: 'margin-bottom:12px' }, h('div', { class: 'pstat' }, h('span', {}, t('weighted')), h('b', { class: 'tnum' }, money(open.reduce((a, d) => a + (d.amount || 0), 0)))),
      h('div', { class: 'pstat' }, h('span', {}, t('wonDeals')), h('b', { class: 'tnum' }, money(won.reduce((a, d) => a + (d.amount || 0), 0)))), h('div', { class: 'grow' }), filt),
    list.length ? h('div', { class: 'board' }, ...cols) : h('div', { class: 'empty' }, t('noDeals'))]);
}

// =================================================================== assistant : préparer la visite, message de suivi
function aiWaitModal(title, wait) {
  const body = h('div', { class: 'stack' }, h('div', { class: 'ai-st' }, h('span', { class: 'spinner' }), wait));
  const m = modal(h('h3', {}, ic('spark', 20), ' ', title), body);
  return { m, body };
}
async function briefModal(c) {
  if (!navigator.onLine) return toast(t('aiOffline'));
  const { m, body } = aiWaitModal(t('briefT') + ' — ' + c.name, t('briefWait'));
  try {
    const { brief: b } = await api('POST', '/api/ai/brief/' + c.id, { lang });
    const sec = (label, arr) => (arr && arr.length ? h('div', { class: 'bsec' }, h('b', {}, label), h('ul', {}, ...arr.map((x) => h('li', {}, x)))) : null);
    body.replaceChildren(...[h('p', { style: 'margin:0' }, b.resume || ''), sec(t('bKnow'), b.a_savoir), sec(t('bPending'), b.en_attente), sec(t('bPropose'), b.a_proposer), sec(t('bQuestions'), b.questions),
      h('button', { class: 'btn ghost', onclick: () => m.remove() }, t('confirm'))].filter(Boolean));
  } catch (e) { body.replaceChildren(h('p', { style: 'color:var(--red);margin:0' }, e.status === 0 ? t('aiOffline') : e.message), h('button', { class: 'btn ghost', onclick: () => m.remove() }, t('cancel'))); }
}
async function followupModal(v) {
  if (!navigator.onLine) return toast(t('aiOffline'));
  let channel = 'whatsapp';
  const { m, body } = aiWaitModal(t('followup'), t('followupWait'));
  const run = async () => {
    body.replaceChildren(h('div', { class: 'ai-st' }, h('span', { class: 'spinner' }), t('followupWait')));
    try {
      const r = await api('POST', '/api/ai/followup/' + v.id, { channel, lang });
      const subj = h('input', { class: 'input', value: r.subject || '' });
      const msg = h('textarea', { class: 'input', rows: 9, value: r.message || '' });
      const seg = h('div', { class: 'seg' }, ...[['whatsapp', 'WhatsApp'], ['email', t('email')]].map(([k, l]) => h('button', { type: 'button', class: channel === k ? 'on' : null, onclick: () => { if (channel !== k) { channel = k; run(); } } }, l)));
      const copy = h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText((channel === 'email' ? subj.value + '\n\n' : '') + msg.value); toast(t('copied')); } catch (e) {} } }, t('copy'));
      const send = channel === 'whatsapp'
        ? h('a', { class: 'btn primary grow', target: '_blank', rel: 'noopener', onclick: (e) => { e.currentTarget.href = (r.phone ? waHref(r.phone) : 'https://wa.me/') + (r.phone ? '?' : '?') + 'text=' + encodeURIComponent(msg.value); } }, ic('wa', 18), t('sendWa'))
        : h('a', { class: 'btn primary grow', onclick: (e) => { e.currentTarget.href = 'mailto:' + encodeURIComponent(r.email || '') + '?subject=' + encodeURIComponent(subj.value) + '&body=' + encodeURIComponent(msg.value); } }, ic('send', 18), t('sendMail'));
      body.replaceChildren(...[seg, channel === 'email' ? h('label', { class: 'f' }, t('subject'), subj) : null, msg].filter(Boolean), h('div', { class: 'row' }, send, copy), h('button', { class: 'btn ghost', onclick: () => m.remove() }, t('cancel')));
    } catch (e) { body.replaceChildren(h('p', { style: 'color:var(--red);margin:0' }, e.status === 0 ? t('aiOffline') : e.message), h('button', { class: 'btn ghost', onclick: () => m.remove() }, t('cancel'))); }
  };
  run();
}



// questions rapides de Magi : [texte, true = à compléter avant d'envoyer]
const MAGI_MENU = {
  fr: [
    ['Aujourd’hui', [['Qu’est-ce que j’ai aujourd’hui ?'], ['Mes rendez-vous de demain'], ['Mes tâches en retard']]],
    ['Clients', [['Clients pas visités depuis 30 jours'], ['Mes prospects à relancer'], ['Ouvre la fiche ', 1], ['Nouveau prospect : ', 1]]],
    ['Planifier', [['Programme un rendez-vous demain à 10h avec ', 1], ['Rappelle-moi d’appeler ', 1], ['Note pour le client ', 1]]],
    ['Ventes', [['Où en est le pipeline ?'], ['Quelles affaires sont en négociation ?'], ['Crée une affaire pour ', 1]]],
    ['Équipe', [['Activité de l’équipe cette semaine'], ['Qui n’a fait aucune visite cette semaine ?']], 'admin'],
    ['Aller à', [['Ouvre l’agenda'], ['Ouvre le pipeline'], ['Ouvre la carte']]],
  ],
  ar: [
    ['اليوم', [['شنو عندي اليوم؟'], ['مواعيدي غدا'], ['المهام المتأخرة']]],
    ['الزبناء', [['الزبناء اللي ما زرتهمش هادي 30 يوم'], ['الزبناء المحتملين اللي خاصني نتابعهم'], ['حل ليا ملف ', 1], ['زبون محتمل جديد: ', 1]]],
    ['البرمجة', [['برمج ليا موعد غدا على 10 مع ', 1], ['فكرني نعيط لـ ', 1], ['ملاحظة للزبون ', 1]]],
    ['المبيعات', [['كيف حال الصفقات؟'], ['شنو هي الصفقات اللي فالتفاوض؟'], ['دير صفقة جديدة لـ ', 1]]],
    ['الفريق', [['نشاط الفريق هاد السيمانة'], ['شكون ما دار حتى زيارة هاد السيمانة؟']], 'admin'],
    ['افتح', [['افتح الأجندة'], ['افتح الصفقات'], ['افتح الخريطة']]],
  ],
  en: [
    ['Today', [['What do I have today?'], ['My meetings tomorrow'], ['My overdue tasks']]],
    ['Clients', [['Clients not visited for 30 days'], ['Prospects to follow up'], ['Open the record of ', 1], ['New prospect: ', 1]]],
    ['Plan', [['Schedule a meeting tomorrow at 10am with ', 1], ['Remind me to call ', 1], ['Note for client ', 1]]],
    ['Sales', [['How is the pipeline?'], ['Which deals are in negotiation?'], ['Create a deal for ', 1]]],
    ['Team', [['Team activity this week'], ['Who made no visit this week?']], 'admin'],
    ['Go to', [['Open the agenda'], ['Open the pipeline'], ['Open the map']]],
  ],
};
// =================================================================== assistant « Magi » : on écrit ou on parle, il agit
const ROBOT_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><line x1="32" y1="5" x2="32" y2="13" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle class="bulb" cx="32" cy="5" r="4"/><rect x="9" y="12" width="46" height="36" rx="15" fill="currentColor"/><rect x="15" y="18" width="34" height="23" rx="10" fill="#fff"/><g class="eyes"><ellipse cx="25" cy="28" rx="3.6" ry="4.2" fill="#14112b"/><ellipse cx="39" cy="28" rx="3.6" ry="4.2" fill="#14112b"/></g><rect class="mouth" x="28" y="34" width="8" height="2.6" rx="1.3" fill="#14112b"/><rect x="20" y="50" width="24" height="12" rx="6" fill="currentColor" opacity=".8"/></svg>';
const robotIcon = (cls) => { const s = h('span', { class: 'robot ' + (cls || '') }); s.innerHTML = ROBOT_SVG; return s; };
const magi = { log: [], history: [], voice: (() => { try { return localStorage.getItem('crm-voice') === '1'; } catch (e) { return false; } })(), panel: null };
const PAGE_HASH = { clients: '#/clients', pipeline: '#/pipeline', agenda: '#/agenda', map: '#/map', me: '#/me', new_client: '#/new', dashboard: '#/dashboard', team: '#/team', export: '#/export', journal: '#/journal', settings: '#/settings' };
function speak(text) {
  try {
    if (!window.speechSynthesis || !text) return;
    speechSynthesis.cancel();
    const ar = /[؀-ۿ]/.test(text);
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#✅]/g, ''));
    u.lang = ar ? 'ar-SA' : lang === 'en' ? 'en-GB' : 'fr-FR';
    const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith(ar ? 'ar' : u.lang.slice(0, 2)));
    if (v) u.voice = v;
    u.rate = 1.02;
    const r = magi.panel && magi.panel.querySelector('.magi-head .robot');
    u.onstart = () => r && r.classList.add('talk'); u.onend = u.onerror = () => r && r.classList.remove('talk');
    speechSynthesis.speak(u);
  } catch (e) {}
}
async function magiFocus() {
  const m = location.hash.match(/^#\/(client|visit)\/([0-9a-zA-Z-]{8,40})/) || location.hash.match(/^#\/meeting\?client=([0-9a-zA-Z-]{8,40})/);
  if (!m) return null;
  if (m[1] === 'visit') { const v = await DB.get('visits', m[2]).catch(() => null); return v ? v.client_id : null; }
  return m[2] || m[1];
}
// résumé de la journée calculé sur le téléphone (marche aussi hors ligne)
async function magiDay() {
  const [visits, clients] = await Promise.all([DB.all('visits'), DB.all('clients')]);
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); const t0 = d0.getTime(), t1 = t0 + 86400000;
  const cname = new Map(clients.map((c) => [c.id, c.name]));
  const mine = visits.filter((v) => !v.deleted_at && v.user_id === S.user.id && v.status === 'planned');
  const today = mine.filter((v) => v.date >= t0 && v.date < t1).sort((a, b) => a.date - b.date);
  const late = mine.filter((v) => v.date < t0);
  const lastDone = new Map(); for (const v of visits) if (!v.deleted_at && v.status === 'done') lastDone.set(v.client_id, Math.max(lastDone.get(v.client_id) || 0, v.date));
  const sleep = clients.filter((c) => !c.deleted_at && c.owner_id === S.user.id && (lastDone.get(c.id) || 0) < Date.now() - 30 * 86400000).length;
  const parts = [];
  if (today.length) parts.push(t('magiRdv', { n: today.length }) + ' (' + today.slice(0, 4).map((v) => new Date(v.date).toTimeString().slice(0, 5) + ' ' + (cname.get(v.client_id) || '')).join(' · ') + ')');
  if (late.length) parts.push(t('magiLate', { n: late.length }));
  if (sleep) parts.push(t('magiSleep', { n: sleep }));
  return t('magiToday', { x: parts.length ? parts.join(', ') : t('magiFree') });
}
function openMagi() {
  if (magi.panel && document.body.contains(magi.panel)) return;
  const log = h('div', { class: 'magi-log', 'aria-live': 'polite' });
  const input = h('textarea', { class: 'input', rows: 1, placeholder: t('magiPh'), 'aria-label': t('magiPh'), onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }, oninput: () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; } });
  let micLang = lang === 'ar' ? 'ar' : 'fr'; try { micLang = localStorage.getItem('crm-magi-lang') || micLang; } catch (e) {}
  const langBtn = h('button', { type: 'button', class: 'magi-lang', title: t('magiMicLang'), onclick: () => { micLang = micLang === 'fr' ? 'ar' : 'fr'; try { localStorage.setItem('crm-magi-lang', micLang); } catch (e) {} langBtn.textContent = micLang === 'ar' ? 'ع' : 'FR'; } }, micLang === 'ar' ? 'ع' : 'FR');
  const mic = h('button', { type: 'button', class: 'magi-mic', 'aria-label': t('magiMic'), onclick: () => listen() }, ic('mic', 22));
  const sendBtn = h('button', { type: 'button', class: 'magi-send', 'aria-label': t('magiSend'), onclick: () => send() }, ic('send', 20));
  const voiceBtn = h('button', { type: 'button', class: 'iconbtn' + (magi.voice ? ' on' : ''), 'aria-pressed': magi.voice ? 'true' : 'false', title: magi.voice ? t('magiVoiceOn') : t('magiVoiceOff'),
    onclick: () => { magi.voice = !magi.voice; try { localStorage.setItem('crm-voice', magi.voice ? '1' : '0'); } catch (e) {} voiceBtn.classList.toggle('on', magi.voice); voiceBtn.setAttribute('aria-pressed', magi.voice ? 'true' : 'false'); voiceBtn.title = magi.voice ? t('magiVoiceOn') : t('magiVoiceOff'); if (!magi.voice) try { speechSynthesis.cancel(); } catch (e) {} toast(voiceBtn.title); } }, ic('vol', 20));
  const resetBtn = h('button', { type: 'button', class: 'iconbtn', title: t('magiNew'), 'aria-label': t('magiNew'), onclick: () => { magi.log = []; magi.history = []; paint(); } }, ic('plus', 20));
  const closeBtn = h('button', { type: 'button', class: 'iconbtn', 'aria-label': t('cancel'), onclick: () => close() }, ic('x', 20));
  const menuSheet = h('div', { class: 'magi-menu', hidden: true });
  const fillMenu = () => menuSheet.replaceChildren(...(MAGI_MENU[lang] || MAGI_MENU.fr).filter((g) => g[2] !== 'admin' || S.user.role === 'admin').map(([title, qs]) =>
    h('div', { class: 'mm-g' }, h('b', {}, title), h('div', { class: 'mm-q' }, ...qs.map(([q, fill]) => h('button', { type: 'button', class: fill ? 'fill' : null, onclick: () => {
      toggleMenu(false);
      if (fill) { input.value = q; input.focus(); input.setSelectionRange(q.length, q.length); input.dispatchEvent(new Event('input')); }
      else send(q);
    } }, fill ? q.trim().replace(/[:：]$/, '').trim() + '…' : q))))));
  const toggleMenu = (on) => { const show = on ?? menuSheet.hidden; if (show) fillMenu(); menuSheet.hidden = !show; menuBtn.setAttribute('aria-expanded', show ? 'true' : 'false'); menuBtn.classList.toggle('on', show); };
  const menuBtn = h('button', { type: 'button', class: 'magi-menubtn', 'aria-expanded': 'false', onclick: () => toggleMenu() }, ic('list', 18), t('magiMenu'));
  const panel = h('div', { class: 'magi-panel', role: 'dialog', 'aria-label': t('magi') },
    h('div', { class: 'magi-head' }, robotIcon(), h('div', { class: 'grow' }, h('b', {}, 'Magi'), h('small', {}, t('magi'))), voiceBtn, resetBtn, closeBtn),
    log,
    menuSheet,
    h('div', { class: 'magi-bar' }, menuBtn),
    h('div', { class: 'magi-in' }, langBtn, input, mic, sendBtn));
  const veil = h('div', { class: 'magi-veil', onclick: () => close() });
  document.body.append(veil, panel);
  magi.panel = panel;
  const close = () => { try { speechSynthesis.cancel(); } catch (e) {} if (rec) rec.cancel(); panel.remove(); veil.remove(); magi.panel = null; };
  const onKey = (e) => { if (e.key === 'Escape' && magi.panel === panel) { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  const bubble = (who, ...kids) => h('div', { class: 'mg ' + who }, ...kids);
  function paint() {
    const items = [];
    if (!magi.log.length) {
      items.push(bubble('bot', t('magiHi', { n: (S.user.name || '').split(' ')[0] })));
      if (dayTxt) items.push(bubble('bot', dayTxt));
      items.push(h('div', { class: 'magi-sugg' }, ...['magiS1', 'magiS2', 'magiS3', 'magiS4'].map((k) => h('button', { type: 'button', onclick: () => send(t(k)) }, t(k)))));
    }
    for (const e of magi.log) items.push(e.el || (e.el = e.who === 'user' ? bubble('user', e.text) : bubble('bot', e.text)));
    log.replaceChildren(...items);
    log.scrollTop = log.scrollHeight;
  }
  const push = (entry) => { magi.log.push(entry); paint(); return entry; };
  let busy = false, dayTxt = '';
  magiDay().then((x) => { dayTxt = x; if (!magi.log.length) paint(); }).catch(() => {});
  // sans internet : quelques demandes comprises sur le téléphone
  async function offline(msg) {
    const n = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const pages = [[/agenda|rendez|rdv|اجند|أجند|مواعيد|موعد/, 'agenda'], [/pipeline|affaire|صفق/, 'pipeline'], [/carte|map|خريط/, 'map'], [/nouve(au|lle) (client|fiche|prospect)|زبون جديد|ملف جديد/, 'new_client']];
    if (/aujourd|journee|اليوم|نهار|today/.test(n)) return push({ who: 'bot', text: await magiDay() });
    for (const [re, pg] of pages) if (re.test(n)) { close(); return go(PAGE_HASH[pg]); }
    const words = n.split(/\s+/).filter((w) => w.length > 2);
    const hits = (await DB.all('clients')).filter((c) => !c.deleted_at && words.some((w) => [c.name, c.company, c.city, c.code].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(w))).slice(0, 12);
    if (hits.length) { const el = bubble('bot', h('div', { class: 'mg-t' }, t('magiFound'))); push({ who: 'bot', el }); return runAction({ type: 'show_clients', clients: hits.map((c) => ({ id: c.id, name: c.name, code: c.code, city: c.city, kind: c.kind })) }, el); }
    push({ who: 'bot', text: t('magiOffHelp') });
  }
  async function send(text, spoken) {
    const msg = String(text ?? input.value).trim();
    if (!msg || busy) return;
    toggleMenu(false);
    input.value = ''; input.style.height = 'auto';
    push({ who: 'user', text: msg });
    if (!navigator.onLine) return offline(msg);
    busy = true;
    const wait = push({ who: 'bot', el: bubble('bot wait', h('span', { class: 'spinner' }), t('magiThinking')) });
    try {
      const r = await api('POST', '/api/ai/assistant', { text: msg, lang, tz: new Date().getTimezoneOffset(), history: magi.history, client_id: await magiFocus() });
      magi.history.push({ role: 'user', content: msg }, { role: 'assistant', content: r.reply });
      magi.history = magi.history.slice(-6);
      magi.log.splice(magi.log.indexOf(wait), 1);
      const el = bubble('bot', h('div', { class: 'mg-t' }, r.reply));
      push({ who: 'bot', el });
      if (spoken || magi.voice) speak(r.reply);
      await runAction(r.action || { type: 'none' }, el);
      if (r.suggestions && r.suggestions.length) el.append(h('div', { class: 'magi-sugg small' }, ...r.suggestions.map((q) => h('button', { type: 'button', onclick: () => send(q) }, q))));
      log.scrollTop = log.scrollHeight;
    } catch (e) {
      magi.log.splice(magi.log.indexOf(wait), 1);
      if (e.status === 0) { busy = false; return offline(msg); }
      push({ who: 'bot', el: bubble('bot err', e.message) });
    } finally { busy = false; }
  }
  // --- micro : un message vocal court, transcrit puis envoyé
  let rec = null;
  async function listen() {
    if (rec) return rec.stop();
    if (!navigator.onLine) return push({ who: 'bot', text: t('magiNeedNet') });
    const mime = audioMime();
    if (mime === null) return toast(t('recUnsupported'));
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }); }
    catch (e) { return toast(t('recDenied', { e: e.message }), 6000); }
    try { speechSynthesis.cancel(); } catch (e) {}
    const parts = []; let cancelled = false;
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : {});
    mr.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    const status = push({ who: 'user', el: bubble('user listening', h('span', { class: 'recdot' }), t('magiListening')) });
    status.el.onclick = () => rec && rec.stop();
    mic.classList.add('on');
    const limit = setTimeout(() => rec && rec.stop(), 60000);
    rec = { stop: () => { try { mr.stop(); } catch (e) {} }, cancel: () => { cancelled = true; try { mr.stop(); } catch (e) {} } };
    mr.onstop = async () => {
      clearTimeout(limit); rec = null; mic.classList.remove('on');
      stream.getTracks().forEach((x) => x.stop());
      magi.log.splice(magi.log.indexOf(status), 1);
      if (cancelled) return;
      const blob = new Blob(parts, { type: (mr.mimeType || mime || 'audio/webm').split(';')[0] });
      if (blob.size < 800) return paint();
      const wait = push({ who: 'user', el: bubble('user wait', h('span', { class: 'spinner' }), t('magiHear')) });
      try {
        const r = await api('POST', '/api/ai/listen', blob, { 'Content-Type': blob.type || 'audio/webm', 'X-Lang': micLang });
        magi.log.splice(magi.log.indexOf(wait), 1); paint();
        if (r.text) send(r.text, true);
      } catch (e) { magi.log.splice(magi.log.indexOf(wait), 1); push({ who: 'bot', el: bubble('bot err', e.status === 0 ? t('magiNeedNet') : e.message) }); }
    };
    mr.start();
  }
  // --- exécuter ce que Magi a compris
  async function runAction(a, el) {
    const c = a.client_id ? ((await DB.get('clients', a.client_id)) || a.client) : null;
    const card = (...kids) => { const k = h('div', { class: 'mg-card' }, ...kids); el.append(k); return k; };
    const doneMsg = (txt, href) => { push({ who: 'bot', el: bubble('bot', txt, href ? h('a', { class: 'btn small', href, onclick: () => close() }, t('magiOpen')) : null) }); };
    const dateIn = (day, time, fallbackH) => { const d = day ? new Date(day + 'T' + (time || (fallbackH || '09:00'))) : new Date(Date.now() + 3600000); return h('input', { class: 'input', type: 'datetime-local', value: localInput(isNaN(d) ? Date.now() : d.getTime()) }); };
    const cancelBtn = (k) => h('button', { class: 'btn ghost', onclick: () => k.remove() }, t('cancel'));
    switch (a.type) {
      case 'guide': return a.page ? card(h('a', { class: 'btn primary', href: PAGE_HASH[a.page] || '#/', onclick: () => close() }, ic('send', 18), t('magiOpenPage'))) : null;
      case 'show_clients': {
        const k = card(h('div', { class: 'mg-list' }, ...a.clients.map((x) => h('a', { href: '#/client/' + x.id, onclick: () => close() }, h('span', { class: 'av', style: '--h:' + hueOf(x.name) }, (x.name || '?').trim().charAt(0).toUpperCase()), h('span', { class: 'grow' }, h('b', {}, x.name), h('small', {}, [x.code, x.city, t(x.kind)].filter(Boolean).join(' · ')))))));
        k.classList.add('flat'); return;
      }
      case 'open_activity': close(); return go('#/visit/' + a.activity_id);
      case 'complete_activity': {
        const v = a.activity;
        const k = card(h('div', { class: 'mg-c' }, `${t(v.kind)} · ${v.client}`), h('div', { class: 'small muted' }, fdt(v.date) + (v.text ? ' · ' + v.text : '')),
          h('div', { class: 'row' }, h('button', { class: 'btn primary grow', onclick: async () => { await saveVisit(a.activity_id, { status: 'done' }, false); k.remove(); doneMsg(t('magiDone') + ' ' + t(v.kind) + ' · ' + v.client, '#/client/' + v.client_id); } }, ic('check', 18), t('magiMarkDone')), cancelBtn(null)));
        k.querySelector('.btn.ghost').onclick = () => k.remove(); return;
      }
      case 'reschedule': {
        const v = a.activity;
        const old = new Date(v.date);
        const when = dateIn(a.date, a.time || old.toTimeString().slice(0, 5));
        const k = card(h('div', { class: 'mg-c' }, `${t(v.kind)} · ${v.client}`), h('div', { class: 'small muted' }, fdt(v.date) + ' →'), h('label', { class: 'f' }, t('magiMoveTo'), when),
          h('div', { class: 'row' }, h('button', { class: 'btn primary grow', onclick: async () => { const d = fromInput(when.value); if (!d) return; await saveVisit(a.activity_id, { date: d }, false); k.remove(); doneMsg(t('magiDone') + ' ' + t(v.kind) + ' · ' + fdt(d), '#/agenda'); } }, ic('check', 18), t('confirm')), h('button', { class: 'btn ghost', onclick: () => k.remove() }, t('cancel'))));
        return;
      }
      case 'update_client': {
        const ins = {};
        const rows = Object.entries(a.changes).map(([key, val]) => h('label', { class: 'f' }, (key === 'notes' ? t('notes') + ' (' + t('magiAdd') + ')' : t(key)) + (key !== 'notes' && a.current[key] ? ' — ' + a.current[key] : ''), (ins[key] = key === 'notes' ? h('textarea', { class: 'input', rows: 2, value: val }) : h('input', { class: 'input', value: val }))));
        const k = card(h('div', { class: 'mg-c' }, t('magiChanges') + ' · ' + ((c && c.name) || '')), ...rows,
          h('div', { class: 'row' }, h('button', { class: 'btn primary grow', onclick: async () => {
            const cur = (await DB.get('clients', a.client_id)) || {};
            const f = {};
            for (const [key, el2] of Object.entries(ins)) { const v2 = el2.value.trim(); if (!v2) continue; f[key] = key === 'notes' ? [cur.notes, v2].filter(Boolean).join('\n') : v2; }
            if (Object.keys(f).length) await saveClient(a.client_id, f, false);
            k.remove(); doneMsg(t('magiDone') + ' ' + ((c && c.name) || ''), '#/client/' + a.client_id);
          } }, ic('check', 18), t('confirm')), h('button', { class: 'btn ghost', onclick: () => k.remove() }, t('cancel'))));
        return;
      }
      case 'followup': {
        const vs = (await DB.all('visits')).filter((v) => v.client_id === a.client_id && !v.deleted_at && v.status === 'done' && (v.summary || v.agreed || v.next_step || v.transcript)).sort((x, y) => y.date - x.date);
        if (!vs.length) return card(h('p', { class: 'small muted', style: 'margin:0' }, t('magiNoMeet')));
        close(); return followupModal(vs.find((v) => v.kind === 'reunion') || vs[0]);
      }
      case 'open_page': close(); return go(PAGE_HASH[a.page] || '#/');
      case 'search': close(); listState.q = a.query; listState.kind = ''; listState.city = ''; return location.hash === '#/clients' ? render() : go('#/clients');
      case 'open_client': close(); return go('#/client/' + a.client_id);
      case 'meeting': close(); return go('#/meeting?client=' + a.client_id);
      case 'voice_note': close(); return c && voiceNote(c);
      case 'brief': close(); return c && briefModal(c);
      case 'call': case 'whatsapp': { const ph = c && (c.phone || c.phone2); if (!ph) return card(h('p', { class: 'small muted' }, t('magiNoPhone')), h('a', { class: 'btn small', href: '#/client/' + a.client_id, onclick: close }, t('magiOpen')));
        return card(h('a', { class: 'btn primary', href: a.type === 'call' ? telHref(ph) : waHref(ph), target: a.type === 'call' ? null : '_blank', rel: 'noopener' }, ic(a.type === 'call' ? 'phone' : 'wa', 18), a.type === 'call' ? t('magiCall') + ' ' + ph : 'WhatsApp')); }
      case 'email': return card(c && c.email ? h('a', { class: 'btn primary', href: 'mailto:' + c.email }, ic('send', 18), t('magiMail')) : h('p', { class: 'small muted' }, '—'));
      case 'directions': return card(c && c.lat != null ? h('a', { class: 'btn primary', href: gdir(c), target: '_blank', rel: 'noopener' }, ic('map', 18), t('magiGo')) : h('p', { class: 'small muted' }, t('magiNoGps')));
      case 'create_activity': {
        let kind = a.kind;
        const segEl = h('div', { class: 'seg' });
        const paintSeg = () => segEl.replaceChildren(...['rdv', 'appel', 'tache', 'note', 'visite'].map((k) => h('button', { type: 'button', class: kind === k ? 'on' : null, onclick: () => { kind = k; paintSeg(); } }, t(k))));
        paintSeg();
        const when = dateIn(a.date, a.time);
        const what = h('textarea', { class: 'input', rows: 2, value: a.text || '' });
        const k = card(h('div', { class: 'mg-c' }, (c && c.name) || ''), segEl, h('label', { class: 'f' }, t('magiWhen'), when), h('label', { class: 'f' }, t('magiWhat'), what),
          h('div', { class: 'row' }, h('button', { class: 'btn primary grow', onclick: async () => {
            const date = fromInput(when.value) || Date.now(), txt = what.value.trim();
            const f = { client_id: a.client_id, kind, date };
            if (kind === 'note') Object.assign(f, { status: 'done', summary: txt, date: Date.now() });
            else if (kind === 'tache') Object.assign(f, { status: 'planned', summary: txt });
            else Object.assign(f, { status: kind === 'visite' && date < Date.now() ? 'done' : 'planned', next_step: txt });
            await saveVisit(uuid(), f, true);
            k.remove(); doneMsg(t('magiDone') + ' ' + t(kind) + ' · ' + (kind === 'note' ? '' : fdt(date)), '#/client/' + a.client_id);
          } }, ic('check', 18), t('confirm')), h('button', { class: 'btn ghost', onclick: () => k.remove() }, t('cancel'))));
        return;
      }
      case 'create_client': {
        const f = {}; const inp = (key, label, extra = {}) => h('label', { class: 'f' }, label, (f[key] = h('input', { class: 'input', value: a[key] || '', ...extra })));
        let kind = a.client_kind;
        const segEl = h('div', { class: 'seg' }); const paintSeg = () => segEl.replaceChildren(...['prospect', 'client'].map((x) => h('button', { type: 'button', class: kind === x ? 'on' : null, onclick: () => { kind = x; paintSeg(); } }, t(x)))); paintSeg();
        const k = card(a.similar && a.similar.length ? h('div', { class: 'warn small' }, t('magiSimilar') + ' : ', ...a.similar.map((x) => h('a', { href: '#/client/' + x.id, onclick: close }, `${x.name} (${x.code})`))) : null,
          inp('name', t('name')), segEl, inp('company', t('company')), inp('phone', t('phone'), { inputmode: 'tel' }), inp('city', t('city')), inp('sector', t('sector')),
          h('div', { class: 'row' }, h('button', { class: 'btn primary grow', onclick: async () => {
            const name = f.name.value.trim(); if (!name) return f.name.focus();
            const id = uuid();
            await saveClient(id, { name, kind, company: f.company.value.trim(), phone: f.phone.value.trim(), city: f.city.value.trim(), sector: f.sector.value.trim(), email: a.email || '' }, true);
            k.remove(); doneMsg(t('magiDone') + ' ' + name, '#/client/' + id);
          } }, ic('check', 18), t('confirm')), h('button', { class: 'btn ghost', onclick: () => k.remove() }, t('cancel'))));
        return;
      }
      case 'create_deal': {
        const title = h('input', { class: 'input', value: a.title || '' });
        const amount = h('input', { class: 'input', inputmode: 'decimal', value: a.amount != null ? a.amount : '' });
        const stage = h('select', { class: 'input' }, ...STAGES.map((x) => { const o = h('option', { value: x }, t(x)); if (x === a.stage) o.selected = true; return o; }));
        const close_d = h('input', { class: 'input', type: 'date', value: a.date || '' });
        const k = card(h('div', { class: 'mg-c' }, (c && c.name) || ''), h('label', { class: 'f' }, t('dealTitle'), title), h('div', { class: 'grid2' }, h('label', { class: 'f' }, t('amount'), amount), h('label', { class: 'f' }, t('stage'), stage)), h('label', { class: 'f' }, t('closeDate'), close_d),
          h('div', { class: 'row' }, h('button', { class: 'btn primary grow', onclick: async () => {
            const n = Number(String(amount.value).replace(/\s/g, '').replace(',', '.'));
            await saveDeal(uuid(), { client_id: a.client_id, title: title.value.trim() || 'Affaire', amount: Number.isFinite(n) && n > 0 ? n : null, stage: stage.value, close_date: close_d.value ? new Date(close_d.value + 'T12:00').getTime() : null }, true);
            k.remove(); doneMsg(t('magiDone') + ' ' + (title.value.trim() || ''), '#/client/' + a.client_id);
          } }, ic('check', 18), t('confirm')), h('button', { class: 'btn ghost', onclick: () => k.remove() }, t('cancel'))));
        return;
      }
      case 'deal_stage': {
        const d = (await DB.get('deals', a.deal_id)) || a.deal;
        const k = card(h('div', { class: 'mg-c' }, `${d.title} · ${a.deal.client}`), h('p', { class: 'small', style: 'margin:0' }, t(d.stage) + ' → ', h('b', {}, t(a.stage))),
          h('div', { class: 'row' }, h('button', { class: 'btn primary grow', onclick: async () => { await saveDeal(a.deal_id, { stage: a.stage }, false); k.remove(); doneMsg(t('magiDone') + ' ' + d.title + ' : ' + t(a.stage), '#/pipeline'); } }, ic('check', 18), t('confirm')), h('button', { class: 'btn ghost', onclick: () => k.remove() }, t('cancel'))));
        return;
      }
    }
  }
  paint();
  setTimeout(() => input.focus(), 60);
}

// --- bouton « Enregistrer » : choisir le client puis la note vocale ou la réunion
async function quickCapture() {
  const { clients, visits } = await loadData();
  const last = new Map();
  for (const v of visits) if (!last.get(v.client_id) || v.date > last.get(v.client_id)) last.set(v.client_id, v.date);
  let mode = 'vocal', q = '';
  const segEl = h('div', { class: 'seg' });
  const paintSeg = () => segEl.replaceChildren(...[['vocal', 'newVocal', 'mic'], ['reunion', 'newMeeting', 'meet']].map(([k, l, i]) => h('button', { type: 'button', class: mode === k ? 'on' : null, 'aria-pressed': mode === k ? 'true' : 'false', onclick: () => { mode = k; paintSeg(); } }, ic(i, 18), t(l))));
  paintSeg();
  const list = h('div', { class: 'list pick' });
  const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const paint = () => {
    const nq = norm(q);
    const rows = clients.filter((c) => !nq || norm([c.name, c.company, c.city, c.code, c.phone].join(' ')).includes(nq))
      .sort((a, b) => (last.get(b.id) || b.updated_at || 0) - (last.get(a.id) || a.updated_at || 0)).slice(0, 30);
    list.replaceChildren(...rows.map((c) => h('button', { class: 'item', onclick: () => { m.remove(); if (mode === 'reunion') go('#/meeting?client=' + c.id); else voiceNote(c); } },
      h('span', { class: 'av', style: '--h:' + hueOf(c.name) }, initials(c.name)),
      h('div', { class: 'grow' }, h('div', { class: 't' }, c.name), h('div', { class: 's' }, [c.company && c.company !== c.name ? c.company : null, c.city].filter(Boolean).join(' · ') || c.code)))),
      rows.length ? '' : h('div', { class: 'empty' }, clients.length ? t('noneSearch') : t('none')));
  };
  const search = h('input', { class: 'input', type: 'search', placeholder: t('searchShort'), 'aria-label': t('searchShort'), oninput: (e) => { q = e.target.value; paint(); } });
  const m = modal(h('h3', {}, t('captureT')), segEl, h('b', { style: 'font-size:14px' }, t('pickClient')), search, list,
    h('a', { class: 'btn ghost', href: '#/new', onclick: () => m.remove() }, ic('plus', 18), t('newClientShort')));
  paint();
}

// --- note écrite
function viewNote(v, c, isNew, mine) {
  const vid = v.id || uuid();
  const task = v.kind === 'tache';
  if (task && isNew) { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); v.date = d.getTime(); }
  const txt = h('textarea', { class: 'input', rows: task ? 3 : 7, placeholder: task ? t('taskPh') : t('notePh'), disabled: !mine, value: v.summary || '' });
  const date = h('input', { class: 'input', type: 'datetime-local', value: localInput(v.date), disabled: !mine });
  const doneBox = h('input', { type: 'checkbox', checked: v.status === 'done', disabled: !mine });
  const form = h('form', { class: 'card pad stack', onsubmit: async (e) => {
    e.preventDefault();
    if (!mine) return history.back();
    if (!txt.value.trim()) { txt.focus(); return; }
    await saveVisit(vid, { client_id: c.id, kind: task ? 'tache' : 'note', status: task && !doneBox.checked ? 'planned' : 'done', date: fromInput(date.value) || Date.now(), summary: txt.value.trim() }, isNew);
    toast(navigator.onLine ? t('saved') : t('savedOffline'));
    clientTab = 'visits';
    location.replace('#/client/' + c.id);
  } },
    h('div', { class: 'item', style: 'border:0;padding:0' }, h('span', { class: 'av' }, initials(c.name)), h('div', { class: 'grow' }, h('div', { class: 't' }, c.name), h('div', { class: 's' }, [c.code, c.company].filter(Boolean).join(' · ')))),
    h('label', { class: 'f' }, task ? t('taskTxt') : t('noteTxt'), txt), h('label', { class: 'f' }, task ? t('dueDate') : t('date'), date),
    task && !isNew ? h('label', { class: 'check' }, doneBox, t('taskDone')) : null,
    mine ? h('div', { class: 'row' }, h('button', { class: 'btn primary grow', type: 'submit' }, ic('check', 20), t('save')), h('button', { type: 'button', class: 'btn ghost', onclick: () => history.back() }, t('cancel'))) : null,
    admin() && !isNew ? delVisitBtn(v, c) : null);
  layout(task ? t('tache') : t('note'), form, { back: '#/client/' + c.id });
  if (isNew) setTimeout(() => txt.focus(), 50);
}
function delVisitBtn(v, c) {
  return h('button', { type: 'button', class: 'btn danger', onclick: async () => {
    if (!(await confirmBox(t('deleteQ'), t('delete'), true))) return;
    try { await api('DELETE', '/api/visits/' + v.id); await DB.put('visits', { ...v, deleted_at: Date.now() }); go('#/client/' + c.id); } catch (e) { toast(e.status === 0 ? t('offlineAdmin') : t('error', { e: e.message })); }
  } }, ic('trash', 18), t('delete'));
}

// --- note vocale (enregistrement ou fichier audio)
async function voiceNote(c) {
  const spoken = langSelect();
  const vid = uuid();
  let r = null, iv = 0;
  const body = h('div', { class: 'stack' });
  const m = modal(h('h3', {}, t('newVocal')), h('p', { class: 'muted small', style: 'margin:0' }, c.name), h('label', { class: 'f' }, t('recLang'), spoken), body);
  m.addEventListener('click', (e) => { if (r && e.target === m) e.stopImmediatePropagation(); }, true);
  const create = () => saveVisit(vid, { client_id: c.id, kind: 'vocal', status: 'done', date: Date.now(), lang: spoken.value || null }, true);
  const finish = async (duration) => {
    await saveVisit(vid, { ai_status: 'pending', duration }, false);
    await queue({ type: 'ai', id: vid, body: { lang } });
    m.remove();
    toast(navigator.onLine ? t('saved') : t('savedOffline'));
    clientTab = 'visits';
    render();
  };
  const idle = () => body.replaceChildren(
    h('p', { class: 'small muted', style: 'margin:0' }, t('recHint') + ' ' + t('recMax', { m: VOICE_MAX_S / 60 })),
    h('button', { class: 'btn primary block big', onclick: start }, ic('mic', 24), t('rec')),
    h('button', { class: 'btn block', onclick: importFile }, ic('file', 20), t('recImport')));
  async function start() {
    const lv = levelBar();
    const time = h('div', { class: 'rec-time tnum' }, '0:00');
    try {
      await create();
      r = await startRecorder({ onChunk: (blob, n) => saveAudio(c, vid, blob, n, 'vocal', spoken.value), onLevel: lv.set });
    } catch (e) { toast(e.name === 'NotAllowedError' || e.name === 'NotFoundError' ? t('recDenied', { e: e.message }) : e.message, 6000); await DB.del('visits', vid).catch(() => {}); await dropVisitOp(vid); return idle(); }
    spoken.disabled = true;
    const stop = async () => { btn.disabled = true; clearInterval(iv); const d = r.elapsed(); await r.stop(); r = null; await finish(d); };
    const btn = h('button', { class: 'btn danger block big', onclick: stop }, ic('stop', 24), t('recStop'));
    body.replaceChildren(h('div', { class: 'row rec-row' }, h('span', { class: 'recdot' }), time), lv.el, btn);
    iv = setInterval(() => { const s = r ? r.elapsed() : 0; time.textContent = fdur(s); if (s >= VOICE_MAX_S && r) stop(); }, 400);
  }
  async function importFile() {
    const [f] = await pickFiles('audio/*,.m4a,.mp3,.ogg,.opus,.wav,.aac,.amr,.webm', null, false);
    if (!f) return;
    if (f.size > 24 * 1048576) return toast(t('aiTooBig'), 6000);
    await create();
    await saveAudio(c, vid, f, 1, 'vocal', spoken.value, f.name);
    await finish(null);
  }
  idle();
}
async function dropVisitOp(id) {
  for (const o of await DB.all('outbox')) if (o.type === 'visit' && o.id === id) await DB.del('outbox', o.seq);
  await refreshPending();
}

// --- réunion enregistrée
async function viewMeeting(clientId) {
  const c = await DB.get('clients', clientId);
  if (!c) return go('#/clients');
  const spoken = langSelect();
  const consent = h('input', { type: 'checkbox' });
  const err = h('p', { class: 'small', role: 'alert', style: 'color:var(--red);margin:0' });
  const startBtn = h('button', { class: 'btn primary block big', disabled: true, onclick: () => begin() }, ic('mic', 24), t('meetStart'));
  consent.onchange = () => { startBtn.disabled = !consent.checked; };
  const intro = h('section', { class: 'card pad stack' },
    h('div', { class: 'item', style: 'border:0;padding:0' }, h('span', { class: 'av' }, initials(c.name)), h('div', { class: 'grow' }, h('div', { class: 't' }, c.name), h('div', { class: 's' }, [c.code, c.company, c.city].filter(Boolean).join(' · ')))),
    h('p', { class: 'muted', style: 'margin:0' }, t('meetP')),
    h('label', { class: 'f' }, t('recLang'), spoken),
    h('label', { class: 'check' }, consent, t('meetConsent')),
    err, startBtn);
  layout(t('meetT'), intro, { back: '#/client/' + c.id });
  async function begin() {
    const vid = uuid();
    const lv = levelBar();
    let r;
    startBtn.disabled = true;
    try {
      await saveVisit(vid, { client_id: c.id, kind: 'reunion', status: 'done', date: Date.now(), lang: spoken.value || null }, true);
      r = await startRecorder({ onChunk: (blob, n) => saveAudio(c, vid, blob, n, 'reunion', spoken.value), onLevel: lv.set });
    } catch (e) {
      err.textContent = e.name === 'NotAllowedError' || e.name === 'NotFoundError' ? t('recDenied', { e: e.message }) : e.message;
      await DB.del('visits', vid).catch(() => {}); await dropVisitOp(vid); startBtn.disabled = false; return;
    }
    S.recording = location.hash;
    const time = h('div', { class: 'rec-time big tnum' }, '0:00');
    const end = async () => {
      endBtn.disabled = true; clearInterval(iv);
      const d = r.elapsed();
      await r.stop();
      S.recording = null; window.onbeforeunload = null;
      await saveVisit(vid, { ai_status: 'pending', duration: d }, false);
      await queue({ type: 'ai', id: vid, body: { lang } });
      toast(t('meetSaved'), 4000);
      location.replace('#/visit/' + vid);
    };
    const endBtn = h('button', { class: 'btn danger block big', onclick: end }, ic('stop', 24), t('meetEnd'));
    intro.replaceWith(h('section', { class: 'card pad stack rec-live' },
      h('div', { class: 'row rec-row' }, h('span', { class: 'recdot' }), h('b', {}, t('meetRec')), h('span', { class: 'grow' }), h('span', { class: 'muted small' }, c.name)),
      time, lv.el, h('p', { class: 'small muted', style: 'margin:0' }, t('meetKeep')), endBtn));
    window.onbeforeunload = (e) => { e.preventDefault(); e.returnValue = t('meetLeave'); return t('meetLeave'); };
    const iv = setInterval(() => { const s = r.elapsed(); time.textContent = fdur(s); if (s >= MEETING_MAX_S) end(); }, 400);
  }
}

// --- détail d'une note vocale ou d'une réunion
async function viewAiActivity(v, c, mine) {
  const { files } = await loadData();
  const audios = files.filter((f) => f.visit_id === v.id && f.category === 'audio').sort((a, b) => (a.seq || 0) - (b.seq || 0) || a.created_at - b.created_at);
  const players = h('div', { class: 'stack' });
  audios.forEach((f, i) => {
    const a = h('audio', { controls: true, preload: 'none', style: 'width:100%' });
    if (f.local) DB.get('blobs', f.id).then((b) => { if (b) a.src = URL.createObjectURL(b); }); else a.src = BASE + '/api/files/' + f.id;
    players.append(h('div', { class: 'stack', style: 'gap:4px' }, h('span', { class: 'small muted' }, audios.length > 1 ? t('part', { n: i + 1 }) : t('audio')), a));
  });
  const busy = v.ai_status === 'pending';
  const head = h('section', { class: 'card pad stack' },
    h('div', { class: 'item', style: 'border:0;padding:0' }, h('span', { class: 'av' }, initials(c.name)), h('a', { class: 'grow', href: '#/client/' + c.id, style: 'color:inherit;text-decoration:none' }, h('div', { class: 't' }, c.name), h('div', { class: 's' }, [fdt(v.date), userName(v.user_id), v.duration ? fdur(v.duration) : null].filter(Boolean).join(' · ')))),
    aiBadge(v),
    mine && !busy && audios.length ? h('button', { class: 'btn', onclick: async () => { await askAi(v); render(); } }, ic('sync', 18), v.ai_status === 'done' || v.transcript ? (v.kind === 'reunion' ? t('aiRegen') : t('aiRetry')) : v.ai_status === 'error' ? t('aiRetry') : t('aiAnalyze')) : null,
    v.ai_status === 'done' || v.transcript ? h('button', { class: 'btn brief', onclick: () => followupModal(v) }, ic('send', 18), t('followup')) : null,
    audios.length ? [h('h2', { class: 'sec', style: 'margin:6px 0 0' }, t('recordings')), players] : null);
  const blocks = [head];
  if (v.kind === 'vocal') {
    const txt = h('textarea', { class: 'input', rows: 8, disabled: !mine, value: v.transcript || '' });
    blocks.push(h('section', { class: 'card pad stack' }, h('label', { class: 'f' }, t('transcript'), txt),
      mine ? h('button', { class: 'btn primary', onclick: async () => { await saveVisit(v.id, { transcript: txt.value.trim() }, false); toast(t('saved')); } }, ic('check', 20), t('save')) : null));
  } else {
    const f = {};
    const ta = (k, label) => h('label', { class: 'f' }, label, (f[k] = h('textarea', { class: 'input', rows: 3, disabled: !mine, value: v[k] || '' })));
    f.next_date = h('input', { class: 'input', type: 'datetime-local', value: v.next_date ? localInput(v.next_date) : '', disabled: !mine });
    blocks.push(h('section', { class: 'card pad stack' },
      ta('summary', t('summary')), ta('agreed', t('agreed')), ta('not_done', t('notDone')), ta('demands', t('demands')),
      h('div', { class: 'grid2' }, h('label', { class: 'f' }, t('nextStep'), (f.next_step = h('input', { class: 'input', value: v.next_step || '', disabled: !mine }))), h('label', { class: 'f' }, t('nextDate'), f.next_date)),
      mine ? h('button', { class: 'btn primary', onclick: async () => {
        await saveVisit(v.id, { summary: f.summary.value.trim(), agreed: f.agreed.value.trim(), not_done: f.not_done.value.trim(), demands: f.demands.value.trim(), next_step: f.next_step.value.trim(), next_date: fromInput(f.next_date.value) }, false);
        toast(t('saved'));
      } }, ic('check', 20), t('save')) : null));
    // transcription : bulles Commercial / Client, modifiable
    const lines = String(v.transcript || '').split('\n').filter(Boolean);
    const bubbles = h('div', { class: 'dialog' }, ...lines.map((l) => {
      const mm = l.match(/^(Commercial|Client|—)\s*:\s*([\s\S]*)$/);
      const who = mm ? mm[1] : '';
      return h('div', { class: 'bub ' + (who === 'Client' ? 'cli' : who === 'Commercial' ? 'com' : '') }, who && who !== '—' ? h('b', {}, who === 'Client' ? t('speakerK') : t('speakerC')) : null, h('span', {}, mm ? mm[2] : l));
    }));
    const edit = h('textarea', { class: 'input', rows: 12, value: v.transcript || '', style: 'display:none' });
    const saveTr = h('button', { class: 'btn primary', style: 'display:none', onclick: async () => { await saveVisit(v.id, { transcript: edit.value.trim() }, false); toast(t('saved')); render(); } }, ic('check', 20), t('save'));
    blocks.push(h('section', { class: 'card pad stack' },
      h('div', { class: 'row' }, h('b', { class: 'grow' }, t('transcriptWho')), mine && lines.length ? h('button', { class: 'btn sm', onclick: () => { bubbles.style.display = 'none'; edit.style.display = ''; saveTr.style.display = ''; } }, ic('edit', 16), t('editText')) : null),
      lines.length ? bubbles : h('p', { class: 'muted small', style: 'margin:0' }, busy ? t('aiPending') : t('aiNone')), edit, saveTr));
  }
  if (admin()) blocks.push(delVisitBtn(v, c));
  layout(t(v.kind) + ' — ' + fdate(v.date), blocks, { back: '#/client/' + c.id });
}

// =================================================================== écran : agenda
const agendaState = { user: '' };
async function viewAgenda() {
  const { clients, visits } = await loadData();
  const cm = new Map(clients.map((c) => [c.id, c]));
  const mineOnly = (v) => (!agendaState.user || v.user_id === agendaState.user) && cm.has(v.client_id);
  const now = Date.now(), d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const today0 = d0.getTime(), today1 = today0 + 86400000;
  const tasks = visits.filter((v) => v.kind === 'tache' && v.status === 'planned' && mineOnly(v)).sort((a, b) => a.date - b.date);
  const planned = visits.filter((v) => v.status === 'planned' && v.kind !== 'tache' && mineOnly(v)).sort((a, b) => a.date - b.date);
  const overdue = planned.filter((v) => v.date < today0), today = planned.filter((v) => v.date >= today0 && v.date < today1), next = planned.filter((v) => v.date >= today1);
  const recent = visits.filter((v) => v.status === 'done' && v.kind !== 'tache' && mineOnly(v)).sort((a, b) => b.date - a.date).slice(0, 40);
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
    h('h2', { class: 'sec' }, `${t('tasks')} (${tasks.length})`),
    tasks.length ? h('div', { class: 'stack', style: 'gap:8px' }, ...tasks.map((v) => taskCard(v, (cm.get(v.client_id) || {}).name))) : h('div', { class: 'empty' }, t('noTasks')),
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
  const pl = new Map((d.pipeline || []).map((x) => [x.stage, x]));
  const openAmt = ['nouveau', 'devis', 'negociation'].reduce((a, k) => a + ((pl.get(k) || {}).amount || 0), 0);
  const pipeBox = h('a', { class: 'card pad pipe-sum', href: '#/pipeline' }, h('b', {}, t('pipeline')),
    h('div', { class: 'pbars' }, ...STAGES.map((k) => { const x = pl.get(k) || { n: 0, amount: 0 }; return h('div', { class: 'pb s-' + k }, h('span', {}, t(k)), h('b', { class: 'tnum' }, x.n), h('small', { class: 'tnum' }, money(x.amount))); })),
    h('div', { class: 'small muted' }, t('weighted') + ' : ' + money(openAmt)));
  layout(t('dashboard'), [
    pipeBox,
    h('div', { class: 'kpis' }, kpi(T0.clients, t('kpiClients')), kpi(T0.prospects, t('kpiProspects')), kpi(T0.visits_7, t('kpiVisits7')), kpi(T0.planned, t('kpiPlanned')),
      kpi(T0.visits_30, t('kpiVisits30')), kpi(`${T0.located}/${T0.clients + T0.prospects}`, t('kpiLocated')), kpi(T0.files, t('kpiFiles'), fsize(T0.storage)), kpi(T0.new_30, t('kpiNew'))),
    d.ai_usage ? h('div', { class: 'card pad ai-use' }, robotIcon(), h('div', { class: 'grow' }, h('b', {}, t('aiToday')), h('div', { class: 'small' }, t('aiTodayD', { a: d.ai_usage.assistant || 0, s: d.ai_usage.stt || 0, l: d.ai_usage.llm || 0 })),
      d.ai_usage.prev ? h('div', { class: 'small muted' }, t('aiYest', { a: d.ai_usage.prev.assistant, s: d.ai_usage.prev.stt, l: d.ai_usage.prev.llm })) : null)) : null,
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
      h('div', { class: 'grow' }, h('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, h('span', { class: 't' }, u.name), h('span', { class: 'badge ' + (u.role === 'admin' ? 'b-planned' : 'b-muted') }, userTitle(u)), u.active ? null : h('span', { class: 'badge b-cancelled' }, t('disabled'))),
        h('div', { class: 's', dir: 'ltr', style: 'text-align:start' }, u.login + (u.phone ? ' · ' + u.phone : '')),
        h('div', { class: 's' }, `${s.clients || 0} ${t('clients').toLowerCase()} · ${s.visits_30 || 0} ${t('visits').toLowerCase()} / 30 j · ${t('lastSeen')} ${ago(u.last_seen)}`)),
      ic('chev', 18));
  }));
  layout(t('team'), [h('div', { class: 'row', style: 'margin-bottom:12px' }, h('button', { class: 'btn primary', onclick: () => userSheet(null, users.users) }, ic('plus', 20), t('addUser'))), list]);
}
const JOB_TITLES = ['Directeur commercial', 'Directrice commerciale', 'Gérant', 'Responsable des ventes', 'Chef d’équipe', 'Superviseur', 'Commercial terrain', 'Technico-commercial', 'Assistante commerciale', 'Responsable grands comptes'];
const userTitle = (u) => (u && u.title) || t(u && u.role === 'admin' ? 'admin' : 'commercial');
function userSheet(u, all) {
  const isNew = !u;
  const f = {};
  const p = u ? u.perms : { all: false, export: false, edit_all: false };
  f.name = h('input', { class: 'input', value: u ? u.name : '', required: true });
  f.login = h('input', { class: 'input', value: u ? u.login : '', dir: 'ltr', autocapitalize: 'none', required: true });
  f.phone = h('input', { class: 'input', value: u ? u.phone || '' : '', dir: 'ltr', type: 'tel' });
  f.role = h('select', { class: 'input' }, ...['commercial', 'admin'].map((r) => { const o = h('option', { value: r }, t(r)); if (u && u.role === r) o.selected = true; return o; }));
  f.title = h('input', { class: 'input', value: u ? u.title || '' : '', list: 'job-titles', maxlength: 60, placeholder: t('jobTitlePh') });
  const titles = h('datalist', { id: 'job-titles' }, ...JOB_TITLES.map((x) => h('option', { value: x })));
  f.all = h('input', { type: 'checkbox', checked: p.all });
  f.edit = h('input', { type: 'checkbox', checked: p.edit_all });
  f.exp = h('input', { type: 'checkbox', checked: p.export });
  const err = h('p', { class: 'small', role: 'alert', style: 'color:var(--red);margin:0' });
  const body = () => ({ name: f.name.value, login: f.login.value, phone: f.phone.value, role: f.role.value, title: f.title.value.trim(), perms: { scope: f.all.checked ? 'all' : 'own', edit_all: f.edit.checked, export: f.exp.checked } });
  const m = modal(h('h3', {}, isNew ? t('addUser') : u.name),
    h('label', { class: 'f' }, t('fullName'), f.name), h('div', { class: 'grid2' }, h('label', { class: 'f' }, t('login'), f.login), h('label', { class: 'f' }, t('phone'), f.phone)),
    h('div', { class: 'grid2' }, h('label', { class: 'f' }, t('jobTitle'), f.title, titles), h('label', { class: 'f' }, t('role'), f.role)),
    h('p', { class: 'small muted', style: 'margin:0' }, t('roleHelp')),
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
      h('button', { class: 'btn primary', onclick: () => { const q = new URLSearchParams(); if (ck.value) q.set('kind', ck.value); if (co.value) q.set('owner', co.value); if (cc.value) q.set('city', cc.value); dl(BASE + '/api/export/clients.xlsx?' + q); } }, ic('xls', 20), t('download'))),
    h('section', { class: 'card pad stack' }, h('h3', { style: 'margin:0' }, t('expVisits')),
      h('div', { class: 'grid2' }, h('label', { class: 'f' }, t('from'), vfrom), h('label', { class: 'f' }, t('to'), vto)), admin() || S.user.perms.all ? h('label', { class: 'f' }, t('owner'), vu) : null,
      h('button', { class: 'btn primary', onclick: () => { const q = new URLSearchParams(); if (vfrom.value) q.set('from', new Date(vfrom.value + 'T00:00').getTime()); if (vto.value) q.set('to', new Date(vto.value + 'T23:59:59').getTime()); if (vu.value) q.set('user', vu.value); dl(BASE + '/api/export/visits.xlsx?' + q); } }, ic('xls', 20), t('download'))),
    h('section', { class: 'card pad stack' }, h('h3', { style: 'margin:0' }, t('expDeals')),
      h('button', { class: 'btn primary', onclick: () => dl(BASE + '/api/export/deals.xlsx') }, ic('xls', 20), t('download'))),
    admin() ? importBox(users) : null,
    h('p', { class: 'small muted' }, t('expHelp'))));
}
// --- import Excel / CSV (fichiers exportés de Sage, EBP…)
const IMPORT_COLS = {
  code: ['code', 'codeclient', 'reference', 'ref', 'numero', 'numeroclient', 'compte', 'codetiers', 'ctnum'],
  name: ['nom', 'name', 'raisonsociale', 'client', 'intitule', 'nomclient', 'denomination', 'ctintitule', 'tiers'],
  company: ['societe', 'entreprise', 'company', 'nomsociete'],
  contact: ['contact', 'interlocuteur', 'personneacontacter', 'responsable'],
  phone: ['gsm', 'mobile', 'portable', 'telephonemobile', 'tel2', 'cell'],
  phone2: ['telephone', 'tel', 'fixe', 'telephonefixe', 'phone', 'ctelephone'],
  email: ['email', 'mail', 'courriel', 'adresseemail', 'emailcontact'],
  website: ['siteweb', 'site', 'web', 'website', 'url', 'siteinternet'],
  city: ['ville', 'city', 'localite', 'ctville'],
  address: ['adresse', 'address', 'rue', 'ctadresse', 'adresse1'],
  sector: ['secteur', 'activite', 'secteurdactivite', 'categorie', 'famille'],
  ice: ['ice', 'identifiantcommun'],
  notes: ['remarques', 'notes', 'commentaire', 'commentaires', 'observation'],
};
const colKey = (hd) => { const n = String(hd || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''); for (const [k, al] of Object.entries(IMPORT_COLS)) if (al.includes(n)) return k; return null; };
function parseCsv(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const sep = [';', ',', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}
async function unzipEntries(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), out = {};
  let e = buf.byteLength - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('zip');
  let p = dv.getUint32(e + 16, true); const n = dv.getUint16(e + 10, true);
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (!/^xl\/(sharedStrings|worksheets\/sheet1)\.xml$/.test(name)) continue;
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    const data = u8.subarray(start, start + csize);
    out[name] = method === 0 ? new TextDecoder().decode(data) : await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  return out;
}
async function parseXlsx(buf) {
  const z = await unzipEntries(buf);
  const P = new DOMParser();
  const ss = z['xl/sharedStrings.xml'] ? [...P.parseFromString(z['xl/sharedStrings.xml'], 'application/xml').getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((x) => x.textContent).join('')) : [];
  const doc = P.parseFromString(z['xl/worksheets/sheet1.xml'] || '<x/>', 'application/xml');
  const rows = [];
  for (const r of doc.getElementsByTagName('row')) {
    const row = [];
    for (const c of r.getElementsByTagName('c')) {
      const ref = c.getAttribute('r') || '', col = ref.replace(/\d+/g, '').split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const tp = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], is = c.getElementsByTagName('t')[0];
      row[col >= 0 ? col : row.length] = tp === 's' ? ss[Number(v && v.textContent)] : tp === 'inlineStr' ? (is ? is.textContent : '') : v ? v.textContent : '';
    }
    rows.push(Array.from(row, (x) => (x == null ? '' : String(x))));
  }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}
function importBox(users, onDone) {
  const info = h('p', { class: 'small muted', style: 'margin:0' });
  const kindSel = h('select', { class: 'input' }, h('option', { value: 'client' }, t('client')), h('option', { value: 'prospect' }, t('prospect')));
  const ownSel = h('select', { class: 'input' }, h('option', { value: '' }, S.user.name), ...users.filter((u) => u.active && u.id !== S.user.id).map((u) => h('option', { value: u.id }, u.name)));
  const go2 = h('button', { class: 'btn primary', disabled: true }, ic('plus', 18), t('importPick'));
  const errBox = h('ul', { class: 'small imp-err', hidden: true });
  let rows = [];
  const pick = h('button', { class: 'btn', onclick: async () => {
    const [file] = await pickFiles('.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, false);
    if (!file) return;
    try {
      const table = /\.csv$/i.test(file.name) || file.type === 'text/csv' ? parseCsv(await file.text()) : await parseXlsx(await file.arrayBuffer());
      const head = (table[0] || []).map(colKey);
      if (!head.includes('name')) { info.textContent = t('importNone'); go2.disabled = true; return; }
      rows = table.slice(1).map((r) => { const o = {}; head.forEach((k, i) => { if (k && r[i] != null && String(r[i]).trim()) o[k] = String(r[i]).trim(); }); return o; }).filter((o) => o.name || o.code);
      info.textContent = t('importRows', { n: rows.length, c: [...new Set(head.filter(Boolean))].map((k) => t(k === 'name' ? 'name' : k === 'company' ? 'companyF' : k)).join(', ') });
      go2.disabled = !rows.length; go2.replaceChildren(ic('plus', 18), t('importGo', { n: rows.length }));
    } catch (e) { info.textContent = t('importErr', { e: e.message }); go2.disabled = true; }
  } }, ic('file', 18), t('importPick'));
  go2.onclick = async () => {
    if (!navigator.onLine) return toast(t('offlineAdmin'));
    go2.disabled = true;
    let c = 0, u = 0; const errs = [];
    try {
      for (let i = 0; i < rows.length; i += 300) {
        go2.replaceChildren(h('span', { class: 'spinner' }), `${Math.min(i + 300, rows.length)} / ${rows.length}`);
        const r = await api('POST', '/api/clients/import', { rows: rows.slice(i, i + 300), kind: kindSel.value, owner_id: admin() ? ownSel.value || null : null });
        c += r.created; u += r.updated;
        for (const x of r.errors || []) errs.push({ ...x, line: x.line + i + 1 });
      }
      info.textContent = t('importDone', { c, u }); toast(t('importDone', { c, u }), 5000); rows = [];
      errBox.replaceChildren(...errs.slice(0, 20).map((x) => h('li', {}, t('importLine', { n: x.line }) + ' : ' + x.error)));
      errBox.hidden = !errs.length;
      syncNow(true);
    } catch (e) { toast(t('error', { e: e.message })); }
    go2.replaceChildren(ic('plus', 18), t('importPick'));
  };
  return h('section', { class: 'card pad stack' }, h('h3', { style: 'margin:0' }, t('importT')), h('p', { class: 'small muted', style: 'margin:0' }, t('importP')),
    admin() ? h('div', { class: 'grid2' }, h('label', { class: 'f' }, t('importKind'), kindSel), h('label', { class: 'f' }, t('importOwner'), ownSel)) : h('label', { class: 'f' }, t('importKind'), kindSel),
    pick, info, go2, errBox, onDone ? h('button', { class: 'btn ghost', type: 'button', onclick: onDone }, t('close')) : null);
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
function recoverySection() {
  const state = h('p', { class: 'small muted', style: 'margin:0' }, '…');
  api('GET', '/api/settings/recovery').then((r) => { state.textContent = r.exists ? t('recSecOk') : t('recSecNone'); state.style.color = r.exists ? '' : 'var(--red)'; }).catch(() => { state.textContent = ''; });
  const pw = h('input', { class: 'input', type: 'password', dir: 'ltr', autocomplete: 'current-password' });
  const err = h('p', { class: 'small', role: 'alert', style: 'color:var(--red);margin:0' });
  return h('section', { class: 'card pad stack', style: 'margin-top:12px' }, h('h3', { style: 'margin:0' }, t('recSec')), h('p', { class: 'small muted', style: 'margin:0' }, t('recSecP')), state,
    h('label', { class: 'f' }, t('recPw'), pw), err,
    h('button', { class: 'btn', type: 'button', onclick: async () => {
      err.textContent = '';
      try { const r = await api('POST', '/api/settings/recovery', { password: pw.value }); pw.value = ''; state.textContent = t('recSecOk'); state.style.color = ''; showRecovery(r.code); }
      catch (x) { err.textContent = x.status === 0 ? t('offlineAdmin') : x.message; }
    } }, t('recGen')),
    h('p', { class: 'small muted', style: 'margin:0' }, t('recTip')));
}
function viewSettings() {
  const thSel = h('select', { class: 'input' }, ...THEMES.map(([k, l]) => { const o = h('option', { value: k }, l); if (k === (S.settings.theme || 'indigo')) o.selected = true; return o; }));
  const f = { company: h('input', { class: 'input', value: S.settings.company }), cp: h('input', { class: 'input', value: S.settings.client_prefix, dir: 'ltr', maxlength: 6 }), pp: h('input', { class: 'input', value: S.settings.prospect_prefix, dir: 'ltr', maxlength: 6 }) };
  layout(t('settings'), [h('form', { class: 'card pad stack', onsubmit: async (e) => {
    e.preventDefault();
    try { const d = await api('PATCH', '/api/settings', { company: f.company.value, client_prefix: f.cp.value, prospect_prefix: f.pp.value, theme: thSel.value }); S.settings = d.settings; await DB.put('meta', S.settings, 'settings'); toast(t('saved')); render(); }
    catch (x) { toast(x.status === 0 ? t('offlineAdmin') : t('error', { e: x.message })); }
  } }, h('label', { class: 'f' }, t('companyName'), f.company), h('div', { class: 'grid2' }, h('label', { class: 'f' }, t('prefixC'), f.cp), h('label', { class: 'f' }, t('prefixP'), f.pp)), h('label', { class: 'f' }, t('themeDefault'), thSel), h('button', { class: 'btn primary', type: 'submit' }, t('save'))),
    S.settings.demo ? null : recoverySection()]);
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
  const themeBox = h('div', { class: 'themes' });
  const paintThemes = () => themeBox.replaceChildren(...[['', t('themeCompany'), null, null], ...THEMES].map(([k, l, a, b]) => {
    const th = THEMES.find((x) => x[0] === (k || S.settings.theme || 'indigo')) || THEMES[0];
    return h('button', { class: 'sw' + (myTheme() === k ? ' on' : ''), 'aria-pressed': myTheme() === k ? 'true' : 'false', onclick: () => { try { if (k) localStorage.setItem('crm-theme', k); else localStorage.removeItem('crm-theme'); } catch (e) {} applyTheme(S.settings); paintThemes(); } },
      h('i', {}, h('span', { style: 'background:' + (a || th[2]) }), h('span', { style: 'background:' + (b || th[3]) })), l);
  }));
  paintThemes();
  layout(t('me'), h('div', { class: 'stack' },
    h('section', { class: 'card pad stack' }, h('b', {}, t('theme')), h('span', { class: 'small muted', style: 'margin-top:-8px' }, t('themeHelp')), themeBox),
    S.user.must_change ? h('div', { class: 'card pad', style: 'background:var(--orange-s);border-color:transparent' }, t('mustChange')) : null,
    h('section', { class: 'card pad' }, h('div', { class: 'item', style: 'border:0;padding:0' }, h('span', { class: 'av' }, initials(S.user.name)), h('div', { class: 'grow' }, h('div', { class: 't' }, S.user.name), h('div', { class: 's', dir: 'ltr', style: 'text-align:start' }, S.user.login), h('div', { class: 's' }, userTitle(S.user) + ' · ' + S.settings.company)))),
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
      await DB.wipe(); try { await caches.delete('crm-files-v1'); } catch (e) {} S.user = null; showLogin();
    } }, t('logout')),
    h('p', { class: 'small muted', style: 'text-align:center' }, 'Magiscom CRM · ' + S.settings.company)));
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
  if (S.recording) { if (seg[0] !== 'meeting') location.hash = S.recording; return; }   // une réunion s'enregistre : on reste sur l'écran
  try {
    if (!seg.length) return go(admin() ? '#/dashboard' : '#/clients');
    switch (seg[0]) {
      case 'clients': return viewClients();
      case 'new': return viewClientForm(null);
      case 'client': return seg[2] === 'edit' ? viewClientForm(seg[1]) : viewClient(seg[1]);
      case 'visit': return viewVisitForm(seg[1] === 'new' ? null : seg[1], params);
      case 'meeting': return viewMeeting(params.get('client'));
      case 'pipeline': return viewPipeline();
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
  if ('serviceWorker' in navigator) {
    const hadSw = !!navigator.serviceWorker.controller;
    let reloaded = false;
    // nouvelle version de l'application installée : on recharge une fois (sauf pendant un enregistrement)
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadSw && !reloaded && !S.recording) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('/sw.js').then((r) => r.update().catch(() => {})).catch(() => {});
  }
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
