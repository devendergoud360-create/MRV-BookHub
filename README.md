# MRV BookHub

College book management and exchange platform with a 3D scrollable React frontend and a secure, modular Node/Express/SQLite backend.

## Rubric-Focused Highlights
- **Requirements/Functionality**: roles (Student/Faculty/Librarian/Vendor/Admin), book CRUD/search, peer borrowing with due dates/extensions, library inventory/reservations/issues/returns/reports, vendor marketplace simulated checkout, notifications/reminders, admin controls, seed data.
- **Architecture**: layered presentation/application/domain/persistence. Patterns: Strategy (`storageStrategy`), Command (`commandBus/registry`), Observer/EventBus (`eventBus` + structured logging subscriber).
- **Security/Robustness**: bcrypt hashes, JWT, RBAC, validation, rate limits, CORS allowlist, origin checks, double-submit CSRF, security headers + strict CSP, upload whitelist/size limits, body limit, centralized errors, audit logs.
- **Logging**: structured JSON logger (`backend/services/logger.js`) with optional file sink (`LOG_FILE`).
- **Innovation**: MRV TrustScore (MTS v1) - deterministic, dependency-free, bounded [0,1] trust/risk score with FNV-1a non-reversible fingerprint and plain-language explanation; JS+Python parity check.
- **Quality/Testing**: unit, property/invariant, integration/security tests; GitHub Actions CI.

## Repo Structure
```text
MRV-BookHub/
  backend/                 # Express API, SQLite, services, middleware
  frontend/                # Vite React + R3F 3D scrollable UI
  docs/                    # SRS, API reference
  scripts/                 # TrustScore python parity + parity check + vectors
  tests/                   # unit/property/integration tests (Vitest)
  .github/workflows/ci.yml # CI
```

## Setup
### Prerequisites
- Node.js 22+
- Python 3.11+ (for parity check)

### Backend
```bash
cd backend
npm install
cp .env.example .env
npm run seed
npm start
```
API: `http://localhost:5000/api/health`

### Frontend
```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_BASE_URL
npm run dev
```
UI: `http://localhost:5173`

### Single-origin deployment (backend serves frontend build)
```bash
cd frontend && npm run build
cd ../backend && PORT=5055 npm start
# open http://localhost:5055/
```

## Environment Variables
See `.env.example` and `backend/.env.example`. Key vars: `PORT`, `HOST`, `LOOPBACK_ONLY`, `DATABASE_PATH`, `JWT_SECRET`, `FRONTEND_URL`, `API_BEARER_TOKEN`, `LOG_TO_FILE`, `LOG_FILE`, SMTP/OTP/reminder vars.

## Test & Validation Commands
```bash
# from repo root
npm install
npm run parity                  # JS/Python TrustScore parity
cd backend && npm test          # backend vitest suite (if configured)
cd .. && npx vitest run         # root tests
cd frontend && npm run build    # frontend build

# or run all checks
node scripts/parity_check.js
npx vitest run
cd frontend && npm run build
```

## API Reference
See [`docs/API.md`](docs/API.md). Includes endpoints, auth, CSRF/origin behavior, error codes, request/response examples.

## Security Notes
- No plain-text passwords; bcrypt hashes only.
- JWT Bearer auth; RBAC enforced on server.
- Double-submit CSRF (`csrf_token` cookie + `X-CSRF-Token` header) for unsafe browser requests; bearer API clients supported.
- Origin allowlist, strict CSP/security headers, body size limit, upload extension/MIME whitelist.
- Rate limiting for login/reset.
- Audit logs for critical actions.
- Dev-only OTP simulation when SMTP not configured; do not enable in production.

## Seeded Dev Accounts (password: `Password@123`)
- Admin: `admin@mrv.edu`
- Students (hall ticket login): `22CSE001`..`23AIML001` (see seed output)
- Faculty: `FAC001-FAC003`
- Librarians: `LIB001-LIB002`
- Vendors: `campusbooks@mrv.edu`, `techreads@mrv.edu`

## Live URLs / Demo
- Local frontend: `http://localhost:5173`
- Local backend: `http://localhost:5000/api/health`
- Single-origin local: `http://localhost:5055`
- Live URL: *add Vercel/Render deployment URL after deployment*
- Repo URL: *add GitHub repo URL after push*

## 2-Minute Demo Script
1. Start backend+frontend, open UI; show 3D scroll sections and role capabilities.
2. Login as student (`22CSE001`/`Password@123`), search books, create borrow request.
3. Login as owner/faculty, approve request, record issue/return; show notification.
4. Login as librarian (`LIB001`), show inventory/reservation/issue/return and reports; highlight inventory invariant.
5. Login as admin, approve user, view audit logs/reports, export data (`/api/system/export?format=json`).
6. Show TrustScore endpoint `/api/system/trust-score/listing/:id` and parity check `node scripts/parity_check.js`.
7. Run tests/build: `node scripts/parity_check.js && npx vitest run && cd frontend && npm run build`.
