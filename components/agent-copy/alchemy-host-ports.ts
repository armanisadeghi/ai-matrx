/**
 * The app's Alchemy host ports (Matrx Alchemy ALC-13/14), bound ONCE, at the
 * boundary where `AlchemyHost` is mounted.
 *
 * Ports arrive with the wave that needs them (CONTRACT §2.2, chair ruling N8):
 *
 *   kinds        ALC-13  the app's one kind validator (`kindValidator`, built
 *                        by `@ai-matrx/content-ir` over the app's
 *                        `SchemaSourcePort`)
 *   diagnostics  ALC-13  REQUIRED — contract breaks land in the error store
 *   identity     ALC-14  the signed-in person and active organization
 *   icons        ALC-15  keys → components (`alchemy-icon-keys.ts`: registered
 *                        app components first, else `@ai-matrx/icons` names)
 *   notify       ALC-15  the app toast; every failure carries its remedy
 *   persistence  PP-13a  the person's own settings: their USER-rung row of the
 *                        Feature Knob register (`platform.knob_override`,
 *                        org-qualified), written through `knob_override_set`.
 *                        A setting key is the knob's dotted address.
 *   transferKnobs PP-13a the organization default recipe: the
 *                        `alchemy.transfer.default_recipe` knob resolved WITHOUT
 *                        the person (organization → platform), from the one
 *                        knob snapshot
 *   window       PP-01a  `AlchemyWindowHost.tsx` — real WindowPanels, several
 *                        at once, each holding a live preparation session
 */

import type {
  AlchemyHostPorts,
  DiagnosticsPort,
  IconResolverPort,
  IdentityPort,
  Json,
  KindValidatorPort,
  NotifyPort,
  PersistencePort,
  TransferKnobsPort,
  WindowPort,
} from "@ai-matrx/alchemy/ports";
import { ensureEffectiveKnob, knobAddress } from "@/lib/scoped-config/effectiveKnobs";
import {
  fetchKnobRungOverrides,
  knobRefusalSentence,
  setKnobOverride,
} from "@/lib/scoped-config/service";
import { toast } from "@/lib/toast";
import { resolveAlchemyIcon } from "./alchemy-icon-keys";
import type { KindValidator } from "@ai-matrx/content-ir/registry";
import { kindValidator } from "@/features/content-ir/registry/kind-schema-source";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { RootState } from "@/lib/redux/rootReducer";
import { selectIsAdmin, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { awaitEffectiveOrganizationId } from "@/features/organizations/awaitWorkspace";

/** The two store methods the identity port reads. */
export interface AlchemyIdentityStore {
  getState(): RootState;
  subscribe(listener: () => void): () => void;
}

export function createKindValidatorPort(
  validator: KindValidator = kindValidator,
): KindValidatorPort {
  return {
    async validate(kindKey, value, signal) {
      const verdict = await validator.validate(value, kindKey, signal);
      if (!verdict.checked) {
        return {
          ok: false,
          unverifiable: true,
          sentence: `The "${kindKey}" contract could not be checked (${verdict.degradedReason}): ${
            verdict.errors[0] ?? "no detail"
          }`,
          remedy:
            verdict.degradedReason === "catalog_unreachable"
              ? "Check the connection, then try again."
              : `Register a valid schema for the "${kindKey}" kind, then try again.`,
        };
      }
      if (!verdict.ok) {
        return {
          ok: false,
          sentence: `This value isn't shaped like the "${kindKey}" kind: ${verdict.errors.join("; ")}`,
          remedy: `Correct the value so it matches the "${kindKey}" kind, then try again.`,
        };
      }
      return { ok: true };
    },
  };
}

export function createDiagnosticsPort(): DiagnosticsPort {
  return {
    capture(error, context) {
      const message = error instanceof Error ? error.message : String(error);
      captureError({
        source: "alchemy",
        message: `[alchemy:${context.area}] ${message}`,
        ...(error instanceof Error
          ? { name: error.name, ...(error.stack ? { stack: error.stack } : {}) }
          : {}),
        raw: { area: context.area, detail: context.detail },
      });
    },
  };
}

type Identity = NonNullable<ReturnType<IdentityPort["current"]>>;

function readIdentity(state: RootState): Identity | null {
  const userId = selectUserId(state);
  if (!userId) return null;
  return {
    userId,
    organizationId: selectOrganizationId(state),
    isAuthenticated: true,
    // ADMIN POWER: true only inside the admin section; on a user page an admin
    // reads like everyone else.
    isAdmin: selectIsAdmin(state),
  };
}

function sameIdentity(a: Identity | null, b: Identity | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.userId === b.userId &&
    a.organizationId === b.organizationId &&
    a.isAdmin === b.isAdmin
  );
}

export function createIdentityPort(store: AlchemyIdentityStore): IdentityPort {
  return {
    current: () => readIdentity(store.getState()),
    onChange(listener) {
      let last = readIdentity(store.getState());
      return store.subscribe(() => {
        const next = readIdentity(store.getState());
        if (sameIdentity(last, next)) return;
        last = next;
        listener();
      });
    },
  };
}

export function createIconResolverPort(): IconResolverPort {
  return { resolve: (key) => resolveAlchemyIcon(key) };
}

export function createNotifyPort(): NotifyPort {
  return {
    success: (sentence) => toast.success(sentence),
    info: (sentence) => toast.info(sentence),
    error: (sentence, remedy) => toast.error(sentence, { description: remedy }),
  };
}

/**
 * The signed-in person in their active organization, or a sentence saying what
 * is missing. "No organization yet" is not "none": it waits for boot's answer
 * first, and a FAILED organization read says so instead of "pick one".
 */
async function knobPrincipal(store: AlchemyIdentityStore): Promise<{ userId: string; organizationId: string }> {
  const identity = readIdentity(store.getState());
  if (!identity) throw new Error("Sign in to use your own settings.");
  if (identity.organizationId) return { userId: identity.userId, organizationId: identity.organizationId };
  const resolved = await awaitEffectiveOrganizationId();
  if (resolved.status === "ready") return { userId: identity.userId, organizationId: resolved.organizationId };
  throw new Error(
    resolved.cause === "unreadable"
      ? resolved.reason
      : "Your own settings are saved per organization, and none is selected. Pick the one you are working in from the menu under your avatar, then try again.",
  );
}

/** The person's own settings: their user-rung knob row (never the effective ladder). */
export function createPersistencePort(store: AlchemyIdentityStore): PersistencePort {
  return {
    async readSetting<T extends Json>(setting: string) {
      const { feature, key } = knobAddress(setting);
      const { userId, organizationId } = await knobPrincipal(store);
      const rows = await fetchKnobRungOverrides({ feature, key, organizationId, kinds: ["user"] });
      return (rows.find((row) => row.scope_id === userId)?.value ?? null) as T | null;
    },
    async writeSetting(setting, value) {
      const { feature, key } = knobAddress(setting);
      const { userId, organizationId } = await knobPrincipal(store);
      const result = await setKnobOverride({ feature, key, scopeKind: "user", scopeId: userId, organizationId, value });
      if (!result.ok) throw new Error(`Your ${setting} setting was not saved: ${knobRefusalSentence(result)}`);
    },
  };
}

export const TRANSFER_DEFAULT_RECIPE_KNOB = { feature: "alchemy.transfer", key: "default_recipe" } as const;

/** Organization default recipes: the knob resolved for the organization alone (organization → platform). */
export function createTransferKnobsPort(): TransferKnobsPort {
  return {
    async defaultRecipe(sourceKind, organizationId) {
      if (!organizationId) {
        throw new Error("Organization default recipes need an organization. Choose one, then reopen the workspace.");
      }
      const map = await ensureEffectiveKnob(organizationId, null, TRANSFER_DEFAULT_RECIPE_KNOB);
      if (map === null || map === undefined) return null;
      if (typeof map !== "object" || Array.isArray(map)) {
        throw new Error("The organization's default recipes are not a map of source kinds to recipes.");
      }
      return (map as Record<string, Json>)[sourceKind] ?? null;
    },
  };
}

export function createAlchemyHostPorts({
  store,
  window,
}: {
  store: AlchemyIdentityStore;
  /** The host's window system (PP-01a); absent = the workspace window is absent. */
  window?: WindowPort;
}): AlchemyHostPorts {
  return {
    kinds: createKindValidatorPort(),
    diagnostics: createDiagnosticsPort(),
    identity: createIdentityPort(store),
    persistence: createPersistencePort(store),
    transferKnobs: createTransferKnobsPort(),
    icons: createIconResolverPort(),
    notify: createNotifyPort(),
    ...(window ? { window } : {}),
  };
}
