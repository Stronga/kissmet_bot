import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

const BOTTOM = [
  { to: "/home", label: "Home" },
  { to: "/application", label: "Application" },
  { to: "/payments", label: "Payments" },
  { to: "/room", label: "My Room" },
  { to: "/more", label: "More" },
];

const SIDEBAR = [
  { to: "/home", label: "Home" },
  { to: "/application", label: "Application" },
  { to: "/booking", label: "Booking" },
  { to: "/payments", label: "Payments" },
  { to: "/room", label: "My Room" },
  { to: "/maintenance", label: "Maintenance" },
  { to: "/messages", label: "Messages" },
  { to: "/announcements", label: "Announcements" },
  { to: "/profile", label: "Profile" },
  { to: "/documents", label: "Documents" },
];

export function Shell() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className="hidden md:flex md:w-64 md:flex-col md:sticky md:top-0 md:h-screen border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-5">
          <p className="text-sm font-semibold text-primary">Kissmet</p>
          <p className="text-xs text-slate-500">{user?.displayName}</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {SIDEBAR.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block min-h-12 rounded-xl px-3 py-3 text-sm md:min-h-0 md:py-2 ${isActive ? "bg-teal-50 font-semibold text-primary" : "text-slate-600 hover:bg-slate-50"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 px-3 py-4">
          <button type="button" onClick={() => logout()} className="w-full rounded-xl px-3 py-2 text-left text-sm text-primary">
            Log out
          </button>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <p className="text-sm font-semibold text-primary">Kissmet</p>
          <p className="text-xs text-slate-500">{user?.displayName}</p>
        </header>
        <main className="p-4 pb-24 md:p-8 md:pb-8 lg:px-10 lg:pt-10">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
            {loc.pathname === "/more" ? (
              <div className="pt-4 text-sm text-slate-500">
                <button type="button" onClick={() => logout()} className="min-h-12 text-primary md:min-h-0">Log out</button>
              </div>
            ) : null}
          </div>
        </main>
        <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white md:hidden">
          <div className="grid grid-cols-5">
            {BOTTOM.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `min-h-12 py-3 text-center text-xs ${isActive ? "font-semibold text-primary" : "text-slate-500"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
