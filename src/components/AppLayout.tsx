import { CalendarCheck, ListChecks, type LucideIcon } from "lucide-react";
import { NavLink, Outlet } from "react-router";

import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: LucideIcon };

// Future modules (calendar, journal, …) add an entry here and a route in App.tsx.
const NAV: NavItem[] = [
  { to: "/", label: "Today", icon: CalendarCheck },
  { to: "/habits", label: "Habits", icon: ListChecks },
];

export function AppLayout() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-52 shrink-0 flex-col gap-1 border-r bg-sidebar p-3 text-sidebar-foreground">
        <div className="px-2 pt-1 pb-4 text-sm font-semibold tracking-tight">Lifelogging</div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
