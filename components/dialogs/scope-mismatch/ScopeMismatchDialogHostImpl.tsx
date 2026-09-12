/**
 * components/dialogs/scope-mismatch/ScopeMismatchDialogHostImpl.tsx
 *
 * Heavy implementation of the global chat↔scope mismatch dialog host.
 * Mounted lazily by `ScopeMismatchDialogHost.tsx` via
 * `next/dynamic({ ssr: false })`.
 *
 * Imperative model: `promptScopeMismatch(...)` pushes a request into the
 * opener's queue and `useOpenerHost` (`@ai-matrx/kit/opener-react`) drains it
 * one at a time — the registration, queue and settle-once machinery are the
 * package's, never re-implemented here. This component renders a single dialog
 * showing both scope sets by name, grouped by scope type. Any of the three
 * action buttons resolves its choice; dismiss (Escape / outside click / X)
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
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useOpenerHost } from "@ai-matrx/kit/opener-react";
import type {
  ScopeMismatchChoice,
  ScopeMismatchDisplayItem,
} from "@/features/scopes/utils/scopeMismatch";
import { scopeMismatchOpener } from "./scopeMismatchOpener";

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
          {/* THE DOOR LAW: this dialog asks the user to CHOOSE between two
              scope sets, and named every scope as flat text — deciding without
              being able to look at either option. `item.id` is the real scope
              id (scopeMismatch.ts builds it from the scope tree), so EntityRef
              resolves the route and the peek.

              Linked even when the tree could not resolve the name: the
              fallback keeps the REAL id and only the label is unknown, and
              `/scopes/s/<id>` exists precisely to resolve a scope from its id
              alone — so the door is most valuable exactly where the client
              knows least. */}
          {items.map((item) => (
            <li
              key={item.id}
              className="flex min-w-0 items-center gap-1 text-sm text-foreground"
            >
              <span className="shrink-0 text-muted-foreground">
                {item.typeLabel}:
              </span>
              <EntityRef
                token="scope"
                id={item.id}
                name={item.name}
                showIcon={false}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ScopeMismatchDialogHostImpl() {
  const { request, open, settle } = useOpenerHost(scopeMismatchOpener);

  const resolveWith = React.useCallback(
    (choice: ScopeMismatchChoice) => settle(choice),
    [settle],
  );

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) return;
      resolveWith("cancel");
    },
    [resolveWith],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            items={request?.current ?? []}
          />
          <ScopeSetList
            heading="This chat's context"
            items={request?.chat ?? []}
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
