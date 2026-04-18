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

  return (
    <div className="min-h-dvh bg-background px-4 py-4 text-white lg:px-6 lg:py-6">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-4">
        <section className="border border-white/10 bg-white/[0.03] px-4 py-5 lg:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[920px]">
              <Badge variant="outline" className="rounded-none border-white/20 px-3 py-1 font-mono text-[10px] uppercase tracking-[1px] text-white/50">
                AGOS MAP APPLICATION / TEMPORAL GEOSPATIAL ANALYSIS
              </Badge>
              <h1 className="mt-4 font-mono text-[36px] uppercase leading-[1.05] tracking-[-0.04em] text-white md:text-[52px]">
                MAP / NETWORK / MOVEMENT / ACTION
              </h1>
              <p className="mt-4 max-w-[760px] font-sans text-[16px] leading-[1.6] text-white/70">
                Traverse asset relationships, inspect physical corridors, run backend viewport and polygon queries, resolve live places through Geoapify, and replay movement over time inside a single AGOS geospatial surface.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                ["Assets", featureData.assets.length],
                ["Zones", featureData.zones.length],
                ["Events", activeEvents.length],
                ["Tracks", tracks.filter((track) => track.visibleCoordinates.length >= 2).length],
              ].map(([label, value]) => (
                <div key={label} className="border border-white/10 px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">{label}</p>
                  <p className="mt-2 font-sans text-[24px] text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
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

          <div className="flex flex-col gap-4">
            <section className="border border-white/10 bg-white/[0.03] px-4 py-4">
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Query</p>
                  <p className="mt-2 font-sans text-[15px] text-white">{queryMode === "bbox" ? "Viewport intersection" : "Polygon intersection"}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Time</p>
                  <p className="mt-2 font-sans text-[15px] text-white">{summary.activeTimestamp.replace("T", " ").replace("Z", " UTC")}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Selection</p>
                  <p className="mt-2 font-sans text-[15px] text-white">{visibleSelection ? `${visibleSelection.type.toUpperCase()} / ${visibleSelection.id}` : "NONE"}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Mode</p>
                  <p className="mt-2 font-sans text-[15px] text-white">{playing ? "PLAYBACK ACTIVE" : "STATIC REVIEW"}</p>
                </div>
              </div>
              {featureQuery.isError ? (
                <p className="mt-3 border-t border-white/10 pt-3 font-sans text-[14px] leading-[1.6] text-white/55">
                  {featureQuery.error instanceof Error ? featureQuery.error.message : "Map data request failed."}
                </p>
              ) : null}
            </section>

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
              onSelectionChange={setSelection}
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
          </div>

          <MapDetailRail
            selection={visibleSelection}
            assets={featureData.assets}
            zones={featureData.zones}
            connections={featureData.connections}
            tracks={tracks}
            events={activeEvents}
            onFitSelection={handleFitSelection}
          />
        </section>
      </div>
    </div>
  );
}
