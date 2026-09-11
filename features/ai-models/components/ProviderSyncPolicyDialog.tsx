"use client";

/**
 * ProviderSyncPolicyDialog — the editor for one provider's `ai.provider.sync_policy`.
 *
 * This replaced `constants/excluded-provider-models.ts`. The exclusion list and
 * the release cutoff used to be a hardcoded constant in this repo, which meant
 * the sync AGENT (which reads the database) and this SCREEN could disagree
 * about which models were deliberately ignored, and nobody could change either
 * without a deploy. The policy is now a row, both sides read it, and an admin
 * edits it here.
 *
 * Saving states the consequence out loud before it happens — an excluded model
 * is a model the sync agent will never add, forever, silently.
 */

import React, { useEffect, useState } from "react";
import { CalendarOff, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Textarea } from "@/components/ui/textarea";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { aiModelService } from "@/features/ai-models/service";
import type { ProviderSyncPolicy } from "@/features/ai-models/types";

export type ProviderSyncPolicyTarget = {
  providerId: string;
  providerName: string;
  policy: ProviderSyncPolicy;
  /** Every model id the provider's last snapshot contained, for the add picker. */
  knownModelIds: string[];
};

export default function ProviderSyncPolicyDialog({
  target,
  onClose,
  onSaved,
}: {
  target: ProviderSyncPolicyTarget | null;
  onClose: () => void;
  onSaved: (providerId: string, policy: ProviderSyncPolicy) => void;
}) {
  const [cutoff, setCutoff] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [newId, setNewId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setCutoff(target.policy.min_release_date ?? "");
    setExcluded([...target.policy.excluded_model_ids]);
    setNotes(target.policy.notes ?? "");
    setNewId("");
  }, [target]);

  if (!target) return null;

  const addExclusion = () => {
    const id = newId.trim();
    if (!id) return;
    if (excluded.includes(id)) {
      toast.info(`"${id}" is already excluded for ${target.providerName}.`);
      setNewId("");
      return;
    }
    setExcluded((prev) => [...prev, id]);
    setNewId("");
  };

  const handleSave = async () => {
    const cutoffValue = cutoff.trim() === "" ? null : cutoff.trim();
    const addedCount = excluded.filter(
      (id) => !target.policy.excluded_model_ids.includes(id),
    ).length;
    const removedCount = target.policy.excluded_model_ids.filter(
      (id) => !excluded.includes(id),
    ).length;
    const cutoffChanged = cutoffValue !== (target.policy.min_release_date ?? null);

    const consequences: string[] = [];
    if (addedCount > 0) {
      consequences.push(
        `${addedCount} model${addedCount === 1 ? "" : "s"} will be excluded — the sync agent will never add ${addedCount === 1 ? "it" : "them"} to the registry.`,
      );
    }
    if (removedCount > 0) {
      consequences.push(
        `${removedCount} model${removedCount === 1 ? "" : "s"} will stop being excluded and will show up as candidates the agent can add.`,
      );
    }
    if (cutoffChanged) {
      consequences.push(
        cutoffValue
          ? `Models released before ${cutoffValue} will be ignored by the sync agent.`
          : "The release cutoff is being removed — every model the provider returns becomes a candidate again, including very old ones.",
      );
    }

    if (consequences.length > 0) {
      const ok = await confirm({
        title: `Change the ${target.providerName} sync policy?`,
        description: consequences.join(" "),
        confirmLabel: "Save policy",
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      const saved = await aiModelService.updateProviderSyncPolicy(
        target.providerId,
        {
          min_release_date: cutoffValue,
          excluded_model_ids: excluded,
          notes: notes.trim() === "" ? null : notes.trim(),
        },
      );
      onSaved(target.providerId, saved);
      toast.success(`${target.providerName} sync policy saved`);
      onClose();
    } catch (err) {
      toast.error(`Could not save the ${target.providerName} sync policy`, {
        description: extractErrorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const unknownExclusions = excluded.filter(
    (id) => !target.knownModelIds.includes(id),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{target.providerName} sync policy</DialogTitle>
          <DialogDescription>
            The rules the model sync agent obeys for this provider. Stored on
            the provider row, read by the agent and by this screen — there is no
            second copy anywhere.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="sync-policy-cutoff"
              className="text-xs font-medium flex items-center gap-1.5"
            >
              <CalendarOff className="h-3.5 w-3.5 text-muted-foreground" />
              Ignore models released before
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="sync-policy-cutoff"
                type="date"
                value={cutoff}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCutoff(e.target.value)}
                className="h-8 w-44 text-xs"
              />
              {cutoff && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setCutoff("")}
                >
                  Clear
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {cutoff
                ? `Older models are classed "before cutoff" — visible here, never synced.`
                : "No cutoff: every model the provider returns is a sync candidate."}
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium">
              Excluded models ({excluded.length})
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={newId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewId(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addExclusion();
                  }
                }}
                placeholder="Provider model id, e.g. gpt-4o-transcribe-diarize"
                className="h-8 text-xs font-mono"
                list="sync-policy-known-models"
              />
              <datalist id="sync-policy-known-models">
                {target.knownModelIds.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={addExclusion}
                disabled={newId.trim() === ""}
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>

            {excluded.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Nothing excluded — every model this provider returns is a
                candidate the agent may add.
              </p>
            ) : (
              <div className="max-h-48 overflow-auto rounded border divide-y">
                {excluded.map((id) => (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-2 px-2 py-1"
                  >
                    <span className="font-mono text-[11px] truncate" title={id}>
                      {id}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!target.knownModelIds.includes(id) && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          not in last snapshot
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setExcluded((prev) => prev.filter((x) => x !== id))
                        }
                        className="text-muted-foreground hover:text-destructive"
                        title={`Stop excluding ${id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {unknownExclusions.length > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {unknownExclusions.length} excluded id
                {unknownExclusions.length === 1 ? " is" : "s are"} not in this
                provider&apos;s last snapshot — retired upstream, or a typo.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="sync-policy-notes" className="text-xs font-medium">
              Notes
            </label>
            <Textarea
              id="sync-policy-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Why these rules exist — the next person reads this."
              className="text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
