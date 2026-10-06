"use client";

/**
 * "Build the list" on a Press Room story angle: pick (or name) an outreach
 * list, then the SAME media-list research dialog the outreach lists page
 * opens — prefilled from the angle, every field still editable, nothing
 * spent until the person previews and runs it.
 *
 * A new list is born in the ANGLE's organization (the object's org, never the
 * active one), on the channel the knob `pr.new_press_list_channel` resolves
 * for this person in that organization (admin default email; organization and
 * personal overrides).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import {
  OutreachListPickerFields,
  useOutreachListChoice,
} from "@/features/crm/components/outreach-lists/OutreachListPicker";
import {
  MediaResearchDialog,
  type MediaResearchPrefill,
} from "@/features/crm/media-research/MediaResearchDialog";
import type {
  OutreachListKind,
  OutreachListWithCount,
} from "@/features/crm/outreach-lists/types";
import {
  ENDOWMENT_COPY,
  OUTLET_KIND_LABELS,
  readFacts,
  type StoryAngle,
} from "@/features/marketing/pr/types";

/** The research form, as far as the angle can fill it. Pure — tested. */
export function prefillFromAngle(
  angle: Pick<
    StoryAngle,
    "headline" | "summary" | "target_beat" | "target_outlet_kind" | "endowment" | "facts"
  >,
): MediaResearchPrefill {
  const summary = angle.summary?.trim();
  const shape = [
    angle.target_beat ? `Beat: ${angle.target_beat}` : null,
    angle.target_outlet_kind
      ? `Outlet: ${OUTLET_KIND_LABELS[angle.target_outlet_kind] ?? angle.target_outlet_kind}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const facts = readFacts(angle.facts).items.slice(0, 3).map((f) => f.statement);
  const endowment = ENDOWMENT_COPY[angle.endowment];
  const standing = [
    endowment ? `${endowment.label}: ${endowment.blurb}` : null,
    ...facts,
  ]
    .filter(Boolean)
    .join("; ");
  return {
    angle: summary ? `${angle.headline}\n\n${summary}` : angle.headline,
    reporterShape: shape || undefined,
    standing: standing || undefined,
    sourceLabel: `Filled in from the story angle “${angle.headline}”`,
  };
}

/** The knob that decides a new press list's channel. */
export const PRESS_LIST_CHANNEL_KNOB = {
  feature: "pr",
  key: "new_press_list_channel",
} as const;

const PRESS_LIST_CHANNELS = ["email", "call", "mixed"] as const;

/** The knob's resolved value as a list kind — a value outside the register's own choices is a named failure, never a guess. */
export function pressListKind(value: unknown): OutreachListKind {
  if (
    typeof value === "string" &&
    (PRESS_LIST_CHANNELS as readonly string[]).includes(value)
  ) {
    return value as OutreachListKind;
  }
  throw new Error(
    `The new press list channel setting (pr.new_press_list_channel) is "${String(value)}", which is not email, call or mixed.`,
  );
}

export function defaultListName(headline: string): string {
  const trimmed = headline.trim();
  const short = trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
  return `Media list — ${short}`;
}

export function BuildMediaListFromAngle({ angle }: { angle: StoryAngle }) {
  const [picking, setPicking] = useState(false);
  const [list, setList] = useState<OutreachListWithCount | null>(null);
  const [busy, setBusy] = useState(false);
  const userId = useAppSelector(selectUserId);
  const choice = useOutreachListChoice(picking);
  const router = useRouter();

  const open = () => {
    choice.setCreating(true);
    if (!choice.newName) choice.setNewName(defaultListName(angle.headline));
    setPicking(true);
  };

  const proceed = async () => {
    setBusy(true);
    try {
      const kind = pressListKind(
        await ensureEffectiveKnob(
          angle.organization_id,
          userId ?? null,
          PRESS_LIST_CHANNEL_KNOB,
        ),
      );
      const resolved = await choice.resolve({
        orgId: angle.organization_id,
        kind,
      });
      setPicking(false);
      setList(resolved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The outreach list could not be made.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        icon={<ListPlus aria-hidden />}
        variant="outline"
        onClick={open}
        data-testid="build-media-list"
      >
        Build the list
      </Button>
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Build a media list for this angle</DialogTitle>
            <DialogDescription>
              Pick the outreach list the journalists land on, or name a new one. Next you check the
              angle and see the cost before anything is spent.
            </DialogDescription>
          </DialogHeader>
          <OutreachListPickerFields
            choice={choice}
            newListLabel="New media list"
            onSubmitKey={() => void proceed()}
          />
          <DialogFooter>
            <Button variant="quiet" onClick={() => setPicking(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void proceed()}
              disabled={busy || !choice.ready}
            >
              {busy ? "Preparing…" : "Next: find journalists"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {list && (
        <MediaResearchDialog
          open
          onOpenChange={(next) => {
            if (!next) setList(null);
          }}
          listId={list.id}
          listName={list.name}
          organizationId={list.organization_id}
          prefill={prefillFromAngle(angle)}
          onLanded={() =>
            toast.success(`Journalists landed on “${list.name}”.`, {
              action: {
                label: "Open list",
                onClick: () => router.push(`/crm/outreach-lists/${list.id}`),
              },
            })
          }
        />
      )}
    </>
  );
}
