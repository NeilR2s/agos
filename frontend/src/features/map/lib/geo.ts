import type { MapBounds, MapEvent, MapTrack, MapZonePolygon } from "../types";

export const closePolygon = (coordinates: [number, number][]) => {
  if (coordinates.length === 0) {
    return coordinates;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return coordinates;
  }

  return [...coordinates, first];
};

export const getBoundsFromPolygon = (coordinates: [number, number][]): MapBounds => {
  if (coordinates.length === 0) {
    return { west: 0, south: 0, east: 0, north: 0 };
  }

  const lons = coordinates.map(([lng]) => lng);
  const lats = coordinates.map(([, lat]) => lat);

  return {
    west: Math.min(...lons),
    south: Math.min(...lats),
    east: Math.max(...lons),
    north: Math.max(...lats),
  };
};

export const pointInBounds = ([lng, lat]: [number, number], bounds: MapBounds) =>
  lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north;

export const bboxIntersects = (left: MapBounds, right: MapBounds) =>
  !(left.east < right.west || left.west > right.east || left.north < right.south || left.south > right.north);

export const pointInPolygon = (point: [number, number], polygon: [number, number][]) => {
  let inside = false;
  const [x, y] = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const pointOnSegment = (point: [number, number], start: [number, number], end: [number, number]) => {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > 1e-9) {
    return false;
  }

  return point[0] >= Math.min(start[0], end[0]) - 1e-9
    && point[0] <= Math.max(start[0], end[0]) + 1e-9
    && point[1] >= Math.min(start[1], end[1]) - 1e-9
    && point[1] <= Math.max(start[1], end[1]) + 1e-9;
};

const orientation = (a: [number, number], b: [number, number], c: [number, number]) =>
  (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);

export const segmentsIntersect = (
  firstStart: [number, number],
  firstEnd: [number, number],
  secondStart: [number, number],
  secondEnd: [number, number]
) => {
  const o1 = orientation(firstStart, firstEnd, secondStart);
  const o2 = orientation(firstStart, firstEnd, secondEnd);
  const o3 = orientation(secondStart, secondEnd, firstStart);
  const o4 = orientation(secondStart, secondEnd, firstEnd);

  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) {
    return true;
  }

  return pointOnSegment(secondStart, firstStart, firstEnd)
    || pointOnSegment(secondEnd, firstStart, firstEnd)
    || pointOnSegment(firstStart, secondStart, secondEnd)
    || pointOnSegment(firstEnd, secondStart, secondEnd);
};

const polygonEdges = (coordinates: [number, number][]) => {
  const closed = closePolygon(coordinates);
  return closed.slice(0, -1).map((coordinate, index) => [coordinate, closed[index + 1]] as const);
};

export const zoneIntersectsBounds = (zone: MapZonePolygon, bounds: MapBounds) => {
  const zoneBounds = getBoundsFromPolygon(zone.coordinates);
  if (!bboxIntersects(zoneBounds, bounds)) {
    return false;
  }

  const boundsPolygon: [number, number][] = [
    [bounds.west, bounds.south],
    [bounds.east, bounds.south],
    [bounds.east, bounds.north],
    [bounds.west, bounds.north],
  ];

  return zoneIntersectsPolygon(zone, boundsPolygon);
};

export const zoneIntersectsPolygon = (zone: MapZonePolygon, polygon: [number, number][]) => {
  const polygonBounds = getBoundsFromPolygon(polygon);
  const zoneBounds = getBoundsFromPolygon(zone.coordinates);
  if (!bboxIntersects(zoneBounds, polygonBounds)) {
    return false;
  }

  return zone.coordinates.some((coordinate) => pointInPolygon(coordinate, polygon))
    || polygon.some((coordinate) => pointInPolygon(coordinate, zone.coordinates))
    || polygonEdges(zone.coordinates).some(([start, end]) => polygonEdges(polygon).some(([otherStart, otherEnd]) => segmentsIntersect(start, end, otherStart, otherEnd)));
};

export const lineIntersectsBounds = (coordinates: [number, number][], bounds: MapBounds) => {
  if (coordinates.length === 0) {
    return false;
  }

  const lineBounds = getBoundsFromPolygon(coordinates);
  return bboxIntersects(lineBounds, bounds);
};

export const lineIntersectsPolygon = (coordinates: [number, number][], polygon: [number, number][]) => {
  if (coordinates.length === 0 || polygon.length < 3) {
    return false;
  }

  const polygonBounds = getBoundsFromPolygon(polygon);
  const lineBounds = getBoundsFromPolygon(coordinates);
  if (!bboxIntersects(lineBounds, polygonBounds)) {
    return false;
  }

  return coordinates.some((coordinate) => pointInPolygon(coordinate, polygon))
    || polygon.some((coordinate) => coordinates.some((linePoint, index) => index > 0 && pointOnSegment(coordinate, coordinates[index - 1], linePoint)))
    || coordinates.slice(1).some((coordinate, index) => polygonEdges(polygon).some(([start, end]) => segmentsIntersect(coordinates[index], coordinate, start, end)));
};

export const stripClosingCoordinate = (coordinates: [number, number][]) => {
  if (coordinates.length >= 2) {
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      return coordinates.slice(0, -1);
    }
  }

  return coordinates;
};

const getWindowStartIndex = (index: number, windowSize: number) => Math.max(0, index - windowSize + 1);

export const isEventVisibleAtIndex = (event: MapEvent, timestamps: string[], index: number, windowSize = timestamps.length) => {
  const eventIndex = timestamps.indexOf(event.timestamp);
  if (eventIndex === -1) {
    return false;
  }

  const windowStartIndex = getWindowStartIndex(index, windowSize);
  return eventIndex >= windowStartIndex && eventIndex <= index;
};

export const getTrackCoordinatesUpToIndex = (track: MapTrack, timestamps: string[], index: number, windowSize = timestamps.length) => {
  const windowStartIndex = getWindowStartIndex(index, windowSize);
  return track.points
    .filter((point) => {
      const pointIndex = timestamps.indexOf(point.timestamp);
      return pointIndex >= windowStartIndex && pointIndex <= index;
    })
    .map((point) => point.location);
};
