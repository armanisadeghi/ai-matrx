"use client";

/**
 * Step 6 — WHERE the finished work lives.
 *
 * Reuses the canonical `UniversalAssociationPicker` (the same picker every
 * association surface uses, doors included) but holds the picks in composer
 * state: `assoc_add` requires `iam.has_access` on the conversation, and the
 * conversation row does not exist until the run starts. The picks become real
 * canonical `conversation → project|task|war_room` edges the moment the run
 * launches — the composer never fakes an edge and never silently drops one.
 */

import { X } from "lucide-react";
import {
  UniversalAssociationPicker,
  attachedKey,
} from "@/features/scopes/components/associations/UniversalAssociationPicker";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";
import type { SavedRequestHome, WorkHomeToken } from "../savedRequests";

export const HOME_TOKENS = [
  "project",
  "task",
  "war_room",
] as const satisfies readonly EntityTypeToken[];

export function HomeStep({
  homes,
  onChange,
}: {
  homes: SavedRequestHome[];
  onChange: (next: SavedRequestHome[]) => void;
}) {
  const attachedKeys = new Set(
    homes.map((home) => attachedKey(home.token, home.id)),
  );

  return (
    <div className="flex flex-col gap-3">
      {homes.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {homes.map((home) => (
            <li
              key={`${home.token}:${home.id}`}
              className="flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pl-2 pr-1 text-xs"
            >
              <EntityRef
                token={home.token}
                id={home.id}
                name={home.label}
                openInNewTab
              />
              <button
                type="button"
                onClick={() =>
                  onChange(
                    homes.filter(
                      (entry) =>
                        !(entry.token === home.token && entry.id === home.id),
                    ),
                  )
                }
                aria-label={`Remove ${home.label}`}
                className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <UniversalAssociationPicker
        tokens={[...HOME_TOKENS]}
        attachedKeys={attachedKeys}
        onAttach={async (token, resourceId, title) => {
          onChange([
            ...homes.filter(
              (entry) => !(entry.token === token && entry.id === resourceId),
            ),
            { token: token as WorkHomeToken, id: resourceId, label: title },
          ]);
          return { ok: true };
        }}
        onDetach={async (token, resourceId) => {
          onChange(
            homes.filter(
              (entry) => !(entry.token === token && entry.id === resourceId),
            ),
          );
          return { ok: true };
        }}
      />

      <p className="text-xs text-muted-foreground">
        These links are created when the run starts, so the conversation exists
        before it is filed.
      </p>
    </div>
  );
}
