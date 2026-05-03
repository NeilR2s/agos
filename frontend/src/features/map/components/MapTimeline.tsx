import { PauseIcon, PlayIcon } from "@heroicons/react/24/outline";

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

  return (
    <section className="border-t border-border/30 bg-background/80 px-4 py-3 backdrop-blur-md">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex shrink-0 items-center gap-4">
          <button
            onClick={onTogglePlayback}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-foreground/5 text-foreground hover:bg-foreground/10 transition-colors"
          >
            {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4 fill-current ml-0.5" />}
          </button>
          
          <div className="flex flex-col min-w-[140px]">
            <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-muted-foreground/50">
              Temporal Step T+{activeIndex.toString().padStart(2, "0")}
            </span>
            <span className="font-mono text-[13px] tabular-nums text-foreground/90">
              {formatTimestampLabel(activeTimestamp)} UTC
            </span>
          </div>
        </div>

        <div className="flex flex-1 items-center gap-6">
          <div className="relative flex flex-1 items-center">
            <input
              id="map-timeline-index"
              name="map-timeline-index"
              aria-label="Map timeline position"
              type="range"
              min={0}
              max={Math.max(timestamps.length - 1, 0)}
              value={activeIndex}
              onChange={(event) => onIndexChange(Number(event.target.value))}
              className="h-1 w-full cursor-pointer appearance-none bg-border/30 [accent-color:var(--foreground)] hover:bg-border/50 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1 border border-border/40 p-0.5">
            <span className="mr-2 px-1 font-mono text-[9px] uppercase tracking-[1px] text-muted-foreground/40">Window</span>
            {windowOptions.map((size) => (
              <button
                key={size}
                onClick={() => onWindowSizeChange(size)}
                className={`px-2 py-0.5 font-mono text-[10px] uppercase tracking-[1px] transition-colors ${
                  windowSize === size ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/10"
                }`}
              >
                {size === timestamps.length ? "All" : `${size}x`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
