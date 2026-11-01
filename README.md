# KotRunner frontend

React + Vite, JavaScript. A category-first Kotlin practice interface with 90
original exercises, a CodeMirror editor, one Go button, visible results, aggregate
hidden results, optional hints, and successful-solution persistence.

## Local development

Use Node 24 LTS or newer and npm. From this directory:

```sh
npm ci
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to `http://localhost:8080`; start
the Kotlin backend from its sibling checkout. `API_PROXY` can override this
development proxy. No database or execution secrets belong in frontend variables.

For the full application with MongoDB and the isolated compiler, run
`docker compose up --build -d` from `../kotrunner-backend` and open
http://localhost:8088. See the backend README for the guest-only Compose overlay.

```sh
npm test
npm run build
npm audit
```

Tests cover navigation, hint visibility, successful and failed runs, busy state,
Reset/reopen, auth forms, verified transfer, account logout isolation, corrupt or
unsupported browser data, denied storage, and concurrent transfer snapshots.

## Persistence rules

Guest successful source is saved under `kotrunner.progress.v1`, schema version 1.
Drafts are never autosaved. Navigation or refresh can discard unfinished code.
Reset restores the starter in the current editor and preserves the saved correct
solution. Reopening restores that solution; successful reruns replace it.

Account progress comes only from the API. Sessions use HTTP-only cookies, never
localStorage tokens. Registration/login automatically verify saved guest source
with the backend. Only confirmed transferred records are cleared. Existing
account source wins on duplicates; failed/interrupted transfers retain local
copies and offer retry. There is no export/import utility or reference solution UI.

## Contract and deployment

The canonical v1 API contract is `docs/API.md` in the sibling backend repository:
https://github.com/SaranFuchs/kotrunner-backend/blob/main/docs/API.md

`nginx.conf` serves the built SPA, applies browser security headers, and proxies
same-origin `/api` to the backend. The backend needs the exact frontend Origin in
its allowlist. Production requires a verified HTTPS API route; a static-only
frontend deployment does not satisfy the complete KotRunner requirements.

See the backend `DEPLOYMENT.md` and `ACCEPTANCE.md` for current hosted acceptance.
Neither secrets nor hidden fixtures/oracles may be committed to this repository.
