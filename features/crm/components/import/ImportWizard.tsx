"use client";

// features/crm/components/import/ImportWizard.tsx
//
// The /crm/import wizard: native source → map columns → dry-run preview → results.
// All parsing/planning/writing lives in features/crm/import/engine.ts; this
// component is presentation + step state only.
//
// The dry run is the contract: nothing is written until the user has seen
// exactly what will be created, what already exists (with a door to each
// existing record), and what cannot be imported.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { getUserOrganizations } from "@/features/organizations/service";
import type { PartyKind } from "../../types";
import {
  buildTemplateCsv,
  commitImport,
  fieldsForKind,
  guessMapping,
  parseDelimitedText,
  parseImportFile,
  planImport,
} from "../../import/engine";
import type {
  ImportField,
  ImportMapping,
  ImportPlan,
  ImportResult,
  ParsedImportData,
  RowPlan,
} from "../../import/types";
import { IMPORT_FIELD_LABELS } from "../../import/types";
import { persistConnectorCursor } from "../../import/connectors/service";
import { ConnectorSources } from "./ConnectorSources";

type Step = "source" | "map" | "preview" | "done";

const STATUS_META: Record<
  RowPlan["status"],
  { label: string; className: string }
> = {
  create: {
    label: "New",
    className: "bg-primary/10 text-primary border border-primary/30",
  },
  exists: {
    label: "Exists",
    className: "bg-muted text-muted-foreground border border-border",
  },
  duplicate_in_file: {
    label: "Duplicate row",
    className:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30",
  },
  invalid: {
    label: "Invalid",
    className:
      "bg-destructive/10 text-destructive border border-destructive/30",
  },
};

export function ImportWizard() {
  const router = useRouter();
  const effectiveOrgId = useAppSelector(selectEffectiveOrganizationId);

  const [step, setStep] = useState<Step>("source");
  const [kind, setKind] = useState<PartyKind>("person");
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [parsed, setParsed] = useState<ParsedImportData | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await getUserOrganizations();
        if (cancelled) return;
        setOrgs(list.map((o) => ({ id: o.id, name: o.name })));
      } catch (e) {
        console.error("[crm-import] failed to load organizations:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedOrgId = orgId ?? effectiveOrgId ?? null;
  const selectedOrg = orgs.find(
    (organization) => organization.id === resolvedOrgId,
  );

  const loadParsedData = (
    nextParsed: ParsedImportData,
    name: string | null,
  ) => {
    if (nextParsed.headers.length === 0 || nextParsed.rows.length === 0) {
      toast.error("Could not find a header row plus at least one data row");
      return;
    }
    setFileName(name);
    setParsed(nextParsed);
    setMapping(guessMapping(nextParsed.headers, kind));
    setPlan(null);
    setStep("map");
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    // Clear the input so choosing the SAME file again re-fires change.
    if (fileInputRef.current) fileInputRef.current.value = "";
    setReadingFile(true);
    try {
      loadParsedData(await parseImportFile(file), file.name);
    } catch (e) {
      toast.error(
        `Could not read the file: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setReadingFile(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([buildTemplateCsv(kind)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      kind === "person" ? "contacts-template.csv" : "companies-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const runDryRun = async () => {
    if (!parsed || !resolvedOrgId) return;
    setPlanning(true);
    try {
      const nextPlan = await planImport({
        parsed,
        mapping,
        kind,
        orgId: resolvedOrgId,
      });
      setPlan(nextPlan);
      setStep("preview");
    } catch (e) {
      toast.error(
        `Dry run failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setPlanning(false);
    }
  };

  const runImport = async () => {
    if (!plan) return;
    setProgress({ done: 0, total: plan.counts.create });
    try {
      const res = await commitImport(
        plan,
        (done, total) => setProgress({ done, total }),
        // Provenance: which file (or connector account) each of these contacts
        // came from, stamped on the row as `source_detail`.
        fileName ?? undefined,
      );
      setResult(res);
      setStep("done");
      // Connector imports: advance the incremental-sync cursor only when the
      // WHOLE commit landed. On any failure the cursor stays put, the next
      // sync re-reads the same delta, and the resolver makes that idempotent.
      if (plan.connector?.syncToken && res.failed.length === 0) {
        try {
          await persistConnectorCursor({
            providerKey: plan.connector.providerKey,
            connectionId: plan.connector.connectionId,
            orgId: plan.orgId,
            syncToken: plan.connector.syncToken,
            counts: {
              created: res.created.filter((r) => !r.matchedExisting).length,
              matched: res.created.filter((r) => r.matchedExisting).length,
            },
          });
        } catch (e) {
          toast.error(
            `Imported, but saving the sync position failed — the next sync will simply re-read the same contacts (nothing is lost). ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      } else if (plan.connector?.syncToken && res.failed.length > 0) {
        toast.error(
          "Some rows failed, so the sync position was NOT advanced — the next sync will retry them.",
        );
      }
      // The resolver matches contacts we already had rather than duplicating
      // them, so "imported N" is only the new ones. Saying so is the whole
      // point — a silent match reads as a lost row.
      const matched = res.created.filter((r) => r.matchedExisting).length;
      const fresh = res.created.length - matched;
      const matchedNote =
        matched > 0
          ? `, ${matched} already existed and ${matched === 1 ? "was" : "were"} updated instead of duplicated`
          : "";
      if (res.failed.length === 0) {
        toast.success(
          `Imported ${fresh} record${fresh === 1 ? "" : "s"}${matchedNote}`,
        );
      } else {
        toast.error(
          `Imported ${fresh}${matchedNote}, ${res.failed.length} failed — details below`,
        );
      }
    } catch (e) {
      toast.error(
        `Import failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setProgress(null);
    }
  };

  /** Back to the source step, keeping the pasted text for tweaking. */
  const backToSource = () => {
    setStep("source");
    setFileName(null);
    setParsed(null);
    setMapping({});
    setPlan(null);
    setResult(null);
  };

  /** Full restart ("Import another file") — nothing carries over. */
  const reset = () => {
    backToSource();
    setPastedText("");
  };

  // Fields already assigned to some header (a field feeds at most one column).
  const assigned = new Set(Object.values(mapping).filter(Boolean));

  return (
    // The (core) shell header is transparent glass floating OVER the body, so
    // static top chrome must clear it — same offset CrmListPage uses.
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden px-3 pt-[calc(var(--shell-header-h)+0.375rem)]">
      {/* Step rail */}
      <div className="flex shrink-0 items-center gap-1 pb-2 text-xs text-muted-foreground">
        <ChevronLeftTapButton
          onClick={() => router.back()}
          ariaLabel="Back"
          className="mr-1"
        />
        {(
          [
            ["source", "Source"],
            ["map", "Map columns"],
            ["preview", "Preview"],
            ["done", "Results"],
          ] as const
        ).map(([key, label], i) => (
          <div key={key} className="flex items-center gap-1">
            {i > 0 && <span className="px-1 text-border">/</span>}
            <span
              className={cn(
                "rounded px-1.5 py-0.5",
                step === key
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {step === "source" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  What are you importing?
                </span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={kind === "person" ? "default" : "outline"}
                    className="h-11 gap-1.5 text-sm sm:h-8 sm:text-xs"
                    onClick={() => setKind("person")}
                  >
                    <Users className="h-3.5 w-3.5" /> People
                  </Button>
                  <Button
                    size="sm"
                    variant={kind === "organization" ? "default" : "outline"}
                    className="h-11 gap-1.5 text-sm sm:h-8 sm:text-xs"
                    onClick={() => setKind("organization")}
                  >
                    <Building2 className="h-3.5 w-3.5" /> Companies
                  </Button>
                </div>
              </div>
              <div className="flex min-w-52 flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Into organization
                </span>
                <Select
                  value={resolvedOrgId ?? undefined}
                  onValueChange={(v) => setOrgId(v)}
                >
                  <SelectTrigger className="h-11 text-sm sm:h-8 sm:text-xs">
                    <SelectValue placeholder="Pick an organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id} className="text-xs">
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedOrg && (
                  <EntityRef
                    token="organization"
                    id={selectedOrg.id}
                    name={selectedOrg.name}
                    openInNewTab
                    alwaysShowActions
                    className="text-xs text-muted-foreground"
                  />
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-11 gap-1.5 text-sm sm:h-8 sm:text-xs"
                onClick={downloadTemplate}
              >
                <Download className="h-3.5 w-3.5" /> Template
              </Button>
            </div>

            <button
              type="button"
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center transition-colors hover:border-primary/50 hover:bg-accent/40"
              onClick={() => fileInputRef.current?.click()}
              disabled={!resolvedOrgId || readingFile}
            >
              {readingFile ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <FileUp className="h-6 w-6 text-muted-foreground" />
              )}
              <span className="text-sm font-medium text-foreground">
                {readingFile ? "Reading export…" : "Choose a contact export"}
              </span>
              <span className="text-xs text-muted-foreground">
                CSV, TSV, Excel (.xlsx/.xls), or vCard (.vcf) from Google
                Contacts, Outlook, Apple Contacts, Salesforce, HubSpot,
                LinkedIn, and most CRMs.
              </span>
              <span className="text-xs text-muted-foreground">
                Up to 20 MB and 10,000 rows. Nothing is saved until you confirm
                the preview.
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.vcf,.vcard,text/csv,text/tab-separated-values,text/vcard,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            {!resolvedOrgId && (
              <p className="text-xs text-muted-foreground">
                Pick an organization first — imported records belong to it.
              </p>
            )}

            <ConnectorSources
              orgId={resolvedOrgId}
              kind={kind}
              onLoaded={loadParsedData}
            />

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Or paste CSV or tab-separated text (straight from a spreadsheet)
              </span>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                rows={5}
                spellCheck={false}
                placeholder={
                  "Name,Email,Phone\nAda Lovelace,ada@example.com,+13105551234"
                }
                className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring sm:text-xs"
              />
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-11 gap-1 text-sm sm:h-7 sm:text-xs"
                  disabled={!pastedText.trim() || !resolvedOrgId}
                  onClick={() =>
                    loadParsedData(parseDelimitedText(pastedText), null)
                  }
                >
                  <ArrowRight className="h-3.5 w-3.5" /> Use pasted text
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "map" && parsed && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {fileName ? `${fileName} — ` : ""}
                Detected {parsed.sourceLabel}
                {parsed.sheetName
                  ? `, worksheet “${parsed.sheetName}”`
                  : ""} — {parsed.rows.length} row
                {parsed.rows.length === 1 ? "" : "s"}. Match each imported
                column to a field, or leave it ignored.
              </p>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  onClick={backToSource}
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
                <Button
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => void runDryRun()}
                  disabled={planning || !assigned.size}
                >
                  {planning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5" />
                  )}
                  Preview import
                </Button>
              </div>
            </div>
            {parsed.parseWarnings.length > 0 && (
              <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                {parsed.parseWarnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            )}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                    <th className="px-2.5 py-1.5 font-medium">
                      Imported column
                    </th>
                    <th className="px-2.5 py-1.5 font-medium">Sample values</th>
                    <th className="px-2.5 py-1.5 font-medium">Imports as</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.headers.map((header) => {
                    const samples = parsed.rows
                      .map((r) => r[header])
                      .filter(Boolean)
                      .slice(0, 2);
                    const current = mapping[header] ?? null;
                    return (
                      <tr
                        key={header}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-2.5 py-1.5 font-medium text-foreground">
                          {header}
                        </td>
                        <td className="max-w-64 truncate px-2.5 py-1.5 text-muted-foreground">
                          {samples.join(" · ") || "—"}
                        </td>
                        <td className="px-2.5 py-1.5">
                          <Select
                            value={current ?? "__ignore__"}
                            onValueChange={(v) =>
                              setMapping((prev) => {
                                const next: ImportMapping = { ...prev };
                                const field =
                                  v === "__ignore__"
                                    ? null
                                    : (v as ImportField);
                                // A field feeds one column — take it from any
                                // other header that held it.
                                if (field) {
                                  for (const h of Object.keys(next)) {
                                    if (h !== header && next[h] === field)
                                      next[h] = null;
                                  }
                                }
                                next[header] = field;
                                return next;
                              })
                            }
                          >
                            <SelectTrigger className="h-11 w-48 text-sm sm:h-7 sm:text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem
                                value="__ignore__"
                                className="text-xs text-muted-foreground"
                              >
                                Ignore
                              </SelectItem>
                              {fieldsForKind(kind).map((f) => (
                                <SelectItem
                                  key={f}
                                  value={f}
                                  className="text-xs"
                                >
                                  {IMPORT_FIELD_LABELS[f]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === "preview" && plan && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {plan.counts.create} new
              </span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {plan.counts.exists} already exist
              </span>
              {plan.counts.duplicateInFile > 0 && (
                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                  {plan.counts.duplicateInFile} duplicate rows in file
                </span>
              )}
              {plan.counts.invalid > 0 && (
                <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                  {plan.counts.invalid} invalid
                </span>
              )}
              {plan.newCompanyNames.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  + creates {plan.newCompanyNames.length} compan
                  {plan.newCompanyNames.length === 1 ? "y" : "ies"}:{" "}
                  {plan.newCompanyNames.slice(0, 4).join(", ")}
                  {plan.newCompanyNames.length > 4 ? ", …" : ""}
                </span>
              )}
              <div className="ml-auto flex gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-11 gap-1 text-sm sm:h-7 sm:text-xs"
                  onClick={() => setStep("map")}
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
                <Button
                  size="sm"
                  className="h-11 gap-1 text-sm sm:h-7 sm:text-xs"
                  onClick={() => void runImport()}
                  disabled={plan.counts.create === 0 || progress !== null}
                >
                  {progress ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {progress.done}/{progress.total}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Import {plan.counts.create} record
                      {plan.counts.create === 1 ? "" : "s"}
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                    <th className="px-2.5 py-1.5 font-medium">#</th>
                    <th className="px-2.5 py-1.5 font-medium">Name</th>
                    <th className="px-2.5 py-1.5 font-medium">Contact</th>
                    {plan.kind === "person" && (
                      <th className="px-2.5 py-1.5 font-medium">Company</th>
                    )}
                    <th className="px-2.5 py-1.5 font-medium">Status</th>
                    <th className="px-2.5 py-1.5 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((row) => (
                    <tr
                      key={row.rowNumber}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-2.5 py-1.5 text-muted-foreground">
                        {row.rowNumber}
                      </td>
                      <td className="px-2.5 py-1.5 font-medium text-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          {plan.kind === "person" ? (
                            <UserRound className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                          )}
                          {row.displayName || "—"}
                        </span>
                      </td>
                      <td className="max-w-56 truncate px-2.5 py-1.5 text-muted-foreground">
                        {[...row.emails, ...row.phones].join(" · ") || "—"}
                      </td>
                      {plan.kind === "person" && (
                        <td className="px-2.5 py-1.5 text-muted-foreground">
                          {row.companyName ? (
                            row.existingEmployer ? (
                              <EntityRef
                                token="party"
                                id={row.existingEmployer.id}
                                name={row.existingEmployer.display_name}
                                openInNewTab
                                alwaysShowActions
                              />
                            ) : (
                              <span>
                                {row.companyName}
                                {row.status === "create" ? " (new)" : ""}
                              </span>
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                      <td className="px-2.5 py-1.5">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[11px] font-medium",
                            STATUS_META[row.status].className,
                          )}
                        >
                          {STATUS_META[row.status].label}
                        </span>
                      </td>
                      <td className="max-w-72 px-2.5 py-1.5 text-muted-foreground">
                        {row.existing && (
                          <EntityRef
                            token="party"
                            id={row.existing.id}
                            name={row.existing.display_name}
                            openInNewTab
                            alwaysShowActions
                          />
                        )}
                        {row.duplicateOfRow !== undefined && (
                          <span>same as row {row.duplicateOfRow}</span>
                        )}
                        {row.problems.length > 0 && (
                          <span
                            className={cn(
                              row.existing || row.duplicateOfRow !== undefined
                                ? "ml-1.5"
                                : "",
                            )}
                          >
                            {row.problems.join("; ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium text-foreground">
                <Link href="/crm" className="text-primary hover:underline">
                  Imported {result.created.length} record
                  {result.created.length === 1 ? "" : "s"}
                </Link>
                {result.companiesCreated.length > 0 &&
                  ` and created ${result.companiesCreated.length} compan${result.companiesCreated.length === 1 ? "y" : "ies"}`}
                .
              </p>
            </div>
            {result.created.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-2.5">
                <p className="pb-1.5 text-xs font-medium text-foreground">
                  Created contacts
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {result.created
                    .slice(0, 100)
                    .map((created) =>
                      created.partyId ? (
                        <EntityRef
                          key={created.partyId}
                          token="party"
                          id={created.partyId}
                          name={created.displayName}
                          openInNewTab
                        />
                      ) : null,
                    )}
                  {result.created.length > 100 && (
                    <Link
                      href="/crm"
                      className="text-xs text-primary hover:underline"
                    >
                      Open {result.created.length - 100} more in CRM
                    </Link>
                  )}
                </div>
              </div>
            )}
            {result.companiesCreated.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-2.5">
                <p className="pb-1.5 text-xs font-medium text-foreground">
                  Created companies
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {result.companiesCreated.slice(0, 100).map((company) => (
                    <EntityRef
                      key={company.id}
                      token="party"
                      id={company.id}
                      name={company.display_name}
                      openInNewTab
                    />
                  ))}
                  {result.companiesCreated.length > 100 && (
                    <Link
                      href="/crm"
                      className="text-xs text-primary hover:underline"
                    >
                      Open {result.companiesCreated.length - 100} more in CRM
                    </Link>
                  )}
                </div>
              </div>
            )}
            {result.failed.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
                <p className="pb-1 text-xs font-medium text-destructive">
                  {result.failed.length} row
                  {result.failed.length === 1 ? "" : "s"} failed:
                </p>
                {result.failed.map((f) => (
                  <p
                    key={f.rowNumber}
                    className="text-xs text-muted-foreground"
                  >
                    Row {f.rowNumber} (
                    {f.partyId ? (
                      <EntityRef
                        token="party"
                        id={f.partyId}
                        name={f.displayName}
                        openInNewTab
                        alwaysShowActions
                      />
                    ) : (
                      f.displayName
                    )}
                    ): {f.error}
                  </p>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="h-11 gap-1.5 text-sm sm:h-8 sm:text-xs"
                asChild
              >
                <Link href="/crm">
                  <Users className="h-3.5 w-3.5" /> Open CRM
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-11 gap-1.5 text-sm sm:h-8 sm:text-xs"
                onClick={reset}
              >
                <FileUp className="h-3.5 w-3.5" /> Import another file
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
