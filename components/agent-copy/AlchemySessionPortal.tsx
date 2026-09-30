"use client";

// AlchemySessionPortal — runs the requests filed through `openAlchemySession`
// (./alchemy-session) with the app's real Alchemy capabilities. Mounted ONCE,
// inside <AlchemyHost>, so every handler anywhere reaches the SAME preparation
// workspace and the SAME destination actions the Alchemy menu offers.
//
//   prepare → a hidden <ContentTransferMenu> for the source opens its
//             preparation workspace (the canonical one: trim, sections, AI
//             preparation, "Use prepared content" destinations).
//   action  → the destination action the palette would run (same id, same
//             capture → draft → limits → supports → run), outcome announced.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ContentTransferMenu,
  createTransferEmailActions,
  useContentTransferCapabilities,
  type ContentTransferController,
} from "@ai-matrx/design-system/content-transfer";
import {
  applyTransferLimits,
  capture,
  createDraft,
  resolveTransferPreferences,
} from "@ai-matrx/kit/content-transfer";
import { toast } from "@/lib/toast";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import {
  ensureOrganizationForWrite,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";
import {
  currentAlchemySession,
  subscribeAlchemySession,
  type AlchemySessionRequest,
} from "./alchemy-session";
import { extractErrorMessage } from "@/utils/errors";

export function AlchemySessionPortal() {
  const request = React.useSyncExternalStore(
    subscribeAlchemySession,
    currentAlchemySession,
    () => null,
  );
  if (!request) return null;
  return <AlchemySession key={request.key} request={request} />;
}

function errorText(error: unknown): string {
  return extractErrorMessage(error, "Unknown error");
}

function AlchemySession({ request }: { request: AlchemySessionRequest }) {
  const controller = React.useRef<ContentTransferController>(null);
  const capabilities = useContentTransferCapabilities();
  const router = useRouter();
  const ran = React.useRef(false);
  // The destinations are offered only with a workspace selected; the run below
  // may ASK for one and must then read the capabilities the pick produced.
  const capabilitiesRef = React.useRef(capabilities);
  capabilitiesRef.current = capabilities;
  // This source's own engines for built-in format names (stable per request).
  const localCapabilities = React.useMemo(
    () => (request.formats ? { formats: [...request.formats] } : undefined),
    [request.formats],
  );

  React.useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const { intent } = request;
    const hasWorkspace = () => {
      const state = getStoreSingleton()?.getState() as { appContext?: { organization_id?: string | null } } | undefined;
      return Boolean(state?.appContext?.organization_id);
    };
    if (intent.kind === "prepare") {
      const openWorkspace = () => {
        const variant = intent.variantId ? request.variants?.find((v) => v.id === intent.variantId) : undefined;
        const open = variant
          ? controller.current?.prepare(variant.source, { id: variant.id, label: variant.label })
          : controller.current?.preparePrimary();
        if (!open) {
          toast.error("Alchemy could not open", { description: "Reload the page and try again." });
          return;
        }
        void open.catch((error: unknown) => toast.error("Alchemy could not open", { description: errorText(error) }));
      };
      if (!intent.forDestination || hasWorkspace()) {
        openWorkspace();
        return;
      }
      // Pressed to SEND somewhere with no organization chosen: ask through the one write helper,
      // then wait for the host to re-render with the destinations (the menu remounts on the new
      // identity) before the workspace opens. Dismiss = the workspace opens without destinations.
      void (async () => {
        try {
          await ensureOrganizationForWrite();
          for (let i = 0; i < 40 && !(capabilitiesRef.current.actions ?? []).length; i++) {
            await new Promise((r) => setTimeout(r, 50));
          }
          await new Promise((r) => setTimeout(r, 0));
        } catch (error) {
          if (!isOrganizationSelectionCancelled(error)) {
            toast.error("Choosing an organization did not work", { description: errorText(error) });
          }
        }
        openWorkspace();
      })();
      return;
    }
    const findAction = () => {
      const caps = capabilitiesRef.current;
      const actions = [
        ...(caps.email ? createTransferEmailActions(caps.email) : []),
        ...(caps.actions ?? []),
      ];
      return actions.find((a) => a.id === intent.actionId);
    };
    const controllerAbort = new AbortController();
    void (async () => {
      let action = findAction();
      // A Matrx destination is filed under a workspace. With none selected the
      // person pressed this row, so ASK through the one write helper (never a
      // bare "not available"); the pick re-renders the host with the
      // destinations, which we wait for. Dismiss = nothing happened.
      if (!action && !hasWorkspace()) {
        try {
          await ensureOrganizationForWrite();
        } catch (error) {
          if (isOrganizationSelectionCancelled(error)) return;
          toast.error(`${intent.label} did not work`, { description: errorText(error) });
          return;
        }
        for (let i = 0; i < 40 && !action; i++) {
          await new Promise((r) => setTimeout(r, 50));
          action = findAction();
        }
      }
      if (!action) {
        // Say what is TRUE: signed out → sign in; signed in (the workspace was
        // asked for above) → this host did not offer the destination.
        const signedIn = Boolean(selectUserId(getStoreSingleton()?.getState() as Parameters<typeof selectUserId>[0]));
        toast.error(`${intent.label} did not open`, {
          description: signedIn
            ? "This page did not offer that destination. Reload the page and try again."
            : "Sign in to save or send from here.",
        });
        return;
      }
      const toastId = toast.loading(`${intent.label}…`);
      try {
        const source = request.formatSources?.markdown ?? request.source;
        const { snapshot } = await capture(source, controllerAbort.signal);
        const limits = resolveTransferPreferences(undefined, capabilities.preferences, snapshot.limits).limits;
        const draft = applyTransferLimits(createDraft(snapshot), limits);
        if (snapshot.coverage.status !== "complete" || draft.omissions.length) {
          throw new Error("This content is partial or needs reductions. Use Copy for AI… to review it first.");
        }
        if (!action.supports(snapshot, draft)) throw new Error(`${intent.label} is unavailable for this content.`);
        const outcome = (await action.run({ snapshot, draft, signal: controllerAbort.signal })) as
          | { status?: string; message?: string; href?: string; label?: string }
          | undefined;
        if (outcome && outcome.status === "error") throw new Error(outcome.message ?? "It did not work.");
        const href = outcome && typeof outcome.href === "string" ? outcome.href : null;
        toast.success(`${intent.label}: done`, {
          id: toastId,
          ...(href ? { action: { label: "Open", onClick: () => router.push(href) } } : {}),
        });
      } catch (error) {
        toast.error(`${intent.label} did not work`, { id: toastId, description: errorText(error) });
      }
    })();
  }, [capabilities, request, router]);

  return (
    <ContentTransferMenu
      triggerHidden
      controllerRef={controller}
      source={request.source}
      label={request.label}
      {...(request.formatSources ? { formatSources: request.formatSources } : {})}
      {...(request.variants ? { variants: request.variants } : {})}
      {...(request.envelope ? { envelope: () => request.envelope } : {})}
      {...(localCapabilities ? { capabilities: localCapabilities } : {})}
    />
  );
}

export default AlchemySessionPortal;
