import { Cloud, Droplets, TrendingUp } from "lucide-react";

export function WeatherBar() {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-[5.5rem] shrink-0 items-center gap-2 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-2">
        <Cloud className="h-4 w-4 text-emerald-300" />
        <span className="text-xs font-semibold text-emerald-100">84°F</span>
      </div>
      <div className="flex min-w-[6.5rem] shrink-0 items-center gap-2 rounded-full border border-red-500/45 bg-red-950/35 px-3 py-2">
        <TrendingUp className="h-4 w-4 text-red-400" />
        <span className="text-xs font-semibold text-red-200/95">High ET</span>
      </div>
      <div className="flex min-w-[7rem] shrink-0 items-center gap-2 rounded-full border border-orange-500/45 bg-orange-950/30 px-3 py-2">
        <Droplets className="h-4 w-4 text-orange-300" />
        <span className="text-xs font-semibold text-orange-100/95">
          Low Precip
        </span>
      </div>
    </div>
  );
}
