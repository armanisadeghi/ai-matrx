/** @deprecated Legacy broker preview hooks — no-op stubs. */

import type { BrokerIdentifier } from "../types";

export function useServerBrokerSync(_options: {
  brokers: BrokerIdentifier[];
  syncOnChange?: boolean;
}): void {
  // Legacy server sync removed.
}
