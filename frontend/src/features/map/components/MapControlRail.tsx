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
  searchQuery: string;
  searchResults: MapPlaceSearchResult[];
  searchResultsLoading: boolean;
  searchResultsError: string | null;
  onLayerToggle: (key: keyof MapLayerState) => void;
  onQueryModeChange: (mode: QueryMode) => void;
  onSearchQueryChange: (value: string) => void;
  onCompletePolygon: () => void;
  onClearPolygon: () => void;
  onUndoPolygonVertex: () => void;
  onSelectSearchResult: (result: MapPlaceSearchResult) => void;
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
  searchQuery,
  searchResults,
  searchResultsLoading,
  searchResultsError,
  onLayerToggle,
  onQueryModeChange,
  onSearchQueryChange,
  onCompletePolygon,
  onClearPolygon,
  onUndoPolygonVertex,
  onSelectSearchResult,
}: MapControlRailProps) {
  const [legendExpanded, setLegendExpanded] = useState(false);

  return (
    <aside className="flex min-h-0 flex-col gap-2 xl:h-full xl:overflow-y-auto">
      <section className="border border-white/10 bg-white/[0.03] p-3">
        <label htmlFor="map-search" className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/60">Search</label>
        <Input
          id="map-search"
          name="map-search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="FILTER OBJECTS / SEARCH PLACES"
          className="mt-2 h-9 font-mono text-[11px] uppercase tracking-[1.1px]"
        />
        <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Place Matches</p>
            {searchResultsLoading ? <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-white/30">Resolving</span> : null}
          </div>
          {searchResultsError ? <p className="font-sans text-[13px] leading-[1.5] text-white/50">{searchResultsError}</p> : null}
          <div className="max-h-[140px] space-y-2 overflow-y-auto xl:max-h-[180px]">
            {searchResults.length ? searchResults.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => onSelectSearchResult(result)}
                className="w-full border border-white/10 px-3 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.05]"
              >
                <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-white/40">{result.region ?? result.country ?? "PH"}</p>
                <p className="mt-1 font-sans text-[13px] text-white">{result.label}</p>
              </button>
            )) : searchQuery.trim().length >= 2 && !searchResultsLoading && !searchResultsError ? (
              <p className="font-sans text-[13px] leading-[1.5] text-white/50">No place matches returned by the live Geoapify search.</p>
            ) : (
              <p className="font-sans text-[12px] leading-[1.5] text-white/50">Type two characters to resolve places.</p>
            )}
          </div>
        </div>
      </section>

      <section className="border border-white/10 bg-white/[0.03] p-3">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Layers</p>
        <div className="mt-2 grid gap-1.5">
          {layerLabels.map((layer) => (
            <button
              key={layer.key}
              type="button"
              onClick={() => onLayerToggle(layer.key)}
              className={[
                "flex items-center justify-between border px-3 py-2.5 text-left transition-colors",
                layerState[layer.key] ? "border-white/20 bg-white/[0.05] text-white" : "border-white/10 text-white/50 hover:text-white",
              ].join(" ")}
            >
              <span className="font-mono text-[11px] uppercase tracking-[1.2px]">{layer.label}</span>
              <span className="font-sans text-[12px]">{layerState[layer.key] ? "ON" : "OFF"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Query Mode</p>
          <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">{queryLabel}</span>
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

        <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-white/70">
          <p className="font-sans text-[12px] leading-[1.5]">
            {queryMode === "bbox" ? "Viewport drives query." : "Click, drag, commit polygon."}
          </p>

          {queryMode === "polygon" ? (
            <div className="grid gap-2 pt-2">
              <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-white/30">
                Draft vertices: {polygonDraftCount}
              </span>
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
                  {isPolygonCommitted ? "Refresh Query" : "Commit Polygon"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={onClearPolygon} disabled={polygonDraftCount === 0 && !isPolygonCommitted}>
                  Clear
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Legend</p>
          <Button type="button" variant="outline" size="xs" onClick={() => setLegendExpanded((current) => !current)}>
            {legendExpanded ? "Hide" : "Show"}
          </Button>
        </div>
        {legendExpanded ? (
          <div className="mt-3 grid gap-2 text-white/70">
            {[
              ["Solid nodes", "Assets and operational sensors"],
              ["Hollow nodes", "Events revealed by the active time window"],
              ["Solid lines", "Infrastructure and network links"],
              ["Dashed lines", "Movement tracks inside the active time window"],
              ["Polygon overlay", "Committed spatial query geometry"],
            ].map(([label, detail]) => (
              <div key={label} className="border border-white/10 px-3 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-white/40">{label}</p>
                <p className="mt-1 font-sans text-[13px] leading-[1.5] text-white/70">{detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 font-sans text-[12px] leading-[1.5] text-white/50">Reveal semantics on demand.</p>
        )}
      </section>
    </aside>
  );
}
