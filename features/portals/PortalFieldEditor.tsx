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

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PortalWriteOutcome } from "@/app/(portal)/portal/c/[slug]/r/[recordId]/actions";

export function PortalFieldEditor({
  slug,
  recordId,
  fieldKey,
  label,
  initialValue,
  save,
}: {
  slug: string;
  recordId: string;
  fieldKey: string;
  label: string;
  initialValue: string;
  save: (
    slug: string,
    recordId: string,
    key: string,
    value: string,
  ) => Promise<PortalWriteOutcome>;
}) {
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(initialValue);
  const [refusal, setRefusal] = useState<{ message: string; hint: string | null } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = value !== saved;

  function onSave() {
    setRefusal(null);
    setJustSaved(false);
    startTransition(async () => {
      const outcome = await save(slug, recordId, fieldKey, value);
      if (outcome.ok) {
        setSaved(value);
        setJustSaved(true);
        return;
      }
      setRefusal({
        message: outcome.message ?? "That did not save.",
        hint: outcome.hint ?? null,
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
      <Textarea
        id={`portal-field-${fieldKey}`}
        value={value}
        rows={3}
        onChange={(event) => {
          setValue(event.target.value);
          setJustSaved(false);
        }}
        placeholder="Anything you want them to know about this job"
        className="mt-1.5 min-h-[88px] resize-y text-base"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          className="h-9"
          onClick={onSave}
          disabled={pending || !dirty}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Saving" : "Save"}
        </Button>
        {justSaved && !dirty ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        ) : null}
      </div>
      {refusal ? (
        <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">{refusal.message}</p>
          {refusal.hint ? <p className="mt-1 text-muted-foreground">{refusal.hint}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
