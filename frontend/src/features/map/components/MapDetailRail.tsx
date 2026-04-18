import { Button } from "@/components/ui/button";
import type { MapAssetPoint, MapConnectionLine, MapEvent, MapSelection, MapTrack, MapZonePolygon } from "../types";

type MapDetailRailProps = {
  selection: MapSelection;
  assets: MapAssetPoint[];
  zones: MapZonePolygon[];
  connections: MapConnectionLine[];
  tracks: MapTrack[];
  events: MapEvent[];
  onFitSelection: () => void;
};

const statusTone = {
  nominal: "text-white/60",
  watch: "text-white/80",
  critical: "text-white",
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

export function MapDetailRail({ selection, assets, zones, connections, tracks, events, onFitSelection }: MapDetailRailProps) {
  const selectedAsset = selection?.type === "asset" ? assets.find((asset) => asset.id === selection.id) ?? null : null;
  const selectedZone = selection?.type === "zone" ? zones.find((zone) => zone.id === selection.id) ?? null : null;
  const selectedConnection = selection?.type === "connection" ? connections.find((connection) => connection.id === selection.id) ?? null : null;
  const selectedEvent = selection?.type === "event" ? events.find((event) => event.id === selection.id) ?? null : null;
  const selectedTrack = selection?.type === "track" ? tracks.find((track) => track.id === selection.id) ?? null : null;

  const relatedConnections = selectedAsset
    ? connections.filter((connection) => connection.sourceId === selectedAsset.id || connection.targetId === selectedAsset.id)
    : [];
  const relatedEvents = selectedAsset
    ? events.filter((event) => event.assetId === selectedAsset.id)
    : selectedZone
      ? events.filter((event) => event.zoneId === selectedZone.id)
      : [];
  const relatedTrack = selectedAsset ? tracks.find((track) => track.assetId === selectedAsset.id) ?? null : null;

  return (
    <aside className="flex flex-col gap-4">
      <section className="border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Selected Object</p>
          {selection ? <Button type="button" size="sm" variant="outline" onClick={onFitSelection}>Fit</Button> : null}
        </div>
        {!selection ? (
          <p className="mt-3 font-sans text-[14px] leading-[1.6] text-white/60">
            Select an asset, zone, connection, event, or track on the map to inspect its operational context.
          </p>
        ) : null}

        {selectedAsset ? (
          <div className="mt-3 space-y-3">
            <h2 className="font-sans text-[22px] text-white">{selectedAsset.name}</h2>
            <p className={["font-mono text-[10px] uppercase tracking-[1.2px]", statusTone[selectedAsset.status]].join(" ")}>{selectedAsset.status}</p>
            <p className="font-sans text-[14px] leading-[1.6] text-white/70">{selectedAsset.description}</p>
            <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-white/40">
              {selectedAsset.location[1].toFixed(4)} / {selectedAsset.location[0].toFixed(4)}
            </p>
          </div>
        ) : null}

        {selectedZone ? (
          <div className="mt-3 space-y-3">
            <h2 className="font-sans text-[22px] text-white">{selectedZone.name}</h2>
            <p className={["font-mono text-[10px] uppercase tracking-[1.2px]", statusTone[selectedZone.status]].join(" ")}>{selectedZone.kind}</p>
            <p className="font-sans text-[14px] leading-[1.6] text-white/70">{selectedZone.description}</p>
          </div>
        ) : null}

        {selectedConnection ? (
          <div className="mt-3 space-y-3">
            <h2 className="font-sans text-[22px] text-white">{selectedConnection.kind.toUpperCase()} LINK</h2>
            <p className={["font-mono text-[10px] uppercase tracking-[1.2px]", statusTone[selectedConnection.status]].join(" ")}>{selectedConnection.status}</p>
            <p className="font-sans text-[14px] leading-[1.6] text-white/70">{selectedConnection.description}</p>
          </div>
        ) : null}

        {selectedEvent ? (
          <div className="mt-3 space-y-3">
            <h2 className="font-sans text-[22px] text-white">{selectedEvent.title}</h2>
            <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-white/60">{selectedEvent.kind}</p>
            <p className="font-sans text-[14px] leading-[1.6] text-white/70">{selectedEvent.detail}</p>
            <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-white/40">{formatTimestamp(selectedEvent.timestamp)}</p>
          </div>
        ) : null}

        {selectedTrack ? (
          <div className="mt-3 space-y-3">
            <h2 className="font-sans text-[22px] text-white">{selectedTrack.label}</h2>
            <p className="font-sans text-[14px] leading-[1.6] text-white/70">Movement path with {selectedTrack.points.length} checkpoints.</p>
          </div>
        ) : null}
      </section>

      <section className="border border-white/10 bg-white/[0.03] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Connections</p>
        <div className="mt-3 space-y-3">
          {relatedConnections.length ? relatedConnections.map((connection) => (
            <div key={connection.id} className="border border-white/10 px-3 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-white/50">{connection.kind}</p>
              <p className="mt-1 font-sans text-[14px] text-white">{connection.description}</p>
            </div>
          )) : <p className="font-sans text-[14px] leading-[1.6] text-white/60">No connected infrastructure in the current selection.</p>}
        </div>
      </section>

      <section className="border border-white/10 bg-white/[0.03] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Event Stream</p>
        <div className="mt-3 space-y-3">
          {relatedEvents.length ? relatedEvents.map((event) => (
            <div key={event.id} className="border border-white/10 px-3 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-white/50">{formatTimestamp(event.timestamp)}</p>
              <p className="mt-1 font-sans text-[14px] text-white">{event.title}</p>
              <p className="mt-1 font-sans text-[13px] leading-[1.5] text-white/60">{event.detail}</p>
            </div>
          )) : <p className="font-sans text-[14px] leading-[1.6] text-white/60">No recent events linked to the current object.</p>}
        </div>
      </section>

      <section className="border border-white/10 bg-white/[0.03] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Track</p>
        <p className="mt-3 font-sans text-[14px] leading-[1.6] text-white/60">
          {relatedTrack ? `${relatedTrack.label} is attached to the selected asset with ${relatedTrack.points.length} checkpoints.` : "No track is attached to the current object."}
        </p>
      </section>
    </aside>
  );
}
