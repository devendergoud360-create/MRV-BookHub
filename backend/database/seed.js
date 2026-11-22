const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { db, initializeDatabase } = require('../config/database');

async function seed() {
  initializeDatabase();

  const existing = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (existing > 0) {
    console.log('Database already has data. Skipping seed. (Delete the DB file to reseed)');
    process.exit(0);
  }

  const hash = await bcrypt.hash('Password@123', 10);

  const departments = [
    ['Computer Science and Engineering', 'CSE'],
    ['CSE Artificial Intelligence & ML', 'CSE-AIML'],
    ['Electronics and Communication Engineering', 'ECE'],
    ['Electrical and Electronics Engineering', 'EEE'],
    ['Mechanical Engineering', 'MECH'],
    ['Civil Engineering', 'CIVIL'],
    ['Information Technology', 'IT'],
  ];
  const deptStmt = db.prepare('INSERT INTO departments (department_name, department_code) VALUES (?,?)');
  const deptIds = {};
  for (const [name, code] of departments) {
    const info = deptStmt.run(name, code);
    deptIds[code] = info.lastInsertRowid;
  }

  const insertUser = db.prepare(`INSERT INTO users (full_name,email,mobile_number,password_hash,role,account_status,email_verified,mobile_verified) VALUES (?,?,?,?,?,?,1,1)`);
  const insertStudent = db.prepare(`INSERT INTO students (user_id,hall_ticket_number,department_id,academic_year,semester) VALUES (?,?,?,?,?)`);
  const insertFaculty = db.prepare(`INSERT INTO faculty (user_id,faculty_id,department_id,designation) VALUES (?,?,?,?)`);
  const insertLibrarian = db.prepare(`INSERT INTO librarians (user_id,librarian_id) VALUES (?,?)`);
  const insertVendor = db.prepare(`INSERT INTO vendors (user_id,vendor_name,business_name,contact_number,business_address,approval_status) VALUES (?,?,?,?,?,?)`);

  // Admin
  const adminId = insertUser.run('System Admin', 'admin@mrv.edu', '9000000000', hash, 'admin', 'active').lastInsertRowid;

  // Students (10)
  const students = [
    ['Aarav Sharma', '22CSE001', 'aarav@student.mrv.edu', '9000000001', 'CSE', '2022-26', '6'],
    ['Diya Patel', '22CSE002', 'diya@student.mrv.edu', '9000000002', 'CSE', '2022-26', '6'],
    ['Rohan Kumar', '22AIML001', 'rohan@student.mrv.edu', '9000000003', 'CSE-AIML', '2022-26', '6'],
    ['Sneha Reddy', '22ECE001', 'sneha@student.mrv.edu', '9000000004', 'ECE', '2022-26', '6'],
    ['Vikram Singh', '22EEE001', 'vikram@student.mrv.edu', '9000000005', 'EEE', '2022-26', '6'],
    ['Ananya Iyer', '22IT001', 'ananya@student.mrv.edu', '9000000006', 'IT', '2022-26', '6'],
    ['Karthik Nair', '22MECH001', 'karthik@student.mrv.edu', '9000000007', 'MECH', '2022-26', '6'],
    ['Priya Das', '22CIVIL001', 'priya@student.mrv.edu', '9000000008', 'CIVIL', '2022-26', '6'],
    ['Mohit Verma', '23CSE001', 'mohit@student.mrv.edu', '9000000009', 'CSE', '2023-27', '4'],
    ['Isha Gupta', '23AIML001', 'isha@student.mrv.edu', '9000000010', 'CSE-AIML', '2023-27', '4'],
  ];
  const studentUserIds = [];
  for (const s of students) {
    const uid = insertUser.run(s[0], s[2], s[3], hash, 'student', 'active').lastInsertRowid;
    insertStudent.run(uid, s[1], deptIds[s[4]], s[5], s[6]);
    studentUserIds.push(uid);
  }

  // Faculty (3)
  const faculty = [
    ['Dr. Meera Rao', 'FAC001', 'meera.rao@mrv.edu', '9100000001', 'CSE', 'Professor'],
    ['Prof. Suresh Babu', 'FAC002', 'suresh.babu@mrv.edu', '9100000002', 'ECE', 'Associate Professor'],
    ['Dr. Kavita Joshi', 'FAC003', 'kavita.joshi@mrv.edu', '9100000003', 'CSE-AIML', 'Assistant Professor'],
  ];
  const facultyUserIds = [];
  for (const f of faculty) {
    const uid = insertUser.run(f[0], f[2], f[3], hash, 'faculty', 'active').lastInsertRowid;
    insertFaculty.run(uid, f[1], deptIds[f[4]], f[5]);
    facultyUserIds.push(uid);
  }

  // Librarians (2)
  const librarians = [
    ['Ramesh Librarian', 'LIB001', 'librarian1@mrv.edu', '9200000001'],
    ['Sunita Librarian', 'LIB002', 'librarian2@mrv.edu', '9200000002'],
  ];
  const librarianUserIds = [];
  for (const l of librarians) {
    const uid = insertUser.run(l[0], l[2], l[3], hash, 'librarian', 'active').lastInsertRowid;
    insertLibrarian.run(uid, l[1]);
    librarianUserIds.push(uid);
  }

  // Vendors (2)
  const vendors = [
    ['Campus Books Store', 'Campus Books Pvt Ltd', 'campusbooks@mrv.edu', '9300000001', 'Near Main Gate, MRV Campus', 'approved'],
    ['TechReads Vendor', 'TechReads Solutions', 'techreads@mrv.edu', '9300000002', 'Block B, City Center', 'approved'],
  ];
  const vendorUserIds = [];
  for (const v of vendors) {
    const uid = insertUser.run(v[0], v[2], v[3], hash, 'vendor', 'active').lastInsertRowid;
    insertVendor.run(uid, v[0], v[1], v[3], v[4], v[5]);
    vendorUserIds.push(uid);
  }

  // Authorized students list (for demo auto-activation)
  const authStmt = db.prepare('INSERT OR IGNORE INTO authorized_students (hall_ticket_number, full_name, department_code, active) VALUES (?,?,?,1)');
  authStmt.run('22CSE001', 'Aarav Sharma', 'CSE');
  authStmt.run('22CSE002', 'Diya Patel', 'CSE');

  // Books (30) and listings
  const insertBook = db.prepare(`INSERT INTO books (title,author,edition,isbn,course_code,department_id,category,description) VALUES (?,?,?,?,?,?,?,?)`);
  const insertListing = db.prepare(`INSERT INTO book_listings (book_id,owner_user_id,owner_type,listing_type,book_condition,max_borrow_days,price,stock_quantity,available) VALUES (?,?,?,?,?,?,?,?,?)`);
  const insertInventory = db.prepare(`INSERT INTO library_inventory (book_id,total_copies,available_copies,reserved_copies,issued_copies,shelf_number,rack_number,max_issue_days) VALUES (?,?,?,0,0,?,?,?)`);

  const booksData = [
    ['Introduction to Algorithms', 'Cormen et al.', '3rd', '9780262033848', 'CSE301', 'CSE', 'Algorithms', 'Comprehensive algorithms textbook'],
    ['Operating System Concepts', 'Silberschatz', '10th', '9781119456339', 'CSE302', 'CSE', 'Operating Systems', 'Classic OS concepts'],
    ['Database System Concepts', 'Silberschatz', '7th', '9780078022159', 'CSE303', 'CSE', 'Databases', 'Database fundamentals'],
    ['Computer Networks', 'Tanenbaum', '5th', '9780132126953', 'CSE304', 'CSE', 'Networks', 'Networking principles'],
    ['Clean Code', 'Robert C. Martin', '1st', '9780132350884', 'CSE305', 'CSE', 'Software Engineering', 'Writing maintainable code'],
    ['Artificial Intelligence: A Modern Approach', 'Russell & Norvig', '4th', '9780134610993', 'AIML301', 'CSE-AIML', 'AI', 'AI foundations'],
    ['Deep Learning', 'Goodfellow et al.', '1st', '9780262035613', 'AIML302', 'CSE-AIML', 'Machine Learning', 'Deep learning textbook'],
    ['Pattern Recognition and Machine Learning', 'Bishop', '1st', '9780387310732', 'AIML303', 'CSE-AIML', 'Machine Learning', 'PRML classic'],
    ['Hands-On Machine Learning', 'Aurélien Géron', '3rd', '9781098125974', 'AIML304', 'CSE-AIML', 'Machine Learning', 'Practical ML with scikit-learn'],
    ['Python Programming', 'John Zelle', '3rd', '9781590282755', 'CSE201', 'CSE', 'Programming', 'Intro to Python'],
    ['Digital Design', 'Morris Mano', '6th', '9780134549897', 'ECE301', 'ECE', 'Digital Electronics', 'Digital logic design'],
    ['Signals and Systems', 'Oppenheim', '2nd', '9780138147570', 'ECE302', 'ECE', 'Signals', 'Signals and systems theory'],
    ['Communication Systems', 'Simon Haykin', '5th', '9780471697909', 'ECE303', 'ECE', 'Communications', 'Analog and digital comms'],
    ['Microelectronic Circuits', 'Sedra & Smith', '7th', '9780199339136', 'ECE304', 'ECE', 'Circuits', 'Microelectronics'],
    ['Electric Machinery', 'Fitzgerald', '7th', '9780073380469', 'EEE301', 'EEE', 'Machines', 'Electrical machines'],
    ['Power Systems Analysis', 'Stevenson', '4th', '9780070612938', 'EEE302', 'EEE', 'Power Systems', 'Power system fundamentals'],
    ['Control Systems Engineering', 'Norman Nise', '7th', '9781118800829', 'EEE303', 'EEE', 'Control Systems', 'Control engineering'],
    ['Engineering Mechanics', 'Hibbeler', '14th', '9780133918922', 'MECH201', 'MECH', 'Mechanics', 'Statics and dynamics'],
    ['Thermodynamics', 'Cengel', '9th', '9781259822674', 'MECH301', 'MECH', 'Thermodynamics', 'Engineering thermodynamics'],
    ['Fluid Mechanics', 'White', '8th', '9780073398273', 'MECH302', 'MECH', 'Fluids', 'Fluid mechanics fundamentals'],
    ['Structural Analysis', 'Hibbeler', '10th', '9780134610672', 'CIVIL301', 'CIVIL', 'Structures', 'Structural analysis'],
    ['Surveying', 'Bannister', '7th', '9780273723476', 'CIVIL302', 'CIVIL', 'Surveying', 'Surveying principles'],
    ['Data Structures and Algorithms in Java', 'Goodrich', '6th', '9781118771334', 'IT301', 'IT', 'Data Structures', 'DSA in Java'],
    ['Web Technologies', 'Uttam Roy', '1st', '9780198066224', 'IT302', 'IT', 'Web', 'Web development basics'],
    ['Software Engineering', 'Pressman', '8th', '9780078022128', 'CSE306', 'CSE', 'Software Engineering', 'SE principles'],
    ['Compiler Design', 'Aho et al.', '2nd', '9780321486813', 'CSE307', 'CSE', 'Compilers', 'Dragon book'],
    ['Computer Organization', 'Patterson & Hennessy', '6th', '9780128201091', 'CSE308', 'CSE', 'Architecture', 'Computer organization'],
    ['Discrete Mathematics', 'Kenneth Rosen', '8th', '9781259676512', 'CSE201B', 'CSE', 'Mathematics', 'Discrete math'],
    ['Linear Algebra and Its Applications', 'Gilbert Strang', '5th', '9780980232776', 'MAT301', 'CSE-AIML', 'Mathematics', 'Linear algebra'],
    ['Probability and Statistics', 'DeGroot', '4th', '9780321500465', 'MAT302', 'CSE', 'Mathematics', 'Probability theory'],
  ];

  const bookIds = [];
  for (const b of booksData) {
    const bid = insertBook.run(b[0], b[1], b[2], b[3], b[4], deptIds[b[5]], b[6], b[7]).lastInsertRowid;
    bookIds.push({ id: bid, title: b[0], dept: b[5] });
  }

  // Student/faculty borrow listings (10)
  const listingIds = [];
  for (let i = 0; i < 6; i++) {
    const owner = studentUserIds[i % studentUserIds.length];
    const lid = insertListing.run(bookIds[i].id, owner, 'student', 'borrow', 'Good', 14, null, null, 1).lastInsertRowid;
    listingIds.push(lid);
  }
  for (let i = 6; i < 10; i++) {
    const owner = facultyUserIds[i % facultyUserIds.length];
    const lid = insertListing.run(bookIds[i].id, owner, 'faculty', 'borrow', 'Like New', 21, null, null, 1).lastInsertRowid;
    listingIds.push(lid);
  }

  // Vendor sell listings (8)
  const vendorListingIds = [];
  for (let i = 10; i < 18; i++) {
    const owner = vendorUserIds[i % vendorUserIds.length];
    const price = 250 + i * 30;
    const lid = insertListing.run(bookIds[i].id, owner, 'vendor', 'sell', 'New', null, price, 10, 1).lastInsertRowid;
    vendorListingIds.push(lid);
  }

  // Library inventory (12 books)
  const inventoryIds = [];
  for (let i = 18; i < 30; i++) {
    const total = 3 + (i % 4);
    const invId = insertInventory.run(bookIds[i].id, total, total, `S-${i}`, `R-${(i % 5) + 1}`, 14).lastInsertRowid;
    inventoryIds.push(invId);
  }

  // Sample borrowing requests
  const insertBorrowReq = db.prepare(`INSERT INTO borrow_requests (listing_id, borrower_user_id, requested_days, request_message, status) VALUES (?,?,?,?,?)`);
  insertBorrowReq.run(listingIds[0], studentUserIds[5], 7, 'Need for exam prep', 'pending');
  insertBorrowReq.run(listingIds[1], studentUserIds[6], 10, 'Course reference', 'approved');
  insertBorrowReq.run(listingIds[2], studentUserIds[7], 5, 'Assignment help', 'pending');

  // Sample borrow transaction for approved request (id 2)
  const approvedReq = db.prepare('SELECT * FROM borrow_requests WHERE status = ? LIMIT 1').get('approved');
  if (approvedReq) {
    const issueDate = new Date();
    const dueDate = new Date(issueDate.getTime() + approvedReq.requested_days * 24 * 60 * 60 * 1000);
    db.prepare(`INSERT INTO borrow_transactions (borrow_request_id, issue_date, due_date, original_due_date, transaction_status) VALUES (?,?,?,?, 'active')`)
      .run(approvedReq.id, issueDate.toISOString(), dueDate.toISOString(), dueDate.toISOString());
    db.prepare('UPDATE book_listings SET available = 0 WHERE id = ?').run(approvedReq.listing_id);
  }

  // Sample notifications
  const insertNotif = db.prepare(`INSERT INTO notifications (user_id, title, message, notification_type) VALUES (?,?,?,?)`);
  insertNotif.run(studentUserIds[0], 'Welcome to MRV BookHub', 'Your account is active. Start exploring books!', 'system_alert');
  insertNotif.run(studentUserIds[5], 'Borrow request submitted', 'Your borrow request was submitted.', 'borrow_request');
  insertNotif.run(studentUserIds[6], 'Borrow request approved', 'Your borrow request was approved.', 'borrow_approved');

  console.log('Seed completed successfully.');
  console.log('--- Development test accounts (password for all: Password@123) ---');
  console.log('Admin:      admin@mrv.edu');
  console.log('Students:   22CSE001, 22CSE002, 22AIML001, 22ECE001, 22EEE001, 22IT001, 22MECH001, 22CIVIL001, 23CSE001, 23AIML001 (login with hall ticket)');
  console.log('Faculty:    FAC001, FAC002, FAC003');
  console.log('Librarians: LIB001, LIB002');
  console.log('Vendors:    campusbooks@mrv.edu, techreads@mrv.edu');
  console.log('NOTE: Development-only credentials. Do not use in production.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
