import { useCallback, useMemo, useState } from "react";
import { BottomNav, type NavTab } from "./components/BottomNav";
import { AnalyticsScreen } from "./components/AnalyticsScreen";
import { FIELD_PLACEHOLDER } from "./data/placeholder";
import { DEFAULT_ZONE_ID, ZONES, type ZoneInfo } from "./data/zones";
import { MonitorPage } from "./pages/monitor/MonitorPage";
import { OrdersPage } from "./pages/orders/OrdersPage";
import { TodayPage } from "./pages/today/TodayPage";

/**
 * Top-level app shell.
 *
 * Owns two pieces of cross-tab state:
 *   1. `tab`             — which bottom-nav tab is active.
 *   2. `selectedZoneId`  — which of the 4 visual zones (A/B/C/D) the
 *                          user is currently focused on. The Today tab
 *                          can switch this AND the active tab in one
 *                          gesture (tap an alert -> selectedZone='B' +
 *                          tab='monitor'), so the state has to live up
 *                          here, not inside MonitorPage.
 *
 * The Today tab's `onScanZone` callback bubbles up here, sets the
 * selected zone, and switches to Monitor — that's the alert-review
 * affordance the user asked for. Monitor uses the resolved ZoneInfo to
 * pick the backend zone id for new runs and to pass through to the
 * field map for visual selection.
 */
export default function App() {
  const [tab, setTab] = useState<NavTab>("today");
  const [selectedZoneId, setSelectedZoneId] =
    useState<ZoneInfo["id"]>(DEFAULT_ZONE_ID);

  const selectedZone = useMemo(
    () => ZONES.find((z) => z.id === selectedZoneId) ?? ZONES[1],
    [selectedZoneId],
  );

  // Demo data is mostly B3-flavored placeholder copy; we override only
  // `zone` so the backend run is dispatched against the selected zone's
  // backend id (e.g. A2 for Zone A). Static decoration fields stay as
  // they were — they're stylistic, not load-bearing.
  const data = useMemo(
    () => ({ ...FIELD_PLACEHOLDER, zone: selectedZone.backendZoneId }),
    [selectedZone.backendZoneId],
  );

  function handleNav(next: NavTab) {
    setTab(next);
  }

  /**
   * Today -> Monitor handoff. When the user taps an alert card or a zone
   * tile on Today, we:
   *   1. set the selected zone (so MonitorPage knows what to run)
   *   2. switch to the Monitor tab
   * The countdown then auto-arms on Monitor (since runId is null), so
   * the experience is "tap alert in Today -> see countdown begin in
   * Monitor" — which is exactly the flow the user asked for.
   */
  const handleScanZone = useCallback((visualZoneId: ZoneInfo["id"]) => {
    setSelectedZoneId(visualZoneId);
    setTab("monitor");
  }, []);

  return (
    <div className="min-h-screen bg-terrascout-bg pb-28">
      <div className="mx-auto max-w-md px-4 pt-4">
        {tab === "today" ? <TodayPage onScanZone={handleScanZone} /> : null}
        {tab === "monitor" ? (
          <MonitorPage
            data={data}
            selectedZone={selectedZone}
            onChangeZone={setSelectedZoneId}
          />
        ) : null}
        {tab === "orders" ? <OrdersPage data={data} /> : null}
        {tab === "analytics" ? <AnalyticsScreen /> : null}
      </div>

      <BottomNav active={tab} onChange={handleNav} />
    </div>
  );
}
