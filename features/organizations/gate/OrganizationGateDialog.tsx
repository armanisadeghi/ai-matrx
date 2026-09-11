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

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  resolveOrganizationForBlockedAction,
  selectOrganizationId,
} from "@/lib/redux/slices/appContextSlice";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  hasPendingOrganizationRequest,
  registerOrganizationPicker,
  settleOrganizationSelection,
} from "@/lib/organization/organization-gate";

export function OrganizationGateDialog() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [open, setOpen] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const userId = useAppSelector(selectUserId);
  // The header and this action gate must see the SAME membership list. A
  // second component-local fetch can remain pending while the header is ready.
  const { organizations, status, error, refresh } = useScopeTree();
  const loading =
    organizations.length === 0 && (status === "idle" || status === "loading");

  useEffect(() => {
    if (open && userId) void dispatch(ensureScopeTree({}));
  }, [open, userId, dispatch]);

  useEffect(() => {
    const resumeSelectedOrganization = () => {
      if (!hasPendingOrganizationRequest()) return false;
      const state = store.getState();
      const activeOrgId = selectOrganizationId(state);
      if (!selectUserId(state) || !activeOrgId) return false;
      // The selected org can arrive AFTER send opens the dialog. Subscribe to
      // the same store as the header and resume the parked action immediately.
      settleOrganizationSelection(activeOrgId);
      setOpen(false);
      setChosenId(null);
      return true;
    };
    registerOrganizationPicker(() => {
      if (!resumeSelectedOrganization()) setOpen(true);
    });
    const unsubscribe = store.subscribe(resumeSelectedOrganization);
    return () => {
      unsubscribe();
      registerOrganizationPicker(null);
      settleOrganizationSelection(null);
    };
  }, [store]);

  const sorted = [...organizations].sort((a, b) => {
    if (a.is_personal !== b.is_personal) return a.is_personal ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  const cancel = () => {
    setOpen(false);
    setChosenId(null);
    settleOrganizationSelection(null);
  };

  const confirm = () => {
    if (!chosenId || !userId) return;
    const org = sorted.find((o) => o.id === chosenId);
    if (!org) return;
    // Commit globally FIRST so the answer outlives this one action — the next
    // thing they do already knows the workspace, exactly as if they had chosen
    // it from the switcher.
    dispatch(
      resolveOrganizationForBlockedAction({
        id: chosenId,
        name: org.name,
      }),
    );
    setOpen(false);
    setChosenId(null);
    settleOrganizationSelection(chosenId);
  };

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
            Choose the workspace for this action. We&apos;ll continue where you
            left off and use it as your active workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-1 overflow-y-auto py-1">
          {!userId ? (
            <p role="alert" className="px-1 py-6 text-sm text-destructive">
              Your session is unavailable. Sign in again to continue; nothing
              has been submitted.
            </p>
          ) : error && organizations.length === 0 ? (
            <div role="alert" className="space-y-2 px-1 py-6">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => void refresh()}>
                Try again
              </Button>
            </div>
          ) : loading ? (
            <p className="px-1 py-6 text-sm text-muted-foreground">
              Loading your organizations…
            </p>
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
                  {org.is_personal ? (
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
          <Button
            onClick={confirm}
            disabled={!userId || !sorted.some((org) => org.id === chosenId)}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OrganizationGateDialog;
