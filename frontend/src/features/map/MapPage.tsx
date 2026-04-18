import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { mapApi } from "@/api/backend/client";
import { Badge } from "@/components/ui/badge";
import { MapCanvas } from "./components/MapCanvas";
import { MapControlRail } from "./components/MapControlRail";
import { MapDetailRail } from "./components/MapDetailRail";
import { MapTimeline } from "./components/MapTimeline";
import {
  closePolygon,
  getBoundsFromPolygon,
  getTrackCoordinatesUpToIndex,
  isEventVisibleAtIndex,
} from "./lib/geo";
import type { MapBounds, MapFeatureCollection, MapFocusTarget, MapLayerState, MapPlaceSearchResult, MapSelection, QueryMode } from "./types";

const initialLayerState: MapLayerState = {
  assets: true,
  zones: true,
  connections: true,
  tracks: true,
  events: true,
};

const initialBounds: MapBounds = {
  west: 116,
  south: 8,
  east: 126,
  north: 19,
};

const emptyFeatureCollection: MapFeatureCollection = {
  assets: [],
  zones: [],
  connections: [],
  tracks: [],
  events: [],
  timeline: ["2026-04-18T08:00:00Z"],
};

const getRoundedBoundsKey = (bounds: MapBounds) => ({
  west: Number(bounds.west.toFixed(4)),
  south: Number(bounds.south.toFixed(4)),
  east: Number(bounds.east.toFixed(4)),
  north: Number(bounds.north.toFixed(4)),
});

const truncateMiddle = (value: string, edge = 10) => {
  if (value.length <= edge * 2 + 3) {
    return value;
  }

  return `${value.slice(0, edge)}...${value.slice(-edge)}`;
};

export function MapPage() {
  const [layerState, setLayerState] = useState<MapLayerState>(initialLayerState);
  const [selection, setSelection] = useState<MapSelection>(null);
  const [queryMode, setQueryMode] = useState<QueryMode>("bbox");
  const [mapBounds, setMapBounds] = useState<MapBounds>(initialBounds);
  const [polygonDraft, setPolygonDraft] = useState<[number, number][]>([]);
  const [polygonQuery, setPolygonQuery] = useState<[number, number][] | null>(null);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [timeWindow, setTimeWindow] = useState(5);
  const [playing, setPlaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);
  const [dismissedInspectorSelectionKey, setDismissedInspectorSelectionKey] = useState<string | null>(null);

  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const roundedBounds = useMemo(() => getRoundedBoundsKey(mapBounds), [mapBounds]);

  const featureQuery = useQuery({
    queryKey: ["map-features", queryMode, roundedBounds, polygonQuery, deferredSearchQuery],
    queryFn: async () => {
      if (queryMode === "polygon" && polygonQuery) {
        return mapApi.queryPolygon(polygonQuery, deferredSearchQuery);
      }

      return mapApi.getFeatures(roundedBounds, deferredSearchQuery);
    },
    enabled: queryMode === "bbox" || Boolean(polygonQuery),
    placeholderData: (previous) => previous,
  });

  const placeSearchQuery = useQuery({
    queryKey: ["map-place-search", deferredSearchQuery],
    queryFn: () => mapApi.searchPlaces(deferredSearchQuery, 5),
    enabled: deferredSearchQuery.length >= 2,
    staleTime: 60_000,
  });

  const featureData = featureQuery.data ?? emptyFeatureCollection;
  const timeline = featureData.timeline.length ? featureData.timeline : emptyFeatureCollection.timeline;
  const activeTimelineIndex = Math.min(timelineIndex, Math.max(timeline.length - 1, 0));
  const activeTimeWindow = Math.max(1, Math.min(timeWindow, timeline.length));

  useEffect(() => {
    if (!playing || timeline.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setTimelineIndex((current) => (Math.min(current, timeline.length - 1) + 1) % timeline.length);
    }, 1600);

    return () => window.clearInterval(interval);
  }, [playing, timeline.length]);

  const tracks = useMemo(
    () => featureData.tracks.map((track) => ({
      ...track,
      visibleCoordinates: getTrackCoordinatesUpToIndex(track, timeline, activeTimelineIndex, activeTimeWindow),
    })),
    [activeTimeWindow, activeTimelineIndex, featureData.tracks, timeline]
  );

  const activeEvents = useMemo(
    () => featureData.events.filter((event) => isEventVisibleAtIndex(event, timeline, activeTimelineIndex, activeTimeWindow)),
    [activeTimeWindow, activeTimelineIndex, featureData.events, timeline]
  );

  const visibleSelection = useMemo(() => {
    if (!selection) {
      return null;
    }
    const availableIds = {
      asset: new Set(featureData.assets.map((asset) => asset.id)),
      zone: new Set(featureData.zones.map((zone) => zone.id)),
      connection: new Set(featureData.connections.map((connection) => connection.id)),
      event: new Set(activeEvents.map((event) => event.id)),
      track: new Set(tracks.map((track) => track.id)),
    };

    return availableIds[selection.type].has(selection.id) ? selection : null;
  }, [activeEvents, featureData.assets, featureData.connections, featureData.zones, selection, tracks]);

  const selectionSummaryLabel = useMemo(() => {
    if (!visibleSelection) {
      return "None";
    }

    if (visibleSelection.type === "asset") {
      return featureData.assets.find((item) => item.id === visibleSelection.id)?.name ?? truncateMiddle(visibleSelection.id);
    }

    if (visibleSelection.type === "zone") {
      return featureData.zones.find((item) => item.id === visibleSelection.id)?.name ?? truncateMiddle(visibleSelection.id);
    }

    if (visibleSelection.type === "connection") {
      return featureData.connections.find((item) => item.id === visibleSelection.id)?.description ?? truncateMiddle(visibleSelection.id);
    }

    if (visibleSelection.type === "event") {
      return activeEvents.find((item) => item.id === visibleSelection.id)?.title ?? truncateMiddle(visibleSelection.id);
    }

    return tracks.find((item) => item.id === visibleSelection.id)?.label ?? truncateMiddle(visibleSelection.id);
  }, [activeEvents, featureData.assets, featureData.connections, featureData.zones, tracks, visibleSelection]);

  const activeSelectionKey = visibleSelection ? `${visibleSelection.type}:${visibleSelection.id}` : null;
  const inspectorOpen = Boolean(activeSelectionKey) && dismissedInspectorSelectionKey !== activeSelectionKey;

  const summary = useMemo(() => {
    const activePolygon = polygonQuery ? getBoundsFromPolygon(polygonQuery) : null;
    return {
      queryLabel: activePolygon
        ? `${activePolygon.west.toFixed(2)} / ${activePolygon.east.toFixed(2)}`
        : `${roundedBounds.west.toFixed(2)} / ${roundedBounds.east.toFixed(2)}`,
      activeTimestamp: timeline[activeTimelineIndex] ?? timeline[0],
    };
  }, [activeTimelineIndex, polygonQuery, roundedBounds, timeline]);

  const handleLayerToggle = (key: keyof MapLayerState) => {
    setLayerState((current) => ({ ...current, [key]: !current[key] }));
  };

  const handleQueryModeChange = (mode: QueryMode) => {
    setQueryMode(mode);
    if (mode === "bbox") {
      setPolygonDraft([]);
      setPolygonQuery(null);
    }
  };

  const handleCompletePolygon = () => {
    if (polygonDraft.length < 3) {
      return;
    }
    setPolygonQuery(closePolygon(polygonDraft));
  };

  const handleUndoPolygonVertex = () => {
    setPolygonDraft((current) => {
      const next = current.slice(0, -1);
      setPolygonQuery(next.length >= 3 && polygonQuery ? closePolygon(next) : polygonQuery ? null : polygonQuery);
      return next;
    });
  };

  const handleClearPolygon = () => {
    setPolygonDraft([]);
    setPolygonQuery(null);
  };

  const handleUpdatePolygonVertex = (index: number, coordinate: [number, number]) => {
    setPolygonDraft((current) => {
      const next = current.map((vertex, vertexIndex) => (vertexIndex === index ? coordinate : vertex));
      if (polygonQuery) {
        setPolygonQuery(closePolygon(next));
      }
      return next;
    });
  };

  const handleAddPolygonVertex = (coordinate: [number, number]) => {
    setPolygonDraft((current) => {
      const next = [...current, coordinate];
      if (polygonQuery) {
        setPolygonQuery(closePolygon(next));
      }
      return next;
    });
  };

  const handleSelectSearchResult = (result: MapPlaceSearchResult) => {
    setFocusTarget({
      key: `place-${result.id}-${Date.now()}`,
      geometry: { type: "point", coordinates: result.coordinates },
    });
    setSelection(null);
  };

  const handleFitSelection = () => {
    if (!visibleSelection) {
      return;
    }

    if (visibleSelection.type === "asset") {
      const asset = featureData.assets.find((item) => item.id === visibleSelection.id);
      if (asset) {
        setFocusTarget({ key: `selection-${visibleSelection.id}-${Date.now()}`, geometry: { type: "point", coordinates: asset.location } });
      }
      return;
    }

    if (visibleSelection.type === "event") {
      const event = activeEvents.find((item) => item.id === visibleSelection.id);
      if (event) {
        setFocusTarget({ key: `selection-${visibleSelection.id}-${Date.now()}`, geometry: { type: "point", coordinates: event.location } });
      }
      return;
    }

    if (visibleSelection.type === "zone") {
      const zone = featureData.zones.find((item) => item.id === visibleSelection.id);
      if (zone) {
        setFocusTarget({ key: `selection-${visibleSelection.id}-${Date.now()}`, geometry: { type: "polygon", coordinates: zone.coordinates } });
      }
      return;
    }

    if (visibleSelection.type === "connection") {
      const connection = featureData.connections.find((item) => item.id === visibleSelection.id);
      if (connection) {
        setFocusTarget({ key: `selection-${visibleSelection.id}-${Date.now()}`, geometry: { type: "line", coordinates: connection.coordinates } });
      }
      return;
    }

    const track = tracks.find((item) => item.id === visibleSelection.id);
    if (track?.visibleCoordinates.length) {
      setFocusTarget({ key: `selection-${visibleSelection.id}-${Date.now()}`, geometry: { type: "line", coordinates: track.visibleCoordinates } });
    }
  };

  const handleCloseInspector = () => {
    if (activeSelectionKey) {
      setDismissedInspectorSelectionKey(activeSelectionKey);
    }
  };

  return (
    <div className="min-h-dvh bg-background px-3 py-3 text-white lg:px-4 lg:py-4">
      <div className="mx-auto flex max-w-[1920px] flex-col gap-2.5">
        <section className="border border-white/10 bg-white/[0.03] px-4 py-3 lg:px-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              <Badge variant="outline" className="rounded-none border-white/20 px-3 py-1 font-mono text-[10px] uppercase tracking-[1px] text-white/50">
                AGOS MAP APPLICATION / TEMPORAL GEOSPATIAL ANALYSIS
              </Badge>
              <h1 className="mt-3 font-mono text-[32px] uppercase leading-[0.98] tracking-[-0.04em] text-white md:text-[44px] xl:text-[48px]">
                MAP / NETWORK / MOVEMENT / ACTION
              </h1>
              <div className="mt-3 flex min-w-0 flex-col gap-2 border-t border-white/10 pt-3 xl:flex-row xl:flex-wrap xl:items-center xl:gap-5">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Query</p>
                  <p className="mt-1 font-sans text-[14px] text-white">{queryMode === "bbox" ? "Viewport" : "Polygon"}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Time</p>
                  <p className="mt-1 truncate font-sans text-[14px] text-white">{summary.activeTimestamp.replace("T", " ").replace("Z", " UTC")}</p>
                </div>
                <div className="min-w-0 xl:max-w-[360px]">
                  <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Selection</p>
                  <p className="mt-1 truncate font-sans text-[14px] text-white">{selectionSummaryLabel}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Mode</p>
                  <p className="mt-1 font-sans text-[14px] text-white">{playing ? "Playback" : "Static review"}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Window</p>
                  <p className="mt-1 truncate font-sans text-[14px] text-white/70">{summary.queryLabel}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[340px]">
              {[
                ["Assets", featureData.assets.length],
                ["Zones", featureData.zones.length],
                ["Events", activeEvents.length],
                ["Tracks", tracks.filter((track) => track.visibleCoordinates.length >= 2).length],
              ].map(([label, value]) => (
                <div key={label} className="border border-white/10 px-3 py-2.5">
                  <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">{label}</p>
                  <p className="mt-1 font-sans text-[22px] text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-2.5 xl:grid-cols-[188px_minmax(0,1fr)] xl:items-start">
          <div className="xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-hidden">
            <MapControlRail
              layerState={layerState}
              queryMode={queryMode}
              queryLabel={summary.queryLabel}
              polygonDraftCount={polygonDraft.length}
              isPolygonCommitted={Boolean(polygonQuery)}
              searchQuery={searchQuery}
              searchResults={placeSearchQuery.data ?? []}
              searchResultsLoading={placeSearchQuery.isFetching}
              searchResultsError={placeSearchQuery.isError ? (placeSearchQuery.error instanceof Error ? placeSearchQuery.error.message : "Place search failed") : null}
              onLayerToggle={handleLayerToggle}
              onQueryModeChange={handleQueryModeChange}
              onSearchQueryChange={setSearchQuery}
              onCompletePolygon={handleCompletePolygon}
              onClearPolygon={handleClearPolygon}
              onUndoPolygonVertex={handleUndoPolygonVertex}
              onSelectSearchResult={handleSelectSearchResult}
            />
          </div>

          <div className="relative flex min-w-0 flex-col gap-2.5">
            {featureQuery.isError ? (
              <section className="border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="font-sans text-[14px] leading-[1.6] text-white/55">
                  {featureQuery.error instanceof Error ? featureQuery.error.message : "Map data request failed."}
                </p>
              </section>
            ) : null}

            <div className="relative flex min-w-0 flex-col gap-0 overflow-hidden border border-white/10 bg-white/[0.03]">
              <MapCanvas
                assets={featureData.assets}
                zones={featureData.zones}
                connections={featureData.connections}
                tracks={tracks}
                events={activeEvents}
                layerState={layerState}
                selection={visibleSelection}
                queryMode={queryMode}
                polygonDraft={polygonDraft}
                polygonQuery={polygonQuery}
                focusTarget={focusTarget}
                onSelectionChange={(nextSelection) => {
                  setSelection(nextSelection);
                  if (nextSelection) {
                    setDismissedInspectorSelectionKey(null);
                  }
                }}
                onBoundsChange={setMapBounds}
                onAddPolygonVertex={handleAddPolygonVertex}
                onUpdatePolygonVertex={handleUpdatePolygonVertex}
              />

              <MapTimeline
                timestamps={timeline}
                activeIndex={activeTimelineIndex}
                playing={playing}
                windowSize={activeTimeWindow}
                onIndexChange={setTimelineIndex}
                onTogglePlayback={() => setPlaying((current) => !current)}
                onWindowSizeChange={setTimeWindow}
              />

              <MapDetailRail
                key={visibleSelection ? `${visibleSelection.type}:${visibleSelection.id}` : "none"}
                className="xl:absolute xl:inset-y-0 xl:right-0 xl:w-[320px] xl:border-l"
                open={inspectorOpen}
                selection={visibleSelection}
                assets={featureData.assets}
                zones={featureData.zones}
                connections={featureData.connections}
                tracks={tracks}
                events={activeEvents}
                onFitSelection={handleFitSelection}
                onClose={handleCloseInspector}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
