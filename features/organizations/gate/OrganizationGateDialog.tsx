"use client";

/**
 * The organization gate's UI half — one dialog, mounted once, app-wide.
 *
 * It appears only when an action the person just took cannot proceed without
 * knowing which workspace it belongs to. It is deliberately NOT a nag, NOT a
 * boot-time prompt, and NOT a router guard: no action in flight, no dialog.
 *
 * The contract with `lib/organization/organization-gate.ts`:
 *   Continue → commit the choice globally, then settle with the id. The
 *              blocked action resumes and lands in the chosen workspace.
 *   Cancel   → settle with `null`. The caller throws
 *              `OrganizationSelectionCancelled`, which every call site treats
 *              as "nothing happened" — Arman's rule: you come right back to
 *              where you were.
 *
 * The dialog can only ever CLOSE by settling. Escape, the overlay backdrop, and
 * unmount all route through `cancel()`, because a promise that is never settled
 * is an action wedged forever.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
// eslint-disable-next-line no-restricted-syntax -- Surface A: this IS the first-org-choice writer
import { resolveOrganizationForBlockedAction } from "@/lib/redux/slices/appContextSlice";
import { useUserOrganizations } from "@/features/organizations/hooks";
import {
  registerOrganizationPicker,
  settleOrganizationSelection,
} from "@/lib/organization/organization-gate";

export function OrganizationGateDialog() {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const { organizations, loading, error } = useUserOrganizations();

  // Register the opener so the gate can ask. Unregistering on unmount matters:
  // with no picker reachable, `ensureOrganizationContext` re-throws the plain
  // fail-closed error instead of awaiting a dialog that will never appear.
  useEffect(() => {
    registerOrganizationPicker(() => setOpen(true));
    return () => registerOrganizationPicker(null);
  }, []);

  // A dialog that unmounts mid-question must not strand the awaiting action.
  useEffect(
    () => () => {
      settleOrganizationSelection(null);
    },
    [],
  );

  const sorted = useMemo(
    () =>
      [...organizations].sort((a, b) => {
        // Personal last: this dialog exists because personal was being chosen
        // silently, so it must never be the eye's default landing spot.
        if (a.isPersonal !== b.isPersonal) return a.isPersonal ? 1 : -1;
        return (a.name ?? "").localeCompare(b.name ?? "");
      }),
    [organizations],
  );

  const cancel = useCallback(() => {
    setOpen(false);
    setChosenId(null);
    settleOrganizationSelection(null);
  }, []);

  const confirm = useCallback(() => {
    if (!chosenId) return;
    const org = sorted.find((o) => o.id === chosenId);
    // Commit globally FIRST so the answer outlives this one action — the next
    // thing they do already knows the workspace, exactly as if they had chosen
    // it from the switcher.
    dispatch(
      resolveOrganizationForBlockedAction({
        id: chosenId,
        name: org?.name ?? null,
      }),
    );
    setOpen(false);
    setChosenId(null);
    settleOrganizationSelection(chosenId);
  }, [chosenId, dispatch, sorted]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) cancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Which workspace is this for?</DialogTitle>
          <DialogDescription>
            You don&apos;t have an organization selected yet. Pick one and we
            &apos;ll finish what you started — it becomes your active workspace
            from here on.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-1 overflow-y-auto py-1">
          {loading ? (
            <p className="px-1 py-6 text-sm text-muted-foreground">
              Loading your organizations…
            </p>
          ) : error ? (
            <p className="px-1 py-6 text-sm text-destructive">{error}</p>
          ) : sorted.length === 0 ? (
            <p className="px-1 py-6 text-sm text-muted-foreground">
              You don&apos;t belong to any organization yet.
            </p>
          ) : (
            sorted.map((org) => {
              const selected = org.id === chosenId;
              return (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => setChosenId(org.id)}
                  aria-pressed={selected}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-transparent hover:bg-muted"
                  }`}
                >
                  <span className="truncate font-medium">{org.name}</span>
                  {org.isPersonal ? (
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                      Personal
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!chosenId}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OrganizationGateDialog;
