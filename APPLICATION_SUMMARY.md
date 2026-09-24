# Attend – Application Summary

## Overview (paragraph)

**Attend** is an AI-powered face-recognition attendance system for schools and colleges. It automates roll call by identifying students from live camera or photo capture using InsightFace and FAISS, with a human confirmation step before saving. The system is multi-tenant and scales to many students per college. **Use cases:** Teachers and department admins use the **mobile app** to enroll students (with three face photos), run attendance sessions (live stream or single photo), and view or download reports (PDF/Excel). Department admins also manage sections and assign teachers to sections; teachers manage which students are in their sections. Super admins and platform/college admins use the **desktop app** to create colleges, departments, and users (super admins, department admins, teachers), and to manage colleges and view students. The **backend** (FastAPI) handles auth, enrollment, face recognition, attendance storage, and report generation; data lives in PostgreSQL (Supabase) with face images in Supabase Storage.

---

## App name, pages, and one-line descriptions

**Attend Mobile (Expo / React Native)** — divided by role: **Super Admin**, **Department Admin**, and **Teacher**. (Students do not log in; they are enrolled and marked for attendance by staff.)

**Shared (all three roles)** — Auth, profile, enrollment, attendance, reports
- **Login** — Sign in with email and password; optional test connection to backend.
- **Sign up** — Create a new account (email + password).
- **Verify email** — Shown after signup or when login is blocked until email is verified.
- **Dashboard** — Home with quick actions (Take Attendance, Enroll, View Reports; admins also see Department hub / Create Department Admin; teachers see Section Students).
- **Enroll** — Multi-step flow: choose college/department, enter student details, then open camera for three face poses.
- **Enroll Camera** — Capture front, left, and right face images for new student enrollment.
- **Attendance** — Choose subject and section, then start a session (live stream or photo) to take attendance.
- **Attendance Camera** — Live or single-shot capture; confirm recognition results before saving.
- **Reports** — List subjects with attendance data; open a subject to view or download reports.
- **Reports Detail** — View attendance records for a subject/section and download PDF or Excel.
- **Attendance Record Detail** — View a single attendance record (student, date, subject/section).
- **Profile** — View profile summary and links to Profile Card and Edit Profile.
- **Profile Card** — Full profile view (name, contact, role, etc.).
- **Profile Edit** — Update name and contact number.
- **Edit Student** — Edit student details and manage face images (add/remove).
- **Add Face Camera** — Capture additional face poses for an existing student.

**Super Admin only**
- **Create Department Admin** — Create a new department admin user.
- (Also has access to all Department Admin pages below; can select any college when enrolling.)

**Department Admin**
- **Department Hub** — Admin hub: View Students, View Teachers, Section Students, Manage Sections, Add Teacher.
- **Student List** — Browse students by department.
- **Teacher List** — Browse teachers by department.
- **Manage Sections** — List subjects; tap a subject to manage its sections.
- **Manage Sections Detail** — For a subject: list sections, add section, assign or remove teachers, edit/delete sections.
- **Create Teacher** — Create a new teacher user.
- (Also has access to Section Students flows below.)

**Teacher**
- **Section Students (My Sections)** — List subjects you teach; tap a subject to see its sections.
- **Section Students Detail** — For a subject, list sections; tap a section to open its student list.
- **Section Students List** — For one section: view students, enter edit mode to add/remove students.
- (No access to Department Hub, Student List, Teacher List, Manage Sections, Create Department Admin, or Create Teacher.)

**Other**
- **Not Found** — Shown when a route does not exist.
- **Modal** — Generic modal placeholder screen.

**Attend Admin Desktop (Electron + React)**

- **Login** — Sign in for platform/college admins.
- **Dashboard** — Overview and navigation for admins.
- **Colleges** — List and manage colleges.
- **Create College** — Create a new college.
- **Edit College** — Edit college details (e.g. name, logo).
- **Departments** — List and manage departments (per college).
- **Users** — List and manage users (admins, teachers, etc.).
- **Create User** — Create a new user (role-based).
- **Create Super Admin** — Create a super admin user (platform admin).
- **Students** — View students (by college/department).
- **Subjects** — View and manage subjects (by department).
