import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

const BOTTOM = [
  { to: "/home", label: "Home" },
  { to: "/application", label: "Application" },
  { to: "/payments", label: "Payments" },
  { to: "/room", label: "My Room" },
  { to: "/more", label: "More" },
];

export function Shell() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 pb-24">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3">
        <p className="text-sm font-semibold text-primary">Kissmet</p>
        <p className="text-xs text-slate-500">{user?.displayName}</p>
      </header>
      <main className="p-4"><Outlet /></main>
      {loc.pathname === "/more" ? (
        <div className="px-4 pb-4 text-sm text-slate-500">
          <button onClick={() => logout()} className="text-primary">Log out</button>
        </div>
      ) : null}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {BOTTOM.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `py-3 text-center text-xs ${isActive ? "font-semibold text-primary" : "text-slate-500"}`}>{item.label}</NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
