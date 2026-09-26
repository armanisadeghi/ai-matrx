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
 *   persistence  ALC-14  NOT BOUND. No per-person Alchemy setting exists yet
 *                        (the menu layout/density setting arrives with ALC-15),
 *                        so per-person settings are ABSENT — never stubbed.
 */

import type {
  AlchemyHostPorts,
  DiagnosticsPort,
  IdentityPort,
  KindValidatorPort,
} from "@ai-matrx/alchemy/ports";
import type { KindValidator } from "@ai-matrx/content-ir/registry";
import { kindValidator } from "@/features/content-ir/registry/kind-schema-source";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { RootState } from "@/lib/redux/rootReducer";
import { selectIsAdmin, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

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

export function createAlchemyHostPorts({
  store,
}: {
  store: AlchemyIdentityStore;
}): AlchemyHostPorts {
  return {
    kinds: createKindValidatorPort(),
    diagnostics: createDiagnosticsPort(),
    identity: createIdentityPort(store),
  };
}
