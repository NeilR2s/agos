import { PauseIcon, PlayIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import type { TimestampId } from "../types";

type MapTimelineProps = {
  timestamps: TimestampId[];
  activeIndex: number;
  playing: boolean;
  windowSize: number;
  onIndexChange: (index: number) => void;
  onTogglePlayback: () => void;
  onWindowSizeChange: (size: number) => void;
};

const formatTimestampLabel = (timestamp: string) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(timestamp));

export function MapTimeline({ timestamps, activeIndex, playing, windowSize, onIndexChange, onTogglePlayback, onWindowSizeChange }: MapTimelineProps) {
  const activeTimestamp = timestamps[activeIndex] ?? timestamps[0];
  const windowOptions = Array.from(new Set([1, Math.min(3, timestamps.length), timestamps.length])).filter((value) => value >= 1);
  const visibleTimestampIndices = Array.from(new Set([
    Math.max(activeIndex - 1, 0),
    activeIndex,
    Math.min(activeIndex + 1, timestamps.length - 1),
  ])).sort((left, right) => left - right);

  return (
    <section className="border-t border-border bg-card/75">
      <div className="flex flex-col gap-2 px-3 py-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Temporal Playback</p>
          <p className="mt-1 truncate font-sans text-[15px] text-foreground">{formatTimestampLabel(activeTimestamp)} UTC</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onTogglePlayback}>
            {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
            {playing ? "Pause" : "Play"}
          </Button>
          <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
            T+{activeIndex.toString().padStart(2, "0")}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Window</span>
            {windowOptions.map((size) => (
              <Button key={size} type="button" variant={windowSize === size ? "default" : "outline"} size="sm" onClick={() => onWindowSizeChange(size)}>
                {size === timestamps.length ? "All" : `${size}x`}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border px-3 py-2">
        <input
          id="map-timeline-index"
          name="map-timeline-index"
          aria-label="Map timeline position"
          type="range"
          min={0}
          max={Math.max(timestamps.length - 1, 0)}
          value={activeIndex}
          onChange={(event) => onIndexChange(Number(event.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary [accent-color:var(--primary)]"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleTimestampIndices.map((index) => (
            <button
              key={timestamps[index]}
              type="button"
              onClick={() => onIndexChange(index)}
              className={[
                "min-w-[88px] rounded-xl border px-2 py-1.5 text-left transition-colors",
                index === activeIndex ? "border-ring/60 bg-accent text-foreground" : "border-border text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <span className="block font-mono text-[10px] uppercase tracking-[1.2px]">T+{index.toString().padStart(2, "0")}</span>
              <span className="mt-0.5 block font-sans text-[11px]">{formatTimestampLabel(timestamps[index])}</span>
            </button>
          ))}
          {timestamps.length > visibleTimestampIndices.length ? (
            <div className="flex items-center rounded-xl border border-dashed border-border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">
              {timestamps.length - visibleTimestampIndices.length} steps
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
