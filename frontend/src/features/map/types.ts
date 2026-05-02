export type LngLat = [number, number];

export type TimestampId = string;

export type MapAssetPoint = {
  id: string;
  name: string;
  kind: "asset" | "event" | "sensor";
  status: "nominal" | "watch" | "critical";
  location: LngLat;
  zoneId?: string;
  description: string;
  tags: string[];
};

export type MapZonePolygon = {
  id: string;
  name: string;
  kind: "facility" | "corridor" | "coverage";
  status: "nominal" | "watch" | "critical";
  coordinates: LngLat[];
  description: string;
};

export type MapConnectionLine = {
  id: string;
  sourceId: string;
  targetId: string;
  kind: "fiber" | "road" | "supply";
  status: "nominal" | "watch" | "critical";
  description: string;
};

export type MapExpandedConnectionLine = MapConnectionLine & { coordinates: LngLat[] };

export type MapTrackPoint = {
  timestamp: TimestampId;
  location: LngLat;
  eventId?: string;
};

export type MapTrack = {
  id: string;
  assetId: string;
  label: string;
  points: MapTrackPoint[];
};

export type MapEvent = {
  id: string;
  title: string;
  kind: "inspection" | "alert" | "handoff" | "movement";
  severity: "low" | "medium" | "high";
  timestamp: TimestampId;
  location: LngLat;
  assetId?: string;
  zoneId?: string;
  detail: string;
};

export type MapLayerState = {
  assets: boolean;
  zones: boolean;
  connections: boolean;
  tracks: boolean;
  events: boolean;
};

export type QueryMode = "bbox" | "polygon";

export type MapSelection =
  | { type: "asset"; id: string }
  | { type: "zone"; id: string }
  | { type: "connection"; id: string }
  | { type: "event"; id: string }
  | { type: "track"; id: string }
  | null;

export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type MapFeatureCollection = {
  assets: MapAssetPoint[];
  zones: MapZonePolygon[];
  connections: MapExpandedConnectionLine[];
  tracks: MapTrack[];
  events: MapEvent[];
  timeline: TimestampId[];
};

export type MapPlaceSearchResult = {
  id: string;
  label: string;
  coordinates: LngLat;
  country?: string;
  region?: string;
};

export type MapFocusTarget = {
  key: string;
  geometry:
    | { type: "point"; coordinates: LngLat }
    | { type: "line"; coordinates: LngLat[] }
    | { type: "polygon"; coordinates: LngLat[] };
};

export type MapObjectDetail = {
  selection: Exclude<MapSelection, null>;
  asset: MapAssetPoint | null;
  zone: MapZonePolygon | null;
  connection: MapExpandedConnectionLine | null;
  track: MapTrack | null;
  event: MapEvent | null;
  relatedAssets: MapAssetPoint[];
  relatedZones: MapZonePolygon[];
  relatedConnections: MapExpandedConnectionLine[];
  relatedTracks: MapTrack[];
  relatedEvents: MapEvent[];
};
