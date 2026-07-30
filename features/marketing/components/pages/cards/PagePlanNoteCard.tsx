"use client";

import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { DesiredSection } from "@/features/marketing/components/pages/desired/DesiredSection";
import { useDesiredValueSlice } from "@/features/marketing/components/pages/desired/useDesiredValueSlice";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type {
  MarketingPage,
  PageDesiredValues,
} from "@/features/marketing/types";

/**
 * PagePlanNoteCard — the generic freeform plan slot. Every observed area in
 * the Studio split gets a plan-side counterpart; areas without a structured
 * plan yet get this card: a titled notes editor persisted to ONE string key
 * of `web.page.desired_values` through the clobber-safe slice path. When an
 * area later earns a structured plan card, it replaces this one and can seed
 * from the same key.
 */

/** The `desired_values` keys whose value is a plain notes string. */
export type PagePlanNoteKey = {
  [K in keyof PageDesiredValues]-?: PageDesiredValues[K] extends
    | string
    | undefined
    ? K
    : never;
}[keyof PageDesiredValues];

export function PagePlanNoteCard({
  page,
  noteKey,
  title,
  hint,
  placeholder,
}: {
  page: MarketingPage;
  noteKey: PagePlanNoteKey;
  title: string;
  /** One-line explanation of what belongs in this plan area. */
  hint: string;
  placeholder: string;
}) {
  const desired = useDesiredValueSlice(page, noteKey);
  const value = desired.draft ?? "";

  return (
    <SectionCard
      title={title}
      collapsible
      anchor={noteKey}
      copy={webCopy({
        kind: "web-page-plan-note",
        label: title,
        description: `Freeform plan notes for the "${title}" area of this page.`,
        surface: `${title} — ${page.url}`,
        data: { url: page.url, key: noteKey, notes: value || null },
        lines: [
          ["Page", page.url],
          ["Notes", value || "none yet"],
        ],
        attributes: { page_id: page.id },
      })}
    >
      <DesiredSection
        title="Plan notes"
        hint={hint}
        dirty={desired.dirty}
        saving={desired.saving}
        onSave={() => void desired.save()}
        onReset={desired.reset}
        className="border-t-0"
      >
        <Textarea
          value={value}
          onChange={(event) =>
            desired.setDraft(event.target.value || undefined)
          }
          placeholder={placeholder}
          minHeight={96}
          className="text-xs"
        />
      </DesiredSection>
    </SectionCard>
  );
}
