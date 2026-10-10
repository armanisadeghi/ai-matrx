"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { getJson, postJson } from "@/lib/python-client";
import { getUserMessage } from "@/lib/api/errors";
import type { components } from "@ai-matrx/agents/generated/api-types";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import type { ContactSearchResultPending } from "./types";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
type Preview = components["schemas"]["GoogleContactEditPreview"];
type Result = components["schemas"]["GoogleContactEditResult"];
type Admission = components["schemas"]["ContactWriteAdmission"];
type Name = components["schemas"]["GoogleContactNameEdit"];

const base = "/google-integrations/contacts/write";

export function contactWriteConnectionForRead(
  connections: GoogleConnectionSummary[],
  search: ContactSearchResultPending | null,
  selectedAccount: string | null,
): GoogleConnectionSummary | null {
  if (!search?.connection_id || (selectedAccount && selectedAccount !== search.google_account)) return null;
  return connections.find((connection) => connection.id === search.connection_id &&
    connection.owner_type === "user" && connection.status === "connected" &&
    connection.scopes.includes(GOOGLE_SCOPE.contactsWrite)) ?? null;
}

function sourceName(value: Record<string, unknown>): Name {
  const names = value.names;
  const first = Array.isArray(names) ? names[0] : null;
  if (!first || typeof first !== "object") return { given_name: null, family_name: null };
  const entry = first as Record<string, unknown>;
  return {
    given_name: typeof entry.givenName === "string" ? entry.givenName : null,
    family_name: typeof entry.familyName === "string" ? entry.familyName : null,
  };
}

function nameText(name: Name): string {
  return [name.given_name, name.family_name].filter(Boolean).join(" ") || "Unnamed";
}

export function ContactWriteReview({ organizationId, connectionId, resourceName, displayName, accountLabel }: {
  organizationId: string;
  connectionId: string;
  resourceName: string;
  displayName: string;
  accountLabel: string;
}) {
  const admission = useQuery({
    queryKey: ["google", "contacts-write", "admission"],
    queryFn: async ({ signal }) => (await getJson<Admission>(`${base}/admission`, { signal })).data,
    staleTime: 30_000,
  });
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reviewedEdits, setReviewedEdits] = useState<Name | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [reverseReview, setReverseReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const applying = useRef(false);

  useEffect(() => {
    requestVersion.current += 1;
    applying.current = false;
    setBusy(false);
    setPreview(null);
    setReviewedEdits(null);
    setResult(null);
    setReverseReview(false);
    setGivenName("");
    setFamilyName("");
    setError(null);
  }, [organizationId, connectionId, resourceName]);

  const invalidate = () => {
    requestVersion.current += 1;
    setPreview(null);
    setReviewedEdits(null);
    setError(null);
  };

  const review = async (edits: Name, reverse = false) => {
    invalidate();
    const version = requestVersion.current;
    setBusy(true);
    try {
      const { data } = await postJson<Preview>(`${base}/preview`, {
        organization_id: organizationId, connection_id: connectionId, resource_name: resourceName,
        edits: { name: edits },
      }, { organizationId });
      if (version !== requestVersion.current) return;
      setPreview(data);
      setReviewedEdits(edits);
      setReverseReview(reverse);
    } catch (cause) {
      if (version === requestVersion.current) setError(getUserMessage(cause));
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  };

  const apply = async () => {
    if (!preview || !reviewedEdits || applying.current) return;
    const receipt = preview.receipt;
    const edits = reviewedEdits;
    invalidate(); // A receipt is a single deliberate attempt, even if the request fails.
    const version = requestVersion.current;
    applying.current = true;
    setBusy(true);
    try {
      const { data } = await postJson<Result>(`${base}/apply`, {
        organization_id: organizationId, connection_id: connectionId, resource_name: resourceName,
        edits: { name: edits }, review_receipt: receipt,
      }, { organizationId });
      if (version === requestVersion.current) {
        setResult(data);
        setReverseReview(false);
      }
    } catch (cause) {
      if (version === requestVersion.current) setError(getUserMessage(cause));
    } finally {
      if (version === requestVersion.current) {
        applying.current = false;
        setBusy(false);
      }
    }
  };

  if (admission.isLoading) return <p className="text-xs text-muted-foreground">Checking edit access…</p>;
  if (admission.isError) return <Button variant="outline" onClick={() => void admission.refetch()}>Check edit access again</Button>;
  if (!admission.data?.eligible) return <p className="text-xs text-muted-foreground">{admission.data?.message ?? "Review access unavailable."}</p>;

  const before = preview ? sourceName(preview.before) : null;
  const after = preview ? sourceName(preview.after) : null;
  const confirmed = result ? sourceName(result.after) : null;
  const original = result ? sourceName(result.before) : null;
  const reverse: Name = {
    given_name: original?.given_name ?? null,
    family_name: original?.family_name ?? null,
  };

  return <section className="mt-2 space-y-3 rounded-md border p-3" aria-label={`Edit ${displayName} in Google`}>
    <p className="text-sm font-medium">Edit Google Contact name</p>
    <p className="text-xs text-muted-foreground">{accountLabel}</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs">Given name<Input value={givenName} maxLength={256} disabled={busy} onChange={(event) => { invalidate(); setGivenName(event.target.value); }} /></label>
      <label className="text-xs">Family name<Input value={familyName} maxLength={256} disabled={busy} onChange={(event) => { invalidate(); setFamilyName(event.target.value); }} /></label>
    </div>
    <Button variant="outline" disabled={busy || (!givenName.trim() && !familyName.trim())}
      onClick={() => void review({ ...(givenName.trim() ? { given_name: givenName.trim() } : {}), ...(familyName.trim() ? { family_name: familyName.trim() } : {}) })}>
      {busy ? "Working…" : "Preview name edit"}
    </Button>
    {preview && before && after ? <div className="space-y-2 text-sm">
      <p>Google now: {nameText(before)}</p><p>After edit: {nameText(after)}</p>
      <Button variant="primary" disabled={busy} onClick={() => void apply()}>{reverseReview ? "Restore reviewed name" : "Apply reviewed edit"}</Button>
    </div> : null}
    {result && confirmed && !preview ? <div className="space-y-2 text-sm">
      <p>Google confirmed: {nameText(confirmed)}</p>
      <Button variant="outline" disabled={busy} onClick={() => void review(reverse, true)}>Preview reverse edit</Button>
    </div> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}<ErrorAlchemyMenu error={error} /></p> : null}
  </section>;
}
