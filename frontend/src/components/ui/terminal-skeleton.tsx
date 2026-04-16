import { cn } from "@/lib/utils";

const widths = [0.96, 0.82, 0.9, 0.72, 0.88, 0.76];
const compactWidths = [0.72, 0.58, 0.66, 0.5, 0.62, 0.46];

export function TerminalSkeleton({
  lines = 4,
  label = "LOADING",
  compact = false,
  className,
}: {
  lines?: number;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const lineWidths = compact ? compactWidths : widths;

  return (
    <div className={cn("space-y-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/20", compact && "space-y-2 text-center", className)}>
      <p className={cn("text-white/30", compact && "sr-only")}>{label}</p>
      <div className={cn("space-y-2", compact && "space-y-1")}>
        {Array.from({ length: lines }).map((_, index) => {
          const width = lineWidths[index % lineWidths.length];

          return compact ? (
            <div key={index} className="flex justify-center">
              <div className="h-2 w-full max-w-[10rem] overflow-hidden border border-border/70 bg-white/[0.03]" aria-hidden="true">
                <div className="h-full animate-pulse bg-white/15" style={{ width: `${Math.round(width * 100)}%` }} />
              </div>
            </div>
          ) : (
            <div key={index} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
              <span className="text-white/15">[</span>
              <div className="h-3 w-full overflow-hidden border border-border/70 bg-white/[0.03]" aria-hidden="true">
                <div className="h-full animate-pulse bg-white/15" style={{ width: `${Math.round(width * 100)}%` }} />
              </div>
              <span className="text-white/15">]</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
