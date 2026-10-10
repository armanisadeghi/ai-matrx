"use client";

// features/unified-data/connect-database/ConnectDatabasePage.tsx — LANE VISION-REACH, wave 3.
//
// "Connect a database": paste a Postgres / Supabase connection string → the server tests it and
// lists the tables it may read → pick one → it becomes a Synced table in the organization new
// things are saved to, and opens. Champions: Supabase / Neon connect, Airtable Sync, Notion
// synced databases (outside rows land read-only; your own columns sit beside them).
//
// 🚨 The connection string lives in this component's state only while the form is open. It is a
// password field (never echoed, never autocompleted), sent only in a POST body, and cleared the
// moment a table is added. Nothing the server answers carries it.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Loader2, Search, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { SavesTo, SAVED_WHERE_CHOSEN } from "@/features/make/MakeMount";
import { extractErrorMessage } from "@/utils/errors";

import { connectTable, inspectDatabase, type InspectAnswer, type OutsideTable } from "./service";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
type Step =
  | { phase: "paste" }
  | { phase: "testing" }
  | { phase: "pick"; answer: InspectAnswer }
  | { phase: "adding"; answer: InspectAnswer };

function tableKey(t: { schema_name: string; name: string }): string {
  return `${t.schema_name}.${t.name}`;
}

export function ConnectDatabasePage() {
  const router = useRouter();
  // org-filter: write-target the synced table is made in the organization new things are saved to
  const active = useOrganizationRequired();
  const organizationId = active.organizationState === "ready" ? active.organizationId : null;
  const [connection, setConnection] = useState("");
  const [step, setStep] = useState<Step>({ phase: "paste" });
  const [error, setError] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const answer = step.phase === "pick" || step.phase === "adding" ? step.answer : null;
  const shown = useMemo(() => {
    if (!answer) return [];
    const q = find.trim().toLowerCase();
    return q ? answer.tables.filter((t) => tableKey(t).toLowerCase().includes(q)) : answer.tables;
  }, [answer, find]);
  const pickedTable = answer?.tables.find((t) => tableKey(t) === picked) ?? null;

  const test = async () => {
    if (!organizationId || !connection.trim()) return;
    setError(null);
    setStep({ phase: "testing" });
    try {
      const next = await inspectDatabase(organizationId, connection.trim());
      setPicked(null);
      setFind("");
      setStep({ phase: "pick", answer: next });
    } catch (err) {
      setError(extractErrorMessage(err));
      setStep({ phase: "paste" });
    }
  };

  const add = async (table: OutsideTable) => {
    if (!organizationId || !answer) return;
    setError(null);
    setStep({ phase: "adding", answer });
    try {
      const made = await connectTable(organizationId, connection.trim(), table);
      setConnection("");
      router.push(`/data/${made.table_id}`);
    } catch (err) {
      setError(extractErrorMessage(err));
      setStep({ phase: "pick", answer });
    }
  };

  return (
    <>
      <RecordPageHeader backHref="/data" record={{ name: "Connect a database" }} />
      <div className="h-full overflow-y-auto overflow-x-hidden">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-16 pt-[calc(var(--shell-header-h)+1.25rem)] sm:px-6">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SavesTo />
          </div>
          {!organizationId ? (
            <OrganizationContextNotice
              state={active.organizationState === "ready" ? "required" : active.organizationState}
              what="Synced tables"
              description={SAVED_WHERE_CHOSEN}
              compact
            />
          ) : (
            <>
              <form
                className="flex flex-col gap-2"
                data-connect-database="paste"
                onSubmit={(e) => {
                  e.preventDefault();
                  void test();
                }}
              >
                <label htmlFor="connection-string" className="text-sm font-medium text-foreground">
                  Connection string
                </label>
                <div className="flex gap-2">
                  <Input mono
                    id="connection-string"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="postgresql://user:password@host:5432/postgres"
                    value={connection}
                    onChange={(e) => setConnection(e.target.value)}
                    disabled={step.phase === "testing" || step.phase === "adding"}
                  />
                  <Button icon={step.phase === "testing" ? <Loader2 className="animate-spin" aria-hidden /> : <Database aria-hidden />} variant="primary" type="submit" disabled={!connection.trim() || step.phase === "testing" || step.phase === "adding"}>
                    <span className="ml-1.5">Connect</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Read only, and sealed in your organization&apos;s vault</p>
              </form>

              {error ? (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive-ink" data-connect-database-error="">
                  {error}
                <ErrorAlchemyMenu error={error} /></p>
              ) : null}

              {answer ? (
                <section className="flex flex-col gap-3" aria-label="Tables" data-connect-database="pick">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{answer.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {/* read-gate-exempt: answer exists only after the probe succeeded; failures show above */}
                      {answer.tables.length === 1 ? "1 table" : `${answer.tables.length.toLocaleString()} tables`}
                    </span>
                  </div>
                  {answer.tables.length === 0 ? (
                    // read-gate-exempt: answer exists only after the probe succeeded; failures show above
                    <p className="text-sm text-muted-foreground">This user can read no tables here.</p>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input adornment="start"
                          placeholder="Find a table"
                          value={find}
                          onChange={(e) => setFind(e.target.value)}
                        />
                      </div>
                      <ul className="max-h-[50dvh] divide-y divide-border overflow-y-auto rounded-md border border-border" role="listbox" aria-label="Tables">
                        {shown.map((t) => {
                          const key = tableKey(t);
                          const selected = key === picked;
                          return (
                            <li key={key} role="option" aria-selected={selected}>
                              <button
                                type="button"
                                className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted ${selected ? "bg-muted" : ""}`}
                                onClick={() => setPicked(key)}
                                data-outside-table={key}
                              >
                                <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                                  {t.name}
                                  <span className="ml-1.5 text-muted-foreground">{t.schema_name}</span>
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {t.columns.length} columns{t.key.length === 0 ? " · no key" : ""}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="flex items-center justify-end gap-2">
                        {pickedTable && pickedTable.key.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Needs a primary key to sync</span>
                        ) : null}
                        <Button
                          icon={step.phase === "adding" ? <Loader2 className="animate-spin" aria-hidden /> : null}
                          variant="primary"
                          type="button"
                          disabled={!pickedTable || pickedTable.key.length === 0 || step.phase === "adding"}
                          onClick={() => pickedTable && void add(pickedTable)}
                          data-connect-database-add=""
                        >
                          Add as synced table
                        </Button>
                      </div>
                    </>
                  )}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
