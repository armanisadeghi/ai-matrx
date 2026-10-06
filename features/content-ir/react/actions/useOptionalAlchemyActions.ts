"use client";

/**
 * The app's ONE action registry + ports when rendered inside the host's
 * `<AlchemyActionsProvider>` (components/agent-copy/AlchemyHost), else null.
 *
 * `useAlchemyActions` throws outside the provider, and a kind component or an
 * assist chip must never crash a render (bare renders, tests, a tree mounted
 * outside the app Providers). The package shares its context through
 * `globalThis[Symbol.for("ai-matrx.alchemy.actions-context")]` so every bundle
 * reads the same provider; importing `/react/host` creates it. This reads that
 * same context without the throw. Belongs in `@ai-matrx/alchemy/react/host`
 * as `useOptionalAlchemyActions` — replace this file when the package ships it.
 */

import { createContext, useContext, type Context } from "react";
import type { AlchemyActionsValue } from "@ai-matrx/alchemy/react/host";
import "@ai-matrx/alchemy/react/host";

const KEY = Symbol.for("ai-matrx.alchemy.actions-context");
type Holder = { [KEY]?: Context<AlchemyActionsValue | null> };
const NONE = createContext<AlchemyActionsValue | null>(null);

export function useOptionalAlchemyActions(): AlchemyActionsValue | null {
  return useContext((globalThis as Holder)[KEY] ?? NONE);
}
