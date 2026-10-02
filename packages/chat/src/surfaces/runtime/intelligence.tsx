"use client";

/**
 * THE SURFACE INTELLIGENCE SEAM (CPM-009a, P19).
 *
 * Feature intelligence — the icon beside a control that runs AI jobs, the
 * declared places per feature, the intelligence pages' links — is a host
 * feature (matrx-frontend `features/mandates/feature-intelligence`). The
 * package reads it only through this port, registered once at startup
 * (matrx-frontend: `providers/ChatSurfaceRegistrations.tsx`).
 *
 * Unregistered (a bare host): the icon renders nothing, no page jobs are
 * declared, and the first read says so once on the console with the remedy
 * (PACKAGE-INDEPENDENCE §5.1). Kept on `globalThis` so the server-render and
 * browser module instances read one registration.
 */
import type { ComponentType } from "react";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import type {
  FeaturePlaces,
  IntelligenceContext,
  IntelligenceIndicatorProps,
  PageIntelligenceDoor,
} from "./intelligence-types";

export interface SurfaceIntelligencePort {
  /** The intelligence icon (a small mark that lists the jobs behind a spot). */
  Indicator: ComponentType<IntelligenceIndicatorProps>;
  /** Jobs declared for the route on screen. */
  declaredKeysForRoute(pathname: string): AnyMandateKey[];
  /** React hook: the doors the mounted page registered. Must be a stable hook. */
  usePageIntelligenceDoors(): readonly PageIntelligenceDoor[];
  /** One feature's declared places, or null. */
  declaredPlacesFor(feature: string): FeaturePlaces | null;
  /** The intelligence page link for a feature (and optionally one job). */
  featureIntelligenceHref(
    feature: string,
    options?: { mandateKey?: AnyMandateKey | null; context?: IntelligenceContext },
  ): string;
  /** The registry target (intelligence page) a job key lands on. */
  targetForKey(mandateKey: AnyMandateKey): string;
}

const SLOT = Symbol.for("@ai-matrx/chat/surfaces/intelligence-port");

type Slot = { port: SurfaceIntelligencePort | null; announced: boolean };

function slot(): Slot {
  const holder = globalThis as unknown as Record<symbol, Slot | undefined>;
  let current = holder[SLOT];
  if (!current) {
    current = { port: null, announced: false };
    holder[SLOT] = current;
  }
  return current;
}

const NO_DOORS: readonly PageIntelligenceDoor[] = [];

const UNREGISTERED: SurfaceIntelligencePort = {
  Indicator: () => null,
  declaredKeysForRoute: () => [],
  usePageIntelligenceDoors: () => NO_DOORS,
  declaredPlacesFor: () => null,
  featureIntelligenceHref: () => "",
  targetForKey: () => "",
};

function port(): SurfaceIntelligencePort {
  const current = slot();
  if (current.port) return current.port;
  if (!current.announced) {
    current.announced = true;
    console.warn(
      "[chat surfaces] No feature-intelligence port is registered, so intelligence icons and page " +
        "jobs are hidden. Register one at startup with registerSurfaceIntelligence() from " +
        "@ai-matrx/chat/surfaces/runtime/intelligence.",
    );
  }
  return UNREGISTERED;
}

/** Register the host's feature-intelligence port. Returns an unregister function. */
export function registerSurfaceIntelligence(next: SurfaceIntelligencePort): () => void {
  const current = slot();
  const previous = current.port;
  current.port = next;
  return () => {
    if (current.port === next) current.port = previous;
  };
}

/** True once a host registered its feature-intelligence port. */
export function hasSurfaceIntelligence(): boolean {
  return slot().port !== null;
}

/** The host's intelligence icon; renders nothing when no host registered one. */
export function IntelligenceIndicator(props: IntelligenceIndicatorProps) {
  const Indicator = port().Indicator;
  return <Indicator {...props} />;
}

export function declaredKeysForRoute(pathname: string): AnyMandateKey[] {
  return port().declaredKeysForRoute(pathname);
}

export function usePageIntelligenceDoors(): readonly PageIntelligenceDoor[] {
  return port().usePageIntelligenceDoors();
}

export function declaredPlacesFor(feature: string): FeaturePlaces | null {
  return port().declaredPlacesFor(feature);
}

export function featureIntelligenceHref(
  feature: string,
  options?: { mandateKey?: AnyMandateKey | null; context?: IntelligenceContext },
): string {
  return port().featureIntelligenceHref(feature, options);
}

export function targetForKey(mandateKey: AnyMandateKey): string {
  return port().targetForKey(mandateKey);
}
