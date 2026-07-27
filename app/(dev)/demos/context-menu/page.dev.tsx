/**
 * Context-menu testing suite — hub.
 *
 * Page metadata is read on the server from `_registry.ts` and passed into
 * the client shell as props so taglines/descriptions stay in sync with SSR
 * during dev HMR (avoids hydration mismatch when registry strings change).
 */

import { ContextMenuHubClient } from "./_components/ContextMenuHubClient";
import { CONTEXT_MENU_PAGES } from "./_registry";

export default function ContextMenuHubPage() {
  return <ContextMenuHubClient pages={CONTEXT_MENU_PAGES} />;
}
