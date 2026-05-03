import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";

import { cn } from "@/lib/utils";
import { closePolygon } from "../lib/geo";
import { defaultMapStyleUrl } from "../lib/mapStyle";
import type {
  MapAssetPoint,
  MapBounds,
  MapConnectionLine,
  MapEvent,
  MapFocusTarget,
  MapLayerState,
  MapSelection,
  MapTrack,
  MapZonePolygon,
  QueryMode,
} from "../types";

type MapCanvasProps = {
  assets: MapAssetPoint[];
  zones: MapZonePolygon[];
  connections: Array<MapConnectionLine & { coordinates: [number, number][] }>;
  tracks: Array<MapTrack & { visibleCoordinates: [number, number][] }>;
  events: MapEvent[];
  layerState: MapLayerState;
  selection: MapSelection;
  queryMode: QueryMode;
  polygonDraft: [number, number][];
  polygonQuery: [number, number][] | null;
  focusTarget: MapFocusTarget | null;
  onSelectionChange: (selection: MapSelection) => void;
  onBoundsChange: (bounds: MapBounds) => void;
  onAddPolygonVertex: (coordinate: [number, number]) => void;
  onUpdatePolygonVertex: (index: number, coordinate: [number, number]) => void;
};

type HoverState = {
  x: number;
  y: number;
  label: string;
  kind: string;
};

const assetsSourceId = "agos-map-assets";
const zonesSourceId = "agos-map-zones";
const connectionsSourceId = "agos-map-connections";
const tracksSourceId = "agos-map-tracks";
const eventsSourceId = "agos-map-events";
const querySourceId = "agos-map-query";
const draftSourceId = "agos-map-draft";
const handlesSourceId = "agos-map-handles";

const interactiveFeatureLayers = ["agos-assets", "agos-zones-fill", "agos-connections", "agos-events", "agos-tracks"] as const;
const mapPaint = {
  foreground: "white",
  panel: "#1f2228",
};

const calibrateBaseMapStyle = (map: maplibregl.Map) => {
  const style = map.getStyle();
  style.layers?.forEach((layer) => {
    const id = layer.id.toLowerCase();

    if (layer.type === "background") {
      map.setPaintProperty(layer.id, "background-color", "#030303");
      return;
    }

    if (layer.type === "fill") {
      if (id.includes("water")) {
        map.setPaintProperty(layer.id, "fill-color", "#080a0c");
        return;
      }

      map.setPaintProperty(layer.id, "fill-color", "#0e1012");
      map.setPaintProperty(layer.id, "fill-opacity", id.includes("landcover") || id.includes("landuse") ? 0.35 : 0.65);
      return;
    }

    if (layer.type === "line") {
      map.setPaintProperty(layer.id, "line-color", id.includes("road") || id.includes("boundary") ? "#2a2e32" : "#1a1e22");
      map.setPaintProperty(layer.id, "line-opacity", 0.4);
      return;
    }

    if (layer.type === "symbol") {
      map.setPaintProperty(layer.id, "text-color", "#525a64");
      map.setPaintProperty(layer.id, "text-halo-color", "#030303");
      map.setPaintProperty(layer.id, "text-halo-width", 1);
    }
  });
};

const extendBounds = (coordinates: [number, number][]) => {
  const bounds = new maplibregl.LngLatBounds(coordinates[0], coordinates[0]);
  coordinates.slice(1).forEach((coordinate) => bounds.extend(coordinate));
  return bounds;
};

export function MapCanvas({
  assets,
  zones,
  connections,
  tracks,
  events,
  layerState,
  selection,
  queryMode,
  polygonDraft,
  polygonQuery,
  focusTarget,
  onSelectionChange,
  onBoundsChange,
  onAddPolygonVertex,
  onUpdatePolygonVertex,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const queryModeRef = useRef(queryMode);
  const onAddPolygonVertexRef = useRef(onAddPolygonVertex);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onUpdatePolygonVertexRef = useRef(onUpdatePolygonVertex);
  const activeDragVertexIndexRef = useRef<number | null>(null);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [tooltipWidth, setTooltipWidth] = useState(320);

  useEffect(() => {
    queryModeRef.current = queryMode;
    onAddPolygonVertexRef.current = onAddPolygonVertex;
    onSelectionChangeRef.current = onSelectionChange;
    onBoundsChangeRef.current = onBoundsChange;
    onUpdatePolygonVertexRef.current = onUpdatePolygonVertex;
  }, [onAddPolygonVertex, onBoundsChange, onSelectionChange, onUpdatePolygonVertex, queryMode]);

  const assetsGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: assets.map((asset) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: asset.location },
      properties: { id: asset.id, label: asset.name, kind: asset.kind, selected: selection?.type === "asset" && selection.id === asset.id ? 1 : 0 },
    })),
  }), [assets, selection]);

  const zonesGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: zones.map((zone) => ({
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: [closePolygon(zone.coordinates)] },
      properties: { id: zone.id, label: zone.name, kind: zone.kind, selected: selection?.type === "zone" && selection.id === zone.id ? 1 : 0 },
    })),
  }), [zones, selection]);

  const connectionsGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: connections.map((connection) => ({
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates: connection.coordinates },
      properties: { id: connection.id, kind: connection.kind, label: connection.description, selected: selection?.type === "connection" && selection.id === connection.id ? 1 : 0 },
    })),
  }), [connections, selection]);

  const tracksGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: tracks
      .filter((track) => track.visibleCoordinates.length >= 2)
      .map((track) => ({
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: track.visibleCoordinates },
        properties: { id: track.id, label: track.label, kind: "track", selected: selection?.type === "track" && selection.id === track.id ? 1 : 0 },
      })),
  }), [tracks, selection]);

  const eventsGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: events.map((event) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: event.location },
      properties: { id: event.id, label: event.title, kind: event.kind, selected: selection?.type === "event" && selection.id === event.id ? 1 : 0 },
    })),
  }), [events, selection]);

  const polygonQueryGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: polygonQuery
      ? [{ type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: [closePolygon(polygonQuery)] }, properties: { id: "query" } }]
      : [],
  }), [polygonQuery]);

  const polygonDraftGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: polygonDraft.length >= 2
      ? [{ type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: [...polygonDraft, polygonDraft[0]] }, properties: { id: "draft" } }]
      : [],
  }), [polygonDraft]);

  const polygonHandlesGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: polygonDraft.map((coordinate, index) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: coordinate },
      properties: { id: `vertex-${index}`, index, label: `VERTEX ${index + 1}`, kind: "vertex" },
    })),
  }), [polygonDraft]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: defaultMapStyleUrl,
      center: [121.0244, 14.5547],
      zoom: 5.4,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const syncBounds = () => {
      const bounds = map.getBounds();
      onBoundsChangeRef.current({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
    };

    const setHover = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || !feature.properties) {
        setHoverState(null);
        return;
      }

      setHoverState({
        x: event.point.x,
        y: event.point.y,
        label: String(feature.properties.label ?? feature.properties.id ?? "OBJECT"),
        kind: String(feature.properties.kind ?? "feature"),
      });
    };

    const clearHover = () => {
      setHoverState((current) => (activeDragVertexIndexRef.current === null ? null : current));
      if (activeDragVertexIndexRef.current === null) {
        map.getCanvas().style.cursor = queryModeRef.current === "polygon" ? "crosshair" : "";
      }
    };

    map.on("load", () => {
      loadedRef.current = true;
      calibrateBaseMapStyle(map);

      map.addSource(assetsSourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(zonesSourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(connectionsSourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(tracksSourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(eventsSourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(querySourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(draftSourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(handlesSourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

      map.addLayer({
        id: "agos-zones-fill",
        type: "fill",
        source: zonesSourceId,
        paint: {
          "fill-color": mapPaint.foreground,
          "fill-opacity": ["case", ["==", ["get", "selected"], 1], 0.12, 0.05],
        },
      });
      map.addLayer({
        id: "agos-zones-line",
        type: "line",
        source: zonesSourceId,
        paint: {
          "line-color": mapPaint.foreground,
          "line-opacity": ["case", ["==", ["get", "selected"], 1], 0.9, 0.3],
          "line-width": ["case", ["==", ["get", "selected"], 1], 2, 1],
        },
      });
      map.addLayer({
        id: "agos-connections",
        type: "line",
        source: connectionsSourceId,
        paint: {
          "line-color": mapPaint.foreground,
          "line-opacity": ["case", ["==", ["get", "selected"], 1], 0.9, 0.28],
          "line-width": ["case", ["==", ["get", "selected"], 1], 2.6, 1.2],
        },
      });
      map.addLayer({
        id: "agos-tracks",
        type: "line",
        source: tracksSourceId,
        paint: {
          "line-color": mapPaint.foreground,
          "line-dasharray": [1, 1.2],
          "line-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.45],
          "line-width": ["case", ["==", ["get", "selected"], 1], 3, 1.5],
        },
      });
      map.addLayer({
        id: "agos-assets",
        type: "circle",
        source: assetsSourceId,
        paint: {
          "circle-color": mapPaint.foreground,
          "circle-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.85],
          "circle-radius": ["case", ["==", ["get", "selected"], 1], 7, 5],
          "circle-stroke-color": mapPaint.panel,
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "agos-events",
        type: "circle",
        source: eventsSourceId,
        paint: {
          "circle-color": mapPaint.panel,
          "circle-opacity": 0.95,
          "circle-radius": ["case", ["==", ["get", "selected"], 1], 7, 4],
          "circle-stroke-color": mapPaint.foreground,
          "circle-stroke-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.7],
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "agos-query-fill",
        type: "fill",
        source: querySourceId,
        paint: { "fill-color": mapPaint.foreground, "fill-opacity": 0.06 },
      });
      map.addLayer({
        id: "agos-query-line",
        type: "line",
        source: querySourceId,
        paint: { "line-color": mapPaint.foreground, "line-width": 2, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "agos-draft-line",
        type: "line",
        source: draftSourceId,
        paint: { "line-color": mapPaint.foreground, "line-width": 1.5, "line-opacity": 0.5 },
      });
      map.addLayer({
        id: "agos-polygon-handles",
        type: "circle",
        source: handlesSourceId,
        paint: {
          "circle-color": mapPaint.panel,
          "circle-stroke-color": mapPaint.foreground,
          "circle-stroke-width": 1.5,
          "circle-radius": 6,
        },
      });

      syncBounds();
      map.on("moveend", syncBounds);

      interactiveFeatureLayers.forEach((layerId) => {
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mousemove", layerId, setHover);
        map.on("mouseleave", layerId, clearHover);
      });

      map.on("mouseenter", "agos-polygon-handles", () => {
        map.getCanvas().style.cursor = "grab";
      });
      map.on("mousemove", "agos-polygon-handles", setHover);
      map.on("mouseleave", "agos-polygon-handles", clearHover);

      map.on("click", "agos-assets", (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") {
          onSelectionChangeRef.current({ type: "asset", id });
        }
      });
      map.on("click", "agos-zones-fill", (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") {
          onSelectionChangeRef.current({ type: "zone", id });
        }
      });
      map.on("click", "agos-connections", (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") {
          onSelectionChangeRef.current({ type: "connection", id });
        }
      });
      map.on("click", "agos-events", (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") {
          onSelectionChangeRef.current({ type: "event", id });
        }
      });
      map.on("click", "agos-tracks", (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") {
          onSelectionChangeRef.current({ type: "track", id });
        }
      });

      map.on("mousedown", "agos-polygon-handles", (event) => {
        if (queryModeRef.current !== "polygon") {
          return;
        }
        const featureIndex = Number(event.features?.[0]?.properties?.index);
        if (Number.isNaN(featureIndex)) {
          return;
        }

        activeDragVertexIndexRef.current = featureIndex;
        map.dragPan.disable();
        map.getCanvas().style.cursor = "grabbing";
      });

      map.on("mousemove", (event) => {
        if (activeDragVertexIndexRef.current === null) {
          return;
        }

        onUpdatePolygonVertexRef.current(activeDragVertexIndexRef.current, [event.lngLat.lng, event.lngLat.lat]);
        setHoverState({ x: event.point.x, y: event.point.y, label: `VERTEX ${activeDragVertexIndexRef.current + 1}`, kind: "editing" });
      });

      map.on("mouseup", () => {
        if (activeDragVertexIndexRef.current === null) {
          return;
        }

        activeDragVertexIndexRef.current = null;
        map.dragPan.enable();
        map.getCanvas().style.cursor = queryModeRef.current === "polygon" ? "crosshair" : "";
      });

      map.on("click", (event) => {
        const hasFeature = map.queryRenderedFeatures(event.point, { layers: [...interactiveFeatureLayers, "agos-polygon-handles"] }).length > 0;
        if (hasFeature) {
          return;
        }
        if (queryModeRef.current === "polygon") {
          onAddPolygonVertexRef.current([event.lngLat.lng, event.lngLat.lat]);
        } else {
          onSelectionChangeRef.current(null);
        }
      });
    });

    const observer = new ResizeObserver(() => {
      setTooltipWidth(containerRef.current?.clientWidth ?? 320);
      map.resize();
    });
    observer.observe(containerRef.current);
    setTooltipWidth(containerRef.current.clientWidth);

    return () => {
      observer.disconnect();
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) {
      return;
    }

    (map.getSource(assetsSourceId) as GeoJSONSource | undefined)?.setData(assetsGeoJson);
    (map.getSource(zonesSourceId) as GeoJSONSource | undefined)?.setData(zonesGeoJson);
    (map.getSource(connectionsSourceId) as GeoJSONSource | undefined)?.setData(connectionsGeoJson);
    (map.getSource(tracksSourceId) as GeoJSONSource | undefined)?.setData(tracksGeoJson);
    (map.getSource(eventsSourceId) as GeoJSONSource | undefined)?.setData(eventsGeoJson);
    (map.getSource(querySourceId) as GeoJSONSource | undefined)?.setData(polygonQueryGeoJson);
    (map.getSource(draftSourceId) as GeoJSONSource | undefined)?.setData(polygonDraftGeoJson);
    (map.getSource(handlesSourceId) as GeoJSONSource | undefined)?.setData(polygonHandlesGeoJson);

    map.setLayoutProperty("agos-assets", "visibility", layerState.assets ? "visible" : "none");
    map.setLayoutProperty("agos-zones-fill", "visibility", layerState.zones ? "visible" : "none");
    map.setLayoutProperty("agos-zones-line", "visibility", layerState.zones ? "visible" : "none");
    map.setLayoutProperty("agos-connections", "visibility", layerState.connections ? "visible" : "none");
    map.setLayoutProperty("agos-tracks", "visibility", layerState.tracks ? "visible" : "none");
    map.setLayoutProperty("agos-events", "visibility", layerState.events ? "visible" : "none");
    map.setLayoutProperty("agos-query-fill", "visibility", polygonQuery ? "visible" : "none");
    map.setLayoutProperty("agos-query-line", "visibility", polygonQuery ? "visible" : "none");
    map.setLayoutProperty("agos-draft-line", "visibility", polygonDraft.length >= 2 ? "visible" : "none");
    map.setLayoutProperty("agos-polygon-handles", "visibility", queryMode === "polygon" && polygonDraft.length ? "visible" : "none");
  }, [assetsGeoJson, connectionsGeoJson, eventsGeoJson, layerState, polygonDraft.length, polygonDraftGeoJson, polygonHandlesGeoJson, polygonQuery, polygonQueryGeoJson, queryMode, tracksGeoJson, zonesGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget) {
      return;
    }

    if (focusTarget.geometry.type === "point") {
      map.easeTo({ center: focusTarget.geometry.coordinates, zoom: Math.max(map.getZoom(), 10.5), duration: 800 });
      return;
    }

    if (!focusTarget.geometry.coordinates.length) {
      return;
    }

    map.fitBounds(extendBounds(focusTarget.geometry.coordinates), { padding: 64, duration: 800, maxZoom: 12 });
  }, [focusTarget]);

  return (
    <div className="relative min-h-[420px] flex-1 overflow-hidden bg-[#030303] md:min-h-[520px] xl:min-h-0">
      <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(3,3,3,1)_0%,transparent_12%,transparent_85%,rgba(3,3,3,0.8)_100%)]" aria-hidden="true" />
      
      <div className="absolute left-6 top-6 z-20 flex flex-col gap-1">
        <span className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground/30">
          Geospatial Surface
        </span>
        <span className="font-sans text-[12px] text-muted-foreground/50">
          {queryMode === "bbox" ? "Active Viewport Filter" : "Spatial Geometry Definition"}
        </span>
      </div>

      {hoverState ? (
        <div
          className="pointer-events-none absolute z-50 flex flex-col gap-0.5 border border-white/10 bg-[#080808]/90 px-2 py-1.5 backdrop-blur-md"
          style={{ left: Math.min(hoverState.x + 16, Math.max(16, tooltipWidth - 160)), top: Math.max(16, hoverState.y + 16) }}
        >
          <span className="font-mono text-[8px] uppercase tracking-[1px] text-primary/60">{hoverState.kind}</span>
          <span className="font-sans text-[12px] text-foreground/90 whitespace-nowrap">{hoverState.label}</span>
        </div>
      ) : null}
      
      <div ref={containerRef} className={cn("h-[420px] w-full md:h-[520px] xl:h-full", queryMode === "polygon" && "cursor-crosshair")} />
    </div>
  );
}
