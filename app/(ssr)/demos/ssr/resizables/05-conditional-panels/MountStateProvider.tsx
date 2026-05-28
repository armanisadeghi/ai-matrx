"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

interface ContextValue {
  showRight: boolean;
  toggleRight: () => void;
}

const Ctx = createContext<ContextValue | null>(null);

// Bridge for the conditional-panels demo. Mount/unmount intent lives here so
// header buttons (in the PageHeader portal) and the panel layout (in the page
// body) stay in sync. Persists to a cookie so the SSR pass picks the correct
// initial set of panels.
export function MountStateProvider({
  children,
  initialShowRight,
  toggleCookie,
}: {
  children: React.ReactNode;
  initialShowRight: boolean;
  toggleCookie: string;
}) {
  const [showRight, setShowRight] = useState(initialShowRight);

  useEffect(() => {
    document.cookie =
      `${toggleCookie}=${encodeURIComponent(JSON.stringify({ showRight }))}` +
      `; path=/; max-age=31536000; SameSite=Lax`;
  }, [showRight, toggleCookie]);

  const toggleRight = useCallback(() => setShowRight((v) => !v), []);

  return (
    <Ctx.Provider value={{ showRight, toggleRight }}>{children}</Ctx.Provider>
  );
}

export function useMountState() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useMountState() must be used inside <MountStateProvider>");
  }
  return ctx;
}
