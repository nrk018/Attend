import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { Layout } from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Colleges from './pages/Colleges';
import CreateCollege from './pages/CreateCollege';
import EditCollege from './pages/EditCollege';
import CreateSuperAdmin from './pages/CreateSuperAdmin';
import Departments from './pages/Departments';
import Users from './pages/Users';
import Approvals from './pages/Approvals';
import Students from './pages/Students';
import Subjects from './pages/Subjects';
import SubjectDetail from './pages/SubjectDetail';
import CreateUser from './pages/CreateUser';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PlatformAdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role === 'PLATFORM_ADMIN') return <>{children}</>;
  if (user?.role === 'SUPER_ADMIN' && user.college_id) {
    return <Navigate to={`/colleges/${user.college_id}/users`} replace />;
  }
  return <Navigate to="/" replace />;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role === 'SUPER_ADMIN') return <>{children}</>;
  return <Navigate to="/" replace />;
}

function CollegeStaffRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role === 'SUPER_ADMIN' || user?.role === 'DEPARTMENT_ADMIN') return <>{children}</>;
  return <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route
            path="/colleges"
            element={
              <PlatformAdminRoute>
                <Colleges />
              </PlatformAdminRoute>
            }
          />
          <Route
            path="/colleges/new"
            element={
              <PlatformAdminRoute>
                <CreateCollege />
              </PlatformAdminRoute>
            }
          />
          <Route path="/colleges/:collegeId/edit" element={<EditCollege />} />
          <Route
            path="/colleges/:collegeId/super-admin"
            element={
              <PlatformAdminRoute>
                <CreateSuperAdmin />
              </PlatformAdminRoute>
            }
          />
          <Route
            path="/colleges/:collegeId/departments"
            element={<SuperAdminRoute><Departments /></SuperAdminRoute>}
          />
          <Route
            path="/colleges/:collegeId/users"
            element={<CollegeStaffRoute><Users /></CollegeStaffRoute>}
          />
          <Route
            path="/colleges/:collegeId/users/new"
            element={<CollegeStaffRoute><CreateUser /></CollegeStaffRoute>}
          />
          <Route
            path="/colleges/:collegeId/students"
            element={<SuperAdminRoute><Students /></SuperAdminRoute>}
          />
          <Route path="/colleges/:collegeId/departments/:departmentId/subjects" element={<Subjects />} />
          <Route path="/colleges/:collegeId/departments/:departmentId/subjects/:subjectId" element={<SubjectDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
