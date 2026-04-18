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

  return (
    <section className="border border-white/10 bg-white/[0.03]">
      <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Temporal Playback</p>
          <p className="mt-2 font-sans text-[18px] text-white">{formatTimestampLabel(activeTimestamp)} UTC</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={onTogglePlayback}>
            {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
            {playing ? "Pause" : "Play"}
          </Button>
          <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">
            T+{activeIndex.toString().padStart(2, "0")}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Window</span>
            {windowOptions.map((size) => (
              <Button key={size} type="button" variant={windowSize === size ? "default" : "outline"} size="sm" onClick={() => onWindowSizeChange(size)}>
                {size === timestamps.length ? "All" : `${size}x`}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-4">
        <input
          type="range"
          min={0}
          max={Math.max(timestamps.length - 1, 0)}
          value={activeIndex}
          onChange={(event) => onIndexChange(Number(event.target.value))}
          className="h-2 w-full cursor-pointer appearance-none bg-white/10 accent-white"
        />
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          {timestamps.map((timestamp, index) => (
            <button
              key={timestamp}
              type="button"
              onClick={() => onIndexChange(index)}
              className={[
                "border px-2 py-2 text-left transition-colors",
                index === activeIndex ? "border-white/20 bg-white/[0.06] text-white" : "border-white/10 text-white/50 hover:text-white",
              ].join(" ")}
            >
              <span className="block font-mono text-[10px] uppercase tracking-[1.2px]">T+{index.toString().padStart(2, "0")}</span>
              <span className="mt-1 block font-sans text-[12px]">{formatTimestampLabel(timestamp)}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
