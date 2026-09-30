"use client";

/**
 * A candidate's (or its baseline's) holder, named WITH its version (V1 D17:
 * the card said "Page Summary Analyst (a pinned version)" and never which one).
 *
 * A pinned version is read from `<agent|workflow>.definition_version` — its own
 * name at that version and its number — so the card says
 * "Page Summary Analyst · v2". Latest (no version id) keeps the server's own
 * words ("… (latest version)"). Until the version row answers, or when it
 * cannot be read, the server's name stays and the short id rides in the tooltip.
 */

import { useEffect, useState } from "react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { supabase } from "@/utils/supabase/client";

export interface HolderVersion {
  number: number | null;
  name: string | null;
}

/** One pinned version's number and name; null while reading or unread. */
export function useHolderVersion(
  holderType: "agent" | "workflow" | null,
  versionId: string | null,
): HolderVersion | null {
  const [answer, setAnswer] = useState<{ id: string; version: HolderVersion | null } | null>(null);
  useEffect(() => {
    if (!versionId || !holderType) return;
    let cancelled = false;
    void supabase
      .schema(holderType)
      .from("definition_version")
      .select("version_number, name")
      .eq("id", versionId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("[mandate candidates] version read failed", versionId, error.message);
        if (!cancelled) {
          setAnswer({
            id: versionId,
            version: data ? { number: data.version_number ?? null, name: data.name ?? null } : null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [holderType, versionId]);
  return answer && answer.id === versionId ? answer.version : null;
}

export function CandidateHolderName({
  type,
  id,
  versionId,
  name,
}: {
  type: "agent" | "workflow";
  id: string;
  versionId: string | null;
  name: string | null;
}) {
  const version = useHolderVersion(type, versionId);
  const shown =
    versionId && version?.number != null
      ? `${version.name?.trim() || name || "Agent"} · v${version.number}`
      : name;
  return (
    <span className="inline-flex min-w-0 items-center" data-candidate-holder title={versionId ?? undefined}>
      <EntityRef
        token={type === "workflow" ? "workflow" : "agent"}
        id={id}
        name={shown}
        showIcon={false}
        className="min-w-0 font-medium"
      />
    </span>
  );
}
