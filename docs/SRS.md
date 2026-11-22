# MRV BookHub - Software Requirements Specification (SRS)

## 1. Introduction
MRV BookHub is a college book management and exchange platform supporting Students, Faculty, Librarians, Vendors, and Admins. It provides book listings, peer-to-peer borrowing, library reservations/inventory, vendor sales, notifications/reminders, and admin controls.

## 2. Architecture
### 2.1 Layers
- **Presentation**: React + Vite frontend (`frontend/`), 3D scrollable landing experience, API client.
- **Application**: Express route/controller orchestration (`backend/routes`, `backend/controllers`), auth/RBAC, request validation, command execution.
- **Domain**: business rules in services (`trustScoreService`, `inventoryService`, `reminderService`, validation rules, role constraints).
- **Persistence**: SQLite via `node:sqlite` adapter (`backend/config/database.js`, `database/schema.sql`), file uploads, export strategies.

### 2.2 Design Patterns
- **Strategy**: `services/storageStrategy.js` provides `SQLiteStrategy`, `JSONStrategy`, `CSVStrategy` behind a `StorageRegistry` with common `exportAll/readTable` interface.
- **Command**: `services/commandBus.js` and `services/commandRegistry.js` register executable domain commands (`user.approve`, `inventory.adjust`, `export.data`) with metadata.
- **Observer/Event Bus**: `services/eventBus.js` publishes domain events; a wildcard subscriber emits structured JSON logs (`domain.event`).

### 2.3 Deployment Target
Primary deployment target: Node-hosted backend serving frontend build; Vercel/static deployment possible for frontend with external API. Cloud/static build is treated as deliberate deployment target: frontend uses `VITE_API_BASE_URL`; backend can serve `frontend/dist` for single-origin deployment.

## 3. Requirements Mapping

| Requirement | Implementation | Verification |
|---|---|---|
| Roles: student/faculty/librarian/vendor/admin | `schema.sql`, auth controllers/routes, `roleMiddleware` | integration tests, seed users |
| Student registration/login by hall ticket | `authController.registerStudent/loginStudent`, `students` table | API tests/manual |
| Faculty/librarian/vendor/admin login | `authController` role logins | API tests |
| Forgot/reset password with hashed OTP, expiry, rate limit | `password_resets`, `authController`, `emailService` | integration/security tests |
| Book CRUD/search/upload image | `bookController`, `bookRoutes`, `uploadMiddleware` | API tests |
| Borrow request/approve/reject/issue/return/extension | `borrowController`, `borrowRoutes`, transaction tables | integration tests |
| Library inventory/reservations/issues/reports | `libraryController`, `inventoryService`, invariant `total=available+reserved+issued` | property/integration tests |
| Vendor listings/orders/stock | `vendorController` | API flow |
| Notifications + reminders | `notificationService`, `reminderService`, cron | service tests/manual |
| Admin management/audit logs | `adminController`, `audit_logs` | integration tests |
| Security: bcrypt hash, JWT, RBAC, validation, rate limit, CORS, headers, CSRF, origin, upload whitelist, body limit | `securityMiddleware`, auth/role/validation middleware, server config | security tests |
| Structured JSON logging with file sink | `services/logger.js`, request logger, event subscriber | log output/tests |
| API reference | `docs/API.md` | doc review |
| CI on push/PR | `.github/workflows/ci.yml` | workflow run |
| Original algorithm + cross-language parity | `services/trustScoreService.js`, `scripts/trust_score.py`, `scripts/parity_check.js` | parity/unit tests |

## 4. Novel Algorithm: MRV TrustScore (MTS v1)
### 4.1 Purpose
Deterministic, explainable trust/risk score for book listings/owners to help users and admins prioritize reliable exchanges.

### 4.2 Inputs
`ownerAccountAgeDays, completedTransactions, overdueTransactions, ownerListingCount, condition, hasImage, hasIsbn, descriptionLength, listingAgeDays`.

### 4.3 Components (all clamped to [0,1])
- `R_rep = 1 - overdueRate`, `overdueRate = overdue/(completed+overdue)` or 0.
- `R_comp`: metadata completeness score (image, ISBN, description length, known condition, listing age present), normalized.
- `R_tx = 1 - exp(-K_TX * completed)`, `K_TX=0.35`.
- `R_fresh = exp(-LAMBDA_FRESH * listingAgeDays/365)`, `LAMBDA_FRESH=0.7`.

### 4.4 Aggregate
`Trust = clamp01(0.35*R_rep + 0.25*R_comp + 0.25*R_tx + 0.15*R_fresh)`
`Risk = clamp01(1-Trust)`

### 4.5 Fingerprint
Non-reversible FNV-1a 64-bit hex fingerprint over canonical derived features: `v1|ownerAge|tx|overdue|listings|cond|img|isbn`. No raw secrets/passwords/tokens.

### 4.6 Explainability
Returns component scores, weights, bounded scores, and plain-language explanation.

### 4.7 Parity
JS reference: `backend/services/trustScoreService.js`. Python parity: `scripts/trust_score.py`. Automated check: `scripts/parity_check.js` compares scores/components/fingerprint across vectors in CI.

## 5. Security & Robustness
- Passwords hashed with bcryptjs; no plain-text storage.
- JWT auth; RBAC enforced server-side.
- Input validation and defensive wrappers.
- Rate limiting on auth/reset endpoints.
- CORS allowlist and origin checks.
- CSRF double-submit for browser unsafe requests.
- Security headers + strict CSP.
- Upload MIME/extension/size checks, safe names.
- Request body size limit 100kb.
- Centralized error handling, no stack traces in production.
- Audit logs for important actions.
- Atomic JSON writes and corrupt-file backup recovery utility.

## 6. Testing Strategy
- Unit tests: TrustScore, command bus, storage strategies.
- Property/invariant tests: inventory invariant across rows; role/status invariants.
- Integration/API tests: auth, RBAC, CSRF/security headers, core flows.
- Parity test: JS/Python TrustScore vectors.
- Build checks: frontend Vite build, backend syntax check.
- CI runs compile + tests + parity + build on push/PR.

## 7. Known External Dependencies
- SMTP for real email delivery (simulated in dev).
- Official college student verification system (optional/seeded policy supported).
- Real payment gateway for vendor sales (simulated checkout implemented).
