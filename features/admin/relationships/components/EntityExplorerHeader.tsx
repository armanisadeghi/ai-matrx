"use client";

// features/admin/relationships/components/EntityExplorerHeader.tsx
//
// Chrome for /administration/database/relationships/explorer/[token]: back to the
// explorer entry + the same entity picker used there, pre-filled with the
// current token, so switching entities never requires going back first.

import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { EntityTypeChip } from "@/components/entity-types/EntityTypeChip";
import { Button } from "@/components/ui/button";
import { EntityExplorerEntry } from "./EntityExplorerEntry";
import {
  buildOrbitGraph,
  RELATIONSHIPS_LOCATION,
  ruleSentence,
} from "../utils";
import type { RelationshipRule } from "../types";

interface Props {
  token: string;
  rules: RelationshipRule[];
}

export function EntityExplorerHeader({ token, rules }: Props) {
  const info = tryGetEntityInfo(token);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5">
      <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
        <Link
          href="/administration/database/relationships/explorer"
          title="Back to the entity explorer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Link>
      </Button>
      <h1 className="flex items-center gap-2 text-sm font-semibold">
        <Compass className="h-4 w-4 text-primary" />
        Entity explorer
        {/* Inert: this IS the explorer page for that token. */}
        <EntityTypeChip token={token} showToken linkTo={null} />
      </h1>
      <span className="text-xs text-muted-foreground">
        {info?.schema}.{info?.table}
      </span>
      <CopyButtons
        size="icon"
        label={`${token} relationships`}
        human={() => {
          const orbit = buildOrbitGraph(token, rules);
          const touching = [...orbit.sources, ...orbit.targets];
          return [
            `Entity relationships for ${token} (${info?.schema}.${info?.table}) — ${orbit.sources.length} sources, ${orbit.targets.length} targets`,
            ...touching.map((neighbor) => ruleSentence(neighbor.rule)),
          ].join("\n");
        }}
        json={() => buildOrbitGraph(token, rules)}
        agent={() => ({
          kind: "entity-relationship-orbit",
          location: RELATIONSHIPS_LOCATION,
          description:
            "Every registered association rule touching this entity type — sources (things that target it) and targets (things it targets), with container side and conveyance.",
          data: buildOrbitGraph(token, rules),
          attributes: {
            token,
            schema: info?.schema,
            table: info?.table,
            rules: rules.filter(
              (rule) =>
                rule.source_type === token || rule.target_type === token,
            ).length,
          },
        })}
      />
      <div className="ml-auto">
        <EntityExplorerEntry rules={rules} value={token} />
      </div>
    </div>
  );
}
