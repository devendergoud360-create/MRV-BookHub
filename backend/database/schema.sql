PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_name TEXT NOT NULL UNIQUE,
  department_code TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  mobile_number TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','faculty','librarian','vendor','admin')),
  account_status TEXT NOT NULL DEFAULT 'pending' CHECK (account_status IN ('pending','active','suspended','rejected')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  mobile_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  hall_ticket_number TEXT NOT NULL UNIQUE,
  department_id INTEGER REFERENCES departments(id),
  academic_year TEXT,
  semester TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faculty (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  faculty_id TEXT NOT NULL UNIQUE,
  department_id INTEGER REFERENCES departments(id),
  designation TEXT
);

CREATE TABLE IF NOT EXISTS librarians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  librarian_id TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  business_name TEXT,
  contact_number TEXT,
  business_address TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected','suspended'))
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  edition TEXT,
  isbn TEXT,
  course_code TEXT,
  department_id INTEGER REFERENCES departments(id),
  category TEXT,
  description TEXT,
  image_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS book_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('student','faculty','vendor','admin')),
  listing_type TEXT NOT NULL CHECK (listing_type IN ('borrow','sell','both')),
  book_condition TEXT,
  max_borrow_days INTEGER,
  price REAL,
  stock_quantity INTEGER,
  available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS borrow_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES book_listings(id) ON DELETE CASCADE,
  borrower_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_days INTEGER NOT NULL,
  request_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled','returned')),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  rejected_at TEXT
);

CREATE TABLE IF NOT EXISTS borrow_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  borrow_request_id INTEGER NOT NULL UNIQUE REFERENCES borrow_requests(id) ON DELETE CASCADE,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  original_due_date TEXT,
  return_date TEXT,
  transaction_status TEXT NOT NULL DEFAULT 'active' CHECK (transaction_status IN ('active','returned','overdue')),
  extension_days INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS borrow_extension_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  borrow_transaction_id INTEGER NOT NULL REFERENCES borrow_transactions(id) ON DELETE CASCADE,
  requested_days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS library_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  total_copies INTEGER NOT NULL CHECK (total_copies >= 0),
  available_copies INTEGER NOT NULL CHECK (available_copies >= 0),
  reserved_copies INTEGER NOT NULL DEFAULT 0 CHECK (reserved_copies >= 0),
  issued_copies INTEGER NOT NULL DEFAULT 0 CHECK (issued_copies >= 0),
  shelf_number TEXT,
  rack_number TEXT,
  max_issue_days INTEGER NOT NULL DEFAULT 14,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (total_copies = available_copies + reserved_copies + issued_copies)
);

CREATE TABLE IF NOT EXISTS library_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_code TEXT NOT NULL UNIQUE,
  student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inventory_id INTEGER NOT NULL REFERENCES library_inventory(id) ON DELETE CASCADE,
  reservation_status TEXT NOT NULL DEFAULT 'pending' CHECK (reservation_status IN ('pending','confirmed','collected','cancelled','expired','rejected')),
  reservation_date TEXT NOT NULL DEFAULT (datetime('now')),
  expiry_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS library_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER UNIQUE REFERENCES library_reservations(id),
  inventory_id INTEGER NOT NULL REFERENCES library_inventory(id) ON DELETE CASCADE,
  student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_by_librarian_id INTEGER NOT NULL REFERENCES users(id),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  return_date TEXT,
  issue_status TEXT NOT NULL DEFAULT 'issued' CHECK (issue_status IN ('issued','returned','overdue'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'borrow_request','borrow_approved','borrow_rejected','return_reminder','overdue',
    'library_reserved','library_issued','library_returned','reservation_expired','system_alert',
    'order_update'
  )),
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES book_listings(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  total_amount REAL NOT NULL CHECK (total_amount >= 0),
  order_status TEXT NOT NULL DEFAULT 'placed' CHECK (order_status IN ('placed','confirmed','shipped','delivered','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verification_code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  used_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminder_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  reminder_type TEXT NOT NULL,
  reminder_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(entity_type, entity_id, reminder_type, reminder_date)
);

CREATE TABLE IF NOT EXISTS authorized_students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hall_ticket_number TEXT NOT NULL UNIQUE,
  full_name TEXT,
  department_code TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status);
CREATE INDEX IF NOT EXISTS idx_students_user ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_hall ON students(hall_ticket_number);
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
CREATE INDEX IF NOT EXISTS idx_books_course ON books(course_code);
CREATE INDEX IF NOT EXISTS idx_listings_owner ON book_listings(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_listings_book ON book_listings(book_id);
CREATE INDEX IF NOT EXISTS idx_listings_type ON book_listings(listing_type);
CREATE INDEX IF NOT EXISTS idx_borrow_req_listing ON borrow_requests(listing_id);
CREATE INDEX IF NOT EXISTS idx_borrow_req_borrower ON borrow_requests(borrower_user_id);
CREATE INDEX IF NOT EXISTS idx_borrow_req_status ON borrow_requests(status);
CREATE INDEX IF NOT EXISTS idx_lib_inv_book ON library_inventory(book_id);
CREATE INDEX IF NOT EXISTS idx_lib_res_student ON library_reservations(student_user_id);
CREATE INDEX IF NOT EXISTS idx_lib_res_inv ON library_reservations(inventory_id);
CREATE INDEX IF NOT EXISTS idx_lib_res_status ON library_reservations(reservation_status);
CREATE INDEX IF NOT EXISTS idx_lib_issues_student ON library_issues(student_user_id);
CREATE INDEX IF NOT EXISTS idx_lib_issues_status ON library_issues(issue_status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_student ON orders(student_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_vendor ON orders(vendor_user_id);
