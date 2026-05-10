import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { FieldPlaceholder } from "../../data/placeholder";
import {
  AiReasoningPanel,
  AssessmentFieldTitle,
  AssessmentMetadataGrid,
  HumanInTheLoopPanel,
  NdviAnomalyPanel,
} from "../../components/AssessmentAiPanels";
import { AppHeader } from "../../components/AppHeader";
import { FieldWorkOrderScreen } from "../../components/FieldWorkOrderScreen";
import { GroundTruthVerificationScreen } from "../../components/GroundTruthVerificationScreen";
import { AnomalyCard } from "./components/AnomalyCard";
import { AnomalyDashboard } from "./components/AnomalyDashboard";
import { MapRoadDivider } from "./components/MapRoadDivider";
import { WeatherBar } from "./components/WeatherBar";

type MonitorPageProps = {
  data: FieldPlaceholder;
};

/** Monitor tab UI — prefer edits under `src/pages/monitor/`. */
export function MonitorPage({ data }: MonitorPageProps) {
  const [screen, setScreen] = useState<
    "map" | "assessment" | "groundTruth" | "fieldWorkOrder"
  >("map");

  return (
    <div className="space-y-4">
      <AppHeader />
      {screen === "map" ? (
        <>
          <WeatherBar />
          <AnomalyDashboard activeZoneLabel={data.zone} />
          <MapRoadDivider />
          <AnomalyCard
            variant="monitor"
            data={data}
            onReviewAssessment={() => setScreen("assessment")}
          />
        </>
      ) : screen === "assessment" ? (
        <>
          <button
            type="button"
            onClick={() => setScreen("map")}
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
              onProceed={() => setScreen("groundTruth")}
              onIgnore={() => setScreen("map")}
            />
            <AssessmentMetadataGrid data={data} />
          </div>
        </>
      ) : screen === "groundTruth" ? (
        <GroundTruthVerificationScreen
          zoneLabel={data.zone}
          onBack={() => setScreen("assessment")}
          onGenerateWorkOrder={() => setScreen("fieldWorkOrder")}
        />
      ) : (
        <FieldWorkOrderScreen
          data={data}
          onBack={() => setScreen("groundTruth")}
          onReturnToMonitor={() => setScreen("map")}
        />
      )}
    </div>
  );
}
