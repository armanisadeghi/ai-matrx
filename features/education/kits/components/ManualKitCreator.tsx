"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { openFilePicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";
import { fetchEducationLibraryPage } from "@/features/education/library/service";
import type { EducationLibraryRow } from "@/features/education/library/types";
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import { createManualKit, kitHref } from "../kitService";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const PAGE_SIZE = 25;

export function ManualKitCreator() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<EducationLibraryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<EducationLibraryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchEducationLibraryPage({ ...DEFAULT_ENTITY_LIST_QUERY, scope: { kind: "mine" }, search, page }, { sort: "updated", direction: "desc", favoritesFirst: false, pageSize: PAGE_SIZE })
      .then((result) => { if (active) { setRows(result.rows); setTotal(result.total); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load your study aids."); });
    return () => { active = false; };
  }, [page, search]);

  const chooseFile = async () => {
    const ids = await openFilePicker({ title: "Choose source material", multi: false });
    if (ids?.[0]) setSourceId(ids[0]);
  };
  const toggle = (row: EducationLibraryRow) => setSelected((current) =>
    current.some((item) => item.id === row.id) ? current.filter((item) => item.id !== row.id) : [...current, row]);
  const save = async () => {
    setSaving(true); setError(null);
    try { await createManualKit({ sourceId: sourceId ?? "", title, artifacts: selected }); router.push(kitHref("file", sourceId ?? "")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create this kit."); }
    finally { setSaving(false); }
  };
  return <main className="mx-auto w-full max-w-3xl space-y-5 p-4">
    <h1 className="text-xl font-semibold">Create a study kit</h1>
    <p className="text-sm text-muted-foreground">Group saved study aids under one saved source file. Your aids are not copied or changed.</p>
    <label className="block text-sm font-medium">Kit title<Input className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <Button variant="outline" onClick={() => void chooseFile()}>{sourceId ? "Change source file" : "Choose source file"}</Button>
    {sourceId && <p className="text-xs text-muted-foreground">Source file selected.</p>}
    <label className="block text-sm font-medium">Find saved study aids<Input className="mt-1" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
    <div className="space-y-2 rounded-xl border border-border p-3">
      {rows.map((row) => <label key={row.id} className="flex cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={selected.some((item) => item.id === row.id)} onChange={() => toggle(row)} />{row.title}</label>)}
      {!rows.length && !error && <p className="text-sm text-muted-foreground">No matching study aids.</p>}
    </div>
    <div className="flex justify-between"><Button variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-sm text-muted-foreground">{page * PAGE_SIZE < total ? "More results available" : "End of results"}</span><Button variant="outline" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error} <ErrorAlchemyMenu error={error} /></p>}
    <div className="flex gap-2"><Button variant="outline" onClick={() => router.push("/education/kits")}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "Creating…" : "Create kit"}</Button></div>
  </main>;
}
