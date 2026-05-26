import { createAgentFromSeed } from "@/lib/agents/actions";
import { TEMPLATE_DATA } from "@/features/agents/constants/local-agent-templates";
import { AutoSubmitForm } from "./AutoSubmitForm";
import { DesktopBuilderSkeleton } from "@/features/agents/components/builder/AgentBuilderSkeletons";

export const metadata = { title: "Creating Agent... | AI Matrx" };

export default function NewManualAgentPage() {
  async function create() {
    "use server";
    await createAgentFromSeed(TEMPLATE_DATA);
  }

  return (
    <>
      <AutoSubmitForm action={create} />
      <DesktopBuilderSkeleton />
    </>
  );
}
