# Magiscom Desk — application Android

Enregistreur d'écran pour les clients de Magiscom Tech (comme AZ Screen Recorder) :
écran + voix, bulle flottante (minuteur, pause, arrêt), compte à rebours, vidéo MP4 dans la galerie
(Films › Magiscom Desk), partage, et envoi à Magiscom Tech Desk (support.integrateurebp.com) en morceaux de 10 Mo.

- Java, API Android uniquement (aucune bibliothèque externe), Android 10 et plus.
- La compilation se fait sur GitHub Actions (`.github/workflows/android.yml`) : APK **non signée**.
- La signature est faite à part avec la clé de Magiscom Tech, qui n'est **jamais** dans ce dépôt public.
