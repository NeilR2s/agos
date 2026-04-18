const defaultFallbackStyle = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export const mapStyleCandidates = [
  import.meta.env.VITE_MAP_STYLE_URL,
  import.meta.env.VITE_MAP_STYLE_FALLBACK_URL,
  defaultFallbackStyle,
].filter((value, index, collection): value is string => Boolean(value) && collection.indexOf(value) === index);

export const defaultMapStyleUrl = mapStyleCandidates[0] ?? defaultFallbackStyle;
