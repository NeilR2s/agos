import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MapLayerState, MapPlaceSearchResult, QueryMode } from "../types";

type MapControlRailProps = {
  layerState: MapLayerState;
  queryMode: QueryMode;
  queryLabel: string;
  polygonDraftCount: number;
  isPolygonCommitted: boolean;
  isPolygonDirty: boolean;
  objectSearchQuery: string;
  placeSearchQuery: string;
  searchResults: MapPlaceSearchResult[];
  searchResultsLoading: boolean;
  onLayerToggle: (key: keyof MapLayerState) => void;
  onQueryModeChange: (mode: QueryMode) => void;
  onObjectSearchQueryChange: (value: string) => void;
  onPlaceSearchQueryChange: (value: string) => void;
  onCompletePolygon: () => void;
  onClearPolygon: () => void;
  onUndoPolygonVertex: () => void;
  onSelectSearchResult: (result: MapPlaceSearchResult) => void;
  onResetView: () => void;
};

const layerLabels: Array<{ key: keyof MapLayerState; label: string }> = [
  { key: "assets", label: "Assets" },
  { key: "zones", label: "Zones" },
  { key: "connections", label: "Connections" },
  { key: "tracks", label: "Tracks" },
  { key: "events", label: "Events" },
];

export function MapControlRail({
  layerState,
  queryMode,
  queryLabel,
  polygonDraftCount,
  isPolygonCommitted,
  isPolygonDirty,
  objectSearchQuery,
  placeSearchQuery,
  searchResults,
  searchResultsLoading,
  onLayerToggle,
  onQueryModeChange,
  onObjectSearchQueryChange,
  onPlaceSearchQueryChange,
  onCompletePolygon,
  onClearPolygon,
  onUndoPolygonVertex,
  onSelectSearchResult,
  onResetView,
}: MapControlRailProps) {
  const [legendExpanded, setLegendExpanded] = useState(false);

  return (
    <aside className="agent-scrollbar flex h-full flex-col gap-8 overflow-y-auto pr-2">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h3 className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground/60">Search</h3>
          <div className="space-y-2">
            <Input
              id="map-object-filter"
              name="map-object-filter"
              value={objectSearchQuery}
              onChange={(event) => onObjectSearchQueryChange(event.target.value)}
              placeholder="Filter objects..."
              className="h-8 border-x-0 border-t-0 border-b border-border/40 bg-transparent px-0 font-sans text-[13px] tracking-normal focus-visible:ring-0 focus-visible:border-primary/50"
            />
            <Input
              id="map-place-search"
              name="map-place-search"
              value={placeSearchQuery}
              onChange={(event) => onPlaceSearchQueryChange(event.target.value)}
              placeholder="Resolve geometry..."
              className="h-8 border-x-0 border-t-0 border-b border-border/40 bg-transparent px-0 font-sans text-[13px] tracking-normal focus-visible:ring-0 focus-visible:border-primary/50"
            />
          </div>
          
          <div className="mt-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground/40">Matches</span>
              {searchResultsLoading && <span className="animate-pulse font-mono text-[9px] uppercase tracking-[1px] text-primary/60">Resolving</span>}
            </div>
            
            <div className="space-y-1">
              {searchResults.length ? (
                searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => onSelectSearchResult(result)}
                    className="group flex w-full flex-col py-1.5 text-left transition-colors hover:text-primary"
                  >
                    <span className="font-mono text-[9px] uppercase tracking-[1px] text-muted-foreground/50 group-hover:text-primary/60">{result.region ?? result.country ?? "PH"}</span>
                    <span className="font-sans text-[13px] text-foreground/80 group-hover:text-foreground">{result.label}</span>
                  </button>
                ))
              ) : placeSearchQuery.trim().length >= 2 && !searchResultsLoading ? (
                <p className="font-sans text-[12px] text-muted-foreground/40 italic">Zero results.</p>
              ) : (
                <p className="font-sans text-[12px] text-muted-foreground/30">Buffer: 2 chars</p>
              )}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground/60">Layers</h3>
            <button onClick={onResetView} className="font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/40 hover:text-primary transition-colors">
              [ Reset View ]
            </button>
          </div>
          <div className="flex flex-col">
            {layerLabels.map((layer) => (
              <button
                key={layer.key}
                type="button"
                onClick={() => onLayerToggle(layer.key)}
                className="flex items-center justify-between py-2 text-left group"
              >
                <span className={layerState[layer.key] ? "font-mono text-[11px] uppercase tracking-[1.5px] text-foreground" : "font-mono text-[11px] uppercase tracking-[1.5px] text-muted-foreground/40 group-hover:text-muted-foreground/70"}>
                  {layer.label}
                </span>
                <div className={`h-1.5 w-1.5 rounded-full ${layerState[layer.key] ? "bg-primary shadow-[0_0_8px_rgba(var(--primary),0.6)]" : "bg-muted-foreground/20"}`} />
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground/60">Query Mode</h3>
            <span className="font-mono text-[9px] text-muted-foreground/40 tabular-nums">{queryLabel}</span>
          </div>
          <div className="flex gap-1 border border-border/40 p-0.5">
            {(["bbox", "polygon"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onQueryModeChange(mode)}
                className={`flex-1 py-1 font-mono text-[10px] uppercase tracking-[1.2px] transition-colors ${
                  queryMode === mode ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/10"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {queryMode === "polygon" && (
            <div className="mt-1 space-y-3">
              <div className="flex justify-between font-mono text-[9px] uppercase tracking-[1px] text-muted-foreground/50">
                <span>Vertices: {polygonDraftCount}</span>
                {isPolygonCommitted && <span>{isPolygonDirty ? "Modified" : "Synced"}</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="xs" onClick={onUndoPolygonVertex} disabled={polygonDraftCount === 0} className="h-7 text-[10px] tracking-tighter">
                  Undo Vertex
                </Button>
                <Button variant="outline" size="xs" onClick={onClearPolygon} disabled={polygonDraftCount === 0 && !isPolygonCommitted} className="h-7 text-[10px] tracking-tighter">
                  Clear
                </Button>
                <Button
                  variant="default"
                  size="xs"
                  onClick={onCompletePolygon}
                  disabled={polygonDraftCount < 3}
                  className="col-span-2 h-7 text-[10px] tracking-wider"
                >
                  {isPolygonCommitted ? (isPolygonDirty ? "Apply Changes" : "Refresh Query") : "Commit Geometry"}
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground/60">Legend</h3>
            <button onClick={() => setLegendExpanded(!legendExpanded)} className="font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/40 hover:text-primary transition-colors">
              {legendExpanded ? "[ Hide ]" : "[ Show ]"}
            </button>
          </div>
          {legendExpanded && (
            <div className="space-y-4 pt-1">
              {[
                ["●", "Operational assets"],
                ["○", "Contextual events"],
                ["—", "Topology links"],
                ["--", "Movement tracks"],
                ["■", "Active spatial query"],
              ].map(([symbol, detail]) => (
                <div key={detail} className="flex items-start gap-3">
                  <span className="w-4 font-mono text-[11px] text-primary/80">{symbol}</span>
                  <span className="font-sans text-[12px] leading-tight text-muted-foreground/70">{detail}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
