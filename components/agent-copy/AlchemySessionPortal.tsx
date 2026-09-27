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
import {
  currentAlchemySession,
  subscribeAlchemySession,
  type AlchemySessionRequest,
} from "./alchemy-session";

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
  return error instanceof Error ? error.message : "Unknown error";
}

function AlchemySession({ request }: { request: AlchemySessionRequest }) {
  const controller = React.useRef<ContentTransferController>(null);
  const capabilities = useContentTransferCapabilities();
  const router = useRouter();
  const ran = React.useRef(false);

  React.useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const { intent } = request;
    if (intent.kind === "prepare") {
      const variant = intent.variantId ? request.variants?.find((v) => v.id === intent.variantId) : undefined;
      const open = variant
        ? controller.current?.prepare(variant.source, { id: variant.id, label: variant.label })
        : controller.current?.preparePrimary();
      if (!open) {
        toast.error("Alchemy could not open", { description: "Reload the page and try again." });
        return;
      }
      void open.catch((error: unknown) => toast.error("Alchemy could not open", { description: errorText(error) }));
      return;
    }
    const actions = [
      ...(capabilities.email ? createTransferEmailActions(capabilities.email) : []),
      ...(capabilities.actions ?? []),
    ];
    const action = actions.find((a) => a.id === intent.actionId);
    if (!action) {
      toast.error(`${intent.label} is not available`, {
        description: "Sign in and choose an organization to use Matrx destinations.",
      });
      return;
    }
    const toastId = toast.loading(`${intent.label}…`);
    const controllerAbort = new AbortController();
    void (async () => {
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
    />
  );
}

export default AlchemySessionPortal;
