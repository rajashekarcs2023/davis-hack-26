import { Package } from "lucide-react";
import type { FieldPlaceholder } from "../../data/placeholder";
import { AppHeader } from "../../components/AppHeader";
import { RecentRunsList } from "./components/RecentRunsList";
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
        pageSubtitle="AgriScout diagnostics · issues & solutions"
        pageRightIcon={<Package className="h-5 w-5" />}
      />
      <OrdersSummary />
      <WorkOrder data={data} />
      {/* Live AgriScout runs from the backend — each row shows the final
          multi-cause belief leader so users can see at a glance what the
          system concluded for each past run. */}
      <RecentRunsList />
    </div>
  );
}
