/**
 * components/dialogs/scope-mismatch/ScopeMismatchDialogHostImpl.tsx
 *
 * Heavy implementation of the global chat↔scope mismatch dialog host.
 * Mounted lazily by `ScopeMismatchDialogHost.tsx` via
 * `next/dynamic({ ssr: false })`.
 *
 * Imperative model (mirrors ValuePromptsDialogHostImpl):
 * `promptScopeMismatch(...)` calls push requests onto a ref-backed queue;
 * this component drains one at a time and renders a single dialog showing
 * both scope sets by name grouped by scope type. Any of the three action
 * buttons resolves its choice; dismiss (Escape / outside click / X)
 * resolves `"cancel"` — the caller aborts the send, composer text intact.
 */

"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type {
  ScopeMismatchChoice,
  ScopeMismatchDisplayItem,
} from "@/features/scopes/utils/scopeMismatch";
import {
  _registerHost,
  _unregisterHost,
  type ScopeMismatchRequest,
} from "./scopeMismatchOpener";

interface ActiveRequest {
  req: ScopeMismatchRequest;
  resolve: (choice: ScopeMismatchChoice) => void;
}

function ScopeSetList({
  heading,
  items,
}: {
  heading: string;
  items: ScopeMismatchDisplayItem[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">None</div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => (
            <li key={item.id} className="text-sm text-foreground">
              <span className="text-muted-foreground">{item.typeLabel}:</span>{" "}
              {item.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ScopeMismatchDialogHostImpl() {
  const [active, setActive] = React.useState<ActiveRequest | null>(null);
  const [tick, setTick] = React.useState(0);
  const queueRef = React.useRef<ActiveRequest[]>([]);

  React.useEffect(() => {
    const controller = {
      show: (
        req: ScopeMismatchRequest,
        resolve: (choice: ScopeMismatchChoice) => void,
      ) => {
        queueRef.current.push({ req, resolve });
        setTick((n) => n + 1);
      },
    };
    _registerHost(controller);
    return () => _unregisterHost(controller);
  }, []);

  React.useEffect(() => {
    if (active === null && queueRef.current.length > 0) {
      setActive(queueRef.current.shift()!);
    }
  }, [active, tick]);

  const resolveWith = React.useCallback(
    (choice: ScopeMismatchChoice) => {
      if (!active) return;
      active.resolve(choice);
      setActive(null);
    },
    [active],
  );

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (open) return;
      resolveWith("cancel");
    },
    [resolveWith],
  );

  return (
    <Dialog open={!!active} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            This chat&apos;s context differs from your current selection
          </DialogTitle>
          <DialogDescription>
            Choose which scopes this chat should run under. Dismissing
            cancels the send — your message stays in the composer.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1 sm:grid-cols-2">
          <ScopeSetList
            heading="Current selection"
            items={active?.req.current ?? []}
          />
          <ScopeSetList
            heading="This chat's context"
            items={active?.req.chat ?? []}
          />
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => resolveWith("keep")}
          >
            Keep chat&apos;s context
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => resolveWith("combine")}
          >
            Combine both
          </Button>
          <Button type="button" onClick={() => resolveWith("update")}>
            Use current selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
