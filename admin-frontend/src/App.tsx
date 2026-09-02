import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import { DashboardPage } from "./pages/Dashboard";
import { LoginPage } from "./pages/Login";
import {
  AllocationsPage, AnnouncementsPage, ApplicationsPage, AuditLogsPage, BookingsPage,
  MaintenancePage, MessagesPage, PaymentsPage, ReceiptsPage, ReportsPage, ResidentsPage,
  RoomsPage, SettingsPage, StaffPage,
} from "./pages/Modules";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/residents" element={<ResidentsPage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/allocations" element={<AllocationsPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/receipts" element={<ReceiptsPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/audit-logs" element={<AuditLogsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
