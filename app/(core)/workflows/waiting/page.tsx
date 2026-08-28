// /workflows/waiting — the "waiting on you" inbox (UI census #38).
//
// Every run of yours that is holding for a person: `interrupted` (it asked you
// a question) and `awaiting_input` (it was started without a required input).
// Two statuses, ONE inbox — SPEC-workflow-ui-contract §4.3.
//
// Until this route existed, the only way to reach a parked run was to already
// be on its page, and runs sat waiting with nothing anywhere saying so.

import { WaitingInboxPage } from "@/features/workflow-runtime/discovery/components/WaitingInboxPage";

export async function generateMetadata() {
  return { title: "Waiting on you" };
}

export default function WaitingRunsRoute() {
  return <WaitingInboxPage />;
}
