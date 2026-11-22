# Requirements Traceability Matrix (MRV BookHub)

| Req ID | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| R1 | Roles: Student/Faculty/Librarian/Vendor/Admin | `schema.sql`, `authController`, role middleware/routes | seed data, `tests/integration/api.test.js`, RBAC checks | Pass |
| R2 | Student register/login by hall ticket | `authController.registerStudent/loginStudent` | integration API tests, seeded accounts | Pass |
| R3 | Book CRUD, upload, search/filter/pagination | `bookController`, `bookRoutes`, multer upload | API checks/manual, seed listings | Pass |
| R4 | Peer borrowing: request/approve/reject/issue/return/cancel/extension | `borrowController`, borrow tables/routes | seeded borrow flow, API logic | Pass |
| R5 | Library inventory, reservations, issue/return, reports; invariant `total=available+reserved+issued` | `libraryController`, `inventoryService`, schema CHECK | `tests/property/*`, dataset invariants | Pass |
| R6 | Vendor listings/orders/stock/simulated checkout | `vendorController`, orders table | seed vendor data, API routes | Pass |
| R7 | Notifications and due reminders | `notificationService`, `reminderService`, cron | notification table seed, service implementation | Pass |
| R8 | Admin management, audit logs, reports | `adminController`, `auditService`, admin routes | integration RBAC tests, admin endpoints | Pass |
| R9 | Security: bcrypt, JWT, RBAC, validation, rate limit, CORS/origin, CSRF, CSP/headers, upload whitelist, body limit | auth/security middleware, server config | `tests/integration/security.test.js` | Pass |
| R10 | Structured JSON logging with file sink | `services/logger.js`, request logger, event subscriber | code + CI/runtime logs | Pass |
| R11 | Architecture patterns: Strategy/Command/Observer, layered design | storageStrategy/commandBus/eventBus/SRS | unit tests + SRS mapping | Pass |
| R12 | Original algorithm, deterministic, bounded [0,1], explainable, JS+Python parity | `trustScoreService.js`, `scripts/trust_score.py`, parity script | `tests/unit/trustScore.test.js`, `node scripts/parity_check.js` | Pass |
| R13 | API reference + SRS + README + CI + deliverables | `docs/*`, README, `.github/workflows/ci.yml`, deliverables | file presence, CI config | Pass |
| R14 | Browser E2E zero-console smoke | Playwright `tests/e2e/smoke.spec.js` | Playwright run: 2 passed | Pass (smoke) |
| R15 | Deployment readiness/live URL HTTP 200 | Vercel config/docs, local single-origin build served | local health/200 checks | **External blocker** for public live URL from this environment |
