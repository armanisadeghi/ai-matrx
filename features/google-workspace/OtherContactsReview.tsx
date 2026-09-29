"use client";

/** Internal reviewer surface for the separately-authorized Google Other Contacts corpus. */

import { useCallback, useMemo, useState } from "react";
import { Check, ChevronRight, Loader2, RefreshCw, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { GoogleAccountSelect } from "@/features/google-workspace/GoogleAccountSelect";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import { getUserMessage } from "@/lib/api/errors";
import { toast } from "@/lib/toast";
import {
  contactFieldChoice,
  decideContactField,
  narrowContactMatchState,
} from "@/features/connectors/import/contract";
import type {
  ContactFieldChoicePending,
  ContactFieldPlanPending,
} from "@/features/connectors/import/types";
import {
  importOtherContact,
  previewOtherContacts,
  reviewOtherContact,
  type OtherContactPreviewPending,
  type OtherContactsReviewPending,
} from "@/features/connectors/import/service";

function valueText(value: string | string[] | null): string {
  if (value === null) return "No value";
  return Array.isArray(value) ? value.join(", ") : value || "No value";
}

function targetText(review: OtherContactsReviewPending): string {
  if (review.target.create_new) return "Create a new Person";
  return review.target.person_name ?? "The matched Person";
}

/**
 * The screen is unlinked and visibility-gated by its page. Aidream independently
 * authorizes every preview, review, and import; this component never offers
 * consent or creates a connection.
 */
export function OtherContactsReview() {
  const organization = useOrganizationRequired();
  const inventory = useGoogleConnectionInventory();
  const connections = useMemo(
    () =>
      (inventory.data?.connections ?? []).filter(
        (connection) =>
          connection.status === "connected" &&
          connection.scopes.includes(GOOGLE_SCOPE.contactsOtherReadonly),
      ),
    [inventory.data?.connections],
  );
  const [connectionId, setConnectionId] = useState("");
  const [preview, setPreview] = useState<OtherContactPreviewPending[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<OtherContactPreviewPending | null>(null);
  const [review, setReview] = useState<OtherContactsReviewPending | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [reviewedFields, setReviewedFields] = useState<ContactFieldChoicePending[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const resetSelection = useCallback(() => {
    setSelected(null);
    setReview(null);
    setOverrides({});
    setReviewedFields([]);
    setSaved(null);
  }, []);

  const load = useCallback(
    async (pageToken: string | null = null) => {
      if (!connectionId) return;
      setLoading(true);
      setError(null);
      try {
        const result = await previewOtherContacts({ connectionId, pageToken });
        setPreview(result.contacts);
        setNextPageToken(result.next_page_token);
        resetSelection();
      } catch (cause) {
        setError(getUserMessage(cause));
      } finally {
        setLoading(false);
      }
    },
    [connectionId, resetSelection],
  );

  const outcome = review?.result.results[0] ?? null;
  const fields = outcome?.fields ?? [];
  const choices = useMemo(
    () =>
      fields.flatMap((field) => {
        const decision = decideContactField(field);
        const include = overrides[field.key] ?? decision.includeByDefault;
        if (include === decision.includeByDefault) return [];
        return [contactFieldChoice(field, { include, value: null })];
      }),
    [fields, overrides],
  );
  const reviewIsCurrent =
    review !== null && JSON.stringify(choices) === JSON.stringify(reviewedFields);

  const makeReview = useCallback(async () => {
    if (!organization.organizationId || !connectionId || !selected) return;
    setReviewing(true);
    setError(null);
    setSaved(null);
    try {
      const result = await reviewOtherContact({
        organizationId: organization.organizationId,
        connectionId,
        resourceName: selected.resource_name,
        fields: choices,
      });
      setReview(result);
      setReviewedFields(choices);
    } catch (cause) {
      setError(getUserMessage(cause));
    } finally {
      setReviewing(false);
    }
  }, [choices, connectionId, organization.organizationId, selected]);

  const apply = useCallback(async () => {
    if (!organization.organizationId || !connectionId || !selected || !review) return;
    setImporting(true);
    setError(null);
    try {
      const result = await importOtherContact({
        organizationId: organization.organizationId,
        connectionId,
        resourceName: selected.resource_name,
        fields: reviewedFields,
        receipt: review.receipt,
        target: review.target,
      });
      const imported = result.results[0];
      setSaved(
        imported
          ? `${imported.display_name || "Selected contact"} was imported into AI Matrx. Google Other Contacts was not changed.`
          : "The selected contact was imported into AI Matrx. Google Other Contacts was not changed.",
      );
      toast.success("Selected contact imported");
    } catch (cause) {
      setError(getUserMessage(cause));
    } finally {
      setImporting(false);
    }
  }, [connectionId, organization.organizationId, review, reviewedFields, selected]);

  if (organization.organizationState !== "ready") {
    return <OrganizationContextNotice state={organization.organizationState} what="Other Contacts import" />;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Internal test</Badge>
          <Badge variant="secondary">Read-only toward Google</Badge>
        </div>
        <h1 className="text-2xl font-semibold">Review Google Other Contacts</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Preview one bounded page from the account you choose. Review the CRM match and field mapping, then import one selected contact. This screen never changes Google Other Contacts and cannot connect a new account.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Choose the already-authorized account</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {inventory.isLoading ? <p className="text-sm text-muted-foreground">Checking connected Google accounts…</p> : null}
          {!inventory.isLoading && connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No connected Google account has the separate Other Contacts permission. This internal test cannot request or add it.</p>
          ) : null}
          {connections.length ? (
            <div className="flex flex-wrap items-end gap-3">
              <GoogleAccountSelect
                connections={connections}
                connectionId={connectionId}
                onConnectionChange={(id) => { setConnectionId(id); setPreview([]); setNextPageToken(null); resetSelection(); }}
                requireExplicitSelection
                className="min-w-[17rem] flex-1"
              />
              <Button className="min-h-11" disabled={!connectionId || loading} onClick={() => void load()}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Preview one page
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? <p className="flex items-center gap-1 rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}<ErrorAlchemyMenu error={error} /></p> : null}
      {saved ? <p className="flex items-center gap-2 rounded border border-primary/30 bg-primary/5 p-3 text-sm"><Check className="h-4 w-4" />{saved}</p> : null}

      {preview.length ? (
        <Card>
          <CardHeader><CardTitle className="text-base">2. Select one contact to review</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {preview.map((contact) => (
              <button
                key={contact.resource_name}
                type="button"
                onClick={() => { setSelected(contact); setReview(null); setOverrides({}); setReviewedFields([]); setSaved(null); }}
                className={`flex w-full items-center justify-between gap-3 rounded border p-3 text-left transition-colors ${selected?.resource_name === contact.resource_name ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
              >
                <span className="min-w-0"><span className="flex items-center gap-2 font-medium"><UserRound className="h-4 w-4" />{contact.display_name || "Unnamed contact"}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{[...contact.emails, ...contact.phones].join(" · ") || "No email or phone returned"}</span></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
            {nextPageToken ? <Button variant="outline" size="sm" disabled={loading} onClick={() => void load(nextPageToken)}>Load the next page</Button> : null}
          </CardContent>
        </Card>
      ) : connectionId && !loading ? <p className="text-sm text-muted-foreground">Preview a page to see the contacts Google returns for this account.</p> : null}

      {selected ? (
        <Card>
          <CardHeader><CardTitle className="text-base">3. Review the CRM import</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!review ? <p className="text-sm text-muted-foreground">The review reads this one source record again and uses the same CRM matcher and field map as the import.</p> : null}
            {outcome ? (
              <div className="space-y-3">
                <div className="rounded border bg-muted/30 p-3 text-sm"><span className="font-medium">CRM result: </span>{review ? targetText(review) : "Review unavailable"}{outcome.matched_by ? ` · matched by ${outcome.matched_by}` : ""}{narrowContactMatchState(outcome.choice_required ? "choice_required" : outcome.person_id ? "matched" : "new") === "choice_required" ? " · this source cannot be imported until the CRM match is unambiguous" : ""}</div>
                <div className="divide-y rounded border">
                  {fields.map((field: ContactFieldPlanPending) => {
                    const decision = decideContactField(field);
                    const checked = overrides[field.key] ?? decision.includeByDefault;
                    return <label key={field.key} className="flex gap-3 p-3 text-sm"><Checkbox checked={checked} disabled={!decision.choosable} onCheckedChange={(value) => setOverrides((current) => ({ ...current, [field.key]: value === true }))} /><span className="min-w-0 flex-1"><span className="font-medium">{field.label} → {field.person_label}</span><span className="mt-0.5 block text-xs text-muted-foreground">Google: {valueText(field.value)} · CRM now: {valueText(field.current_value)}</span><span className="mt-1 block text-xs text-muted-foreground">{field.explanation || "The server did not return an explanation for this field."}</span></span></label>;
                  })}
                </div>
                {review.result.warnings.map((warning) => <p key={warning} className="text-xs text-amber-700 dark:text-amber-300">{warning}</p>)}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11" disabled={reviewing} onClick={() => void makeReview()}>{reviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}{review ? "Refresh review" : "Review mapping and duplicates"}</Button>
              {review ? <Button className="min-h-11" disabled={!reviewIsCurrent || importing || outcome?.choice_required} onClick={() => void apply()}>{importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Import selected contact</Button> : null}
            </div>
            {review && !reviewIsCurrent ? <p className="text-xs text-muted-foreground">Refresh the review after changing fields. Import stays disabled until the short-lived receipt matches what you see.</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
