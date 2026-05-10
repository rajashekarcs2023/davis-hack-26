import { Cloud, Droplets, MapPin, TrendingUp } from "lucide-react";

type WeatherBarProps = {
  /**
   * When true, prepend a Davis · May 9 location pill so the top of the
   * page can be ONE row of pills instead of two (header chip + weather).
   * Used in tandem with `<AppHeader compact />`.
   */
  withLocation?: boolean;
};

export function WeatherBar({ withLocation = false }: WeatherBarProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {withLocation ? (
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-2.5 py-1.5">
          <MapPin className="h-3.5 w-3.5 text-emerald-300/85" strokeWidth={2.2} />
          <span className="whitespace-nowrap text-[11px] font-semibold text-white/80">
            Davis · May 9
          </span>
        </div>
      ) : null}
      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1.5">
        <Cloud className="h-3.5 w-3.5 text-emerald-300" strokeWidth={2.2} />
        <span className="text-[11px] font-semibold text-emerald-100">84°F</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/45 bg-red-950/35 px-2.5 py-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-red-400" strokeWidth={2.2} />
        <span className="text-[11px] font-semibold text-red-200/95">High ET</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-orange-500/45 bg-orange-950/30 px-2.5 py-1.5">
        <Droplets className="h-3.5 w-3.5 text-orange-300" strokeWidth={2.2} />
        <span className="whitespace-nowrap text-[11px] font-semibold text-orange-100/95">
          Low Precip
        </span>
      </div>
    </div>
  );
}
