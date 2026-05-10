import { useState } from "react";
import { BottomNav, type NavTab } from "./components/BottomNav";
import { AnalyticsScreen } from "./components/AnalyticsScreen";
import { FIELD_PLACEHOLDER } from "./data/placeholder";
import { MonitorPage } from "./pages/monitor/MonitorPage";
import { OrdersPage } from "./pages/orders/OrdersPage";

export default function App() {
  const [tab, setTab] = useState<NavTab>("monitor");
  const data = FIELD_PLACEHOLDER;

  function handleNav(next: NavTab) {
    setTab(next);
  }

  return (
    <div className="min-h-screen bg-terrascout-bg pb-28">
      <div className="mx-auto max-w-md px-4 pt-4">
        {tab === "monitor" ? <MonitorPage data={data} /> : null}
        {tab === "orders" ? <OrdersPage data={data} /> : null}
        {tab === "analytics" ? <AnalyticsScreen /> : null}
      </div>

      <BottomNav active={tab} onChange={handleNav} />
    </div>
  );
}
