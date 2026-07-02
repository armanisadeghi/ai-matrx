/**
 * Client capability registry.
 *
 * Each surface (code editor, sandbox, future Chrome extension / desktop /
 * mobile) registers a provider that selects its capability payload from
 * Redux state at request-build time. `buildToolInjection` walks the registry
 * on every turn and emits the `client` envelope.
 *
 * Adding a new surface is one file: define a provider that calls
 * `registerClientCapability(...)`, then import the file once from
 * `./register-all.ts` for its registration side-effect.
 */

import type { RootState } from "@/lib/redux/store";
import type {
  ClientCapabilityName,
  ClientCapabilityPayloads,
} from "@/features/agents/types/tool-injection.types";

export interface ClientCapabilityProvider<
  TName extends ClientCapabilityName = ClientCapabilityName,
> {
  name: TName;
  /**
   * Returns the payload for this capability when active for the given
   * conversation, or `null` when inactive. Returning `null` keeps the
   * capability out of the request envelope entirely — no false declaration.
   *
   * May be async — the sandbox provider mints a short-lived bearer token
   * on demand. `buildToolInjection` awaits all providers in parallel.
   */
  selectPayload: (
    state: RootState,
    conversationId: string,
  ) =>
    | ClientCapabilityPayloads[TName]
    | null
    | Promise<ClientCapabilityPayloads[TName] | null>;
}

const registry = new Map<ClientCapabilityName, ClientCapabilityProvider>();

export function registerClientCapability<TName extends ClientCapabilityName>(
  provider: ClientCapabilityProvider<TName>,
): void {
  // MATRX-EXCEPTION: the registry is a heterogeneous collection — each
  // provider is generic over its own TName/payload shape, but the Map has to
  // hold every provider under one widened type. TName is preserved at the
  // call site (registerClientCapability<TName>) and getRegisteredCapabilities
  // callers dispatch by `.name`, so this doesn't lose type safety in practice.
  registry.set(
    provider.name,
    provider as unknown as ClientCapabilityProvider,
  );
}

export function getRegisteredCapabilities(): ClientCapabilityProvider[] {
  return Array.from(registry.values());
}
