# Magiscom CRM: Prospects magazine (patch)

The CRM (Worker `magiscom-crm`, https://magiscom-crm.integrateurebp.com) has no repository. The original `dist/worker.js` is recovered from the deployed bundle's source map (`sourcesContent`), patched in memory and uploaded with the Cloudflare API. Nothing else in the CRM is changed.

Files:
- `prospects-client.js`: block inserted before `async function viewExport()` in the embedded `/app.js` (IIFE scope): texts fr/ar/en, CSS, `viewProspects`, header pill with the count of new prospects.
- `prospects-server.js`: block inserted before `/api/me` in `route()`: `GET /api/prospects`, `POST /api/prospects/seen-all`, `POST /api/prospects/:id/status`, `POST /api/prospects/:id/convert` (admin or permission `prospects`).

Other one-line anchors (each must match exactly once or the patch aborts): `canExport` (adds `canProspects`), `nav()`, layout header, router `case 'export'`, Team form (checkbox `permProspects`, `prospects` in the perms body), server `perms()` and its JSON saver, service worker cache `crm-shell-v2` to `v3`.

Table (created lazily): `prospect_posts(id, created_at, company, city, sector, tag, signal, source_name, source_url, contact, status, note, client_id, dedupe UNIQUE)`; tags `distribution | new_company | accounting | sage`; statuses `new | seen | contacted | converted | archived`. The prospecting routine inserts rows directly in D1 (`INSERT OR IGNORE`, `dedupe` = company|city lowercase). Only public company information with a named source URL.

Test Worker: `magiscom-crm-test` (bound to the DEMO D1/R2 only): https://magiscom-crm-test.jaouich.workers.dev/demo
Rollback of the real Worker: Cloudflare dashboard > Workers > magiscom-crm > Deployments (previous version) or the versions API.
