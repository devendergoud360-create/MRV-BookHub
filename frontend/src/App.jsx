import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import Scene from './Scene'
import { getHealth } from './api'
import './App.css'

function CameraRig({ scrollRef }) {
  useFrame((state) => {
    const el = scrollRef.current
    if (!el) return
    const max = Math.max(1, el.scrollHeight - el.clientHeight)
    const p = el.scrollTop / max // 0..1
    const targetY = 1.2 - p * 16
    const targetZ = 7 - p * 1.5
    state.camera.position.y += (targetY - state.camera.position.y) * 0.08
    state.camera.position.z += (targetZ - state.camera.position.z) * 0.08
    state.camera.position.x += (Math.sin(p * Math.PI * 2) * 0.4 - state.camera.position.x) * 0.05
    state.camera.lookAt(0, targetY - 0.5, -2)
  })
  return null
}

function Section({ title, kicker, children, align = 'left' }) {
  return (
    <section className={`panel ${align}`}>
      {kicker && <div className="kicker">{kicker}</div>}
      <h2>{title}</h2>
      <div className="panel-body">{children}</div>
    </section>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export default function App() {
  const scrollRef = useRef(null)
  const [apiStatus, setApiStatus] = useState({ ok: null, message: 'Checking API...' })

  useEffect(() => {
    getHealth().then((d) => {
      if (d && d.success) setApiStatus({ ok: true, message: 'Backend connected' })
      else setApiStatus({ ok: false, message: d?.message || 'Backend not reachable (start backend on port 5000)' })
    })
  }, [])

  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

  return (
    <div className="app">
      <div className="canvas-wrap">
        <Canvas camera={{ position: [0, 1.2, 7], fov: 50 }} dpr={[1, 1.75]}>
          <Suspense fallback={null}>
            <Scene />
            <CameraRig scrollRef={scrollRef} />
          </Suspense>
        </Canvas>
      </div>

      <div className="scroll-container" ref={scrollRef}>
        <header className="hero panel center">
          <div className={`badge ${apiStatus.ok ? 'ok' : apiStatus.ok === false ? 'bad' : ''}`}>{apiStatus.message}</div>
          <h1>MRV BookHub</h1>
          <p className="lead">A complete college book exchange & digital library platform — explore in 3D, scroll to discover every module.</p>
          <div className="hint">Scroll ↓</div>
        </header>

        <Section kicker="Roles & Access" title="Built for the whole campus">
          <div className="grid">
            <div className="card"><h3>Students</h3><p>Register with hall ticket, upload books, borrow from peers, reserve library copies, track due dates and orders.</p></div>
            <div className="card"><h3>Faculty</h3><p>Share academic resources, set borrowing durations, approve requests and manage personal lending history.</p></div>
            <div className="card"><h3>Librarian</h3><p>Manage inventory, reservations, counter issue/returns, overdue tracking and library reports.</p></div>
            <div className="card"><h3>Vendor & Admin</h3><p>Approved vendors sell with stock control; admins verify accounts, moderate listings and view system-wide reports.</p></div>
          </div>
        </Section>

        <Section kicker="Peer-to-Peer" title="Borrowing that just works" align="right">
          <ul className="bullets">
            <li>Search by title, author, course code, department, category & condition</li>
            <li>Request with desired days (capped by owner's max) and owner approval flow</li>
            <li>Physical handover tracking, due dates, returns and extension requests</li>
            <li>Full history with notifications for requests, approvals and reminders</li>
          </ul>
        </Section>

        <Section kicker="Digital Library" title="Reserve. Collect. Return.">
          <div className="grid two">
            <div className="card">
              <h3>Smart Inventory</h3>
              <p>Per-book total/available/reserved/issued copies with shelf & rack location. Invariant enforced: <strong>Total = Available + Reserved + Issued</strong> via transactional updates.</p>
            </div>
            <div className="card">
              <h3>Reservation Flow</h3>
              <p>Students reserve available copies (unique reservation code + expiry), librarians verify identity at counter, issue with due dates and record returns with automatic availability restore.</p>
            </div>
          </div>
        </Section>

        <Section kicker="Marketplace & Alerts" title="Vendors and notifications" align="right">
          <div className="grid two">
            <div className="card"><h3>Vendor Sales</h3><p>Approved vendors publish priced listings, students place simulated orders with backend stock checks, totals and order status tracking.</p></div>
            <div className="card"><h3>Reminders</h3><p>In-app + email notifications for borrow/library events, scheduled due-soon and overdue alerts with de-duplication and configurable reminder policy.</p></div>
          </div>
        </Section>

        <Section kicker="Platform Stats" title="Seeded and ready to test">
          <div className="stats">
            <Stat value="5" label="User Roles" />
            <Stat value="30+" label="Sample Books" />
            <Stat value="18" label="API Route Groups" />
            <Stat value="100%" label="Role-Protected Flows" />
          </div>
        </Section>

        <Section kicker="Get Started" title="Connect frontend to backend" align="center">
          <div className="card wide">
            <p><strong>API Base:</strong> <code>{base}</code></p>
            <p className="muted">Start backend: <code>cd backend &amp;&amp; npm install &amp;&amp; npm run seed &amp;&amp; npm start</code></p>
            <p className="muted">Dev test password for seeded accounts: <code>Password@123</code> (admin: admin@mrv.edu, student login by hall ticket e.g. 22CSE001, librarian LIB001, faculty FAC001, vendor campusbooks@mrv.edu).</p>
            <p className="muted small">Admin accounts are not publicly registerable. OTP delivery is simulated in dev when SMTP is not configured. Vendor checkout is simulated.</p>
          </div>
        </Section>

        <footer className="footer panel center">
          <p>MRV BookHub — modular, secure backend (Node/Express/SQLite) + 3D scrollable React frontend.</p>
        </footer>
      </div>
    </div>
  )
}
