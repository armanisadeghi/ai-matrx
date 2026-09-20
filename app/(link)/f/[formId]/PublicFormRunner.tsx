"use client";

// app/(link)/f/[formId]/PublicFormRunner.tsx — THE ONLY CLIENT CODE ON THE
// PUBLIC FORM PAGE, and it is a mount and a fetch.
//
// `FormRunner` is the SAME component the owner sees inside the app. Its public
// arm takes the Fields the server already resolved and a submit port, so it
// mounts no record-store client at all: the browser on this page holds no key,
// knows no organization id and cannot read a row. Everything it knows, the
// server handed it.
//
// A SCREEN IS ABSENT OR HONEST. A refused answer shows the STORE's own sentence
// — "This form needs full name, date of birth." — because `custom.form_submit`
// names every missing question so a screen can point at it, rather than one
// generic error beside a form with twenty questions.

import { useCallback } from "react";
import { FormRunner, type FormSubmitOutcome } from "@ai-matrx/records-ui";
import type { Field } from "@ai-matrx/records";

import type { PublicForm } from "@/features/forms/service";

export function PublicFormRunner({ form }: { form: PublicForm }) {
  const submit = useCallback(
    async (values: Record<string, unknown>): Promise<FormSubmitOutcome> => {
      try {
        const response = await fetch(`/api/forms/${form.form_id}/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ values }),
        });
        const body = (await response.json()) as {
          ok?: boolean;
          state?: string;
          message?: string | null;
          record_id?: string | null;
        };
        if (!response.ok || body.ok === false) {
          return {
            ok: false,
            message:
              body.message ??
              "This answer could not be sent. Nothing was saved, so it is safe to try again.",
          };
        }
        // HELD IS NOT SENT-AND-FORGOTTEN. An answer whose form has no accept
        // Rule waits for a person, and the thank-you screen says so in the
        // store's own words instead of implying it landed in the table.
        return {
          ok: true,
          recordId: body.record_id ?? null,
          ...(body.message ? { message: body.message } : {}),
        };
      } catch {
        return {
          ok: false,
          message:
            "This answer did not reach us — the connection dropped. Nothing was saved, so pressing send again is safe.",
        };
      }
    },
    [form.form_id],
  );

  return (
    <FormRunner
      form={{
        name: form.title,
        subject: form.table_id,
        intro: form.presentation?.intro ?? null,
        questions: (form.presentation?.questions ?? []).map((q) => ({
          field: q.field,
          ask: q.ask ?? null,
          help: q.help ?? null,
          required: q.required ?? null,
        })),
        flow: form.presentation?.flow ?? "one-at-a-time",
        theme: form.presentation?.theme ?? null,
        thankYou: form.presentation?.thank_you ?? null,
        submitLabel: form.presentation?.submit_label ?? null,
        isPublic: true,
      }}
      fields={form.fields as unknown as Field[]}
      honeypotKey={form.honeypot_key}
      onSubmit={submit}
    />
  );
}
