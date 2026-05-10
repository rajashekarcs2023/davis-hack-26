import { Package } from "lucide-react";
import type { FieldPlaceholder } from "../../data/placeholder";
import { AppHeader } from "../../components/AppHeader";
import { WorkOrder } from "./components/WorkOrder";

type OrdersPageProps = {
  data: FieldPlaceholder;
};

function OrdersSummary() {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-xl border border-white/10 border-l-4 border-l-orange-500 bg-terrascout-card p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
          Active
        </p>
        <p className="mt-1 text-2xl font-bold text-orange-400">2</p>
      </div>
      <div className="rounded-xl border border-white/10 border-l-4 border-l-emerald-500 bg-terrascout-card p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
          Resolved
        </p>
        <p className="mt-1 text-2xl font-bold text-emerald-400">1</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-terrascout-card p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
          Total
        </p>
        <p className="mt-1 text-2xl font-bold text-white">3</p>
      </div>
    </div>
  );
}

/** Orders tab UI — prefer edits under `src/pages/orders/`. */
export function OrdersPage({ data }: OrdersPageProps) {
  return (
    <div className="space-y-4">
      <AppHeader
        pageTitle="Field orders"
        pageSubtitle="Drone-identified issues & solutions"
        pageRightIcon={<Package className="h-5 w-5" />}
      />
      <OrdersSummary />
      <WorkOrder data={data} />
      <div className="rounded-2xl border border-white/10 border-l-4 border-l-amber-400 bg-terrascout-card/60 px-4 py-3 opacity-90">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-white">#041 Zone A</p>
          <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-100 ring-1 ring-amber-400/30">
            Moderate priority
          </span>
        </div>
      </div>
    </div>
  );
}
