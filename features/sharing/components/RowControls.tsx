"use client";

/**
 * features/sharing/components/RowControls.tsx
 *
 * THE RECORD'S ROW CONTROLS — exactly the access ladder's Words table, nothing else
 * (common-docs/policies/access-ladder.md, T-13 phase 5):
 *
 *   Shown to               Only me · My team · Everyone · Everyone on AI Matrx
 *                          Which lists show it to people who can already open it — never a lock.
 *   Published to the web   on · off — anyone, signed in or not, opens it at its address.
 *     + Indexed by search engines, on the same line (T-12), only while published.
 *
 * A Private, Confidential or child record has neither, so nothing is drawn: the type's capabilities
 * (`get_share_capabilities` → `shownToOffered`, `publishLane`) decide, never a guess. It is still
 * shared by Anyone link, secure link or with people — those live in their own tabs.
 * A person who cannot change sharing sees the current state as text, never as dead buttons.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import {
  getShareCapabilities,
  type ShareCapabilities,
} from "@/utils/permissions/shareLinks";
import { publicResourceUrl } from "@/utils/permissions/publicLane";
import { getShareableResource } from "@/utils/permissions/registry";
import { anyoneReachWords } from "./tabs/PublicAccessTab";
import type { ResourceType, ShareActionResult } from "@/utils/permissions/types";
import type { ShownTo } from "@/lib/list-scope/shownTo";
import { SHOWN_TO_ORDER, SHOWN_TO_WORDS } from "@/lib/list-scope/shownToWords";
import { SearchEngineIndexedSwitch } from "@/features/sharing/indexed/SearchEngineIndexedSwitch";

export interface RowControlsProps {
  resourceType: ResourceType;
  resourceId: string;
  /** The person may change this thing's sharing. */
  canChange: boolean;
  /** `useSharing().shownTo` — undefined when the type does not carry it. */
  shownTo: ShownTo | null | undefined;
  /** `useSharing().isPublic` — published to the web. */
  isPublic: boolean;
  /** `useSharing().childRecord` — a child follows its parent: nothing is drawn. */
  childRecord?: boolean;
  onSetShownTo: (next: ShownTo | null) => Promise<ShareActionResult>;
  onPublish: () => Promise<ShareActionResult>;
  onStopPublishing: () => Promise<ShareActionResult>;
}

export function RowControls({
  resourceType,
  resourceId,
  canChange,
  shownTo,
  isPublic,
  childRecord = false,
  onSetShownTo,
  onPublish,
  onStopPublishing,
}: RowControlsProps) {
  const { toast } = useToast();
  const [caps, setCaps] = useState<ShareCapabilities | null>(null);
  const [capsError, setCapsError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"shown" | "publish" | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    setCapsError(null);
    getShareCapabilities(resourceType)
      .then((c) => live && setCaps(c))
      .catch((e: unknown) => live && setCapsError(extractErrorMessage(e)));
    return () => {
      live = false;
    };
  }, [resourceType]);

  const publicUrl = publicResourceUrl(resourceType, resourceId);

  const copyAddress = useCallback(async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy the web address", variant: "destructive" });
    }
  }, [publicUrl, toast]);

  if (capsError) {
    return (
      <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
        Couldn&apos;t read this item&apos;s sharing options: {capsError}
      </p>
    );
  }
  if (!caps || childRecord) return null;

  const showShownTo = caps.shownToOffered && shownTo !== undefined;
  const showPublish = caps.publishLane !== null;
  if (!showShownTo && !showPublish) return null;

  // "Everyone on AI Matrx" is only valid on a published record; it stays listed while it is the
  // current value so the state is never hidden.
  const shownChoices = SHOWN_TO_ORDER.filter(
    (v) => v !== "everyone_on_ai_matrx" || isPublic || shownTo === v,
  );

  const publishSays =
    caps.publishLane === "card"
      ? "Only its card — the name, description and inputs — opens for anyone. What is inside stays in its organization."
      : // Never promise a signed-out read the type cannot deliver (no page of its own).
        anyoneReachWords(
          getShareableResource(resourceType)?.displayLabel?.toLowerCase() ?? "item",
          { publicPage: Boolean(publicUrl), noLoginLink: caps.isLinkShareable },
        );

  const chooseShownTo = async (next: ShownTo) => {
    if (!canChange || next === shownTo || busy) return;
    setBusy("shown");
    try {
      const result = await onSetShownTo(next);
      if (result.success === false) {
        toast({
          title: 'Couldn\'t change "Shown to"',
          description: result.error || "Please try again",
          variant: "destructive",
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const togglePublish = async (on: boolean) => {
    if (!canChange || busy) return;
    setBusy("publish");
    try {
      const result = on ? await onPublish() : await onStopPublishing();
      toast(
        result.success === false
          ? {
              title: on
                ? "Couldn't publish it to the web"
                : "Couldn't stop publishing it to the web",
              description: result.error || "Please try again",
              variant: "destructive",
            }
          : {
              title: on ? "Published to the web" : "No longer published to the web",
              description: on
                ? publishSays
                : "People outside its organization can no longer open it, unless it is shared with them.",
            },
      );
    } finally {
      setBusy(null);
    }
  };


  return (
    <section
      className="space-y-2 rounded-lg border bg-muted/30 p-3"
      data-row-controls
      data-published={isPublic ? "true" : "false"}
    >
      {showShownTo && (
        <div className="flex flex-wrap items-center justify-between gap-2" data-shown-to={shownTo ?? "default"}>
          <span className="text-xs font-medium">Shown to</span>
          {canChange ? (
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={shownTo ?? ""}
              onValueChange={(v) => v && void chooseShownTo(v as ShownTo)}
              aria-label="Shown to"
              className="flex-wrap justify-end"
            >
              {shownChoices.map((v) => (
                <ToggleGroupItem
                  key={v}
                  value={v}
                  aria-label={SHOWN_TO_WORDS[v].label}
                  title={SHOWN_TO_WORDS[v].says}
                  className="h-7 px-2 text-xs data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                >
                  {SHOWN_TO_WORDS[v].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : (
            <span className="text-xs text-muted-foreground">
              {shownTo ? SHOWN_TO_WORDS[shownTo].label : "The default for this type"}
            </span>
          )}
        </div>
      )}
      {showShownTo && (
        <p className="text-xs text-muted-foreground">
          {shownTo
            ? SHOWN_TO_WORDS[shownTo].says
            : "Not set — the default for this type applies."}{" "}
          A list setting, never who may open it.
          {busy === "shown" && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
        </p>
      )}

      {showPublish && (
        <div className={cn("space-y-1.5", showShownTo && "border-t pt-2")}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">Published to the web</span>
            <span className="flex items-center gap-3">
              <SearchEngineIndexedSwitch
                resourceType={resourceType}
                resourceId={resourceId}
                publishedHint={isPublic}
              />
              {busy === "publish" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
              {canChange ? (
                <Switch
                  checked={isPublic}
                  onCheckedChange={(on) => void togglePublish(on)}
                  disabled={busy === "publish"}
                  aria-label="Published to the web"
                />
              ) : (
                <span className="text-xs text-muted-foreground">{isPublic ? "On" : "Off"}</span>
              )}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {isPublic ? publishSays : `When on: ${publishSays}`}
          </p>
          {isPublic && publicUrl && (
            <div className="flex items-center gap-1.5 rounded-md border bg-background p-1.5">
              <span className="min-w-0 flex-1 truncate px-1 font-mono text-xs">{publicUrl}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={() => void copyAddress()}
                title="Copy web address"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
