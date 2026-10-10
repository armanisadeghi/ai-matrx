"use client";

// features/unified-data/custom-fields/CustomFieldsSettingsPage.tsx — LANE ALL-MY-DATA
//
// A STANDARD TABLE'S CUSTOM FIELDS, in their native form: the fields one organization added to the
// table (Tasks, People …), and the one way to add another. Reads `custom.custom_fields_on`; adds
// through `custom.entity_field_declare` (an organization admin's, refused by the store otherwise —
// the refusal is shown in the store's words). The organization is the ROW'S, from the address, never
// the active one.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@ai-matrx/design-system/controls";
import { CUSTOM_FIELD_ADDABLE_TYPES, recordsDataSource } from "@ai-matrx/records-ui";

import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { createClient } from "@/utils/supabase/client";
import { customFieldsOn, declareCustomField, doorFailureLine, type CustomFieldOnRow } from "@/features/unified-data/hub/doors";
import { isUuidShape } from "@ai-matrx/kit/uuid";

type Read = { status: "loading" } | { status: "failed"; message: string } | { status: "ready"; rows: CustomFieldOnRow[] };

export function CustomFieldsSettingsPage({ token, organizationId }: { token: string; organizationId: string | null }) {
  const router = useRouter();
  const [read, setRead] = useState<Read>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [adding, setAdding] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const org = organizationId && isUuidShape(organizationId) ? organizationId : null;

  useEffect(() => {
    let live = true;
    (async () => {
      if (!org) {
        if (live) setRead({ status: "failed", message: "This link names no organization." });
        return;
      }
      const answered = await customFieldsOn(recordsDataSource(createClient()), org, token);
      if (!live) return;
      if (answered.ok) setRead({ status: "ready", rows: answered.data });
      else setRead({ status: "failed", message: doorFailureLine(answered.error) });
    })().catch((e: unknown) => {
      if (live) setRead({ status: "failed", message: e instanceof Error ? e.message : "The fields could not be read." });
    });
    return () => {
      live = false;
    };
  }, [org, token, version]);

  const add = useCallback(async () => {
    if (!org || !label.trim()) return;
    setAdding(true);
    setRefusal(null);
    const answered = await declareCustomField(recordsDataSource(createClient()), org, token, { label: label.trim(), type });
    setAdding(false);
    if (!answered.ok) {
      setRefusal(doorFailureLine(answered.error));
      return;
    }
    setLabel("");
    setVersion((v) => v + 1);
  }, [org, label, type, token]);

  const title = read.status === "ready" && read.rows[0] ? read.rows[0].table_label : token;
  const typeLabel = (value: string) => CUSTOM_FIELD_ADDABLE_TYPES.find((t) => t.value === value)?.label ?? value;

  return (
    <>
      <PageHeader>
        <HeaderStructured back={() => router.back()} title={`Custom fields on ${title}`} />
      </PageHeader>
      <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]" data-custom-fields-settings="">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
          {read.status === "failed" ? (
            <div role="status" className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-400">
              {read.message}
              <ErrorAlchemyMenu error={read.message} />
            </div>
          ) : null}
          <ul className="min-h-[96px] divide-y divide-border rounded-md border border-border" aria-label="Custom fields">
            {read.status === "ready" && read.rows.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">No custom fields here yet.</li>
            ) : null}
            {read.status === "ready"
              ? read.rows.map((row) => (
                  <li key={row.field_id} className="flex items-center justify-between gap-3 p-3 text-sm" data-custom-field={row.field_key}>
                    <span className="truncate font-medium">{row.field_label}</span>
                    <span className="shrink-0 text-muted-foreground">{typeLabel(row.field_type)}</span>
                  </li>
                ))
              : null}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <Input
                placeholder="Field name"
                aria-label="Field name"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={adding || !org}
              />
            </div>
            <select
              aria-label="Field type"
              className="h-7 rounded-md border border-border bg-background px-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={adding || !org}
            >
              {CUSTOM_FIELD_ADDABLE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <Button onClick={add} disabled={adding || !org || !label.trim()}>
              Add field
            </Button>
          </div>
          {refusal ? (
            <div role="alert" className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-400">
              {refusal}
              <ErrorAlchemyMenu error={refusal} />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
