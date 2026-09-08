"use client";

// features/mandates/workspace/SystemAnswerSection.tsx
//
// ── THE SYSTEM ANSWER, FRONT AND CENTRE ──────────────────────────────────────
//
// Arman, 2026-09-08 (verbatim core): *"this is the Admin panel so it should
// never show ANYTHING related to a user or an org. Just like the system agents
// management, the ONLY thing it should ever show is the things we assign from
// the system… it's showing me a bunch of meaningless garbage… and it's missing
// the actual things I need."*
//
// So this section answers exactly one question — **what does the platform
// assign for this job, and is that assignment sound?** — and it answers it
// about the SYSTEM RUNG ONLY: the definition's own default holder, or the
// global binding when one exists. It never reads a user or an org binding, it
// never asks the per-caller resolution door (that answers "what runs for ME",
// which is the wrong question on this page), and it carries no ladder.
//
// The health verdict is `system-rung-health.ts` — a pure function, so the
// sentence and its remedy are testable without a database. The one live read
// this component makes is the holder's `output_schema`, through the SHARED
// mirror of the server's rule (`missingOutputKeys`), because that is the defect
// Arman was looking at and the old copy could not name.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, TriangleAlert, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  agentHolderOfBinding,
  holderOfMandate,
  isFloatingBinding,
  isFloatingMandate,
} from "@/lib/supabase/mandateStorage";
import {
  fetchAgentOutputSchemas,
  missingOutputKeys,
} from "../output-contract";
import { agentHref } from "../admin/mandate-health";
import { Section } from "./Section";
import { systemRungHealth } from "./system-rung-health";
import type { MandateWorkspaceData } from "./useMandateWorkspaceData";

/**
 * WHERE THE SYSTEM'S ANSWER COMES FROM. Two rungs live at platform scope: the
 * definition's own defaults, and a `global` binding that overrides them for
 * everybody. Nothing else is read here — an org or user binding is somebody
 * else's answer and has no business on this page.
 */
function systemHolderOf(data: MandateWorkspaceData) {
  const globalBinding =
    data.bindings.find(
      (b) => b.principal_type === "global" && b.is_enabled !== false,
    ) ?? null;
  const holder = globalBinding
    ? agentHolderOfBinding(globalBinding)
    : holderOfMandate(data.mandate);
  const floating = globalBinding
    ? isFloatingBinding(globalBinding)
    : isFloatingMandate(data.mandate);
  const version = holder.versionId
    ? (data.versionsById[holder.versionId] ?? null)
    : null;
  const agentId = version?.agentId ?? holder.holderId;
  return {
    fromGlobalBinding: globalBinding !== null,
    holderIsWorkflow:
      (globalBinding
        ? (globalBinding as { holder_type?: string | null }).holder_type
        : data.mandate.default_holder_type) === "workflow",
    agentId,
    agent: agentId ? (data.agentsById[agentId] ?? null) : null,
    pinnedVersionNumber: version?.versionNumber ?? null,
    floating,
  };
}

export function SystemAnswerSection({ data }: { data: MandateWorkspaceData }) {
  const system = systemHolderOf(data);
  const required = data.contract.requiredOutputKeys;

  // THE HOLDER'S STRUCTURED OUTPUT — the one live read this section makes.
  //
  // ONE SETTLED SLOT, STAMPED WITH THE AGENT IT ANSWERS FOR (the same pattern
  // the binding pre-flight uses). The verdict is DERIVED during render, never
  // written from the effect body: a `missing` written by an effect renders the
  // wrong sentence first and corrects it, and a verdict stamped with a stale
  // agent id is a lie.
  const [settled, setSettled] = useState<{
    agentId: string;
    schema: unknown;
    readable: boolean;
  } | null>(null);
  const agentId = system.agentId;
  useEffect(() => {
    if (required.length === 0 || !agentId) return;
    let cancelled = false;
    void fetchAgentOutputSchemas([agentId]).then((byId) => {
      if (cancelled) return;
      // An agent absent from the answer is UNREADABLE, not schema-less. The two
      // get different sentences, because they need different remedies.
      setSettled({
        agentId,
        schema: byId[agentId] ?? null,
        readable: agentId in byId,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [agentId, required]);

  const current = settled?.agentId === agentId ? settled : null;
  const missing =
    required.length === 0
      ? []
      : current && current.readable
        ? missingOutputKeys(required, current.schema)
        : null;

  const health = systemRungHealth({
    holderName: system.agent?.name ?? null,
    holderId: system.agentId,
    holderAgentType: system.agent?.agentType ?? null,
    holderArchived: system.agent?.isArchived === true,
    holderIsWorkflow: system.holderIsWorkflow,
    requiredOutputKeys: required,
    missingOutputKeys: missing,
    outputSchemaUnreadable: current !== null && !current.readable,
  });

  return (
    <Section title="The system answer">
      <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
        {/* WHO the platform assigns — the loudest thing in the section. */}
        <div className="flex flex-wrap items-center gap-2">
          {system.agent ? (
            <EntityRef
              token="agent"
              id={system.agent.id}
              name={system.agent.name}
              className="text-[13.5px] font-medium"
            />
          ) : system.agentId ? (
            <EntityRef
              token="agent"
              id={system.agentId}
              className="text-[13.5px] font-medium"
            />
          ) : system.holderIsWorkflow ? (
            <span className="text-[13px] text-foreground">A workflow</span>
          ) : (
            <span className="text-[13px] text-muted-foreground">
              Nothing assigned
            </span>
          )}
          {system.agent?.agentType === "builtin" ? (
            <Badge
              variant="outline"
              className="gap-1 py-0 text-[10px] text-muted-foreground"
            >
              <ShieldCheck className="h-2.5 w-2.5" />
              System agent
            </Badge>
          ) : null}
          {system.agent?.isArchived ? (
            <Badge
              variant="outline"
              className="py-0 text-[10px] text-rose-600 dark:text-rose-400"
            >
              Archived
            </Badge>
          ) : null}
          {system.agentId ? (
            <Badge variant="outline" className="py-0 font-mono text-[10px]">
              {system.floating
                ? "latest"
                : system.pinnedVersionNumber !== null
                  ? `v${system.pinnedVersionNumber}`
                  : "pinned"}
            </Badge>
          ) : null}
        </div>

        {/* WHERE the assignment is written — the definition's own default, or
            a platform-wide binding sitting on top of it. Both are the system
            rung; saying which one is which is the difference between "this is
            the job's default" and "somebody overrode it for everybody". */}
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {system.fromGlobalBinding
            ? "Assigned by a platform-wide binding, which sits above this job's own default."
            : "Assigned by this job's own default — no platform-wide binding overrides it."}
        </p>

        {/* THE VERDICT, WITH THE REMEDY IN THE SAME BREATH. */}
        <div
          className={
            health.broken
              ? "space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
              : "space-y-1.5 rounded-lg border border-border/50 bg-muted/30 p-3"
          }
        >
          <p
            className={
              health.broken
                ? "flex items-start gap-1.5 text-[12.5px] leading-relaxed text-destructive"
                : "text-[12.5px] leading-relaxed text-foreground"
            }
          >
            {health.broken ? (
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : null}
            <span>{health.sentence}</span>
          </p>
          {health.remedy ? (
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {health.remedy}
            </p>
          ) : null}
          {health.remedy ? (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {system.agentId ? (
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link
                    href={agentHref(
                      system.agentId,
                      system.agent?.agentType ?? "builtin",
                      "/build",
                    )}
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    Open {system.agent?.name ?? "this agent"}
                  </Link>
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("matrx:open-mandate-pin"),
                  )
                }
              >
                Assign a different system agent
              </Button>
            </div>
          ) : null}
        </div>

        {/* WHAT THE JOB PROMISES ITS CONSUMERS — the other half of the verdict
            above, stated as a fact so the reader can check the claim. */}
        {required.length > 0 ? (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground/90">
            Required output:{" "}
            {required.map((key, i) => (
              <span key={key}>
                {i > 0 ? ", " : ""}
                <code className="font-mono text-[11px]">{key}</code>
              </span>
            ))}
            .
          </p>
        ) : null}
      </div>
    </Section>
  );
}
