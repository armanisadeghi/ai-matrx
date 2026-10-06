// features/marketing/pr/director/director-dock.ts
//
// Whether the PR Director column is docked beside the Press Room on a wide screen. By default it
// opens only where the angle list keeps a usable width beside it; a person's own open/close is
// remembered on this device and wins. A personal view preference, like a sidebar — not an
// organization setting. Guard: `__tests__/director-dock.test.ts`.

import { useCallback, useEffect, useState } from "react";

export const DIRECTOR_DOCK_KEY = "matrx.pr.director-docked";
/** The Director column is 420px; below this the angle list would drop under ~600px. */
export const DIRECTOR_DOCK_MIN_WIDTH = 1440;

function storedChoice(): boolean | null {
  try {
    const value = window.localStorage.getItem(DIRECTOR_DOCK_KEY);
    return value === "open" ? true : value === "closed" ? false : null;
  } catch {
    return null;
  }
}

export function initialDirectorDocked(viewportWidth: number): boolean {
  return storedChoice() ?? viewportWidth >= DIRECTOR_DOCK_MIN_WIDTH;
}

export function useDirectorDock(): [boolean, (open: boolean) => void] {
  // Read after mount, never during render: the server has no width, and a render-time read
  // would make the first client paint disagree with the server's.
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    setDocked(initialDirectorDocked(window.innerWidth));
  }, []);
  const set = useCallback((open: boolean) => {
    setDocked(open);
    try {
      window.localStorage.setItem(DIRECTOR_DOCK_KEY, open ? "open" : "closed");
    } catch {
      // Private mode: the choice holds for this visit only.
    }
  }, []);
  return [docked, set];
}
