import { BarChart3, ClipboardCheck, Package } from "lucide-react";

export type NavTab = "monitor" | "orders" | "analytics";

type BottomNavProps = {
  active: NavTab;
  onChange: (tab: NavTab) => void;
};

const tabs: { id: NavTab; label: string; icon: typeof ClipboardCheck }[] = [
  { id: "monitor", label: "Monitor", icon: ClipboardCheck },
  { id: "orders", label: "Orders", icon: Package },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#0a1210]/98 backdrop-blur-md"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-md justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`flex min-w-[4.5rem] flex-col items-center gap-1 rounded-t-lg px-3 pb-2 pt-1.5 text-[11px] font-medium transition-colors ${
                isActive
                  ? "border-t-2 border-[#4ade80] bg-emerald-500/10 text-[#4ade80]"
                  : "border-t-2 border-transparent text-white/40 hover:text-white/65"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.25 : 1.75} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
