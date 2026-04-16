export const APP_OVERLAY_EVENT = "agos:overlay-state";

export type AppOverlayState = {
  commandPaletteOpen: boolean;
};

export function publishOverlayState(detail: AppOverlayState) {
  window.dispatchEvent(new CustomEvent<AppOverlayState>(APP_OVERLAY_EVENT, { detail }));
}
