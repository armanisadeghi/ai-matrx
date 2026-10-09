"use client";

// One field the portal opened for editing, edited in place.
//
// The label, the dimensions and the saved value are server-rendered around this
// island; it owns only the typing, the save and what the door said back.
//
// A REFUSAL IS SHOWN, NOT SWALLOWED. When `custom.record_update` refuses, the
// store's own sentence and its hint are printed under the field and the text the
// person wrote stays exactly where it is — so nothing they typed is lost and
// nothing pretends to have saved.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PortalWriteOutcome } from "@/app/(portal)/portal/c/[slug]/r/[recordId]/actions";
import { guardedSave } from "@/lib/save/guardedSave";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { RELOAD_LABEL, STALE_MOVE_LABEL, VERSION_UNREAD_LABEL } from "@/lib/records/record-versions";

import { ProTextarea } from "@/components/official/ProTextarea";
export function PortalFieldEditor({
  slug,
  recordId,
  fieldKey,
  label,
  initialValue,
  initialVersion,
  save,
}: {
  slug: string;
  recordId: string;
  fieldKey: string;
  label: string;
  initialValue: string;
  /** The record's version when the page read it — every save is sent against it (`null` = unread). */
  initialVersion: number | null;
  save: (
    slug: string,
    recordId: string,
    key: string,
    value: string,
    version: number | null,
  ) => Promise<PortalWriteOutcome>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(initialValue);
  const [version, setVersion] = useState<number | null>(initialVersion);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const [refusal, setRefusal] = useState<{
    message: string;
    hint: string | null;
    conflict?: "changed" | "unread";
  } | null>(null);
  // THE PAGE WAS READ AGAIN (Reload, or after a save on this page): the version is what it read, and
  // the stored value replaces the field's text unless she has unsaved words in it.
  useEffect(() => {
    const before = savedRef.current;
    setVersion(initialVersion);
    setValue((typed) => (typed === before ? initialValue : typed));
    setSaved(initialValue);
    setRefusal((r) => (r?.conflict ? null : r));
  }, [initialVersion, initialValue]);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = value !== saved;

  function onSave() {
    setRefusal(null);
    setJustSaved(false);
    startTransition(async () => {
      const outcome = await guardedSave(
        () => save(slug, recordId, fieldKey, value, version),
        {
          what: "this field",
          onRetry: () => onSave(),
        },
      );
      if (outcome.ok) {
        setSaved(value);
        if (typeof outcome.version === "number") setVersion(outcome.version);
        setJustSaved(true);
        return;
      }
      setRefusal({
        message: outcome.message ?? "That did not save.",
        hint: outcome.hint ?? null,
        ...(outcome.conflict ? { conflict: outcome.conflict } : {}),
      });
    });
  }

  return (
    <div>
      <label
        htmlFor={`portal-field-${fieldKey}`}
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </label>
      <ProTextarea minHeight={88}
        id={`portal-field-${fieldKey}`}
        value={value}
        rows={3}
        onChange={(event) => {
          setValue(event.target.value);
          setJustSaved(false);
        }}
        placeholder="Anything you want them to know about this job"
        className="mt-1.5 resize-y"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button
          icon={pending ? <Loader2 className="animate-spin" /> : null}
          variant="primary"
          type="button"
          onClick={onSave}
          disabled={pending || !dirty}
        >
          {pending ? "Saving" : "Save"}
        </Button>
        {justSaved && !dirty ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        ) : null}
      </div>
      {refusal?.conflict ? (
        <div
          className="mt-2 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
          data-portal-version-refusal=""
          title={refusal.message}
        >
          <span className="font-medium text-destructive">
            {refusal.conflict === "changed" ? STALE_MOVE_LABEL : VERSION_UNREAD_LABEL}
          </span>
          <Button type="button" variant="outline" onClick={() => router.refresh()}>
            {RELOAD_LABEL}
          </Button>
        </div>
      ) : refusal ? (
        <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">{refusal.message}</p>
          {refusal.hint ? (
            <p className="mt-1 text-muted-foreground">{refusal.hint}</p>
          ) : null}
          <ErrorAlchemyMenu error={refusal.message} />
        </div>
      ) : null}
    </div>
  );
}
