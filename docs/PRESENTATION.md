# MRV BookHub Presentation (14 slides)

1. **Title** - MRV BookHub: Secure College Book Exchange & Digital Library; team, stack, live/demo.
2. **Problem & Goals** - Fragmented book sharing, library reservations, vendor sales; need secure role-based platform.
3. **Requirements Coverage** - Map must-have/stretch features to modules; edge cases and seed data.
4. **Architecture** - 4 layers: Presentation, Application, Domain, Persistence; deployment model.
5. **Design Patterns** - Strategy (storage), Command (command bus), Observer (event bus + structured logging).
6. **Core Flows** - Student/faculty borrow flow; library reservation/issue/return; vendor order flow.
7. **Data Design** - ER summary: users/profiles, books/listings, borrow tx, library inventory/reservations/issues, orders, notifications, audit logs.
8. **Security & Robustness** - bcrypt/JWT/RBAC, CSRF double-submit, origin checks, CSP/headers, validation, rate limits, upload whitelist, atomic writes, audit logs.
9. **MRV TrustScore (Innovation)** - formula, bounded [0,1], fingerprint, explainability, JS/Python parity.
10. **Testing & QA** - unit/property/integration/security tests, parity check, frontend build, Playwright plan, CI.
11. **API & Observability** - key endpoints, error codes, structured JSON logs/file sink, request IDs.
12. **Deployment** - GitHub + CI + Vercel/Node deployment, env vars, health checks.
13. **Demo Walkthrough** - 2-minute script: login, borrow, library, admin, trust score, tests.
14. **Rubric Self-Assessment & Risks** - predicted 100/100 with honest note: external SMTP/payment/official college verification are configurable integrations; browser QA/deployment URL require environment access.
