import { useEffect, useMemo, useState } from "react";
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

const homeFocusTarget: MapFocusTarget = {
  key: "home-extent",
  geometry: {
    type: "polygon",
    coordinates: [
      [initialBounds.west, initialBounds.south],
      [initialBounds.east, initialBounds.south],
      [initialBounds.east, initialBounds.north],
      [initialBounds.west, initialBounds.north],
    ],
  },
};

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebounced(value);
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

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
  const [objectSearchQuery, setObjectSearchQuery] = useState("");
  const [placeSearchQueryValue, setPlaceSearchQueryValue] = useState("");
  const [focusedPlaceLabel, setFocusedPlaceLabel] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);
  const [dismissedInspectorSelectionKey, setDismissedInspectorSelectionKey] = useState<string | null>(null);

  const debouncedObjectSearchQuery = useDebouncedValue(objectSearchQuery.trim(), 350);
  const debouncedPlaceSearchQuery = useDebouncedValue(placeSearchQueryValue.trim(), 250);
  const roundedBounds = useMemo(() => getRoundedBoundsKey(mapBounds), [mapBounds]);
  const isPolygonDirty = useMemo(() => {
    if (!polygonQuery || polygonDraft.length < 3) {
      return false;
    }

    return JSON.stringify(closePolygon(polygonDraft)) !== JSON.stringify(polygonQuery);
  }, [polygonDraft, polygonQuery]);

  const featureQuery = useQuery({
    queryKey: ["map-features", queryMode, roundedBounds, polygonQuery, debouncedObjectSearchQuery],
    queryFn: async () => {
      if (queryMode === "polygon" && polygonQuery) {
        return mapApi.queryPolygon(polygonQuery, debouncedObjectSearchQuery);
      }

      return mapApi.getFeatures(roundedBounds, debouncedObjectSearchQuery);
    },
    enabled: queryMode === "bbox" || Boolean(polygonQuery),
    placeholderData: (previous) => previous,
  });

  const placeSearchQuery = useQuery({
    queryKey: ["map-place-search", debouncedPlaceSearchQuery],
    queryFn: () => mapApi.searchPlaces(debouncedPlaceSearchQuery, 5),
    enabled: debouncedPlaceSearchQuery.length >= 2,
    staleTime: 60_000,
  });

  const detailQuery = useQuery({
    queryKey: ["map-object-detail", selection?.type, selection?.id],
    queryFn: () => mapApi.getObjectDetail(selection!.type, selection!.id),
    enabled: Boolean(selection),
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

  const canvasSelection = useMemo(() => {
    if (!selection) {
      return null;
    }

    if (selection.type === "asset") {
      return featureData.assets.some((asset) => asset.id === selection.id) ? selection : null;
    }

    if (selection.type === "zone") {
      return featureData.zones.some((zone) => zone.id === selection.id) ? selection : null;
    }

    if (selection.type === "connection") {
      return featureData.connections.some((connection) => connection.id === selection.id) ? selection : null;
    }

    if (selection.type === "event") {
      return activeEvents.some((event) => event.id === selection.id) ? selection : null;
    }

    return tracks.some((track) => track.id === selection.id && track.visibleCoordinates.length >= 2) ? selection : null;
  }, [activeEvents, featureData.assets, featureData.connections, featureData.zones, selection, tracks]);

  const selectionSummaryLabel = useMemo(() => {
    if (!selection) {
      return "None";
    }

    if (detailQuery.data?.asset) {
      return detailQuery.data.asset.name;
    }

    if (detailQuery.data?.zone) {
      return detailQuery.data.zone.name;
    }

    if (detailQuery.data?.connection) {
      return detailQuery.data.connection.description;
    }

    if (detailQuery.data?.event) {
      return detailQuery.data.event.title;
    }

    if (detailQuery.data?.track) {
      return detailQuery.data.track.label;
    }

    return truncateMiddle(selection.id);
  }, [detailQuery.data, selection]);

  const activeSelectionKey = selection ? `${selection.type}:${selection.id}` : null;
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
  const isInitialMapLoad = featureQuery.isLoading && !featureQuery.data;
  const isBackgroundMapRefresh = featureQuery.isFetching && !isInitialMapLoad;

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
    setPolygonDraft((current) => current.slice(0, -1));
  };

  const handleClearPolygon = () => {
    setPolygonDraft([]);
    setPolygonQuery(null);
  };

  const handleUpdatePolygonVertex = (index: number, coordinate: [number, number]) => {
    setPolygonDraft((current) => current.map((vertex, vertexIndex) => (vertexIndex === index ? coordinate : vertex)));
  };

  const handleAddPolygonVertex = (coordinate: [number, number]) => {
    setPolygonDraft((current) => [...current, coordinate]);
  };

  const handleSelectSearchResult = (result: MapPlaceSearchResult) => {
    setFocusedPlaceLabel(result.label);
    setFocusTarget({
      key: `place-${result.id}-${Date.now()}`,
      geometry: { type: "point", coordinates: result.coordinates },
    });
    setSelection(null);
  };

  const handleResetView = () => {
    setFocusedPlaceLabel(null);
    setFocusTarget({ ...homeFocusTarget, key: `home-${Date.now()}` });
    setSelection(null);
  };

  const handleFitSelection = () => {
    if (!selection) {
      return;
    }

    const detail = detailQuery.data;

    if (selection.type === "asset") {
      const asset = detail?.asset ?? featureData.assets.find((item) => item.id === selection.id) ?? null;
      if (asset) {
        setFocusTarget({ key: `selection-${selection.id}-${Date.now()}`, geometry: { type: "point", coordinates: asset.location } });
      }
      return;
    }

    if (selection.type === "event") {
      const event = detail?.event ?? featureData.events.find((item) => item.id === selection.id) ?? null;
      if (event) {
        setFocusTarget({ key: `selection-${selection.id}-${Date.now()}`, geometry: { type: "point", coordinates: event.location } });
      }
      return;
    }

    if (selection.type === "zone") {
      const zone = detail?.zone ?? featureData.zones.find((item) => item.id === selection.id) ?? null;
      if (zone) {
        setFocusTarget({ key: `selection-${selection.id}-${Date.now()}`, geometry: { type: "polygon", coordinates: zone.coordinates } });
      }
      return;
    }

    if (selection.type === "connection") {
      const connection = detail?.connection ?? featureData.connections.find((item) => item.id === selection.id) ?? null;
      if (connection) {
        setFocusTarget({ key: `selection-${selection.id}-${Date.now()}`, geometry: { type: "line", coordinates: connection.coordinates } });
      }
      return;
    }

    const track = detail?.track ?? featureData.tracks.find((item) => item.id === selection.id) ?? null;
    if (track?.points.length) {
      setFocusTarget({ key: `selection-${selection.id}-${Date.now()}`, geometry: { type: "line", coordinates: track.points.map((point) => point.location) } });
    }
  };

  const handleCloseInspector = () => {
    if (activeSelectionKey) {
      setDismissedInspectorSelectionKey(activeSelectionKey);
    }
  };

  return (
    <div className="min-h-dvh bg-background px-2 py-2 text-foreground lg:h-dvh lg:overflow-hidden lg:px-3 lg:py-3">
      <div className="mx-auto flex h-full max-w-[1920px] flex-col gap-2">
        <section className="rounded-2xl border border-border bg-card/55 px-3 py-2.5 lg:px-4">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Badge variant="outline" className="border-border text-muted-foreground">
                [ Geospatial Lab ]
              </Badge>
              <h1 className="font-sans text-[30px] leading-[1.2]">Infrastructure / Vector / Event</h1>
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">
                <span>{queryMode === "bbox" ? "Viewport Mode" : "Polygon Mode"}</span>
                <span>/</span>
                <span>{playing ? "Temporal Playback" : "Static View"}</span>
                <span>/</span>
                <span className="max-w-[220px] truncate text-foreground/80">{selectionSummaryLabel}</span>
                <span>/</span>
                <span className="max-w-[220px] truncate">{summary.activeTimestamp.replace("T", " ").replace("Z", " UTC")}</span>
                {focusedPlaceLabel ? <span className="max-w-[180px] truncate">/ {focusedPlaceLabel}</span> : null}
                {isBackgroundMapRefresh ? <span className="text-chart-3">/ syncing</span> : null}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 xl:min-w-[300px]">
              {[
                ["Assets", featureData.assets.length],
                ["Zones", featureData.zones.length],
                ["Events", activeEvents.length],
                ["Tracks", tracks.filter((track) => track.visibleCoordinates.length >= 2).length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-secondary/30 px-2.5 py-2">
                  <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">{label}</p>
                  <p className="mt-0.5 font-sans text-[18px] text-foreground">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid min-h-0 flex-1 gap-2 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-stretch">
          <div className="order-2 min-h-0 xl:order-1 xl:overflow-hidden">
            <MapControlRail
              layerState={layerState}
              queryMode={queryMode}
              queryLabel={summary.queryLabel}
              polygonDraftCount={polygonDraft.length}
              isPolygonCommitted={Boolean(polygonQuery)}
              isPolygonDirty={isPolygonDirty}
              objectSearchQuery={objectSearchQuery}
              placeSearchQuery={placeSearchQueryValue}
              focusedPlaceLabel={focusedPlaceLabel}
              searchResults={placeSearchQuery.data ?? []}
              searchResultsLoading={placeSearchQuery.isFetching}
              searchResultsError={placeSearchQuery.isError ? (placeSearchQuery.error instanceof Error ? placeSearchQuery.error.message : "Place search failed") : null}
              onLayerToggle={handleLayerToggle}
              onQueryModeChange={handleQueryModeChange}
              onObjectSearchQueryChange={setObjectSearchQuery}
              onPlaceSearchQueryChange={setPlaceSearchQueryValue}
              onCompletePolygon={handleCompletePolygon}
              onClearPolygon={handleClearPolygon}
              onUndoPolygonVertex={handleUndoPolygonVertex}
              onSelectSearchResult={handleSelectSearchResult}
              onResetView={handleResetView}
            />
          </div>

          <div className="relative order-1 flex min-w-0 flex-col gap-2 xl:order-2 xl:min-h-0">
            {featureQuery.isError ? (
              <section className="rounded-2xl border border-border bg-card px-4 py-3">
                <p className="font-sans text-[14px] leading-[1.6] text-muted-foreground">
                  {featureQuery.error instanceof Error ? featureQuery.error.message : "Map data request failed."}
                </p>
              </section>
            ) : null}

            {isInitialMapLoad ? (
              <section className="rounded-2xl border border-border bg-card px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Resolving map state...</p>
              </section>
            ) : null}

            <div className="relative flex min-w-0 flex-1 flex-col gap-0 overflow-hidden rounded-3xl border border-border bg-card/40 xl:min-h-0">
              <MapCanvas
                assets={featureData.assets}
                zones={featureData.zones}
                connections={featureData.connections}
                tracks={tracks}
                events={activeEvents}
                layerState={layerState}
                selection={canvasSelection}
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
                key={selection ? `${selection.type}:${selection.id}` : "none"}
                className="xl:absolute xl:inset-y-0 xl:right-0 xl:w-[320px] xl:border-l"
                open={inspectorOpen}
                selection={selection}
                detail={detailQuery.data ?? null}
                isLoading={detailQuery.isLoading}
                error={detailQuery.isError ? (detailQuery.error instanceof Error ? detailQuery.error.message : "Inspector request failed") : null}
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
