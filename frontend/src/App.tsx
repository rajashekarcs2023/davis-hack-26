import { useState } from "react";
import { ChevronLeft, Package } from "lucide-react";
import { FIELD_PLACEHOLDER } from "./data/placeholder";
import { AnomalyCard } from "./components/AnomalyCard";
import { AnomalyDashboard } from "./components/AnomalyDashboard";
import {
  AiReasoningPanel,
  AssessmentFieldTitle,
  AssessmentMetadataGrid,
  HumanInTheLoopPanel,
  NdviAnomalyPanel,
} from "./components/AssessmentAiPanels";
import { AnalyticsScreen } from "./components/AnalyticsScreen";
import { AppHeader } from "./components/AppHeader";
import { BottomNav, type NavTab } from "./components/BottomNav";
import { GroundTruthVerificationScreen } from "./components/GroundTruthVerificationScreen";
import { MapRoadDivider } from "./components/MapRoadDivider";
import { WeatherBar } from "./components/WeatherBar";
import { WorkOrder } from "./components/WorkOrder";

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

export default function App() {
  const [tab, setTab] = useState<NavTab>("monitor");
  const [monitorScreen, setMonitorScreen] = useState<
    "map" | "assessment" | "groundTruth"
  >("map");
  const data = FIELD_PLACEHOLDER;

  function handleNav(next: NavTab) {
    setTab(next);
    if (next !== "monitor") setMonitorScreen("map");
  }

  return (
    <div className="min-h-screen bg-terrascout-bg pb-28">
      <div className="mx-auto max-w-md px-4 pt-4">
        {tab === "monitor" ? (
          <div className="space-y-4">
            <AppHeader />
            {monitorScreen === "map" ? (
              <>
                <WeatherBar />
                <AnomalyDashboard activeZoneLabel={data.zone} />
                <MapRoadDivider />
                <AnomalyCard
                  variant="monitor"
                  data={data}
                  onReviewAssessment={() => setMonitorScreen("assessment")}
                />
              </>
            ) : monitorScreen === "assessment" ? (
              <>
                <button
                  type="button"
                  onClick={() => setMonitorScreen("map")}
                  className="mb-1 flex items-center gap-1 py-1 text-sm font-medium text-white/50 transition hover:text-white/80"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Map
                </button>
                <AssessmentFieldTitle data={data} />
                <WeatherBar />
                <div className="space-y-4">
                  <NdviAnomalyPanel data={data} />
                  <AiReasoningPanel data={data} />
                  <HumanInTheLoopPanel
                    onProceed={() => setMonitorScreen("groundTruth")}
                    onIgnore={() => setMonitorScreen("map")}
                  />
                  <AssessmentMetadataGrid data={data} />
                </div>
              </>
            ) : (
              <GroundTruthVerificationScreen
                zoneLabel={data.zone}
                onBack={() => setMonitorScreen("assessment")}
                onGenerateWorkOrder={() => {
                  setTab("orders");
                  setMonitorScreen("map");
                }}
              />
            )}
          </div>
        ) : null}

        {tab === "orders" ? (
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
        ) : null}

        {tab === "analytics" ? <AnalyticsScreen /> : null}
      </div>

      <BottomNav active={tab} onChange={handleNav} />
    </div>
  );
}
