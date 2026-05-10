/** Horizontal “field road” separator between map and detail cards (Figma). */
export function MapRoadDivider() {
  return (
    <div
      className="relative h-5 w-full overflow-hidden rounded-md bg-[#4a5350] shadow-inner shadow-black/40 ring-1 ring-black/30"
      aria-hidden
    >
      <div className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 border-t-2 border-dashed border-white/75" />
    </div>
  );
}
