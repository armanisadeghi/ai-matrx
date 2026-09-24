"use client";

// The ONLY client code on a portal form page (lane S6): the platform's own `FormRunner`, in its
// public arm — the Fields the server already resolved and a submit port — so the browser mounts
// no store client and knows no organization id. Sending goes through a server action that asks
// the store AS HER (`custom.portal_form_submit`).
//
// ONE PRESS, ONE REQUEST. A client key minted once per visit travels with every send, so a
// double press or a retry after a dropped connection is the same submission, never two.

import { useRef } from "react";
import Link from "next/link";
import { FormRunner, type FormSubmitOutcome } from "@ai-matrx/records-ui";
import type { Field } from "@ai-matrx/records";

import type { PortalFormSpec } from "@/features/portals/service";

import { sendPortalForm } from "./actions";

export function PortalFormRunner({
  slug,
  form,
  business,
}: {
  slug: string;
  form: PortalFormSpec;
  /** What the business is called on this portal, for the sentence after sending. */
  business: string;
}) {
  const clientKey = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `portal-${crypto.randomUUID()}`
      : `portal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  async function submit(values: Record<string, unknown>): Promise<FormSubmitOutcome> {
    const outcome = await sendPortalForm(slug, form.form_id, values, clientKey.current);
    if (!outcome.ok) {
      return {
        ok: false,
        message: outcome.message ?? "This could not be sent. Nothing was saved, so it is safe to try again.",
      };
    }
    // The store's own sentence when it has one ("held" says the office will look first);
    // otherwise say where it went, in her words, never the form's internals.
    return {
      ok: true,
      recordId: outcome.recordId ?? null,
      message: outcome.message ?? `It is on your portal now, and ${business} has it.`,
    };
  }

  const presentation = form.presentation ?? null;
  const spec: Record<string, unknown> = {
    name: form.label || form.title,
    subject: form.table_id,
    intro: presentation?.intro ?? null,
    questions: (presentation?.questions ?? []).map((q) => ({
      field: q.field,
      ask: q.ask ?? null,
      help: q.help ?? null,
      required: q.required ?? form.required.includes(q.field),
    })),
    flow: presentation?.flow ?? "single-page",
    thankYou: presentation?.thank_you
      ? { title: presentation.thank_you.title ?? null, body: presentation.thank_you.body ?? null, redirectUrl: null }
      : { title: "Sent", body: null, redirectUrl: null },
    submitLabel: presentation?.submit_label ?? "Send",
    isPublic: true,
  };

  return (
    <>
      <FormRunner
        form={spec as unknown as Parameters<typeof FormRunner>[0]["form"]}
        fields={form.fields as unknown as Field[]}
        onSubmit={submit}
      />
      <p className="mt-6 text-sm">
        <Link
          href={`/portal/c/${encodeURIComponent(slug)}`}
          data-tap-target
          className="font-medium text-primary underline underline-offset-4"
        >
          Back to your portal
        </Link>
      </p>
    </>
  );
}
