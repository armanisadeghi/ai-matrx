"use client";

/**
 * Planned pages — the `plan.node` rows whose `topic_id` is this topic (the
 * function's `plan_node` / `home` edges), and "Make a page here".
 *
 * Doors: the plan node's own record through `EntityRef` (route from the entity
 * registry, the same one `useMapLinks().planNode` reads), in a new tab so the
 * panel is never traded for the answer.
 *
 * "Make a page here" writes through the content plan's own single insert path
 * carrying `topic_id` (`plannedPage.ts` has the ruling and why). It needs a
 * site that USES this map; with one in scope it is that site, otherwise the
 * person picks from `seo.map_diagnostics.sites_using_map`. No site → the
 * control says so, with the remedy, instead of hiding.
 */

import { useState } from "react";
import { FilePlus2 } from "lucide-react";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSite } from "@/features/marketing/data/hooks";
import { toast } from "@/lib/toast";

import { topicalMapErrorText } from "../../errors";
import { useMapDiagnostics } from "../../hooks";
import type { MapTopicAssociationResolved } from "../../types";
import { itemLabel } from "../associationGroups";
import { makePlannedPage } from "../plannedPage";
import { PanelEmptyLine, PanelSection } from "../PanelSection";

export interface PlannedPagesSectionProps {
  mapId: string;
  topicName: string;
  /** The `seo.map_topic` id — null until the rows read lands. */
  topicId: string | null;
  organizationId: string | null;
  siteId: string | null;
  planned: readonly MapTopicAssociationResolved[];
  readOnly: boolean;
  /** Refetch the associations after a page is made, so the new node appears. */
  onMade: () => void;
}

export function PlannedPagesSection({
  mapId,
  topicName,
  topicId,
  organizationId,
  siteId,
  planned,
  readOnly,
  onMade,
}: PlannedPagesSectionProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // Only read when the person has no site in scope and may write — the picker
  // is the only reader of this.
  const diagnostics = useMapDiagnostics(mapId, null, 1, !readOnly && siteId === null);
  const candidates = siteId ? [siteId] : diagnostics.data?.sites_using_map ?? [];
  const [pickedSite, setPickedSite] = useState<string | null>(null);
  const targetSite = siteId ?? pickedSite ?? (candidates.length === 1 ? candidates[0] : null);

  const canWrite = !readOnly && topicId !== null && organizationId !== null;

  async function make(label: string) {
    if (!topicId || !organizationId || !targetSite) return;
    setBusy(true);
    setRefusal(null);
    try {
      const node = await makePlannedPage({
        siteId: targetSite,
        organizationId,
        topicId,
        label,
      });
      toast.success(`Planned page "${node.label}" created under ${topicName}.`);
      setOpen(false);
      onMade();
    } catch (error) {
      setRefusal(topicalMapErrorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelSection
      title="Planned pages"
      count={planned.length}
      action={
        canWrite ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <FilePlus2 className="h-3 w-3" aria-hidden />
            Make a page here
          </button>
        ) : null
      }
    >
      {planned.length === 0 ? (
        <PanelEmptyLine>No planned page under this topic yet.</PanelEmptyLine>
      ) : (
        <ul className="flex flex-col gap-1">
          {planned.map((row) => (
            <li key={row.item.id} className="min-w-0 text-sm">
              <EntityRef
                token="plan_node"
                id={row.item.id}
                name={itemLabel(row)}
                openInNewTab
                showIcon={false}
              />
              {row.item.status ? (
                <span className="ml-1.5 text-[11px] text-muted-foreground">{row.item.status}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {refusal ? (
        <p role="alert" className="mt-1 whitespace-pre-wrap text-xs text-destructive">
          {refusal}
        </p>
      ) : null}

      {canWrite ? (
        <TextInputDialog
          open={open}
          onOpenChange={setOpen}
          title={`Make a page under "${topicName}"`}
          description={
            targetSite ? (
              <span>
                The page is planned on{" "}
                <SiteDoor siteId={targetSite} />
              </span>
            ) : candidates.length === 0 ? (
              diagnostics.isPending ? (
                "Finding the sites that use this map…"
              ) : diagnostics.isError ? (
                topicalMapErrorText(diagnostics.error)
              ) : (
                "No site uses this map yet, so there is nowhere to plan the page. Open the map's home and choose \"site uses map\" first."
              )
            ) : (
              <span className="flex flex-col gap-1">
                <span>This map is used by several sites. Which one gets the page?</span>
                <Select value={pickedSite ?? undefined} onValueChange={setPickedSite}>
                  <SelectTrigger className="h-8 text-xs" aria-label="Site">
                    <SelectValue placeholder="Pick a site" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((id) => (
                      <SelectItem key={id} value={id} className="text-xs">
                        <SiteLine siteId={id} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
            )
          }
          placeholder="Page title"
          defaultValue={topicName}
          confirmLabel="Create planned page"
          busy={busy}
          validate={(value) =>
            value.trim().length === 0
              ? "A page needs a title."
              : targetSite
                ? null
                : "Pick the site first."
          }
          onConfirm={(value) => make(value.trim())}
        />
      ) : null}
    </PanelSection>
  );
}

/** A site's name, with its id as the fallback while the row loads (inside a Select item, where a link cannot live). */
function SiteLine({ siteId }: { siteId: string }) {
  const site = useSite(siteId);
  return <>{site.data?.name ?? site.data?.domain ?? siteId}</>;
}

/** The same site as a DOOR (the door law: a named record opens) — peek and new tab. */
function SiteDoor({ siteId }: { siteId: string }) {
  const site = useSite(siteId);
  return (
    <EntityRef
      token="web_site"
      id={siteId}
      name={site.data?.name ?? site.data?.domain ?? siteId}
      openInNewTab
      showIcon={false}
    />
  );
}
