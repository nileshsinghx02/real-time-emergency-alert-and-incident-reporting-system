# 🚨 Real-Time Emergency Alert & Incident Response Platform

A full-stack real-time emergency incident response platform built as a **University Major Project**. Citizens report emergencies with photos and GPS; the control room verifies, transparently scores priority, dispatches the best-matched responder, and tracks the full incident lifecycle — with SLA deadlines, duplicate detection, hotspot analytics, and a complete audit trail.

![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-7.0+-47A248?logo=mongodb&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-4.x-010101?logo=socket.io)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900?logo=leaflet&logoColor=white)

---

## 📑 Table of Contents

1. [Features](#-features)
2. [Incident Lifecycle](#-incident-lifecycle)
3. [Tech Stack](#-tech-stack)
4. [Project Structure](#-project-structure)
5. [Prerequisites](#-prerequisites)
6. [Database Setup (Step-by-Step)](#-database-setup-step-by-step)
7. [Installation & Running](#-installation--running)
8. [Environment Variables](#-environment-variables)
9. [Data Model](#-data-model)
10. [API Reference](#-api-reference)
11. [WebSocket Events](#-websocket-events)
12. [Default Credentials](#-default-credentials)
13. [Architecture Overview](#-architecture-overview)
14. [Troubleshooting](#-troubleshooting)

---

## ✨ Features

### Citizens

| Feature | Description |
|---------|-------------|
| **Report Emergencies** | Type, severity, title, description, GPS pin on interactive map, up to 4 photos |
| **Duplicate Warning** | Server checks nearby recent reports of the same type and warns before submission |
| **Transparent Priority** | Every report gets a 0–100 priority score with a human-readable reason |
| **Live Timeline** | Every lifecycle action is timestamped and visible to the reporter |
| **Edit / Withdraw** | Edit or withdraw reports while still in early lifecycle stages |
| **Persistent Notifications** | Bell dropdown with unread badge; survives page reloads (stored in MongoDB) |
| **Feedback & Rating** | 1–5 star rating + comment after an incident is resolved |
| **Forgot Password** | Email reset link (dev mode shows the link directly) |

### Control Room (Admin)

| Feature | Description |
|---------|-------------|
| **8-Tab Control Room** | Overview, Reports, Analytics, Hotspots, Responders, Users, Audit Log, Profile |
| **Live Map** | Active incidents plotted by severity color, click to open the incident |
| **SLA Watchlist** | Incidents breaching verify/dispatch/resolve deadlines surface automatically |
| **Lifecycle Management** | Verify, Reject (with reason), Prioritize, Dispatch, Close — role-enforced transitions |
| **Priority Control** | Override the computed priority with a mandatory reason (audited) |
| **Responder Recommendations** | Scored top-5 list (specialization match, distance, availability, load, rating) |
| **Dispatch & Reassign** | Assign a responder; rejected assignments return to the queue |
| **Duplicate Linking** | Merge duplicate reports into a primary incident |
| **Analytics Dashboard** | KPIs, reports over time, category/severity/status/priority breakdowns, feedback distribution, responder performance |
| **Hotspot Detection** | Grid clustering of repeat-incident locations with intensity bars |
| **Team & User Management** | Create/deactivate responder accounts; enable/disable citizens |
| **Audit Trail** | Every admin action is logged with actor, action, target, and description |

### Responders

| Feature | Description |
|---------|-------------|
| **Duty Status** | Available / Assigned / Responding / Offline toggle broadcast to the control room |
| **Assignment Cards** | Urgent styling for CRITICAL incidents, navigate button, reporter phone |
| **Accept / Reject** | Reject with mandatory reason returns the incident to the control room |
| **On-Scene Workflow** | Accept → Arrive → Resolve with resolution notes |
| **Performance KPIs** | Resolved count, average rating, active assignments |

### Platform

| Feature | Description |
|---------|-------------|
| **Real-Time Everything** | Socket.io with JWT handshake auth; new reports, status changes, notifications |
| **SLA Tracking** | Per-priority verify/dispatch/resolve deadlines with automatic escalation flagging |
| **Audit Logging** | Dedicated audit collection for all privileged actions |
| **Security** | JWT + refresh tokens, bcrypt, Helmet, CORS, rate limiting, input validation |
| **Neomorphic UI** | Custom design system (~2100 lines) with responsive layout |

---

## 🔄 Incident Lifecycle

```mermaid
stateDiagram-v2
    [*] --> REPORTED: citizen submits
    REPORTED --> VERIFIED: admin verifies (SLA clock starts)
    REPORTED --> REJECTED: admin rejects (reason required)
    VERIFIED --> PRIORITIZED: priority assigned
    PRIORITIZED --> ASSIGNED: responder assigned
    ASSIGNED --> DISPATCHED: dispatch notification sent
    DISPATCHED --> RESPONDER_ACCEPTED: responder accepts
    DISPATCHED --> ASSIGNED: responder rejects (reason required)
    RESPONDER_ACCEPTED --> RESPONDER_ARRIVED: on scene
    RESPONDER_ARRIVED --> RESOLVED: resolution notes
    RESOLVED --> CLOSED: admin closes
    REPORTED --> WITHDRAWN: citizen withdraws
    VERIFIED --> WITHDRAWN: citizen withdraws
    PRIORITIZED --> WITHDRAWN: citizen withdraws
    REJECTED --> [*]
    WITHDRAWN --> [*]
    CLOSED --> [*]
```

**SLA deadlines** are set when a report is verified, based on priority:

| Priority | Verify | Dispatch | Resolve |
|----------|--------|----------|---------|
| CRITICAL | 5 min | 10 min | 60 min |
| HIGH | 10 min | 20 min | 120 min |
| MEDIUM | 30 min | 60 min | 480 min |
| LOW | 60 min | 120 min | 1440 min |

---

## 🛠 Tech Stack

### Backend

| Technology | Purpose |
|-----------|---------|
| **Node.js** | JavaScript runtime |
| **Express 5.x** | Web framework |
| **MongoDB + Mongoose** | Database & ODM |
| **Socket.io** | Real-time bidirectional communication (JWT handshake auth) |
| **JWT + Refresh Tokens + bcryptjs** | Authentication & password hashing |
| **Multer + Sharp** | File upload & image compression (WebP) |
| **Nodemailer** | Email notifications & password reset links |
| **Helmet / CORS / express-rate-limit / express-validator** | Security & validation |
| **compression** | Gzip response compression |

### Frontend

| Technology | Purpose |
|-----------|---------|
| **HTML5 / CSS3 / Vanilla JS** | No frameworks |
| **Leaflet.js 1.9.4** | Interactive maps (OpenStreetMap) |
| **Socket.io Client** | Real-time event handling |
| **Neomorphic CSS** | Custom design system (~2100 lines) |

---

## 📁 Project Structure

```
Emergency-alert/
├── README.md
├── client/                          # Frontend (served as static files)
│   ├── index.html                   # Landing: live stats, public incident map, auth modal, forgot password
│   ├── user-dashboard.html          # Citizen: report form, my reports, filters, timeline, feedback
│   ├── admin-dashboard.html         # Admin: 8-tab control room
│   ├── responder-dashboard.html     # Responder: assignments, duty status, profile
│   ├── reset-password.html          # Password reset page (token from email link)
│   ├── css/
│   │   └── style.css                # Full neomorphic design system (~2100 lines)
│   └── js/
│       ├── api.js                   # Fetch wrapper, token refresh, 60+ API functions, toasts
│       ├── socket.js                # Socket.io client with JWT handshake auth
│       ├── home.js                  # Landing page: stats, live map, forgot password
│       ├── userDashboard.js         # Citizen dashboard logic
│       ├── adminDashboard.js        # Admin control room logic
│       ├── responderDashboard.js    # Responder console logic
│       └── auth.js                  # Legacy (kept for reference)
│
└── server/                          # Backend
    ├── .env                         # Environment config (DO NOT commit)
    ├── package.json
    ├── server.js                    # Express + Socket.io bootstrap
    ├── seed.js                      # Seeds admin, citizens, 5 responders, sample reports
    ├── config/
    │   └── db.js                    # MongoDB connection handler
    ├── middleware/
    │   └── auth.js                  # protect, adminOnly, responderOnly, generateToken
    ├── models/
    │   ├── User.js                  # Users (roles: user/admin/responder)
    │   ├── Report.js                # Reports (lifecycle, priority score, SLA, timeline, duplicates)
    │   └── Responder.js             # Responder profiles (specialization, availability, zone, stats)
    ├── routes/
    │   ├── auth.js                  # register/login/refresh/logout/forgot/reset/me/profile
    │   ├── reports.js               # Lifecycle transitions, priority, assign, duplicates, feedback
    │   ├── responders.js            # Self-service + admin management
    │   ├── notifications.js         # List, unread count, mark read
    │   ├── users.js                 # Admin user management
    │   ├── audit.js                 # Audit trail (admin)
    │   ├── hotspots.js              # Grid hotspot clustering (admin)
    │   └── stats.js                 # Public stats, public map, admin analytics
    ├── socket/
    │   └── index.js                 # JWT-authenticated rooms (admins, user_<id>)
    ├── utils/
    │   ├── history.js               # Timeline + audit helpers
    │   ├── notify.js                # Persistent notification helper (DB + socket)
    │   ├── priority.js              # Transparent priority scoring engine
    │   ├── sla.js                   # SLA minutes per priority + escalation
    │   ├── geo.js                   # Haversine distance
    │   ├── fileUpload.js            # Multer (memory) + Sharp WebP pipeline
    │   └── emailService.js          # Nodemailer templates
    └── uploads/                     # Uploaded images (auto-created)
```

---

## 📋 Prerequisites

| Software | Minimum Version | Download Link |
|----------|----------------|---------------|
| **Node.js** | v18.0 or higher | [nodejs.org](https://nodejs.org/) |
| **MongoDB** | v6.0 or higher | [mongodb.com/try/download](https://www.mongodb.com/try/download/community) |
| **Git** | Any recent version | [git-scm.com](https://git-scm.com/) |

**Verify your installations:**

```bash
node --version    # Should show v18.x or higher
mongod --version  # Should show v6.x or higher
```

---

## 🗄 Database Setup (Step-by-Step)

### Step 1: Install MongoDB

<details>
<summary><strong>🪟 Windows</strong></summary>

1. Download the **MongoDB Community Server** MSI from https://www.mongodb.com/try/download/community
2. Run the installer → **Complete** setup
3. ✅ Check **"Install MongoDB as a Service"** (auto-starts with Windows)
4. Click **Install** → **Finish**

**Verify it's running:**
```powershell
Get-Service MongoDB
```

**If it's not running:**
```powershell
# Run PowerShell as Administrator
net start MongoDB
```

</details>

<details>
<summary><strong>🍎 macOS</strong></summary>

```bash
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

</details>

<details>
<summary><strong>🐧 Ubuntu / Debian</strong></summary>

```bash
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

</details>

---

### Step 2: Configure the Connection

Open **`server/.env`** and set `MONGO_URI`:

```env
# Local MongoDB (simplest)
MONGO_URI=mongodb://127.0.0.1:27017/emergency_alert_db

# OR MongoDB Atlas (cloud)
MONGO_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/emergency_alert_db?retryWrites=true&w=majority
```

> MongoDB creates the database automatically on first insert — no manual setup needed.

---

### Step 3: Install Dependencies & Seed

```bash
cd server
npm install
node seed.js
```

**Expected output:**
```
Connected to MongoDB
✅ Admin: admin@emergency.com / admin123
✅ Citizens: user@test.com, priya@test.com, rahul@test.com / user123
✅ Responders: responder1-5@test.com / responder123 (Medical/Fire/Police/Disaster/General)
✅ Sample reports: ~12 reports across the lifecycle
🎉 Seed complete!
```

---

## 🚀 Installation & Running

```bash
# 1. Install server dependencies
cd server
npm install

# 2. Seed the database (creates accounts + sample data)
node seed.js

# 3. Start the server
npm start
```

Open **http://localhost:5000** in your browser.

---

## ⚙ Environment Variables

All environment variables are stored in `server/.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5000` | Server port |
| `MONGO_URI` | **Yes** | — | MongoDB connection string |
| `JWT_SECRET` | **Yes** | — | Secret for signing JWTs |
| `JWT_EXPIRE` | No | `7d` | Access token lifetime |
| `JWT_REFRESH_SECRET` | No | — | Secret for refresh tokens |
| `JWT_REFRESH_EXPIRE` | No | `30d` | Refresh token lifetime |
| `EMAIL_HOST` | No | `smtp.gmail.com` | SMTP host |
| `EMAIL_PORT` | No | `587` | SMTP port |
| `EMAIL_USER` | No | — | SMTP user |
| `EMAIL_PASS` | No | — | SMTP password / app password |
| `EMAIL_FROM` | No | — | Sender identity |
| `ADMIN_EMAIL` | No | — | Alert recipient |
| `NODE_ENV` | No | `development` | `development` shows reset links in API responses |

> **Note:** Email is **automatically skipped** if `EMAIL_USER` is not set. In development, the forgot-password API returns the reset URL directly so you can test without SMTP.

---

## 🗃 Data Model

### Users (`users`)

| Field | Type | Description |
|-------|------|-------------|
| `name`, `email`, `password` | String | Bcrypt-hashed password, unique email |
| `phone` | String | Contact number |
| `role` | Enum | `user` \| `admin` \| `responder` |
| `active` | Boolean | Admin can disable accounts |
| `notificationsEnabled` | Boolean | Opt-out of notifications |

### Reports (`reports`)

| Field | Type | Description |
|-------|------|-------------|
| `user` | ObjectId → User | Reporter |
| `type` | Enum | `accident` \| `fire` \| `crime` \| `medical` \| `natural_disaster` \| `other` |
| `severity` | Enum | `low` \| `medium` \| `high` \| `critical` |
| `title`, `description` | String | Incident details |
| `location` | Object | `{ address, lat, lng }` |
| `images` | [String] | Up to 4 WebP evidence photos |
| `status` | Enum | Lifecycle status (see diagram) |
| `legacyStatus` | Enum | `Pending` \| `In Progress` \| `Resolved` \| `Dismissed` (derived) |
| `priority` | Enum | `LOW` \| `MEDIUM` \| `HIGH` \| `CRITICAL` |
| `priorityScore` | Number | 0–100 transparent score |
| `priorityReason` | String | Human-readable scoring explanation |
| `prioritySetBy` | ObjectId | Admin override attribution |
| `sla` | Object | `{ verifyDueAt, dispatchDueAt, resolveDueAt, escalated }` |
| `timeline` | [Object] | `{ action, note, actor, actorName, at }` |
| `assignedResponder` | ObjectId → User | Assigned responder |
| `assignedAt / dispatchedAt / acceptedAt / arrivedAt / resolvedAt / closedAt` | Date | Lifecycle timestamps |
| `duplicateOf` / `duplicates` | ObjectId[] | Duplicate clustering |
| `rejectedReason` | String | Why the report was rejected |
| `feedback` | Object | `{ rating, comment, submittedAt }` |
| `adminNotes` | String | Admin notes |

### Responders (`responders`)

| Field | Type | Description |
|-------|------|-------------|
| `user` | ObjectId → User | Linked account |
| `specialization` | Enum | `Medical` \| `Fire` \| `Police` \| `Disaster` \| `General` |
| `availability` | Enum | `Available` \| `Assigned` \| `Responding` \| `Offline` |
| `zone` | String | Patrol zone |
| `contactPhone` | String | Dispatch contact |
| `lastLocation` | Object | `{ lat, lng, updatedAt }` |
| `stats` | Object | `{ resolvedCount, avgRating }` |
| `active` | Boolean | Admin can deactivate |

---

## 📡 API Reference

### Auth (`/api/auth`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/register` | Public | Create account → `{ token, refreshToken, user }` |
| POST | `/login` | Public | Sign in → `{ token, refreshToken, user, responder? }` |
| POST | `/refresh` | Public | Exchange refresh token for new access token |
| POST | `/logout` | Auth | Invalidate refresh token |
| POST | `/forgot-password` | Public | Send reset link (dev: returns `resetUrl`) |
| POST | `/reset-password` | Public | Set new password with token |
| GET | `/me` | Auth | Current user |
| PUT | `/profile` | Auth | Update name/phone/password |

### Reports (`/api/reports`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/` | Auth | Submit report (multipart, images) — returns duplicate warning |
| GET | `/my` | Auth | My reports (search/status/type filters + pagination) |
| GET | `/` | Admin | All reports (status/type/severity/priority/assigned/escalated/search + pagination + stats) |
| GET | `/:id` | Owner/Admin/Assigned | Full report with timeline |
| PATCH | `/:id/status` | Role-enforced | Lifecycle transition (verify/reject/accept/arrive/resolve/close) |
| PATCH | `/:id/priority` | Admin | Override priority with reason |
| GET | `/:id/recommendations` | Admin | Top-5 scored responder recommendations |
| PATCH | `/:id/assign` | Admin | Assign responder |
| PATCH | `/:id/reject-assignment` | Responder | Reject dispatch with reason |
| PATCH | `/:id/link-duplicate` | Admin | Link a duplicate to a primary report |
| PATCH | `/:id/unlink-duplicate` | Admin | Remove duplicate link |
| PUT | `/:id` | Owner | Edit while REPORTED |
| PATCH | `/:id/withdraw` | Owner | Withdraw while REPORTED/VERIFIED/PRIORITIZED |
| POST | `/:id/feedback` | Owner | Rate 1–5 after RESOLVED/CLOSED |
| GET | `/:id/feedback` | Admin | View feedback |
| DELETE | `/:id` | Admin | Delete report |

### Responders (`/api/responders`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/me` | Responder | Own profile |
| PUT | `/me` | Responder | Update specialization/availability/zone/location |
| GET | `/me/incidents` | Responder | Assigned incidents (`?view=active` or `all`) |
| GET | `/nearby` | Admin | Available responders near coordinates |
| GET | `/` | Admin | All responders with live stats |
| POST | `/` | Admin | Create responder account |
| PUT | `/:id` | Admin | Update responder |
| DELETE | `/:id` | Admin | Deactivate responder |

### Notifications (`/api/notifications`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/` | Auth | List notifications (`?unread=true&limit=30`) |
| GET | `/unread-count` | Auth | Unread badge count |
| PATCH | `/:id/read` | Auth | Mark one read |
| PATCH | `/read-all` | Auth | Mark all read |

### Admin Routes

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/users` | Admin | Users with report counts (role/search filters) |
| PATCH | `/api/users/:id/activate` | Admin | Enable account |
| PATCH | `/api/users/:id/deactivate` | Admin | Disable account |
| GET | `/api/audit` | Admin | Audit trail (action/actor/search filters + actions list) |
| GET | `/api/hotspots` | Admin | Hotspot clusters (`?days=30&minCount=3`) |

### Stats (`/api/stats`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/public` | Public | Landing page stats |
| GET | `/public-map` | Public | Active incidents for the public map (limit 200) |
| GET | `/admin` | Admin | Full analytics (KPIs, breakdowns, responder performance, feedback) |

---

## 🔌 WebSocket Events

| Event | Direction | Audience | Description |
|-------|-----------|----------|-------------|
| `newReport` | Server → Admins | Control room | New report submitted (sound + toast) |
| `incidentUpdate` | Server → Relevant | Reporter, assigned responder, admins | Any lifecycle change with full report |
| `statusUpdate` | Server → Reporter | Citizen dashboard | Legacy event (status + adminNotes) |
| `notification` | Server → User | Individual | Persistent notification created |
| `unreadCountChanged` | Server → User | Individual | Badge refresh signal |
| `responderLocation` | Server → Admins | Control room | Responder GPS updates |
| `responderAvailabilityChanged` | Server → Admins | Control room | Duty status changes |

---

## 🔑 Default Credentials

After running `node seed.js`:

| Role | Email | Password | Dashboard |
|------|-------|----------|-----------|
| **Admin** | `admin@emergency.com` | `admin123` | `/admin-dashboard.html` |
| **Citizen** | `user@test.com` | `user123` | `/user-dashboard.html` |
| **Citizen** | `priya@test.com` | `user123` | `/user-dashboard.html` |
| **Citizen** | `rahul@test.com` | `user123` | `/user-dashboard.html` |
| **Responder (Medical)** | `responder1@test.com` | `responder123` | `/responder-dashboard.html` |
| **Responder (Fire)** | `responder2@test.com` | `responder123` | `/responder-dashboard.html` |
| **Responder (Police)** | `responder3@test.com` | `responder123` | `/responder-dashboard.html` |
| **Responder (Disaster)** | `responder4@test.com` | `responder123` | `/responder-dashboard.html` |
| **Responder (General)** | `responder5@test.com` | `responder123` | `/responder-dashboard.html` |

> ⚠ **Change these passwords immediately if deploying to production!**

---

## 🏗 Architecture Overview

```mermaid
flowchart LR
    subgraph Client["Client (Browser)"]
        L["index.html<br/>Landing + Public Map"]
        U["user-dashboard.html<br/>Citizen"]
        A["admin-dashboard.html<br/>Control Room"]
        R["responder-dashboard.html<br/>Responder"]
        API["api.js + socket.js"]
        L --> API
        U --> API
        A --> API
        R --> API
    end

    subgraph Server["Server (Node.js)"]
        E["Express 5.x + Socket.io"]
        M["JWT / RBAC / Validation / Rate Limit"]
        RT["routes: auth, reports, responders,<br/>notifications, users, audit, hotspots, stats"]
        UT["utils: priority, sla, notify,<br/>history, geo, upload, email"]
        E --> M --> RT --> UT
    end

    DB[(MongoDB<br/>users · reports · responders ·<br/>notifications · auditlogs)]

    Client -- "REST + WebSocket" --> Server
    Server -- "Mongoose" --> DB
```

### Request Lifecycle

```
1. Citizen submits report (photos + GPS pin)
2. api.js → POST /api/reports (FormData + JWT)
3. Server: JWT verify → Multer → Sharp WebP compression
4. Duplicate check → nearby same-type reports in last 24h
5. Priority engine computes score + reason
6. Report saved → Socket.io 'newReport' → control room (sound + toast)
7. Admin verifies → SLA deadlines set → citizen notified
8. Admin opens recommendations → assigns best responder
9. Responder accepts → arrives → resolves (each step notifies citizen)
10. Citizen rates the response → admin closes the incident
11. Every privileged action lands in the audit trail
```

---

## 🧩 Troubleshooting

| Problem | Solution |
|---------|----------|
| **`EADDRINUSE :::5000`** | `netstat -ano \| findstr :5000` then `taskkill /PID <pid> /F` (Windows) |
| **`ECONNREFUSED` on Mongo** | Start MongoDB: `net start MongoDB` (Windows) / `brew services start mongodb-community` (macOS) |
| **`Cannot find module 'xyz'`** | `cd server && npm install` |
| **Images not uploading** | Check `server/uploads/` exists and disk space |
| **Emails not sending** | Set `EMAIL_USER`/`EMAIL_PASS` in `.env` (Gmail needs an [App Password](https://support.google.com/accounts/answer/185833)); dev mode shows reset links in the API response |
| **Seed says "already exists"** | Normal — accounts already exist; re-run with a fresh database to regenerate sample reports |
| **Login returns 401** | Check credentials; re-run `node seed.js` |
| **Map not loading** | Needs internet for OpenStreetMap tiles |
| **Socket events not firing** | Check browser console; ensure you're logged in (socket auth requires JWT) |

---

## 📝 License

Built for **educational purposes** as a university major project.

---

<div align="center">

**Built with ❤️ using Node.js, Express, MongoDB, Socket.io, and Leaflet.js**

`© 2026 — University Major Project`

</div>
