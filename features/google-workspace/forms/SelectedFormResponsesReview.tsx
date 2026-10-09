"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { formatAbsoluteDate } from "@ai-matrx/kit/format";
import { Button } from "@/components/ui/button";
import { useOpenSaveToTable, type SaveToTableHandle } from "@/features/overlays/openers/saveToTable";
import { tableHref } from "@/features/records-tool-display/readRecordsAnswer";
import { extractErrorMessage } from "@/utils/errors";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { pickGoogleFormForConnection, type SelectedGoogleForm } from "./formPicker";
import { previewSelectedFormResponses, type FormResponsesPreview } from "./service";
import { selectedResponsesGrid } from "./transform";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

interface Props {
  connectionId: string;
  accountLabel: string;
  organizationId: string | null;
}

export function SelectedFormResponsesReview({ connectionId, accountLabel, organizationId }: Props) {
  const openSaveToTable = useOpenSaveToTable();
  const [form, setForm] = useState<SelectedGoogleForm | null>(null);
  const [page, setPage] = useState<FormResponsesPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"pick" | "preview" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedOperation, setFailedOperation] = useState<{ kind: "pick" } | { kind: "preview"; pageToken?: string } | null>(null);
  const [savedTable, setSavedTable] = useState<{ id: string; name: string | null } | null>(null);
  const epoch = useRef(0);
  const saveEpoch = useRef(0);
  const overlay = useRef<SaveToTableHandle | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current += 1;
      saveEpoch.current += 1;
      overlay.current?.close();
      overlay.current = null;
    };
  }, []);

  function invalidate() {
    epoch.current += 1;
    saveEpoch.current += 1;
    overlay.current?.close();
    overlay.current = null;
    setPage(null);
    setSelected(new Set());
    setSavedTable(null);
    setError(null);
    setFailedOperation(null);
    return epoch.current;
  }

  async function chooseForm() {
    const own = invalidate();
    setBusy("pick");
    try {
      const picked = await pickGoogleFormForConnection({ id: connectionId });
      if (!mounted.current || epoch.current !== own) return;
      if (picked) setForm(picked);
    } catch (cause) {
      if (mounted.current && epoch.current === own) {
        setError(extractErrorMessage(cause));
        setFailedOperation({ kind: "pick" });
      }
    } finally {
      if (mounted.current && epoch.current === own) setBusy(null);
    }
  }

  async function preview(pageToken?: string) {
    if (!form) return;
    const own = invalidate();
    setBusy("preview");
    try {
      const selectedOrganizationId = await ensureOrgId(organizationId);
      if (!mounted.current || epoch.current !== own) return;
      const result = await previewSelectedFormResponses({
        organization_id: selectedOrganizationId,
        connection_id: connectionId,
        form_id: form.id,
        ...(pageToken ? { page_token: pageToken } : {}),
      });
      if (mounted.current && epoch.current === own) setPage(result);
    } catch (cause) {
      if (mounted.current && epoch.current === own) {
        setError(extractErrorMessage(cause));
        setFailedOperation({ kind: "preview", pageToken });
      }
    } finally {
      if (mounted.current && epoch.current === own) setBusy(null);
    }
  }

  function save() {
    if (!page || !selected.size || !openSaveToTable) return;
    const own = epoch.current;
    const savedOwn = ++saveEpoch.current;
    const grid = selectedResponsesGrid(page, selected);
    overlay.current?.close();
    overlay.current = openSaveToTable({
      grid,
      title: `${page.provenance.form_title} responses`,
      organizationId: page.provenance.organization_id,
      onSaved: (event) => {
        if (!mounted.current || epoch.current !== own || saveEpoch.current !== savedOwn) return;
        setSavedTable({ id: event.tableId, name: event.tableName });
      },
    });
  }

  function toggle(id: string) {
    saveEpoch.current += 1;
    overlay.current?.close();
    overlay.current = null;
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSavedTable(null);
  }

  return (
    <section className="rounded-md border border-border p-3" aria-label="Google Form responses">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Form responses</h3>
        <Button type="button" variant="outline" onClick={() => void chooseForm()} disabled={busy !== null}>
          {busy === "pick" ? "Opening Forms…" : "Choose Form"}
        </Button>
      </div>
      {form ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm font-medium">{form.name} <span className="font-normal text-muted-foreground">({form.id})</span></p>
          <a className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline" href={`https://docs.google.com/forms/d/${encodeURIComponent(form.id)}/edit`} target="_blank" rel="noreferrer">Open in Google Forms <ExternalLink className="h-3.5 w-3.5" /></a>
          <p className="text-xs text-muted-foreground">{accountLabel}</p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Preview is temporary.</p>
            <p>Only selected rows are saved to a table.</p>
            <p>Responses may include personal information.</p>
            <p>Preview does not send responses to an AI model.</p>
          </div>
          <Button variant="primary" type="button" onClick={() => void preview()} disabled={busy !== null}>
            {busy === "preview" ? "Loading responses…" : "Preview responses"}
          </Button>
        </div>
      ) : <p className="mt-2 text-sm text-muted-foreground">Choose a Form to review its responses.</p>}
      {error ? <div role="alert" className="mt-2 text-sm text-destructive">{error} <ErrorAlchemyMenu error={error} /> {failedOperation ? <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void (failedOperation.kind === "pick" ? chooseForm() : preview(failedOperation.pageToken))}>Retry</Button> : null}</div> : null}
      {page?.respondent_data_present ? <p className="mt-2 text-xs text-muted-foreground">Respondent data present; review before saving.</p> : null}
      {page?.status === "forms_api_unavailable" || page?.status === "selected_form_unavailable" ? (
        <p className="mt-2 text-sm" role="status">{page.unavailable_reason || "This Form is unavailable. Choose another Form or retry."}</p>
      ) : null}
      {page?.status === "no_responses" || (page && !page.responses?.length && !page.next_page_token && page.status === "ready") ? (
        <p className="mt-2 text-sm" role="status">No responses on this page.</p>
      ) : null}
      {(page?.status === "ready" || page?.status === "next_page_available") && page.responses?.length ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">{page.responses.length} responses on this page</p>
          <ul className="max-h-80 space-y-2 overflow-auto">
            {page.responses.map((response, index) => (
              <li key={response.response_id} className="rounded border border-border p-2 text-sm">
                <label className="flex items-center gap-2 font-medium">
                  <input type="checkbox" aria-label={`Select response ${response.response_id}`} checked={selected.has(response.response_id)} onChange={() => toggle(response.response_id)} />
                  Response {index + 1}
                </label>
                <p className="mt-1 text-xs text-muted-foreground">Last submitted: {formatAbsoluteDate(response.submitted_at ?? null, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }, "—")}</p>
                <dl className="mt-1 grid gap-1">
                  {response.answers.map((answer, index) => (
                    <div key={`${answer.question_id}-${index}`} className="grid grid-cols-[minmax(8rem,1fr)_2fr] gap-2">
                      <dt className="text-muted-foreground">{answer.question_label}</dt>
                      <dd>{answer.values.join("; ") || "—"}{answer.file_upload_count ? ` · ${answer.file_upload_count} file upload${answer.file_upload_count === 1 ? "" : "s"}` : ""}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          {openSaveToTable ? <Button variant="primary" type="button" onClick={save} disabled={!selected.size}>Save selected rows ({selected.size})</Button> : null}
        </div>
      ) : null}
      {page?.next_page_token ? <Button type="button" variant="outline" className="mt-2" onClick={() => void preview(page.next_page_token ?? undefined)} disabled={busy !== null}>Next page</Button> : null}
      {savedTable ? <a className="mt-2 block text-sm text-primary underline" href={tableHref(savedTable.id)}>Open {savedTable.name || "saved table"}</a> : null}
    </section>
  );
}
