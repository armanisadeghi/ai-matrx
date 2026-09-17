import { CreateManualAgentClient } from "./CreateManualAgentClient";

/**
 * `/agents/new/manual` — creates a blank agent from the manual template and
 * sends the person straight into the builder.
 *
 * The create runs in `CreateManualAgentClient`, because the organization the
 * agent must be filed in is the one the person SELECTED, and that selection
 * lives in the store on the client. A server component cannot read it, and a
 * write without it is filed in the creator's personal workspace by
 * `public._stamp_org_default` with no error anywhere —
 * common-docs/policies/context-is-carried-never-rebuilt.md.
 */
export default function NewManualAgentPage() {
  return <CreateManualAgentClient />;
}
