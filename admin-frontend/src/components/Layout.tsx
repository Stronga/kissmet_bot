import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

const NAV = [
  { to: "/dashboard", label: "Dashboard", permission: "admin:read" },
  { to: "/residents", label: "Residents", permission: "resident:read" },
  { to: "/applications", label: "Applications", permission: "application:read" },
  { to: "/bookings", label: "Bookings", permission: "booking:read" },
  { to: "/rooms", label: "Rooms", permission: "admin:read" },
  { to: "/allocations", label: "Allocations", permission: "allocation:read" },
  { to: "/payments", label: "Payments", permission: "payment:read" },
  { to: "/receipts", label: "Receipts", permission: "receipt:read" },
  { to: "/maintenance", label: "Maintenance", permission: "maintenance:read" },
  { to: "/announcements", label: "Announcements", permission: "announcement:read" },
  { to: "/messages", label: "Messages", permission: "message:read" },
  { to: "/reports", label: "Reports", permission: "report:read" },
  { to: "/staff", label: "Staff", permission: "staff:read" },
  { to: "/audit-logs", label: "Audit logs", permission: "audit:read" },
  { to: "/settings", label: "Settings", permission: "settings:read" },
];

export function Layout() {
  const { user, logout, has } = useAuth();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => has(n.permission));
  const nav = (
    <nav className="space-y-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `block rounded-xl px-3 py-2 text-sm ${isActive ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white p-5 lg:block">
        <div className="mb-8">
          <p className="text-lg font-semibold text-primary">Kissmet</p>
          <p className="text-xs text-slate-500">Admin Portal</p>
        </div>
        {nav}
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-64 bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="mb-6 text-lg font-semibold text-primary">Kissmet</p>
            {nav}
          </div>
        </div>
      ) : null}
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button className="rounded-lg px-2 py-1 text-sm lg:hidden" onClick={() => setOpen(true)}>Menu</button>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">{user?.displayName}</p>
              <p className="text-xs capitalize text-slate-500">{user?.role?.replace("_", " ")}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {user?.displayName?.[0] ?? "K"}
            </div>
            <button onClick={() => logout()} className="text-sm text-slate-500 hover:text-slate-800">Logout</button>
          </div>
        </header>
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
