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
  return (
    <aside className="flex flex-col gap-4">
      <section className="border border-white/10 bg-white/[0.03] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Search</p>
        <Input
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="FILTER OBJECTS / SEARCH PLACES"
          className="mt-3 font-mono text-[12px] uppercase tracking-[1.2px]"
        />
        <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Place Matches</p>
            {searchResultsLoading ? <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-white/30">Resolving</span> : null}
          </div>
          {searchResultsError ? <p className="font-sans text-[13px] leading-[1.5] text-white/50">{searchResultsError}</p> : null}
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
            <p className="font-sans text-[13px] leading-[1.5] text-white/50">Type at least two characters to resolve live Philippine locations.</p>
          )}
        </div>
      </section>

      <section className="border border-white/10 bg-white/[0.03] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Layers</p>
        <div className="mt-3 grid gap-2">
          {layerLabels.map((layer) => (
            <button
              key={layer.key}
              type="button"
              onClick={() => onLayerToggle(layer.key)}
              className={[
                "flex items-center justify-between border px-3 py-3 text-left transition-colors",
                layerState[layer.key] ? "border-white/20 bg-white/[0.05] text-white" : "border-white/10 text-white/50 hover:text-white",
              ].join(" ")}
            >
              <span className="font-mono text-[11px] uppercase tracking-[1.2px]">{layer.label}</span>
              <span className="font-sans text-[12px]">{layerState[layer.key] ? "ON" : "OFF"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Query Mode</p>
          <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">{queryLabel}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
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

        <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-white/70">
          <p className="font-sans text-[14px] leading-[1.5]">
            {queryMode === "bbox"
              ? "The backend map query uses the current viewport bounds and returns only intersecting features."
              : "Click on the map to place vertices. Drag handles to edit the polygon and commit it to run the backend intersection query."}
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

      <section className="border border-white/10 bg-white/[0.03] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Legend</p>
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
      </section>
    </aside>
  );
}
