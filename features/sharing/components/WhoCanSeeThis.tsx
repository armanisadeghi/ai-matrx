"use client";

/**
 * features/sharing/components/WhoCanSeeThis.tsx
 *
 * "WHO CAN SEE THIS" — THE LANE CONTROL AT THE TOP OF THE SHARE DIALOG'S PEOPLE TAB
 * (lane SHARE-LANE-CONTROL, VERIFIER-23 item 3).
 *
 * The record store has had the door since lane SHARE (`custom.share_lane_set`: mine |
 * organization | world), and SHARE-TAILS made "mine" really mean the owner and the people named.
 * Nothing on screen reached it: a door with no control is a dead end. This is that control, ONE
 * primitive every share host renders (ShareModal, ShareModalWindow, AgentSharePanel,
 * SiteAccessWorkspace) from `useSharing().whoCanSee` — it never reads or writes on its own.
 *
 *   · Only people I share it with   — lane mine: the owner and the people named below.
 *   · Everyone in <organization>    — the organization's default, at the level it grants.
 *   · Anyone with the link          — the world lane, drawn ONLY where it would be accepted
 *                                     (`world_open`) or is already the state. Otherwise absent,
 *                                     never disabled-looking.
 *
 * The current state is always shown. A person who cannot change sharing sees it as one line of
 * text, not as buttons. Moving to "Only people I share it with" while members reach it through
 * the default asks once, in one sentence, before it applies. Named people are never touched.
 */

import React, { useState } from "react";
import { Building2, Check, Globe, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import type {
  LaneChoice,
  WhoCanSee,
} from "@/utils/permissions/service";
import type { ShareActionResult } from "@/utils/permissions/types";

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
}

interface Option {
  choice: LaneChoice;
  label: string;
  says: string;
  icon: typeof Lock;
}

export function WhoCanSeeThis({ whoCanSee, canChange, onChoose }: WhoCanSeeThisProps) {
  const { orgs } = useNavTree();
  const [pending, setPending] = useState<LaneChoice | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  if (!whoCanSee) return null;

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
      label: "Only people I share it with",
      says: "You and the people named below. Nobody else in the organization.",
      icon: Lock,
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
  const current = options.find((o) => o.choice === whoCanSee.choice) ?? options[1];

  const apply = async (choice: LaneChoice) => {
    setConfirming(false);
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
    if (choice === "mine" && whoCanSee.membersReachNow) {
      setConfirming(true);
      setSaid(null);
      return;
    }
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
              <button
                key={o.choice}
                type="button"
                role="radio"
                aria-checked={selected}
                data-lane-choice={o.choice}
                onClick={() => pick(o.choice)}
                className={cn(
                  "flex w-full min-w-0 items-start gap-2 rounded-md border p-2 text-left transition-colors",
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
            );
          })}
        </div>
      ) : (
        <p className="text-sm" data-who-can-see-text>
          <span className="font-medium">{current.label}.</span>{" "}
          <span className="text-xs text-muted-foreground">{current.says}</span>
        </p>
      )}

      {confirming && (
        <div
          className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs sm:flex-row sm:items-center"
          data-lane-confirm
        >
          <span className="flex-1">
            Members of {orgName} who are not named below will lose access.
          </span>
          <span className="flex gap-1.5">
            <Button size="sm" className="h-7" onClick={() => void apply("mine")}>
              Only people I share it with
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => setConfirming(false)}
            >
              Keep it
            </Button>
          </span>
        </div>
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
