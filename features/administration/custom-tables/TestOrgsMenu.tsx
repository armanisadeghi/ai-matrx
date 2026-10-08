"use client";

// features/administration/custom-tables/TestOrgsMenu.tsx — "Test orgs": mark organizations as test
// fixtures from the Custom tables toolbar (one button in the existing bar, no new row).
//
// READ: every live organization, through the admin-lane read policy on `iam.organizations`
// (`platform_admin_read` → is_platform_admin(), true only on the admin lane; the browser client
// stamps `x-matrx-admin-lane: 1` on /administration/**). Loaded when the menu first opens.
// WRITE: `setTestFixture` → `public.org_update` per organization (see testFixtureOrgs.ts).

import { useCallback, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FlaskConical } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorNotice } from "@ai-matrx/design-system";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";
import {
  isTestFixture,
  setTestFixture,
  type FixtureOutcome,
  type OrgSettingsDoors,
  type Settings,
} from "./testFixtureOrgs";

interface OrgRow {
  id: string;
  name: string;
  isTest: boolean;
}

function client(): SupabaseClient {
  return createClient() as unknown as SupabaseClient;
}

const doors: OrgSettingsDoors = {
  readSettings: async (orgId) => {
    const { data, error } = await client().schema("iam").from("organizations").select("settings").eq("id", orgId).maybeSingle();
    if (error) return { ok: false, message: error.message };
    if (!data) return { ok: false, message: "This organization could not be read." };
    return { ok: true, data: ((data as { settings: Settings | null }).settings ?? null) };
  },
  writeSettings: async (orgId, settings) => {
    const { data, error } = await client().rpc("org_update", { p_org_id: orgId, p_patch: { settings } });
    if (error) return { ok: false, message: error.message };
    return { ok: true, data };
  },
};

export function TestOrgsMenu({ onChanged }: { onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [refusals, setRefusals] = useState<Extract<FixtureOutcome, { status: "refused" }>[]>([]);

  const load = useCallback(async () => {
    setReadError(null);
    const { data, error } = await client()
      .schema("iam")
      .from("organizations")
      .select("id, name, settings")
      .is("archived_at", null)
      .order("name");
    if (error) {
      setReadError(error.message);
      setOrgs([]);
      return;
    }
    setOrgs(
      ((data ?? []) as { id: string; name: string | null; settings: unknown }[]).map((o) => ({
        id: o.id,
        name: o.name?.trim() || "Untitled organization",
        isTest: isTestFixture(o.settings),
      })),
    );
  }, []);

  const shown = useMemo(() => {
    const n = search.trim().toLowerCase();
    return (orgs ?? []).filter((o) => n === "" || o.name.toLowerCase().includes(n));
  }, [orgs, search]);

  // A selection never outlives the search that showed it.
  const shownIds = useMemo(() => new Set(shown.map((o) => o.id)), [shown]);
  const pickedRows = (orgs ?? []).filter((o) => picked.includes(o.id) && shownIds.has(o.id));
  const toMark = pickedRows.filter((o) => !o.isTest);
  const toUnmark = pickedRows.filter((o) => o.isTest);

  const run = async (on: boolean) => {
    const targets = (on ? toMark : toUnmark).map((o) => ({ id: o.id, name: o.name }));
    if (targets.length === 0) return;
    setBusy(true);
    const outcomes = await setTestFixture(targets, on, doors);
    const refused = outcomes.filter((o): o is Extract<FixtureOutcome, { status: "refused" }> => o.status === "refused");
    const changed = outcomes.filter((o) => o.status === "changed").length;
    setRefusals(refused);
    setPicked(refused.map((o) => o.target.id));
    setBusy(false);
    const orgWord = (n: number) => (n === 1 ? "organization" : "organizations");
    if (changed > 0) toast.success(`${changed} ${orgWord(changed)} ${on ? "marked as test" : "unmarked"}`);
    if (refused.length > 0) toast.error(`${refused.length} ${orgWord(refused.length)} not changed`);
    await load();
    onChanged?.();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && orgs === null) void load();
        if (!next) {
          setPicked([]);
          setRefusals([]);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button icon={<FlaskConical />} variant="outline" data-custom-tables-test-orgs="">
          Test orgs
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Organization name…"
          aria-label="Organization name"
          className="mb-2 h-8 w-full rounded-md border border-border bg-background px-2 text-base lg:text-xs"
        />
        <div className="max-h-72 overflow-y-auto" role="list" aria-label="Organizations">
          {orgs === null ? (
            <div className="flex justify-center py-3" aria-label="Reading organizations" role="status">
              <Spinner className="h-4 w-4" />
            </div>
          ) : readError ? (
            <ErrorNotice size="inline" className="px-1 py-2 text-xs" message={readError} operation="Read organizations" calls={["iam.organizations"]} />
          ) : shown.length === 0 ? (
            <div className="px-1 py-2 text-xs text-muted-foreground">No organizations match</div>
          ) : (
            shown.map((o) => (
              <label
                key={o.id}
                role="listitem"
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted"
                data-test-org-row={o.id}
              >
                <Checkbox
                  checked={picked.includes(o.id)}
                  disabled={busy}
                  onCheckedChange={(v) => setPicked((prev) => (v ? [...prev, o.id] : prev.filter((id) => id !== o.id)))}
                  aria-label={o.name}
                />
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                {o.isTest && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">
                    Test
                  </Badge>
                )}
              </label>
            ))
          )}
        </div>
        {refusals.length > 0 && (
          <div className="mt-2 space-y-0.5 text-xs" data-test-orgs-refusals="">
            {refusals.map((o) => (
              <ErrorNotice key={o.target.id} size="inline" title={o.target.name} message={o.message} operation="Mark test organization" calls={["org_update"]} />
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-2 border-t border-border pt-2">
          <Button variant="primary" className="flex-1" disabled={busy || toMark.length === 0} onClick={() => void run(true)}>
            Mark as test{toMark.length > 0 ? ` (${toMark.length})` : ""}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy || toUnmark.length === 0}
            onClick={() => void run(false)}
          >
            Unmark{toUnmark.length > 0 ? ` (${toUnmark.length})` : ""}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
