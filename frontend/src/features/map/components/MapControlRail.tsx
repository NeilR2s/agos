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
  focusedPlaceLabel: string | null;
  searchResults: MapPlaceSearchResult[];
  searchResultsLoading: boolean;
  searchResultsError: string | null;
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
  focusedPlaceLabel,
  searchResults,
  searchResultsLoading,
  searchResultsError,
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
    <aside className="scrollbar-hidden flex min-h-0 flex-col gap-2 xl:h-full xl:overflow-y-auto">
      <section className="rounded-2xl border border-border bg-card/70 p-2.5">
        <label htmlFor="map-object-filter" className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
          Search
        </label>
        <Input
          id="map-object-filter"
          name="map-object-filter"
          value={objectSearchQuery}
          onChange={(event) => onObjectSearchQueryChange(event.target.value)}
          placeholder="FILTER ASSETS / ZONES / EVENTS"
          className="mt-2 h-8 font-mono text-[10px] uppercase tracking-[1.1px]"
        />
        <Input
          id="map-place-search"
          name="map-place-search"
          value={placeSearchQuery}
          onChange={(event) => onPlaceSearchQueryChange(event.target.value)}
          placeholder="FIND PLACE / RECENTER"
          className="mt-2 h-8 font-mono text-[10px] uppercase tracking-[1.1px]"
        />
        {focusedPlaceLabel ? (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">Focused place: {focusedPlaceLabel}</p>
        ) : null}
        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Place Matches</p>
            {searchResultsLoading ? <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">Resolving</span> : null}
          </div>
          {searchResultsError ? <p className="font-sans text-[13px] leading-[1.5] text-muted-foreground">{searchResultsError}</p> : null}
          <div className="scrollbar-hidden max-h-[112px] space-y-1.5 overflow-y-auto xl:max-h-[124px]">
            {searchResults.length ? (
              searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => onSelectSearchResult(result)}
                  className="w-full rounded-xl border border-border px-2.5 py-2 text-left transition-colors hover:border-ring/60 hover:bg-accent/70"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">{result.region ?? result.country ?? "PH"}</p>
                  <p className="mt-1 font-sans text-[13px] text-foreground">{result.label}</p>
                </button>
              ))
            ) : placeSearchQuery.trim().length >= 2 && !searchResultsLoading && !searchResultsError ? (
              <p className="font-sans text-[13px] leading-[1.5] text-muted-foreground">No place matches returned by the live Geoapify search.</p>
            ) : (
              <p className="font-sans text-[12px] leading-[1.5] text-muted-foreground">Type two characters to resolve places without mutating the active query geometry.</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card/70 p-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Layers</p>
          <Button type="button" variant="outline" size="xs" onClick={onResetView}>
            Home
          </Button>
        </div>
        <div className="mt-2 grid gap-1">
          {layerLabels.map((layer) => (
            <button
              key={layer.key}
              type="button"
              onClick={() => onLayerToggle(layer.key)}
              className={[
                "flex items-center justify-between rounded-xl border px-2.5 py-2 text-left transition-colors",
                layerState[layer.key] ? "border-ring/60 bg-accent text-foreground" : "border-border text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <span className="font-mono text-[11px] uppercase tracking-[1.2px]">{layer.label}</span>
              <span className="font-sans text-[12px]">{layerState[layer.key] ? "ON" : "OFF"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card/70 p-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Query Mode</p>
          <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/75">{queryLabel}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {(["bbox", "polygon"] as const).map((mode) => (
            <Button
              key={mode}
              type="button"
              variant={queryMode === mode ? "default" : "outline"}
              size="sm"
              onClick={() => onQueryModeChange(mode)}
            >
              {mode.toUpperCase()}
            </Button>
          ))}
        </div>

        <div className="mt-2 space-y-1.5 border-t border-border pt-2 text-muted-foreground">
          <p className="font-sans text-[12px] leading-[1.5]">{queryMode === "bbox" ? "Viewport drives query." : "Draft geometry on-map, then apply it to refresh results."}</p>

          {queryMode === "polygon" ? (
            <div className="grid gap-2 pt-2">
              <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">Draft vertices: {polygonDraftCount}</span>
              {isPolygonCommitted ? (
                <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">Committed query: {isPolygonDirty ? "Draft changed" : "In sync"}</span>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onUndoPolygonVertex} disabled={polygonDraftCount === 0}>
                  Undo Vertex
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={onCompletePolygon}
                  disabled={polygonDraftCount < 3}
                >
                  {isPolygonCommitted ? (isPolygonDirty ? "Apply Draft" : "Refresh Query") : "Commit Polygon"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={onClearPolygon} disabled={polygonDraftCount === 0 && !isPolygonCommitted}>
                  Clear
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card/70 p-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Legend</p>
          <Button type="button" variant="outline" size="xs" onClick={() => setLegendExpanded((current) => !current)}>
            {legendExpanded ? "Hide" : "Show"}
          </Button>
        </div>
        {legendExpanded ? (
          <div className="mt-2 grid gap-1.5 text-muted-foreground">
            {[
              ["Solid nodes", "Assets and operational sensors"],
              ["Hollow nodes", "Events emphasized by the active time window"],
              ["Solid lines", "Infrastructure and network links"],
              ["Dashed lines", "Movement tracks inside the active time window"],
              ["Polygon overlay", "Committed spatial query geometry"],
              ["Handle vertices", "Editable polygon draft points before apply"],
            ].map(([label, detail]) => (
            <div key={label} className="rounded-xl border border-border px-2.5 py-2">
                <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">{label}</p>
                <p className="mt-1 font-sans text-[13px] leading-[1.5] text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 font-sans text-[12px] leading-[1.5] text-muted-foreground">Reveal semantics on demand.</p>
        )}
      </section>
    </aside>
  );
}
