import { createSystemAgentFromSeed } from "@/lib/agents/actions";
import { BLANK_AGENT_SEED } from "@/features/agents/constants/blank-agent";
import { AutoSubmitForm } from "@/features/agents/components/AutoSubmitForm";
import { DesktopBuilderSkeleton } from "@/features/agents/components/builder/AgentBuilderSkeletons";

export const metadata = { title: "Creating System Agent... | Admin" };

export default function NewManualSystemAgentPage() {
  async function create() {
    "use server";
    await createSystemAgentFromSeed(BLANK_AGENT_SEED);
  }

  return (
    <>
      <AutoSubmitForm action={create} />
      <DesktopBuilderSkeleton />
    </>
  );
}
