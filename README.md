# CAMPUSX — College Management & Student Engagement Platform

> **"One Campus. One Platform. Everything Students Need."**

CampusX is a modern, responsive SaaS-grade college management web application built with **HTML5, CSS3, Vanilla JavaScript (ES6+)**, and **Google Firebase (Authentication, Firestore Database, Cloud Storage)**.

---

## 🌟 Key Features

### 👨‍🎓 Student Portal
* **Visual Overview Dashboard**: Greeting with time of day, academic KPI stats, and today's schedule.
* **Study Notes Repository**: Search, subject filters, and download verified notes uploaded by professors.
* **Assignments & Submissions**: Track upcoming deadlines, priority indicators (Urgent/Important/Normal), view teacher problem sheets, and submit solutions with file uploads and comments.
* **Attendance Tracking & 75% Predictor**: Subject-wise progress bars, overall circular gauge, and an informational predictive calculator computing safe bunks or required consecutive classes to reach 75%.
* **Interactive Weekly Timetable**: Mon–Sat schedule with live **"Happening Right Now"** class detector and upcoming lecture indicator.
* **Examination Schedule**: Mid-term and semester exam dates, hall numbers, and countdowns.
* **Personal Productivity**: Local personal task planner + interactive **Pomodoro Focus Timer** (25m/5m/15m) with Web Audio API chime sounds.
* **Notification Center**: Real-time academic alert feed with unread badges and mark-all-read.

### 👨‍🏫 Faculty Portal
* **Curriculum Notes Manager**: Upload notes with **mandatory file upload**, drag-and-drop, upload progress bar, and size/type validation (<25MB).
* **Assignments Manager**: Create coursework with **optional file attachment**, set deadlines, and access the **Submissions Viewer** to download and review student work.
* **Communication Center**: Broadcast department notices and issue official circulars with **optional attachments**.
* **Student Roster**: Filter and view enrolled students, roll numbers, and attendance records.

### 🛡️ Administrator Portal
* **Campus KPIs**: Total students, faculty, subjects, departments, notes, and assignments.
* **User Management**: View user directory, provision accounts, and reassign roles (Student ⇄ Teacher ⇄ Admin).
* **Curriculum Management**: Academic department management and subject syllabus records.
* **Central Moderation**: Moderate all notes, assignments, and announcements across campus.

---

## 🚀 Getting Started

### Prerequisites
You need a **Firebase project** with Authentication, Firestore, and Storage enabled. Follow the steps below.

### Step 1: Create a Firebase Project
1. Navigate to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** and name it (e.g. `campusx-portal`).

### Step 2: Enable Firebase Authentication
1. In the left navigation, open **Build** → **Authentication**.
2. Click **Get Started**.
3. Under **Sign-in method**, choose **Email/Password** and click **Enable**.

### Step 3: Create Cloud Firestore Database
1. Go to **Build** → **Firestore Database** → **Create Database**.
2. Start in **Production mode** (or test mode).
3. Select your preferred Cloud location.

### Step 4: Enable Firebase Cloud Storage
1. Go to **Build** → **Storage** → **Get Started**.
2. Accept the default security rules and select your storage bucket region.

### Step 5: Register Your Web App & Copy Keys
1. In Project Overview, click the **Web icon (`</>`)** to register a web application.
2. Enter an App nickname (e.g. `CampusX Web`).
3. Copy the `firebaseConfig` object.
4. Open `js/firebase-config.js` in your editor and paste the keys:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "campusx-portal.firebaseapp.com",
     projectId: "campusx-portal",
     storageBucket: "campusx-portal.appspot.com",
     messagingSenderId: "123456789...",
     appId: "1:123456789:web:..."
   };
   ```

### Step 6: Deploy Security Rules
* Paste the contents of `firestore.rules` into **Firestore Database** → **Rules** tab in the Firebase Console and click **Publish**.
* Paste the contents of `storage.rules` into **Storage** → **Rules** tab in the Firebase Console and click **Publish**.

### Step 7: Serve the Application
```bash
# Option A: Python
python -m http.server 8000

# Option B: Node.js npx serve
npx serve .

# Option C: VS Code Live Server extension
```

Open `http://localhost:8000` and register your first user via the **Register** page.

---

## 📁 Project Directory Structure

```
campusx/
├── index.html                     # Public landing page with hero, features & role cards
├── login.html                     # Unified authentication login
├── register.html                  # Student & Faculty registration form
│
├── student/                       # Student Portal
│   ├── dashboard.html             # Morning greeting, timetable widget & academic stats
│   ├── profile.html               # Student academic record & editable bio
│   ├── notes.html                 # Study material search, filters, and downloads
│   ├── assignments.html           # Assignments list, status filters, submission modal
│   ├── notices.html               # College and department announcement board
│   ├── circulars.html             # Official administrative circulars with downloads
│   ├── timetable.html             # Weekly schedule with active class indicator
│   ├── attendance.html            # 75% statutory rule checker & predictive calculator
│   ├── exams.html                 # Examination schedules, dates, and halls
│   ├── planner.html               # Study tasks & Pomodoro focus timer
│   └── notifications.html         # Alerts feed & unread counter
│
├── teacher/                       # Faculty Portal
│   ├── dashboard.html             # Teacher overview & quick action modals
│   ├── profile.html               # Faculty profile details
│   ├── notes.html                 # Lecture notes manager (Required document upload)
│   ├── assignments.html           # Coursework creator (Optional file) & submissions viewer
│   ├── notices.html               # Department notice publisher (Optional attachment)
│   ├── circulars.html             # Official circular publisher (Optional attachment)
│   └── students.html              # Class roster & student attendance summary
│
├── admin/                         # Administrator Portal
│   ├── dashboard.html             # Platform KPIs & activity overview
│   ├── users.html                 # User directory & role promotion
│   ├── students.html              # Student records management
│   ├── teachers.html              # Faculty records management
│   ├── departments.html           # Academic departments CRUD
│   ├── subjects.html              # Syllabus & subject curriculum
│   ├── content.html               # Central moderation of campus resources
│   └── settings.html              # Platform settings & Firebase diagnostics
│
├── css/
│   ├── global.css                 # Color tokens, CSS reset, Light/Dark variables
│   ├── components.css             # Buttons, cards, badges, modals, toasts, tables, progress bars
│   ├── dashboard.css              # Sidebar, topbar, KPI cards, Pomodoro dial
│   ├── auth.css                   # Auth layouts
│   └── responsive.css             # Mobile drawer, responsive tables, media queries
│
├── js/
│   ├── firebase-config.js         # Firebase initialization
│   ├── utils.js                   # Toast system, modals, confirm dialogs, formatters
│   ├── theme.js                   # Light/Dark mode with LocalStorage persistence
│   ├── auth.js                    # Firebase Auth login, registration, logout
│   ├── guards.js                  # Client route protection & role redirection
│   ├── notes.js                   # Notes Firestore & Storage management
│   ├── assignments.js             # Assignments & student submission engine
│   ├── notices.js                 # Notices management with optional file
│   ├── circulars.js               # Circulars management with optional file
│   ├── timetable.js               # Timetable logic & live class tracker
│   ├── attendance.js              # Attendance logic & 75% projection formula
│   ├── planner.js                 # Local task planner & Pomodoro audio timer
│   ├── notifications.js           # Notification store & event dispatcher
│   ├── student.js                 # Student portal controller
│   ├── teacher.js                 # Teacher portal controller
│   └── admin.js                   # Admin portal controller
│
├── firestore.rules                # Production Firebase Firestore security rules
├── storage.rules                  # Production Firebase Storage security rules
└── docs/
    └── COLLEGE_PROJECT_REPORT.md  # Comprehensive academic documentation
```

---

## 🔒 Security Implementation
1. **Frontend Route Guards**: Prevents students from accessing faculty or administrative pages.
2. **Firestore Security Rules**: Role-based access control checking `request.auth` and user role documents. Students cannot modify professor notes or administrative settings.
3. **Storage Security Rules**: File uploads are authenticated and restricted to permitted academic formats under 25MB.
4. **No Plaintext Passwords**: Authentication is managed by Google Firebase Identity Services.
