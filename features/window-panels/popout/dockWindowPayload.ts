export interface DockWindowPayload {
  id: string;
  viewportWidth: number;
  viewportHeight: number;
}

/** Build a dock action payload from the live parent viewport. Client-only. */
export function buildDockWindowPayload(windowId: string): DockWindowPayload {
  return {
    id: windowId,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}
