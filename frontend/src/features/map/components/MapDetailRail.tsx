import { type ReactNode, useMemo, useState } from "react";

import { XMarkIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
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
  const selectionMeta = selection ? `${selection.type.toUpperCase()} / ${truncateMiddle(selection.id)}` : "No object selected.";

  const tabAvailability = {
    overview: true,
    history: Boolean(detail?.relatedEvents.length),
    connections: Boolean(detail?.relatedConnections.length || detail?.relatedAssets.length || detail?.relatedZones.length),
    track: Boolean(detail?.track || detail?.relatedTracks.length),
  };

  const tabLabels: Array<{ key: InspectorTab; label: string; disabled: boolean }> = [
    { key: "overview", label: "Overview", disabled: !tabAvailability.overview },
    { key: "history", label: "History", disabled: !tabAvailability.history },
    { key: "connections", label: "Links", disabled: !tabAvailability.connections },
    { key: "track", label: "Track", disabled: !tabAvailability.track },
  ];

  const overviewContent = isLoading ? (
    <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">Loading object history...</p>
  ) : error ? (
    <p className="font-sans text-[14px] leading-[1.6] text-destructive">{error}</p>
  ) : !selection ? (
    <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">Select an asset, zone, connection, event, or track on the map to inspect its operational context.</p>
  ) : !detail || !primary ? (
    <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">This object is no longer available in the current map dataset.</p>
  ) : (
    <div className="space-y-4">
      {detail.asset ? (
        <div className="space-y-3">
          <h2 className="font-sans text-[22px] text-foreground">{detail.asset.name}</h2>
          <p className={cn("font-mono text-[10px] uppercase tracking-[1.2px]", statusTone[detail.asset.status])}>{detail.asset.status}</p>
          <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">{detail.asset.description}</p>
          <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">
            {detail.asset.location[1].toFixed(4)} / {detail.asset.location[0].toFixed(4)}
          </p>
        </div>
      ) : null}

      {detail.zone ? (
        <div className="space-y-3">
          <h2 className="font-sans text-[22px] text-foreground">{detail.zone.name}</h2>
          <p className={cn("font-mono text-[10px] uppercase tracking-[1.2px]", statusTone[detail.zone.status])}>{detail.zone.kind}</p>
          <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">{detail.zone.description}</p>
        </div>
      ) : null}

      {detail.connection ? (
        <div className="space-y-3">
          <h2 className="font-sans text-[22px] text-foreground">{detail.connection.kind.toUpperCase()} LINK</h2>
          <p className={cn("font-mono text-[10px] uppercase tracking-[1.2px]", statusTone[detail.connection.status])}>{detail.connection.status}</p>
          <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">{detail.connection.description}</p>
        </div>
      ) : null}

      {detail.event ? (
        <div className="space-y-3">
          <h2 className="font-sans text-[22px] text-foreground">{detail.event.title}</h2>
          <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">{detail.event.kind}</p>
          <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">{detail.event.detail}</p>
          <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">{formatTimestamp(detail.event.timestamp)}</p>
        </div>
      ) : null}

      {detail.track ? (
        <div className="space-y-3">
          <h2 className="font-sans text-[22px] text-foreground">{detail.track.label}</h2>
          <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">Movement path with {detail.track.points.length} checkpoints across the full track history.</p>
        </div>
      ) : null}

      {detail.relatedAssets.length ? <NamedCollection label="Related Assets" items={detail.relatedAssets.map((asset) => asset.name)} /> : null}
      {detail.relatedZones.length ? <NamedCollection label="Related Zones" items={detail.relatedZones.map((zone) => zone.name)} /> : null}
    </div>
  );

  const historyContent = isLoading ? (
    <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">Loading event history...</p>
  ) : error ? (
    <p className="font-sans text-[14px] leading-[1.6] text-destructive">{error}</p>
  ) : detail?.relatedEvents.length ? (
    <div className="space-y-3">
      {detail.relatedEvents.map((event) => (
        <div key={event.id} className="rounded-xl border border-border px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">{formatTimestamp(event.timestamp)}</p>
            <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/70">{event.severity}</p>
          </div>
          <p className="mt-1 font-sans text-[14px] text-foreground">{event.title}</p>
          <p className="mt-1 font-sans text-[13px] leading-[1.5] text-muted-foreground">{event.detail}</p>
        </div>
      ))}
    </div>
  ) : (
    <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">No related event history is available for the current object.</p>
  );

  const connectionsContent = isLoading ? (
    <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">Loading related network context...</p>
  ) : error ? (
    <p className="font-sans text-[14px] leading-[1.6] text-destructive">{error}</p>
  ) : detail ? (
    <div className="space-y-4">
      {detail.relatedConnections.length ? (
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/70">Connections</p>
          {detail.relatedConnections.map((connection) => (
            <div key={connection.id} className="rounded-xl border border-border px-3 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">{connection.kind}</p>
              <p className="mt-1 font-sans text-[14px] text-foreground">{connection.description}</p>
            </div>
          ))}
        </div>
      ) : null}

      {detail.relatedAssets.length ? <NamedCollection label="Assets" items={detail.relatedAssets.map((asset) => asset.name)} /> : null}
      {detail.relatedZones.length ? <NamedCollection label="Zones" items={detail.relatedZones.map((zone) => zone.name)} /> : null}

      {!detail.relatedConnections.length && !detail.relatedAssets.length && !detail.relatedZones.length ? (
        <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">No related infrastructure is available for the current selection.</p>
      ) : null}
    </div>
  ) : (
    <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">No related infrastructure is available for the current selection.</p>
  );

  const trackContent = isLoading ? (
    <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">Loading track history...</p>
  ) : error ? (
    <p className="font-sans text-[14px] leading-[1.6] text-destructive">{error}</p>
  ) : detail?.relatedTracks.length ? (
    <div className="space-y-3">
      {detail.relatedTracks.map((track) => (
        <div key={track.id} className="rounded-xl border border-border px-3 py-3">
          <p className="font-sans text-[14px] text-foreground">{track.label}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/70">{track.points.length} checkpoints</p>
          <div className="mt-3 space-y-2">
            {track.points.map((point, index) => (
              <div key={`${track.id}-${point.timestamp}-${index}`} className="rounded-xl border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">{formatTimestamp(point.timestamp)}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/60">{index + 1}/{track.points.length}</span>
                </div>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/70">
                  {point.location[1].toFixed(4)} / {point.location[0].toFixed(4)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">No track history is attached to the current object.</p>
  );

  const tabContent = {
    overview: overviewContent,
    history: historyContent,
    connections: connectionsContent,
    track: trackContent,
  } satisfies Record<InspectorTab, ReactNode>;

  return (
    <aside
      className={cn(
        "min-h-0 xl:z-20",
        open ? "block" : "hidden xl:hidden",
        className
      )}
    >
      <div className="flex h-full min-h-0 flex-col gap-2 bg-background/90 p-2.5 backdrop-blur-xl xl:border-border">
        <section className="rounded-2xl border border-border bg-card/80 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Selected Object</p>
            <div className="flex items-center gap-2">
              {selection ? <Button type="button" size="sm" variant="outline" onClick={onFitSelection}>Fit</Button> : null}
              <Button type="button" size="icon-sm" variant="outline" onClick={onClose} aria-label="Close inspector">
                <XMarkIcon className="size-4" />
              </Button>
            </div>
          </div>
          {selectionTitle ? <p className="mt-3 truncate font-sans text-[16px] text-foreground" title={selectionTitle}>{selectionTitle}</p> : null}
          <p className="mt-1 truncate font-sans text-[12px] leading-[1.5] text-muted-foreground" title={selection ? selection.id : undefined}>
            {selectionMeta}
          </p>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card/80">
          <div className="grid grid-cols-4 border-b border-border">
            {tabLabels.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                disabled={tab.disabled}
                className={cn(
                  "border-r border-border px-2 py-2.5 font-mono text-[10px] uppercase tracking-[1.1px] transition-colors last:border-r-0",
                  activeTab === tab.key ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                  tab.disabled && "cursor-not-allowed text-muted-foreground/40 hover:bg-transparent hover:text-muted-foreground/40"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="agent-scrollbar min-h-[240px] flex-1 overflow-y-auto p-3 xl:min-h-0">
            {tabContent[activeTab]}
          </div>
        </section>
      </div>
    </aside>
  );
}

function NamedCollection({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-full border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
