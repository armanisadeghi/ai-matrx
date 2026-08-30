"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";

const CHANNEL = "popup-demo";

type DemoState = {
  counter: number;
  message: string;
};

type SyncMessage =
  | { type: "state"; state: DemoState; from: "opener" | "popup" }
  | { type: "request-state"; from: "opener" | "popup" };

export default function PopupWindowClient() {
  const [state, setState] = useState<DemoState>({
    counter: 0,
    message: "(waiting for opener…)",
  });
  const [hasOpener, setHasOpener] = useState(false);

  const channelRef = useRef<BroadcastChannel | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    setHasOpener(Boolean(window.opener));

    const ch = new BroadcastChannel(CHANNEL);
    channelRef.current = ch;

    ch.onmessage = (event: MessageEvent<SyncMessage>) => {
      const data = event.data;
      if (data.type === "state" && data.from === "opener") {
        setState(data.state);
      } else if (data.type === "request-state") {
        ch.postMessage({
          type: "state",
          state: stateRef.current,
          from: "popup",
        } satisfies SyncMessage);
      }
    };

    ch.postMessage({
      type: "request-state",
      from: "popup",
    } satisfies SyncMessage);

    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, []);

  const broadcast = useCallback((next: DemoState) => {
    channelRef.current?.postMessage({
      type: "state",
      state: next,
      from: "popup",
    } satisfies SyncMessage);
  }, []);

  const updateState = useCallback(
    (updater: (prev: DemoState) => DemoState) => {
      setState((prev) => {
        const next = updater(prev);
        broadcast(next);
        return next;
      });
    },
    [broadcast],
  );

  return (
    <div className="p-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">Popup Window</h1>
        <p className="text-xs text-muted-foreground">
          {hasOpener
            ? "Connected to opener via BroadcastChannel."
            : "No opener detected — you may have navigated here directly."}
        </p>
      </header>

      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Shared counter</label>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateState((s) => ({ ...s, counter: s.counter - 1 }))
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
                updateState((s) => ({ ...s, counter: s.counter + 1 }))
              }
            >
              +
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="popup-message">
            Shared message
          </label>
          <Input
            id="popup-message"
            value={state.message}
            onChange={(e) =>
              updateState((s) => ({ ...s, message: e.target.value }))
            }
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => window.close()}>
          Close window
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Changes here are broadcast back to the opener. Open the demo page and
        this popup side by side.
      </p>
    </div>
  );
}
