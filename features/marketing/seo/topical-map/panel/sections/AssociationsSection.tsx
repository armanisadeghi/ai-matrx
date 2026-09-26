"use client";

/**
 * The GENERIC associations section (vision §2.3): every kind the function
 * returned that has no section of its own, grouped by the kind string,
 * labelled by the entity registry when it knows the token and by the token
 * when it does not — so a kind registered tomorrow renders today, grouped and
 * openable, with no code change here. There is no switch over kinds.
 *
 * Each row is an `EntityRef` (route + peek + new tab from the registries) and,
 * for a writer, a remove. Add goes through the package's one picker
 * (`UniversalAssociationPicker`) over every listable token, and both writes go
 * through `associationWrites.ts` — the registered RPC path, nothing else.
 *
 * A hidden count (a variant the live function no longer emits — see
 * `associationGroups.ts`) prints as "N you cannot open", never as a row.
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { UniversalAssociationPicker } from "@ai-matrx/associations/react";
import type { EntityTypeToken } from "@ai-matrx/associations";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@ai-matrx/design-system";

import type { MapTopicAssociationResolved } from "../../types";
import type { AssociationGroup } from "../associationGroups";
import { itemLabel } from "../associationGroups";
import { attachToTopic, detachFromTopic } from "../associationWrites";
import { PanelEmptyLine, PanelSection } from "../PanelSection";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

export interface AssociationsSectionProps {
  topicName: string;
  /** The `seo.map_topic` id — null until the rows read lands; then no write control. */
  topicId: string | null;
  organizationId: string | null;
  groups: readonly AssociationGroup[];
  /** Every kind already shown by a dedicated section, so the picker marks them attached too. */
  attachedKeys: ReadonlySet<string>;
  readOnly: boolean;
  onChanged: () => void;
}

export function AssociationsSection({
  topicName,
  topicId,
  organizationId,
  groups,
  attachedKeys,
  readOnly,
  onChanged,
}: AssociationsSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const canWrite = !readOnly && topicId !== null;
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  async function remove(row: MapTopicAssociationResolved) {
    if (!topicId) return;
    setRefusal(null);
    try {
      await detachFromTopic({
        topicId,
        token: row.association.kind,
        id: row.item.id,
        direction: row.association.direction,
        role: row.association.role,
      });
      onChanged();
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <PanelSection
      title="Attached"
      count={total}
      action={
        canWrite ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3 w-3" aria-hidden />
            Attach
          </button>
        ) : null
      }
    >
      {groups.length === 0 ? (
        <PanelEmptyLine>Nothing else is attached to this topic.</PanelEmptyLine>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group) => {
            const info = tryGetEntityInfo(group.kind);
            const Icon = info?.Icon;
            return (
              <div key={group.kind} data-association-kind={group.kind}>
                <p className="mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
                  <span>{info?.labelPlural ?? group.kind}</span>
                  <span className="tabular-nums">{group.rows.length}</span>
                  {group.hidden > 0 ? (
                    <span title="Edges whose other end you cannot open. They are counted, never listed.">
                      · {group.hidden} you cannot open
                    </span>
                  ) : null}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {group.rows.map((row) => (
                    <li
                      key={`${row.association.direction}:${row.association.role ?? ""}:${row.item.id}`}
                      className="flex min-w-0 items-center gap-1.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <EntityRef
                          token={group.kind}
                          id={row.item.id}
                          name={itemLabel(row)}
                          openInNewTab
                          showIcon={false}
                        />
                      </div>
                      {row.association.role ? (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {row.association.role}
                        </span>
                      ) : null}
                      {canWrite ? (
                        <button
                          type="button"
                          onClick={() => void remove(row)}
                          aria-label={`Detach ${itemLabel(row)} from ${topicName}`}
                          title="Detach"
                          className="shrink-0 rounded-sm text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      {refusal ? (
        <ErrorNotice size="inline" className="mt-1 whitespace-pre-wrap text-xs" message={refusal} />
      ) : null}

      {canWrite ? (
        <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
          <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Attach to &ldquo;{topicName}&rdquo;</SheetTitle>
            </SheetHeader>
            {/* The database refuses a pair nobody registered
                (`platform.enforce_known_association`, verified live 2026-09-18:
                only plan_node, web_page, web_youtube_video and facet values pair
                with a topic today). The refusal names the pair and where to
                register it; it is shown as the picker's own error line. */}
            <p className="mt-1 text-[11px] text-muted-foreground">
              Only kinds registered in the relationship rules attach to a topic; a refusal
              names the pair to register.
            </p>
            <div className="mt-2 flex min-h-0 flex-1 flex-col">
              <UniversalAssociationPicker
                attachedKeys={new Set(attachedKeys)}
                orgId={organizationId}
                onAttach={async (token: EntityTypeToken, id: string) => {
                  if (!topicId) {
                    return { ok: false, error: "This topic's id has not loaded yet; try again in a moment." };
                  }
                  try {
                    await attachToTopic({ topicId, token, id, organizationId });
                    onChanged();
                    return { ok: true };
                  } catch (error) {
                    return { ok: false, error: error instanceof Error ? error.message : String(error) };
                  }
                }}
                onDetach={async (token: EntityTypeToken, id: string) => {
                  // The picker only knows the pair; the section's rows know the
                  // direction. A detach from the picker is answered by the row
                  // it maps to, so the edge goes back the way it was read.
                  const row = groups
                    .flatMap((group) => group.rows)
                    .find((candidate) => candidate.association.kind === token && candidate.item.id === id);
                  if (!row) {
                    return { ok: false, error: "That item is not attached through this section; detach it where it is shown." };
                  }
                  try {
                    await remove(row);
                    return { ok: true };
                  } catch (error) {
                    return { ok: false, error: error instanceof Error ? error.message : String(error) };
                  }
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </PanelSection>
  );
}
