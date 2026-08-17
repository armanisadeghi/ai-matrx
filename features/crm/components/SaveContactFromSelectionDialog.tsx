"use client";

// features/crm/components/SaveContactFromSelectionDialog.tsx
//
// "Save selection as contact" — highlight a name, an email signature, a byline
// or a company footer ANYWHERE in the app, right-click, and it becomes a
// governed CRM record.
//
// THE SHAPE OF THIS FLOW, and why:
//   1. A deterministic parser fills the form the instant the dialog opens
//      (parseContactSelection) — no spinner, no waiting on a model to read four
//      lines of text, and the user sees exactly what will be saved.
//   2. The user reviews and edits. Nothing is written until they press Save.
//   3. Save runs the `crm.save_contact` mandate agent, which calls the governed
//      `resolve_contact` operation. That is the ONLY path: the raw database
//      tool is blocked from the `crm` schema server-side, and a direct insert
//      from here would skip the resolver's dedup and manufacture exactly the
//      duplicates /crm/duplicates exists to clean up.
//   4. The run streams in the floating live-run window (never a spinner), and
//      the result is a DOOR — the saved record opens at /crm/[id].

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ExternalLink, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useMandate } from "@/features/agents/mandates/useMandate";
import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import { useOpenLiveRunWindow } from "@/features/overlays/openers/liveRunWindow";
import { CRM_SAVE_CONTACT_AGENT_MANDATE } from "../constants";
import {
  parseContactSelection,
  type ParsedContactSelection,
} from "../agent-context/parseContactSelection";
import type { PartyKind } from "../types";

export interface SaveContactFromSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The highlighted text, verbatim. */
  selection: string;
  /** Where it came from — page label and/or URL. Becomes `source_detail`. */
  origin?: string;
}

/** The agent's declared output schema (mandate `required_output_keys`). */
interface SavedContactResult {
  party_id: string;
  display_name: string;
  party_kind: string | null;
  created: boolean;
  summary: string;
}

function coerceResult(value: unknown): SavedContactResult {
  const v = (value ?? {}) as Record<string, unknown>;
  const partyId = typeof v.party_id === "string" ? v.party_id : "";
  const summary = typeof v.summary === "string" ? v.summary : "";
  if (!partyId && !summary) {
    throw new Error("The contact saver returned nothing usable.");
  }
  return {
    party_id: partyId,
    display_name: typeof v.display_name === "string" ? v.display_name : "",
    party_kind: typeof v.party_kind === "string" ? v.party_kind : null,
    created: v.created === true,
    summary,
  };
}

export function SaveContactFromSelectionDialog({
  isOpen,
  onClose,
  selection,
  origin,
}: SaveContactFromSelectionDialogProps) {
  const router = useRouter();
  const mandate = useMandate(CRM_SAVE_CONTACT_AGENT_MANDATE);
  const live = useLiveAgentRun();
  const openLiveRun = useOpenLiveRunWindow();
  const [draft, setDraft] = useState<ParsedContactSelection>(() =>
    parseContactSelection(selection),
  );
  const [saving, setSaving] = useState(false);

  // A new selection re-parses; the dialog is reused per instance.
  useEffect(() => {
    setDraft(parseContactSelection(selection));
  }, [selection]);

  const set = <K extends keyof ParsedContactSelection>(
    key: K,
    value: ParsedContactSelection[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  const setKind = (kind: PartyKind) =>
    setDraft((prev) => ({
      ...prev,
      kind,
      // A person never carries a company identity key, and a company has no
      // first/last name — mirrors the create form's cross-field rule.
      domain: kind === "organization" ? prev.domain : "",
      firstName: kind === "person" ? prev.firstName : "",
      lastName: kind === "person" ? prev.lastName : "",
    }));

  const canSave =
    Boolean(draft.name.trim()) && !saving && !mandate.loading && !mandate.error;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    // The run floats — the page never shifts and the user watches it work.
    const runWindow = openLiveRun({
      instanceId: "crm-save-contact",
      label: `Saving ${draft.name.trim()}`,
      pending: true,
    });
    try {
      const result = await live.run<SavedContactResult>({
        mandateKey: CRM_SAVE_CONTACT_AGENT_MANDATE,
        surfaceKey: "crm-save-contact",
        sourceFeature: "crm",
        initiation: "user",
        onConversationCreated: (conversationId) =>
          runWindow.update({ conversationId, pending: false }),
        variables: {
          selection,
          hints: JSON.stringify({
            name: draft.name.trim(),
            kind: draft.kind,
            first_name: draft.firstName.trim(),
            last_name: draft.lastName.trim(),
            email: draft.email.trim(),
            phone: draft.phone.trim(),
            domain: draft.domain.trim(),
            headline: draft.headline.trim(),
          }),
          origin: origin ?? "Saved from a selection in the app",
        },
        coerce: coerceResult,
      });

      runWindow.close();
      if (!result.party_id) {
        // The agent declined to save — say what it said, don't pretend.
        toast.info(result.summary || "Nothing there to save as a contact.");
        return;
      }
      const href = `/crm/${result.party_id}`;
      toast.success(
        result.summary ||
          (result.created
            ? `Saved ${result.display_name}`
            : `${result.display_name} was already in your CRM`),
        {
          description: result.created
            ? undefined
            : "Matched an existing record instead of creating a duplicate.",
          action: {
            label: "Open contact",
            onClick: () => router.push(href),
          },
        },
      );
      onClose();
    } catch (error) {
      runWindow.close();
      toast.error(
        error instanceof Error ? error.message : "Could not save the contact",
      );
    } finally {
      setSaving(false);
    }
  };

  const isPerson = draft.kind === "person";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save as contact</DialogTitle>
          <DialogDescription>
            Check the details, then save. If this person or company is already
            in your CRM, their record is updated instead of duplicated.
          </DialogDescription>
        </DialogHeader>

        {/* The mandate is the only save path — say so plainly when it can't run. */}
        {mandate.error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Saving contacts is unavailable right now: {mandate.error}
          </p>
        )}

        <div className="space-y-3">
          <div className="flex gap-1.5">
            {(["person", "organization"] as const).map((kind) => {
              const Icon = kind === "person" ? User : Building2;
              return (
                <Button
                  key={kind}
                  type="button"
                  variant={draft.kind === kind ? "default" : "outline"}
                  size="sm"
                  className="h-8"
                  onClick={() => setKind(kind)}
                >
                  <Icon className="mr-1.5 h-3.5 w-3.5" />
                  {kind === "person" ? "Person" : "Company"}
                </Button>
              );
            })}
          </div>

          <div className="space-y-1">
            <Label htmlFor="crm-save-name">
              {isPerson ? "Full name" : "Company name"}
            </Label>
            <Input
              id="crm-save-name"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={isPerson ? "Jane Cole" : "Acme Robotics"}
              autoFocus
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="crm-save-email">Email</Label>
              <Input
                id="crm-save-email"
                value={draft.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="jane@acme.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="crm-save-phone">Phone</Label>
              <Input
                id="crm-save-phone"
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+13105551234"
              />
            </div>
          </div>

          {isPerson ? (
            <div className="space-y-1">
              <Label htmlFor="crm-save-headline">Title / role</Label>
              <Input
                id="crm-save-headline"
                value={draft.headline}
                onChange={(e) => set("headline", e.target.value)}
                placeholder="VP of Engineering at Acme"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="crm-save-domain">Website domain</Label>
              <Input
                id="crm-save-domain"
                value={draft.domain}
                onChange={(e) => set("domain", e.target.value)}
                placeholder="acme.com"
              />
            </div>
          )}

          <details className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              What you highlighted
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {selection}
            </pre>
          </details>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void onSave()}
            disabled={!canSave}
            className={cn(saving && "opacity-80")}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
