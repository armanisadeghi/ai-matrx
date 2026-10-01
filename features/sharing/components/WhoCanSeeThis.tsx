"use client";

/**
 * features/sharing/components/WhoCanSeeThis.tsx
 *
 * "WHO CAN SEE THIS" — THE LANE CONTROL AT THE TOP OF THE SHARE DIALOG'S PEOPLE TAB
 * (lane SHARE-LANE-CONTROL, VERIFIER-23 item 3). Record-store things only; every other kind gets
 * its row controls ("Shown to", "Published to the web") in the same place through `row`.
 *
 * The record store has had the door since lane SHARE (`custom.share_lane_set`: mine |
 * organization | world). Under the access ladder law (T-36, chair ruling 2026-10-01) "mine" is the
 * hide it is, "Shown to: Only me": the thing leaves coworkers' lists and still opens for members
 * who have the link. It is never a lock; real separation is another organization or a
 * Confidential/Private Table type. The words are `SHOWN_TO_WORDS.only_me`, the ones RowControls uses.
 * Nothing on screen reached it: a door with no control is a dead end. This is that control, ONE
 * primitive every share host renders (ShareModal, ShareModalWindow, AgentSharePanel,
 * SiteAccessWorkspace) from `useSharing().whoCanSee` — it never reads or writes on its own.
 *
 *   · Only me                       — lane mine: hidden from coworkers' lists; opens by link.
 *   · Everyone in <organization>    — the organization's default, at the level it grants.
 *   · Anyone with the link          — the world lane, drawn ONLY where it would be accepted
 *                                     (`world_open`) or is already the state. Otherwise absent,
 *                                     never disabled-looking.
 *
 * The current state is always shown. A person who cannot change sharing sees it as one line of
 * text, not as buttons. Hiding takes nobody's access away, so it applies without a confirm.
 * Named people are never touched.
 */

import React, { useState } from "react";
import { Building2, Check, EyeOff, Globe, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/official/InfoHint";
import { SHOWN_TO_WORDS } from "@/lib/list-scope/shownToWords";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import type {
  LaneChoice,
  WhoCanSee,
} from "@/utils/permissions/service";
import type { ShareActionResult } from "@/utils/permissions/types";
import { RowControls, type RowControlsProps } from "./RowControls";

const LEVEL_WORD: Record<string, string> = {
  viewer: "Viewer",
  commenter: "Commenter",
  editor: "Editor",
  admin: "Admin",
};

export interface WhoCanSeeThisProps {
  /** `useSharing().whoCanSee`. Null → the kind has no lane door, and nothing is drawn. */
  whoCanSee: WhoCanSee | null;
  /** The person may change this thing's sharing (the host's owner/Admin answer). */
  canChange: boolean;
  /** `useSharing().setWhoCanSee`. */
  onChoose: (choice: LaneChoice) => Promise<ShareActionResult>;
  /**
   * Every kind outside the record store: its row controls ("Shown to", "Published to the web"),
   * drawn in this same place. `RowControls` draws nothing for a Private, Confidential or child
   * record (access ladder T-13 phase 5).
   */
  row?: Omit<RowControlsProps, "canChange">;
}

interface Option {
  choice: LaneChoice;
  label: string;
  says: string;
  /** A definition the label cannot carry, behind the tooltip slot (≤ 140). */
  hint?: string;
  icon: typeof Globe;
}

/** The truth of "Only me" on an Organization table (access ladder T-36): it hides, never locks. */
const ONLY_ME_HINT = "Hidden from members' lists. Members with the link can still open it.";

export function WhoCanSeeThis({
  whoCanSee,
  canChange,
  onChoose,
  row,
}: WhoCanSeeThisProps) {
  const { orgs } = useNavTree();
  const [pending, setPending] = useState<LaneChoice | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  if (!whoCanSee) return row ? <RowControls {...row} canChange={canChange} /> : null;

  const orgName =
    whoCanSee.organizationName ??
    (whoCanSee.organizationId
      ? orgs.find((o) => o.id === whoCanSee.organizationId)?.name
      : undefined) ??
    "this organization";
  const level = whoCanSee.memberDefaultLevel
    ? LEVEL_WORD[whoCanSee.memberDefaultLevel] ?? whoCanSee.memberDefaultLevel
    : null;

  const options: Option[] = [
    {
      choice: "mine",
      label: SHOWN_TO_WORDS.only_me.label,
      says: SHOWN_TO_WORDS.only_me.says,
      hint: ONLY_ME_HINT,
      icon: EyeOff,
    },
    {
      choice: "organization",
      label: `Everyone in ${orgName}`,
      says: level
        ? `Every member, as ${level}. This is the organization's default.`
        : "Every member. This is the organization's default.",
      icon: Building2,
    },
  ];
  if (whoCanSee.worldOffered || whoCanSee.choice === "world") {
    options.push({
      choice: "world",
      label: "Anyone with the link",
      says: "Out in the world, findable by the link and nothing else.",
      icon: Globe,
    });
  }
  const current = options.find((o) => o.choice === whoCanSee.choice) ?? options[options.length - 1];

  const apply = async (choice: LaneChoice) => {
    setPending(choice);
    setSaid(null);
    try {
      const result = await onChoose(choice);
      setSaid(
        result.success
          ? { ok: true, text: result.message ?? "Saved." }
          : { ok: false, text: result.error ?? "That could not be changed." },
      );
    } finally {
      setPending(null);
    }
  };

  const pick = (choice: LaneChoice) => {
    if (choice === whoCanSee.choice || pending) return;
    void apply(choice);
  };

  return (
    <section
      className="space-y-1.5 p-3 bg-muted/30 rounded-lg border"
      data-who-can-see
      data-lane={whoCanSee.choice}
    >
      <p className="text-xs font-medium">Who can see this</p>

      {canChange ? (
        <div
          role="radiogroup"
          aria-label="Who can see this"
          className="grid grid-cols-1 gap-1.5 sm:grid-flow-col sm:auto-cols-fr"
        >
          {options.map((o) => {
            const Icon = o.icon;
            const selected = o.choice === whoCanSee.choice;
            return (
              <div key={o.choice} className="relative min-w-0">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                data-lane-choice={o.choice}
                onClick={() => pick(o.choice)}
                className={cn(
                  "flex w-full min-w-0 items-start gap-2 rounded-md border p-2 text-left transition-colors",
                  o.hint && "pr-7",
                  selected
                    ? "border-primary bg-background"
                    : "border-transparent hover:bg-background/60",
                )}
              >
                {pending === o.choice ? (
                  <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-primary" />
                ) : (
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4 flex-shrink-0",
                      selected ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    <span className="min-w-0 break-words">{o.label}</span>
                    {selected && <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary" />}
                  </span>
                  <span className="block text-xs text-muted-foreground">{o.says}</span>
                </span>
              </button>
              {/* Beside the radio, never inside it: a button may not hold a button. */}
              {o.hint && (
                <InfoHint
                  text={o.hint}
                  label={`About ${o.label}`}
                  className="absolute right-2 top-2.5"
                />
              )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm" data-who-can-see-text>
          <span className="font-medium">{current.label}.</span>{" "}
          <span className="text-xs text-muted-foreground">{current.says}</span>
          {current.hint && <InfoHint text={current.hint} label={`About ${current.label}`} />}
        </p>
      )}

      {said && (
        <p
          className={cn(
            "text-xs",
            said.ok ? "text-green-700 dark:text-green-300" : "text-destructive",
          )}
          data-lane-said
        >
          {said.text}
        </p>
      )}
    </section>
  );
}
