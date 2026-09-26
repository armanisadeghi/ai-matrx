"use client";

/**
 * features/sources/SaveSourcePanel.tsx — the ONE Save panel for a Source
 * (SOURCE-CONVERGENCE §8.3). Every surface that captures something — the
 * Sources page, the scraper's result cards, the batch scrape page, the chat
 * web-page picker, transcript import — hands the landed Source id(s) here and
 * the person decides, in one motion:
 *
 *   - Save (on by default) — keep it in Sources.
 *   - Where it is filed — any registered place (project, task, scope, research
 *     topic, deck, podcast episode, war room, data store) through the
 *     registry-driven `UniversalAssociationPicker`, plus an optional
 *     media-catalog Library (remembered per person on this device).
 *   - Process now — override a deferred policy and run processing right away.
 *
 * The write is `POST /sources/{id}/keep` per Source (a server write, because
 * Save is the signal that starts metered AI processing). The organization is
 * always named: the Source's own when the caller knows it, else the one the
 * person has selected (`ensureOrgId` asks when there is none). Every refusal
 * reaches the toast in the server's own words and every notice the door
 * returns is rendered under the button — never dropped.
 *
 * The decisions themselves live in `saveSourceLogic.ts` (pure, copyable into
 * the extension's side panel).
 */

import { useEffect, useState } from "react";
import { Loader2, Library, Save, X } from "lucide-react";
import {
  UniversalAssociationPicker,
  attachedKey,
} from "@ai-matrx/associations/react";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { supabase } from "@/utils/supabase/client";
import { cn } from "@/utils/cn";
import {
  keepSource,
  sourceRefusalSentence,
  type LandedSource,
  type LandingNotice,
} from "@/features/sources/api/sourcesApi";
import { processSourceNow } from "@/features/sources/api/processNow";
import {
  filedPlacesWords,
  SAVE_TARGET_TOKENS,
  buildAttachTargets,
  hasSomethingToSave,
  intelligenceSentence,
  readRememberedLibrary,
  writeRememberedLibrary,
  type StagedTarget,
} from "@/features/sources/saveSourceLogic";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface SaveSourceItem {
  processedDocumentId: string;
  name?: string | null;
  /** The Source's organization, when the caller already read it. */
  organizationId?: string | null;
  /** True for a file's canonical extract (process-now runs the full pipeline). */
  isFileExtract?: boolean;
}

export interface SaveSourcePanelProps {
  sources: SaveSourceItem[];
  /** Notices the door returned when these Sources landed — shown, never dropped. */
  landingNotices?: LandingNotice[];
  onSaved?: (results: LandedSource[]) => void;
  /** Called after EVERY save attempt, success or refusal, so the host re-reads the rows (never trust a toast over the database). */
  onSettled?: () => void;
  onCancel?: () => void;
  /** Start with Save off (e.g. "Attach" from a bulk bar files without re-saving). */
  defaultSave?: boolean;
  /** Inside a dialog that already titles it: hide the panel's own heading and close button. */
  embedded?: boolean;
  className?: string;
}

interface LibraryOption {
  id: string;
  name: string;
  adapter: string;
}

function errorSentence(error: unknown): string {
  return sourceRefusalSentence(error);
}

/** The person's media-catalog Libraries: the ones they made (VIEW LAW: mine). */
function useMyLibraries(userId: string | null) {
  const [libraries, setLibraries] = useState<LibraryOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    void (async () => {
      const { data, error: readError } = await supabase
        .schema("media")
        .from("source_library")
        .select("id,name,adapter")
        .eq("created_by", userId)
        .is("deleted_at", null)
        .order("name")
        .limit(200);
      if (cancelled) return;
      if (readError) {
        setError(
          "Your Libraries could not be loaded, so none can be chosen right now.",
        );
        return;
      }
      const rows = (data ?? []) as LibraryOption[];
      // Web-capture Libraries first: they are where captured pages belong.
      rows.sort(
        (a, b) =>
          Number(b.adapter === "web_capture") -
          Number(a.adapter === "web_capture"),
      );
      setLibraries(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return { libraries, error };
}

const NO_LIBRARY = "__none__";

export function SaveSourcePanel({
  sources,
  landingNotices = [],
  onSaved,
  onSettled,
  onCancel,
  defaultSave = true,
  embedded = false,
  className,
}: SaveSourcePanelProps) {
  const userId = useAppSelector(selectUserId);
  const { libraries, error: librariesError } = useMyLibraries(userId);
  const [save, setSave] = useState(defaultSave);
  const [processNow, setProcessNow] = useState(false);
  const [staged, setStaged] = useState<StagedTarget[]>([]);
  const [libraryId, setLibraryId] = useState<string | null>(() =>
    readRememberedLibrary(
      typeof window === "undefined" ? null : window.localStorage,
      userId,
    ),
  );
  // The person can arrive after the first render (auth hydrates late): read
  // their remembered Library once their id is known.
  const [libraryUser, setLibraryUser] = useState(userId);
  if (userId !== libraryUser) {
    setLibraryUser(userId);
    setLibraryId(
      readRememberedLibrary(
        typeof window === "undefined" ? null : window.localStorage,
        userId,
      ),
    );
  }
  const [busy, setBusy] = useState(false);
  const [resultNotices, setResultNotices] = useState<string[]>([]);

  // New places created from the picker are filed in the Source's own
  // organization when every Source shares one.
  const orgIds = [
    ...new Set(sources.map((s) => s.organizationId).filter(Boolean)),
  ];
  const sourceOrgId = orgIds.length === 1 ? (orgIds[0] as string) : null;
  const attachTo = buildAttachTargets(staged, libraryId);
  const canSave = sources.length > 0 && hasSomethingToSave(save, attachTo);
  const attachedKeys = new Set(staged.map((t) => attachedKey(t.token, t.id)));
  const noun = sources.length === 1 ? "Source" : `${sources.length} Sources`;

  const chooseLibrary = (value: string) => {
    const next = value === NO_LIBRARY ? null : value;
    setLibraryId(next);
    writeRememberedLibrary(
      typeof window === "undefined" ? null : window.localStorage,
      userId,
      next,
    );
  };

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    setResultNotices([]);
    const results: LandedSource[] = [];
    const refusals: string[] = [];
    const notes: string[] = [];
    try {
      const fallbackOrg = sources.every((s) => s.organizationId)
        ? null
        : await ensureOrgId(null);
      for (const source of sources) {
        try {
          const landed = await keepSource(source.processedDocumentId, {
            attachTo,
            organizationId: source.organizationId ?? (fallbackOrg as string),
          });
          results.push(landed);
          for (const n of landed.notices ?? []) notes.push(n.message);
          if (processNow && landed.intelligence !== "queued") {
            const processed = await processSourceNow(
              source.processedDocumentId,
              {
                isFileExtract: !!source.isFileExtract,
              },
            );
            notes.push(processed.message);
          } else {
            notes.push(intelligenceSentence(landed.intelligence, landed.kept));
          }
        } catch (error) {
          refusals.push(errorSentence(error));
        }
      }
    } catch (error) {
      setBusy(false);
      if (isOrganizationSelectionCancelled(error)) return;
      toast.error(errorSentence(error));
      return;
    }
    setBusy(false);
    const uniqueNotes = [...new Set(notes)];
    setResultNotices([...refusals, ...uniqueNotes]);
    const libraryName = libraryId
      ? (libraries.find((l) => l.id === libraryId)?.name ?? "you chose")
      : null;
    const placesWords = filedPlacesWords(staged, libraryName);
    const filed = placesWords ? ` and ${placesWords}` : "";
    if (refusals.length === 0) {
      toast.success(
        `${save ? "Saved" : "Filed"} ${results.length === 1 ? "1 Source" : `${results.length} Sources`}${save ? filed : ""}.${uniqueNotes[0] ? ` ${uniqueNotes[0]}` : ""}`,
      );
    } else {
      toast.error(
        `${results.length} of ${sources.length} done. ${refusals[0]}${refusals.length > 1 ? ` (and ${refusals.length - 1} more)` : ""}`,
      );
    }
    // A partial save keeps the panel open with every refusal listed in it.
    onSettled?.();
    if (results.length && refusals.length === 0) onSaved?.(results);
  };

  return (
    <div
      className={cn(
        "flex max-h-[min(78dvh,720px)] flex-col text-sm",
        className,
      )}
      data-testid="save-source-panel"
    >
      {/* Body scrolls on its own; the footer (Save, the hint, the results) stays pinned. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-3 pr-1">
        {embedded ? null : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-foreground">Save {noun}</p>
              {sources.length === 1 && sources[0].name ? (
                <p className="truncate text-xs text-muted-foreground">
                  {sources[0].name}
                </p>
              ) : null}
            </div>
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                aria-label="Close"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        )}

        {landingNotices.length > 0 ? (
          <ul className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300">
            {landingNotices.map((n) => (
              <li key={`${n.code}:${n.message}`}>{n.message}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="save-source-save" className="text-sm">
            Save
            <span className="block text-xs font-normal text-muted-foreground">
              Keep it in your Sources. Saving starts its processing under your
              organization&apos;s policy.
            </span>
          </Label>
          <Switch
            id="save-source-save"
            checked={save}
            onCheckedChange={setSave}
          />
        </div>

        <div className="space-y-1">
          <Label className="flex items-center gap-1 text-sm">
            <Library className="h-3.5 w-3.5" /> Add to a Library (media catalog,
            optional)
          </Label>
          {librariesError ? (
            <p className="text-xs text-destructive">{librariesError} <ErrorAlchemyMenu error={librariesError} /></p>
          ) : (
            <Select
              value={libraryId ?? NO_LIBRARY}
              onValueChange={chooseLibrary}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="No Library" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LIBRARY}>No Library</SelectItem>
                {libraries.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
                {libraryId &&
                !libraries.some((l) => l.id === libraryId) &&
                libraries.length > 0 ? (
                  <SelectItem value={libraryId}>
                    A Library you chose earlier (no longer listed)
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-sm">File it in</Label>
          {staged.length > 0 ? (
            <ul className="flex flex-wrap gap-1">
              {staged.map((t) => (
                <li
                  key={`${t.token}:${t.id}`}
                  className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs"
                >
                  <span className="max-w-[12rem] truncate">{t.label}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${t.label}`}
                    onClick={() =>
                      setStaged((prev) =>
                        prev.filter(
                          (p) => !(p.token === t.token && p.id === t.id),
                        ),
                      )
                    }
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {/* A long list (every scope, every task) scrolls inside its own box. */}
          <div className="max-h-72 overflow-y-auto rounded-md">
            <UniversalAssociationPicker
              tokens={[...SAVE_TARGET_TOKENS] as EntityTypeToken[]}
              attachedKeys={attachedKeys}
              ownerId={null}
              orgId={sourceOrgId}
              onAttach={async (token, resourceId, title) => {
                setStaged((prev) =>
                  prev.some((p) => p.token === token && p.id === resourceId)
                    ? prev
                    : [
                        ...prev,
                        { token, id: resourceId, label: title || token },
                      ],
                );
                return { ok: true };
              }}
              onDetach={async (token, resourceId) => {
                setStaged((prev) =>
                  prev.filter(
                    (p) => !(p.token === token && p.id === resourceId),
                  ),
                );
                return { ok: true };
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="save-source-process" className="text-sm">
            Process now
            <span className="block text-xs font-normal text-muted-foreground">
              Run processing right away, even when your organization&apos;s
              policy would wait.
            </span>
          </Label>
          <Switch
            id="save-source-process"
            checked={processNow}
            onCheckedChange={setProcessNow}
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center justify-end gap-2">
          {onCancel ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={busy || !canSave}
          >
            {busy ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            {save ? "Save" : "File"}
          </Button>
        </div>
        {!canSave && !busy ? (
          <p className="text-right text-xs text-muted-foreground">
            Turn Save on or choose a place to file it.
          </p>
        ) : null}

        {resultNotices.length > 0 ? (
          <ul
            className="space-y-1 rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground"
            data-testid="save-source-notices"
          >
            {resultNotices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
