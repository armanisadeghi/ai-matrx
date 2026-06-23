"use client";

// features/rich-document/runtime/useActionSurfaceProvider.ts
//
// The shared "action surface provider" hook — the registration brain pulled
// out of RichDocument so it can be reused WITHOUT the content engine.
//
// Two consumers:
//   • RichDocument          — renders the MarkdownStream engine AND an inline
//                             variant; uses this hook for the live ctx, the
//                             resolved action list, and (for "remote") the
//                             provider/bridge registration.
//   • RichDocumentActionProvider — a headless component (renders null) for
//                             surfaces that draw their own content (editors,
//                             the working document) but want the same action
//                             toolkit in a remote <RichDocumentActionSurface/>.
//
// Load-bearing invariant (unchanged from RichDocument): the
// `richDocumentActionSurfaces` slice stores ONLY pure metadata. Handlers live
// in the module-scope registry (looked up by id at click time); live content
// is read through the providerBridge's getCtx() getter. No functions, content,
// or React elements ever enter Redux.

import * as React from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  registerProvider,
  unregisterProvider,
  updateProviderSpecs,
} from "../redux/actionSurfacesSlice";
import { getSourceAdapter } from "../actions/sources";
import { shortHash } from "../actions/sources/raw";
import { resolveActions } from "../actions/registry";
import { resolveActionLabel } from "../actions/utils";
// Side-effect import — registers every built-in action handler at module load.
// Without this, the registry is empty when resolveActions runs. Kept here (not
// only in RichDocument) so the headless provider works on its own.
import "../actions/handlers";
import {
  registerBridge,
  unregisterBridge,
  updateBridge,
} from "./providerBridge";
import type {
  ContentSource,
  RichDocumentAction,
  RichDocumentActionContext,
  RichDocumentActionSpec,
  RichDocumentActionsProp,
  RichDocumentActionsVariant,
  SourceExtensions,
} from "../types";

/**
 * Convert a resolved action list into the pure-metadata spec snapshot that's
 * safe to store in Redux. Strips functions, evaluates label/disabled callbacks
 * against the live context, picks an iconName for the renderer to look up.
 */
function actionsToSpecs(
  actions: RichDocumentAction[],
  ctx: RichDocumentActionContext,
): RichDocumentActionSpec[] {
  return actions.map((action) => {
    const disabledResult = action.disabled?.(ctx);
    const isDisabled =
      disabledResult === true ||
      (typeof disabledResult === "object" && disabledResult !== null);
    const disabledReason =
      typeof disabledResult === "object" && disabledResult !== null
        ? disabledResult.reason
        : undefined;
    return {
      id: action.id,
      label: resolveActionLabel(action.label, ctx),
      iconName: action.icon.displayName ?? action.icon.name ?? "Circle",
      category: action.category,
      renderSlot: action.renderSlot ?? "overflow",
      order: action.order ?? 0,
      disabled: isDisabled,
      disabledReason,
    };
  });
}

/**
 * Cheap fingerprint of a spec list so we can detect "the action set actually
 * changed" between renders and skip dispatch-thrash when nothing meaningful
 * moved. Not cryptographic — just identity for diffing.
 */
function specsKey(specs: RichDocumentActionSpec[]): string {
  return specs
    .map(
      (s) =>
        `${s.id}|${s.label}|${s.disabled ? 1 : 0}|${s.disabledReason ?? ""}`,
    )
    .join(";");
}

/**
 * Build the action context from plain values. Pure function — same inputs
 * always produce the same context. Called both during render (with live props)
 * and at handler-fire time (with ref values, from inside a callback closure
 * where reading .current is legal).
 */
function buildContext(args: {
  content: string;
  source: ContentSource;
  callbacks: RichDocumentActionsProp["callbacks"] | undefined;
  extensions: SourceExtensions | undefined;
  dispatch: ReturnType<typeof useAppDispatch>;
  isAuthenticated: boolean;
  isAdmin: boolean;
}): RichDocumentActionContext {
  const adapter = getSourceAdapter(args.source.type);
  const prefix = adapter.instanceKeyPrefix(args.source);
  // For raw sources, fold the content hash into the prefix so two raw
  // RichDocuments on the same page don't share overlay instance IDs.
  const instancePrefix =
    args.source.type === "raw"
      ? `${prefix}-${shortHash(args.content).slice(0, 8)}`
      : prefix;

  return {
    content: args.content,
    source: args.source,
    metadata: null, // Phase 1 populates from source-specific selectors
    dispatch: args.dispatch,
    isAuthenticated: args.isAuthenticated,
    isAdmin: args.isAdmin,
    isCreator: false, // Phase 1 wires from source-specific selector
    surfaceKey: null, // Phase 1 — surface routing wires through props
    onClose: () => {
      /* no-op; variants override when they own a menu */
    },
    instanceKey: (suffix: string) => `${instancePrefix}-${suffix}`,
    sourceAdapter: adapter,
    callbacks: args.callbacks,
    extensions: args.extensions,
  };
}

export interface UseActionSurfaceProviderArgs {
  content: string | undefined;
  source: ContentSource;
  actions?: RichDocumentActionsProp;
  /** Only "remote" registers to the Redux surface; all variants register the bridge. */
  actionsVariant: RichDocumentActionsVariant;
  /** Required when actionsVariant === "remote". */
  actionsSurfaceId?: string;
}

export interface UseActionSurfaceProviderResult {
  /** Render-time context (from props). Safe to read during render — used to
   * resolve auxiliary action sets (e.g. context-menu actions). */
  ctx: RichDocumentActionContext;
  /** Ref-based context factory. Read inside event handlers only. */
  getCtx: () => RichDocumentActionContext;
  /** The actions visible for this source + this consumer's exclude/extra. */
  resolvedActions: RichDocumentAction[];
}

/**
 * Register a RichDocument action provider (specs + bridge) for a surface and
 * expose the live context + resolved action list. See the file header for the
 * no-functions-in-Redux invariant.
 */
export function useActionSurfaceProvider(
  args: UseActionSurfaceProviderArgs,
): UseActionSurfaceProviderResult {
  const {
    content,
    source,
    actions: actionsProp,
    actionsVariant,
    actionsSurfaceId,
  } = args;

  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) =>
    Boolean(state.userAuth?.id),
  );
  const isAdmin = useAppSelector((state) => Boolean(state.userAuth?.isAdmin));

  // Per-instance provider ID — stable across renders.
  const providerId = React.useId();

  // Live refs — variant click handlers read these inside their closures so a
  // button clicked seconds after a content edit operates on the new content.
  // During render the values are read from props directly (refs are off-limits
  // during render per react-hooks/refs).
  const contentRef = React.useRef(content ?? "");
  const sourceRef = React.useRef<ContentSource>(source);
  const callbacksRef = React.useRef(actionsProp?.callbacks);
  const extensionsRef = React.useRef<SourceExtensions | undefined>(
    actionsProp?.extensions,
  );
  const dispatchRef = React.useRef(dispatch);
  const isAuthRef = React.useRef(isAuthenticated);
  const isAdminRef = React.useRef(isAdmin);
  React.useLayoutEffect(() => {
    contentRef.current = content ?? "";
    sourceRef.current = source;
    callbacksRef.current = actionsProp?.callbacks;
    extensionsRef.current = actionsProp?.extensions;
    dispatchRef.current = dispatch;
    isAuthRef.current = isAuthenticated;
    isAdminRef.current = isAdmin;
  });

  // Factory for the live action context. Reads from refs at invocation time
  // (legal inside event handlers — only render-time reads are banned).
  const getCtx = (): RichDocumentActionContext =>
    buildContext({
      content: contentRef.current,
      source: sourceRef.current,
      callbacks: callbacksRef.current,
      extensions: extensionsRef.current,
      dispatch: dispatchRef.current,
      isAuthenticated: isAuthRef.current,
      isAdmin: isAdminRef.current,
    });

  // Build the live context from props for render-time spec computation.
  const ctx = buildContext({
    content: content ?? "",
    source,
    callbacks: actionsProp?.callbacks,
    extensions: actionsProp?.extensions,
    dispatch,
    isAuthenticated,
    isAdmin,
  });

  // Resolve which actions are visible for this source + this consumer's
  // exclude/extra config. Used both for inline variants and to compute the
  // spec snapshot stored in the remote-surface slice.
  const resolvedActions = resolveActions(ctx, {
    exclude: actionsProp?.exclude,
    extra: actionsProp?.extra,
  });
  const specs = actionsToSpecs(resolvedActions, ctx);

  // Remote-surface registration — only when actionsVariant === "remote".
  // Initial mount registers the provider; spec changes are pushed via
  // updateProviderSpecs (no re-register, just a metadata refresh).
  const lastSpecsKey = React.useRef<string>("");
  React.useEffect(() => {
    if (actionsVariant !== "remote" || !actionsSurfaceId) return;
    dispatch(
      registerProvider({
        surfaceId: actionsSurfaceId,
        registration: {
          providerId,
          computedActionSpecs: specs,
          sourceType: source.type,
        },
      }),
    );
    lastSpecsKey.current = specsKey(specs);
    return () => {
      dispatch(
        unregisterProvider({
          surfaceId: actionsSurfaceId,
          providerId,
        }),
      );
    };
    // Intentionally deps-light: registration is "once per mount". Spec updates
    // happen via the separate effect below so we don't churn through
    // register/unregister on every content change.
  }, [actionsVariant, actionsSurfaceId, providerId, dispatch, source.type]);

  // Push spec updates without re-registering when the resolved set changes
  // (e.g. content length flipped a `visible` predicate, or admin status
  // changed). Cheap; only touches the one stack entry.
  React.useEffect(() => {
    if (actionsVariant !== "remote" || !actionsSurfaceId) return;
    const key = specsKey(specs);
    if (key === lastSpecsKey.current) return;
    lastSpecsKey.current = key;
    dispatch(
      updateProviderSpecs({
        surfaceId: actionsSurfaceId,
        providerId,
        computedActionSpecs: specs,
      }),
    );
  }, [actionsVariant, actionsSurfaceId, providerId, dispatch, specs]);

  // Bridge registration — the module-scope side channel that lets a remote
  // RichDocumentActionSurface invoke handlers without functions traversing
  // Redux. Registered for every actionsVariant (not just "remote") so the
  // bridge is always available; harmless when no surface is consuming it.
  React.useEffect(() => {
    registerBridge(providerId, { getCtx, resolvedActions });
    return () => unregisterBridge(providerId);
    // Re-registration on every relevant change happens via updateBridge below.
  }, [providerId]);
  React.useEffect(() => {
    updateBridge(providerId, { getCtx, resolvedActions });
  });

  return { ctx, getCtx, resolvedActions };
}
