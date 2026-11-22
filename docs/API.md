# MRV BookHub API Reference

Base URL: `http://localhost:5000/api` (configurable via `PORT`). All responses are JSON: `{ success, message?, data?, errors?, requestId? }`.

## Authentication & Security
- **Auth**: JWT Bearer token (`Authorization: Bearer <token>`), issued by login endpoints.
- **CSRF**: Double-submit pattern. Server sets readable `csrf_token` cookie; unsafe methods from browser contexts must echo `X-CSRF-Token` header with same value. Bearer-token API clients may omit CSRF cookie.
- **Origin checks**: unsafe requests validate `Origin` against configured allowlist.
- **Rate limiting**: login and password reset endpoints are rate-limited.
- **Headers**: CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy.
- **Body limit**: 100kb JSON/urlencoded.
- **Static uploads**: `/uploads` serves only whitelisted image extensions; dotfiles denied.

## Error Codes
- 200 OK, 201 Created
- 400 Bad Request / validation
- 401 Unauthorized (missing/invalid token)
- 403 Forbidden (CSRF/origin/role/suspended)
- 404 Not Found
- 409 Conflict (duplicate/invalid state)
- 422 Validation error (`errors` array)
- 429 Rate limited
- 500 Internal Server Error (sanitized in production)

## Endpoints

### Health/System
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Service health, env, timestamp |
| GET | `/system/commands` | Admin | List registered Command pattern handlers |
| POST | `/system/commands/:name` | Admin | Execute command (`user.approve`, `inventory.adjust`, `export.data`) |
| GET | `/system/export?format=json|csv|sqlite` | Admin | Export data via Storage Strategy |
| GET | `/system/trust-score/listing/:id` | Auth | Compute MRV TrustScore for listing |

### Auth (`/auth`)
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/register/student` | full_name, hall_ticket_number, email, mobile_number, department_id, academic_year, password, confirm_password | Student registration; pending/active based on verification policy |
| POST | `/login/student` | hall_ticket_number, password | Returns JWT + profile |
| POST | `/login/faculty` | faculty_id, password |  |
| POST | `/login/librarian` | librarian_id, password |  |
| POST | `/login/vendor` | email, password |  |
| POST | `/login/admin` | email, password |  |
| POST | `/forgot-password` | email or mobile_number | Generates hashed OTP, expiry/rate limit; dev may return simulated code |
| POST | `/verify-reset-code` | email/mobile_number, code | Verifies OTP |
| POST | `/reset-password` | email/mobile_number, code, new_password, confirm_password | Resets password, invalidates codes |
| GET | `/me` | - | Current user profile |

### Users (`/users`)
| GET | `/profile` | Auth | Own profile |
| GET | `/departments` | No/Auth | Departments list |
| GET | `/:id` | Auth | Own or admin |

### Books (`/books`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Optional | List listings, pagination/filter |
| GET | `/search` | Optional | Search title/author/course/department/category/condition/availability/listing_type |
| GET | `/:id` | Optional | Listing detail |
| POST | `/` | Student/Faculty/Vendor/Admin | Create listing (multipart, image) |
| PUT | `/:id` | Owner/Admin | Update listing |
| DELETE | `/:id` | Owner/Admin | Deactivate listing (blocked if active tx) |

### Borrow (`/borrow`)
| POST | `/request` | Auth | Create borrow request (validates ownership, availability, max days, duplicates) |
| GET | `/my-requests` | Auth | Borrower requests |
| GET | `/received-requests` | Auth | Owner received requests |
| PATCH | `/:id/approve` | Owner/Admin | Approve, reserve listing |
| PATCH | `/:id/reject` | Owner/Admin | Reject |
| PATCH | `/:id/cancel` | Borrower/Admin | Cancel pending |
| POST | `/:id/issue` | Owner/Admin | Record physical handover, create tx, due date |
| PATCH | `/:id/return` | Owner/Admin | Return, release listing |
| POST | `/:id/extension-request` | Borrower | Request extension |
| PATCH | `/:id/extension-approve|reject` | Owner/Admin | Decide extension |

### Library (`/library`)
| POST | `/inventory` | Librarian/Admin | Add inventory |
| PUT | `/inventory/:id` | Librarian/Admin | Update stock/location; prevents total < reserved+issued |
| GET | `/books` | Public | Search library books |
| POST | `/reservations` | Student | Reserve copy (transaction, unique active reservation) |
| GET | `/my-reservations` | Student | Own reservations |
| GET | `/reservations` | Librarian/Admin | All reservations |
| PATCH | `/reservations/:id/approve|cancel` | Librarian/Admin or owner cancel | Status updates with inventory restore |
| POST | `/issues` | Librarian/Admin | Issue at counter, verify identity/reservation |
| GET | `/issues` | Librarian/Admin | List issues |
| PATCH | `/issues/:id/return` | Librarian/Admin | Return and restore inventory |
| GET | `/reports` | Librarian/Admin | Totals, overdue, most reserved, department usage |

### Vendor (`/vendor`)
| GET/POST | `/listings` | Public GET, Vendor POST | Sale listings |
| GET | `/orders` | Auth | Role-scoped orders |
| POST | `/orders` | Student | Simulated checkout, stock check, backend total |
| PATCH | `/orders/:id/status` | Vendor/Admin | Update order status |

### Notifications (`/notifications`)
| GET | `/` | Auth | List own notifications |
| PATCH | `/:id/read` | Auth | Mark read |
| PATCH | `/read-all` | Auth | Mark all read |
| DELETE | `/:id` | Auth | Delete |

### Admin (`/admin`)
| GET | `/users` | Admin | List/filter users |
| PATCH | `/users/:id/approve|suspend|reject` | Admin | Account moderation |
| GET | `/books` | Admin | All listings |
| DELETE | `/books/:id` | Admin | Remove/deactivate listing |
| GET | `/reports` | Admin | System stats |
| GET | `/audit-logs` | Admin | Audit log |
| GET/POST/DELETE | `/departments` | Admin | Department management |

## Request/Response Example
```http
POST /api/auth/login/student
Content-Type: application/json
X-CSRF-Token: <csrf_cookie>

{"hall_ticket_number":"22CSE001","password":"Password@123"}
```
```json
{"success":true,"message":"Login successful","data":{"token":"<jwt>","user":{"id":2,"role":"student","account_status":"active"}}}
```
