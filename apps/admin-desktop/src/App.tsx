import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Colleges from './pages/Colleges';
import CreateCollege from './pages/CreateCollege';
import EditCollege from './pages/EditCollege';
import CreateSuperAdmin from './pages/CreateSuperAdmin';
import Departments from './pages/Departments';
import Users from './pages/Users';
import Students from './pages/Students';
import Subjects from './pages/Subjects';
import CreateUser from './pages/CreateUser';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/colleges"
          element={
            <ProtectedRoute>
              <Colleges />
            </ProtectedRoute>
          }
        />
        <Route
          path="/colleges/new"
          element={
            <ProtectedRoute>
              <CreateCollege />
            </ProtectedRoute>
          }
        />
        <Route
          path="/colleges/:collegeId/edit"
          element={
            <ProtectedRoute>
              <EditCollege />
            </ProtectedRoute>
          }
        />
        <Route
          path="/colleges/:collegeId/super-admin"
          element={
            <ProtectedRoute>
              <CreateSuperAdmin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/colleges/:collegeId/departments"
          element={
            <ProtectedRoute>
              <Departments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/colleges/:collegeId/users"
          element={
            <ProtectedRoute>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="/colleges/:collegeId/users/new"
          element={
            <ProtectedRoute>
              <CreateUser />
            </ProtectedRoute>
          }
        />
        <Route
          path="/colleges/:collegeId/students"
          element={
            <ProtectedRoute>
              <Students />
            </ProtectedRoute>
          }
        />
        <Route
          path="/colleges/:collegeId/departments/:departmentId/subjects"
          element={
            <ProtectedRoute>
              <Subjects />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
