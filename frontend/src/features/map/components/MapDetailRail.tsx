import { type ReactNode, useMemo, useState } from "react";

import { XMarkIcon } from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import type { MapObjectDetail, MapSelection } from "../types";

type MapDetailRailProps = {
  open: boolean;
  selection: MapSelection;
  detail: MapObjectDetail | null;
  isLoading: boolean;
  error: string | null;
  onFitSelection: () => void;
  onClose: () => void;
  className?: string;
};

const statusTone = {
  nominal: "text-muted-foreground",
  watch: "text-chart-1",
  critical: "text-destructive",
} as const;

const formatTimestamp = (timestamp: string) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(timestamp));

type InspectorTab = "overview" | "history" | "connections" | "track";

const getInitialTab = (selection: MapSelection): InspectorTab => {
  if (selection?.type === "event") {
    return "history";
  }

  if (selection?.type === "track") {
    return "track";
  }

  return "overview";
};

const truncateMiddle = (value: string, edge = 10) => {
  if (value.length <= edge * 2 + 3) {
    return value;
  }

  return `${value.slice(0, edge)}...${value.slice(-edge)}`;
};

export function MapDetailRail({ open, selection, detail, isLoading, error, onFitSelection, onClose, className }: MapDetailRailProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>(() => getInitialTab(selection));

  const primary = useMemo(() => {
    if (!detail) {
      return null;
    }

    return detail.asset ?? detail.zone ?? detail.connection ?? detail.event ?? detail.track ?? null;
  }, [detail]);

  const selectionTitle = detail?.asset?.name
    ?? detail?.zone?.name
    ?? (detail?.connection ? `${detail.connection.kind.toUpperCase()} LINK` : null)
    ?? detail?.event?.title
    ?? detail?.track?.label
    ?? null;
  const selectionMeta = selection ? `${selection.type.toUpperCase()} / ${truncateMiddle(selection.id)}` : "Awaiting selection.";

  const tabAvailability = {
    overview: true,
    history: Boolean(detail?.relatedEvents.length),
    connections: Boolean(detail?.relatedConnections.length || detail?.relatedAssets.length || detail?.relatedZones.length),
    track: Boolean(detail?.track || detail?.relatedTracks.length),
  };

  const tabLabels: Array<{ key: InspectorTab; label: string; disabled: boolean }> = [
    { key: "overview", label: "Overview", disabled: !tabAvailability.overview },
    { key: "history", label: "History", disabled: !tabAvailability.history },
    { key: "connections", label: "Topology", disabled: !tabAvailability.connections },
    { key: "track", label: "Track", disabled: !tabAvailability.track },
  ];

  const overviewContent = isLoading ? (
    <p className="font-mono text-[11px] uppercase tracking-[1px] text-muted-foreground/50">Resolving object state...</p>
  ) : error ? (
    <p className="font-sans text-[13px] text-destructive/80">{error}</p>
  ) : !selection ? (
    <p className="font-sans text-[13px] italic text-muted-foreground/50">Select an object to inspect context.</p>
  ) : !detail || !primary ? (
    <p className="font-sans text-[13px] text-muted-foreground/50 text-center py-12">No object details available.</p>
  ) : (
    <div className="space-y-6">
      {detail.asset && (
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <span className={cn("font-mono text-[10px] uppercase tracking-[2px]", statusTone[detail.asset.status])}>
              {detail.asset.status}
            </span>
            <h2 className="font-sans text-[20px] font-medium text-foreground">{detail.asset.name}</h2>
          </div>
          <p className="font-sans text-[14px] leading-relaxed text-muted-foreground/80">{detail.asset.description}</p>
          <div className="flex flex-col gap-1 pt-2">
            <span className="font-mono text-[9px] uppercase tracking-[1px] text-muted-foreground/50 text-left">Coordinates</span>
            <span className="font-mono text-[11px] tabular-nums text-foreground/70">
              {detail.asset.location[1].toFixed(6)} N / {detail.asset.location[0].toFixed(6)} E
            </span>
          </div>
        </div>
      )}

      {detail.zone && (
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <span className={cn("font-mono text-[10px] uppercase tracking-[2px]", statusTone[detail.zone.status])}>
              {detail.zone.kind}
            </span>
            <h2 className="font-sans text-[20px] font-medium text-foreground">{detail.zone.name}</h2>
          </div>
          <p className="font-sans text-[14px] leading-relaxed text-muted-foreground/80">{detail.zone.description}</p>
        </div>
      )}

      {detail.connection && (
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <span className={cn("font-mono text-[10px] uppercase tracking-[2px]", statusTone[detail.connection.status])}>
              {detail.connection.kind}
            </span>
            <h2 className="font-sans text-[20px] font-medium text-foreground">{detail.connection.kind.toUpperCase()} LINK</h2>
          </div>
          <p className="font-sans text-[14px] leading-relaxed text-muted-foreground/80">{detail.connection.description}</p>
        </div>
      )}

      {detail.event && (
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground/60">
              {detail.event.kind}
            </span>
            <h2 className="font-sans text-[20px] font-medium text-foreground">{detail.event.title}</h2>
          </div>
          <p className="font-sans text-[14px] leading-relaxed text-muted-foreground/80">{detail.event.detail}</p>
          <div className="flex flex-col gap-1 pt-2">
            <span className="font-mono text-[9px] uppercase tracking-[1px] text-muted-foreground/50">Registered</span>
            <span className="font-mono text-[11px] tabular-nums text-foreground/70">{formatTimestamp(detail.event.timestamp)}</span>
          </div>
        </div>
      )}

      {detail.track && (
        <div className="space-y-4">
          <h2 className="font-sans text-[20px] font-medium text-foreground">{detail.track.label}</h2>
          <p className="font-sans text-[14px] leading-relaxed text-muted-foreground/80">
            Movement path with {detail.track.points.length} checkpoints across the historical viewport.
          </p>
        </div>
      )}

      {(detail.relatedAssets.length > 0 || detail.relatedZones.length > 0) && (
        <div className="border-t border-border/30 pt-6 space-y-6">
          {detail.relatedAssets.length > 0 && <NamedCollection label="Related Assets" items={detail.relatedAssets.map((asset) => asset.name)} />}
          {detail.relatedZones.length > 0 && <NamedCollection label="Related Zones" items={detail.relatedZones.map((zone) => zone.name)} />}
        </div>
      )}
    </div>
  );

  const historyContent = isLoading ? (
    <p className="font-mono text-[11px] uppercase tracking-[1px] text-muted-foreground/50">Resolving history...</p>
  ) : detail?.relatedEvents.length ? (
    <div className="space-y-8">
      {detail.relatedEvents.map((event) => (
        <div key={event.id} className="group relative pl-4 border-l border-border/40 hover:border-primary/50 transition-colors">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50 group-hover:text-muted-foreground/70">
              {formatTimestamp(event.timestamp)}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[1px] text-muted-foreground/50">{event.severity}</span>
          </div>
          <h4 className="font-sans text-[14px] font-medium text-foreground/90 group-hover:text-foreground transition-colors">{event.title}</h4>
          <p className="mt-1 font-sans text-[13px] leading-relaxed text-muted-foreground/60">{event.detail}</p>
        </div>
      ))}
    </div>
  ) : (
    <p className="font-sans text-[13px] text-muted-foreground/50 py-12 text-center">Zero historical traces.</p>
  );

  const connectionsContent = isLoading ? (
    <p className="font-mono text-[11px] uppercase tracking-[1px] text-muted-foreground/50">Resolving topology...</p>
  ) : detail ? (
    <div className="space-y-8">
      {detail.relatedConnections.length > 0 && (
        <div className="space-y-6">
          {detail.relatedConnections.map((connection) => (
            <div key={connection.id} className="group flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground/50 group-hover:text-muted-foreground/60 transition-colors">{connection.kind}</span>
              <p className="font-sans text-[14px] text-foreground/80 group-hover:text-foreground transition-colors">{connection.description}</p>
            </div>
          ))}
        </div>
      )}

      {detail.relatedAssets.length > 0 && <NamedCollection label="Infrastructure" items={detail.relatedAssets.map((asset) => asset.name)} />}
      
      {!detail.relatedConnections.length && !detail.relatedAssets.length && !detail.relatedZones.length && (
        <p className="font-sans text-[13px] text-muted-foreground/50 py-12 text-center">Zero topological links.</p>
      )}
    </div>
  ) : (
    <p className="font-sans text-[13px] text-muted-foreground/50 py-12 text-center">Zero topological links.</p>
  );

  const trackContent = isLoading ? (
    <p className="font-mono text-[11px] uppercase tracking-[1px] text-muted-foreground/50">Resolving tracks...</p>
  ) : detail?.relatedTracks.length ? (
    <div className="space-y-10">
      {detail.relatedTracks.map((track) => (
        <div key={track.id} className="space-y-6">
          <div className="flex flex-col gap-1">
            <h4 className="font-sans text-[15px] font-medium text-foreground">{track.label}</h4>
            <span className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground/50">{track.points.length} checkpoints</span>
          </div>
          <div className="space-y-4">
            {track.points.map((point, index) => (
              <div key={`${track.id}-${point.timestamp}-${index}`} className="flex items-start gap-4">
                <span className="font-mono text-[9px] text-muted-foreground/50 pt-1">{(index + 1).toString().padStart(2, "0")}</span>
                <div className="flex flex-col flex-1">
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">{formatTimestamp(point.timestamp)}</span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50 mt-0.5">
                    {point.location[1].toFixed(5)} / {point.location[0].toFixed(5)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="font-sans text-[13px] text-muted-foreground/50 py-12 text-center">Zero movement traces.</p>
  );

  const tabContent = {
    overview: overviewContent,
    history: historyContent,
    connections: connectionsContent,
    track: trackContent,
  } satisfies Record<InspectorTab, ReactNode>;

  return (
    <aside className={cn("min-h-0 xl:z-20", open ? "block" : "hidden xl:hidden", className)}>
      <div className="flex h-full min-h-0 flex-col bg-[#080808]/95 backdrop-blur-2xl xl:border-l xl:border-border/40">
        <header className="flex flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground/50">Object Detail</span>
            <div className="flex items-center gap-4">
              {selection && (
                <button onClick={onFitSelection} className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground/50 hover:text-primary transition-colors">
                  [ Fit ]
                </button>
              )}
              <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors">
                <XMarkIcon className="size-5" />
              </button>
            </div>
          </div>
          
          <div className="flex flex-col gap-1">
            {selectionTitle ? (
              <h2 className="font-sans text-[22px] font-medium tracking-tight text-foreground" title={selectionTitle}>
                {selectionTitle}
              </h2>
            ) : (
              <h2 className="font-sans text-[20px] font-medium text-muted-foreground/50 italic">No Title</h2>
            )}
            <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground/50 tabular-nums">
              {selectionMeta}
            </span>
          </div>
        </header>

        <nav className="flex border-y border-border/30 bg-foreground/[0.02]">
          {tabLabels.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              disabled={tab.disabled}
              className={cn(
                "flex-1 py-3 font-mono text-[10px] uppercase tracking-[1.2px] transition-all",
                activeTab === tab.key 
                  ? "bg-foreground/5 text-foreground border-b-2 border-primary" 
                  : "text-muted-foreground/50 hover:text-muted-foreground/70",
                tab.disabled && "opacity-20 cursor-not-allowed"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="agent-scrollbar flex-1 overflow-y-auto p-6">
          {tabContent[activeTab]}
        </div>
      </div>
    </aside>
  );
}

function NamedCollection({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground/50">{label}</span>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="px-2 py-1 bg-foreground/[0.03] border border-border/20 font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground/70 hover:text-foreground hover:border-border/40 transition-colors cursor-default">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
