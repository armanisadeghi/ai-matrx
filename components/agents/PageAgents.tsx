"use client";

/**
 * components/agents/PageAgents.tsx
 *
 * 🚨 NO SECRET AI. A surface that runs an agent NAMES the agent it runs.
 *
 * Arman, 2026-08-25: "any page where we have AI integrations, I need the page
 * to identify what agents it's using for those purposes so that I can go look
 * at those agents instructions and things like that." A page that quietly
 * calls a model is a black box, and a black box cannot be approved — least of
 * all one that runs on a schedule while nobody is watching.
 *
 * This is the ONE way to disclose that. Give it the mandate keys the surface
 * actually runs; it renders them as doors into the mandate console, which
 * shows the pinned agent, its version, its instructions and its bindings
 * (`?mandate=<key>` deep-links to the row — see `MandatesConsole`).
 *
 * A mandate KEY, never a raw agent id: the agent behind a job is DB-managed
 * and changes without a deploy, so the key is the stable identity of "the AI
 * that does this job" (common-docs/systems/mandates/FEATURE.md).
 */

import Link from "next/link";
import { BrainCircuit, ExternalLink } from "lucide-react";
import { useDeclaredSurfaceMandates } from "@/features/surfaces/runtime/surface-mandates";

export interface PageAgentRef {
  /** The mandate key, e.g. `seo.topic_assigner`. */
  mandateKey: string;
  /** What this agent does HERE, in the surface's own words. */
  does: string;
}

/**
 * ONE declaration, TWO disclosures. Naming the agent inline is half the job —
 * Arman, 2026-08-25: "on any surface where an agent is actually being assigned
 * but built into the physical UI … we also add that agent to the list of
 * available agents at the top." So this component also registers what it names
 * into the live surface-mandate registry, and the Agents header menu lists it
 * with its notes and its door. A page that already uses `<PageAgents>` gets
 * that for free — there is no second thing to remember.
 *
 * 🚨 NOT for agent-authoring surfaces (the builder, the mandate console): there
 * the agent is the page's subject, and giving it context of itself is wrong.
 */
export function PageAgents({
  agents,
  surfaceName,
  className,
}: {
  agents: PageAgentRef[];
  /** The `ui_surface.name` these agents run on, when the host knows it. */
  surfaceName?: string | null;
  className?: string;
}) {
  useDeclaredSurfaceMandates(
    agents.map((agent) => ({
      mandateKey: agent.mandateKey,
      does: agent.does,
      surfaceName: surfaceName ?? null,
    })),
  );

  if (agents.length === 0) return null;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          <BrainCircuit className="h-3 w-3" aria-hidden="true" />
          AI on this page
        </span>
        {agents.map((agent) => (
          <Link
            key={agent.mandateKey}
            href={`/administration/agents/mandates?mandate=${encodeURIComponent(agent.mandateKey)}`}
            title={`${agent.does} — open this agent's instructions`}
            className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <span className="font-medium">{agent.mandateKey}</span>
            <span className="text-muted-foreground">· {agent.does}</span>
            <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
