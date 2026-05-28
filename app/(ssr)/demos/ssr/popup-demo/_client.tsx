"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CHANNEL = "popup-demo";
const POPUP_PATH = "/popup-window";

type DemoState = {
  counter: number;
  message: string;
};

type SyncMessage =
  | { type: "state"; state: DemoState; from: "opener" | "popup" }
  | { type: "request-state"; from: "opener" | "popup" };

export default function PopupDemoClient() {
  const [state, setState] = useState<DemoState>({
    counter: 0,
    message: "Hello from the opener!",
  });
  const [popupOpen, setPopupOpen] = useState(false);
  const [blockerMessage, setBlockerMessage] = useState<string | null>(null);
  const [isMobileLike, setIsMobileLike] = useState(false);

  const popupRef = useRef<Window | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const touchPrimary = window.matchMedia("(pointer: coarse)").matches;
    const narrow = window.innerWidth < 768;
    setIsMobileLike(touchPrimary && narrow);
  }, []);

  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL);
    channelRef.current = ch;

    ch.onmessage = (event: MessageEvent<SyncMessage>) => {
      const data = event.data;
      if (data.type === "state" && data.from === "popup") {
        setState(data.state);
      } else if (data.type === "request-state") {
        ch.postMessage({
          type: "state",
          state: stateRef.current,
          from: "opener",
        } satisfies SyncMessage);
      }
    };

    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    channelRef.current?.postMessage({
      type: "state",
      state,
      from: "opener",
    } satisfies SyncMessage);
  }, [state]);

  useEffect(() => {
    if (!popupRef.current) return;
    const interval = window.setInterval(() => {
      if (popupRef.current?.closed) {
        setPopupOpen(false);
        popupRef.current = null;
        window.clearInterval(interval);
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [popupOpen]);

  const openPopup = useCallback(() => {
    setBlockerMessage(null);
    const features = "popup=yes,width=480,height=640,left=200,top=200";
    const win = window.open(POPUP_PATH, "popup-demo-window", features);
    if (!win) {
      setBlockerMessage(
        "Popup was blocked by the browser. Check the address bar for a popup-blocked indicator and allow it for this site.",
      );
      return;
    }
    popupRef.current = win;
    setPopupOpen(true);
    win.focus();
  }, []);

  const openPopupDelayed = useCallback(() => {
    setBlockerMessage(
      "Waiting 1.5s, then calling window.open outside the click gesture…",
    );
    window.setTimeout(() => {
      const win = window.open(
        POPUP_PATH,
        "popup-demo-window-delayed",
        "popup=yes,width=480,height=640",
      );
      if (!win) {
        setBlockerMessage(
          "Blocked! This confirms: window.open outside a user gesture is blocked by the popup blocker.",
        );
        return;
      }
      setBlockerMessage("Opened — your browser allowed this async popup.");
      popupRef.current = win;
      setPopupOpen(true);
    }, 1500);
  }, []);

  const closePopup = useCallback(() => {
    popupRef.current?.close();
    popupRef.current = null;
    setPopupOpen(false);
  }, []);

  return (
    <div className="space-y-6">
      {isMobileLike && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <strong>Mobile detected.</strong> Tapping &quot;Open popup&quot; will
          open a new tab — mobile browsers ignore size/popup hints. For true
          mobile overlays, use an in-app modal/drawer instead.
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Opener window (this page)</h2>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              popupOpen
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            Popup: {popupOpen ? "open" : "closed"}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Shared counter</label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setState((s) => ({ ...s, counter: s.counter - 1 }))
                }
              >
                −
              </Button>
              <div className="min-w-12 text-center text-2xl font-mono tabular-nums">
                {state.counter}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setState((s) => ({ ...s, counter: s.counter + 1 }))
                }
              >
                +
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="shared-message">
              Shared message
            </label>
            <Input
              id="shared-message"
              value={state.message}
              onChange={(e) =>
                setState((s) => ({ ...s, message: e.target.value }))
              }
              placeholder="Type to sync live"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={openPopup} disabled={popupOpen}>
            Open popup (inside click)
          </Button>
          <Button variant="outline" onClick={openPopupDelayed}>
            Open popup (delayed 1.5s — blocker test)
          </Button>
          <Button variant="ghost" onClick={closePopup} disabled={!popupOpen}>
            Close popup
          </Button>
        </div>

        {blockerMessage && (
          <div className="text-sm rounded-md border border-border bg-muted/50 px-3 py-2 text-muted-foreground">
            {blockerMessage}
          </div>
        )}

        <p className="text-xs text-muted-foreground pt-2 border-t border-border">
          Changes to counter or message are broadcast to the popup in real time,
          and changes made inside the popup stream back here. Try it.
        </p>
      </div>
    </div>
  );
}
