import { AgentBrowsePage } from "@/features/agents/browse/components/AgentBrowsePage";

export const metadata = {
  title: "Agent support lookup | Admin",
  description:
    "Support tool: look into an organization's or a person's agents while doing tech support",
};

/**
 * /administration/agents/support — Agent support lookup (Arman, 2026-09-26).
 *
 * The System Agents page manages the platform's own agents and nothing else.
 * Looking into an organization's or a person's agents is tech support, and it
 * lives here: the canonical agents list over Organizations / Users / All,
 * narrowable to one organization or one person.
 */
export default function AdminAgentSupportLookupPage() {
  return (
    <div className="flex h-[calc(100dvh-2.5rem)] min-h-0 flex-col overflow-hidden">
      <AgentBrowsePage variant="support-admin" />
    </div>
  );
}
