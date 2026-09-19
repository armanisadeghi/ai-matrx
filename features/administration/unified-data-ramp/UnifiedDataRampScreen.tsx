"use client";

// features/administration/unified-data-ramp/UnifiedDataRampScreen.tsx
//
// THE SWITCH SCREEN. Every consumer of the unified data store, with its state,
// its Test 1 result and — only where there is something honest to switch — a
// switch.
//
// THE THREE RULES THIS SCREEN IS BUILT ON
// ---------------------------------------
// 1. A consumer whose CODE HAS NOT LANDED gets NO SWITCH AT ALL. Not a greyed
//    one, not a disabled one, not one that shrugs when you click it — nothing,
//    and a sentence saying which lane owns it. A control that looks like a
//    control and is not one is a lie the user finds out about by clicking.
// 2. A consumer whose GATE IS NOT GREEN has a switch, and pressing it gets a
//    refusal that quotes the gate's own sentence. The switch is real; the
//    answer is no, and it says why. That is different from rule 1: here there
//    IS something to do, and the screen tells you what.
// 3. TURNING A CONSUMER OFF IS NEVER GATED. A rollback that needs a green gate
//    is not a rollback.
//
// The three verdicts are three, not two: `nothing_to_compare` is what the gate
// returns when no principal holds a grant or neither side carries a pair —
// "lost 0, gained 0" over an empty set — and this screen shows it as its own
// state rather than dressing it up as a pass.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Play, ShieldAlert, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import { getActiveOrgId } from "@/lib/organizations/activeOrg";
import { getUserOrganizations } from "@/features/organizations/service";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setOrganization } from "@/lib/redux/slices/appContextSlice";
import { createClient } from "@/utils/supabase/client";

interface RampConsumer {
  consumer_id: string;
  label: string;
  ramp_order: number;
  batch: string | null;
  owning_lane: string;
  landed_at: string | null;
  not_ready_why: string | null;
  record_types: string[];
  no_rollback: boolean;
  knob_key: string;
  switched_on: boolean;
  gate_verdict: "green" | "red" | "nothing_to_compare" | null;
  gate_why: string | null;
  gate_ran_at: string | null;
  gate_lost: number | null;
  gate_gained: number | null;
}

interface StoreSwitch {
  knob_key: string;
  switched_on: boolean;
  has_organization_override: boolean;
  why: string;
}

interface DualEngineExit {
  id: string;
  engine_old: string;
  engine_new: string;
  exit_trigger: string;
  exit_date: string;
  owner_name: string;
  status: string;
  note: string | null;
}

const VERDICT_TEXT: Record<string, string> = {
  green: "Gate green",
  red: "Gate red",
  nothing_to_compare: "Nothing to compare",
};

function verdictClass(verdict: string | null): string {
  if (verdict === "green") return "text-emerald-600 dark:text-emerald-400";
  if (verdict === "red") return "text-destructive";
  if (verdict === "nothing_to_compare") return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export function UnifiedDataRampScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [organizationId, setOrganizationId] = useState<string>("");
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [consumers, setConsumers] = useState<RampConsumer[] | null>(null);
  const [exits, setExits] = useState<DualEngineExit[]>([]);
  const [storeSwitch, setStoreSwitch] = useState<StoreSwitch | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const active = getActiveOrgId();
    if (active) setOrganizationId(active);
    // THE ORGANIZATION, BY NAME. This screen used to ask a person to paste an
    // organization id by hand, which is a machine identifier at the user and
    // also the only way to reach the switch every refusal in the product names.
    void getUserOrganizations()
      .then((rows) => {
        setOrganizations(rows.map((row) => ({ id: row.id, name: row.name })));
        if (!active && rows[0]) setOrganizationId(rows[0].id);
      })
      .catch(() => setOrganizations([]));
  }, []);

  const load = useCallback(async (orgId: string) => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      // THE DOORS, FROM THIS PERSON'S OWN SESSION. Until 19 September this
      // screen read everything through an admin API route holding the service
      // key, and four of the seven ramp functions had no grant on that lane
      // either — so the screen answered `permission denied for function
      // unified_data_ramp_exit` and nobody could turn the store on from the
      // product at all. The three reads are now declared client doors that
      // decide `iam.has_org_admin` before they read anything, which is the
      // ladder the rest of the platform uses.
      const supabase = createClient().schema("platform");
      const [ramp, store, exit] = await Promise.all([
        supabase.rpc("unified_data_ramp_state", { p_organization_id: orgId }),
        supabase.rpc("unified_data_store_state", { p_organization_id: orgId }),
        supabase.rpc("unified_data_ramp_exit", { p_organization_id: orgId }),
      ]);
      if (ramp.error) throw new Error(ramp.error.message);
      if (store.error) throw new Error(store.error.message);
      if (exit.error) throw new Error(exit.error.message);
      setConsumers((ramp.data ?? []) as RampConsumer[]);
      setStoreSwitch((store.data ?? null) as StoreSwitch | null);
      setExits((exit.data ?? []) as DualEngineExit[]);
    } catch (e) {
      setConsumers(null);
      setStoreSwitch(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (organizationId) void load(organizationId);
  }, [organizationId, load]);

  const runGate = useCallback(
    async (consumerId: string) => {
      setBusy(consumerId);
      try {
        const res = await fetch("/api/admin/unified-data-ramp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "gate", consumerId, organizationId }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        toast.info(body.gate?.why ?? "The gate ran.");
        await load(organizationId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [organizationId, load],
  );

  // THE STORE'S OWN SWITCH. Not a consumer, and deliberately not gated by Test 1: turning the
  // store on for an organization moves no data — every consumer knob below is separate and
  // stays where it is. What it does change is that this organization can reach the store's
  // doors at all, and can promote a field (defect B1).
  const setStore = useCallback(
    async (on: boolean) => {
      setBusy("__store__");
      try {
        // The same door, from this person's session, so `auth.uid()` is a real
        // person and the override is stamped with the person who made it.
        const { error: refused } = await createClient()
          .schema("platform")
          .rpc("unified_data_store_set", { p_organization_id: organizationId, p_on: on });
        if (refused) throw new Error(refused.message);
        // NAMED, NOT "this organization". The picker at the top of this screen
        // and the app's own active organization are two different choices, and
        // on 19 September a person flipped the switch here and opened a
        // DIFFERENT organization's tables without a word anywhere saying so.
        // Every sentence this switch says now carries the name it acted on.
        toast.success(
          on
            ? `${nameOf(organizationId)} is on the unified record store. No consumer moved — every consumer switch below is where you left it.`
            : `${nameOf(organizationId)} is off the unified record store. Its doors take writes only from the role that owns the store.`,
        );
        await load(organizationId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e), { duration: 12000 });
      } finally {
        setBusy(null);
      }
    },
    [organizationId, load],
  );

  /** The name of the organization this screen is acting on, for every sentence it says. */
  const nameOf = useCallback(
    (id: string) => organizations.find((organization) => organization.id === id)?.name ?? "This organization",
    [organizations],
  );

  /**
   * OPEN THE TABLES OF THE ORGANIZATION ON THIS SCREEN — which is what the
   * button always claimed and never did. It used to be a plain link to
   * `/data-v2`, and that page reads the app's ACTIVE organization, not the one
   * picked in the selector above; on 19 September an admin turned the store on
   * for a brand-new organization, pressed this, and landed in a different
   * organization's store with nothing on the screen saying which one they were
   * looking at.
   *
   * So the button now MAKES the organization it names the active one — the same
   * `setOrganization` the sidebar switcher dispatches, which resets the scope,
   * project, task and conversation selections with it — and says so before it
   * moves. One organization, everywhere, and the page it lands on is reading
   * the same choice this screen just made.
   */
  const openTables = useCallback(() => {
    if (!organizationId) return;
    const name = nameOf(organizationId);
    dispatch(setOrganization({ id: organizationId, name }));
    toast.success(`Now working in ${name}. Opening its tables.`);
    router.push("/data-v2");
  }, [organizationId, nameOf, dispatch, router]);

  const setSwitch = useCallback(
    async (consumer: RampConsumer, on: boolean) => {
      setBusy(consumer.consumer_id);
      try {
        const res = await fetch("/api/admin/unified-data-ramp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "set",
            consumerId: consumer.consumer_id,
            organizationId,
            on,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          // The database refused. Its sentence names the verdict and the remedy;
          // this screen shows THAT, never a shorter version of it.
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        toast.success(
          on
            ? `${consumer.label} now reads the unified store for ${nameOf(organizationId)}.`
            : `${consumer.label} is back on the old table for ${nameOf(organizationId)}.`,
        );
        await load(organizationId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e), { duration: 12000 });
      } finally {
        setBusy(null);
      }
    },
    [organizationId, load],
  );

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Unified data ramp</h1>
        <span className="text-sm text-muted-foreground">
          One consumer at a time, one organization at a time. Test 1 gates every switch on.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="ramp-org">
            Organization
          </label>
          <select
            id="ramp-org"
            value={organizationId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOrganizationId(e.target.value)}
            className="w-[22rem] rounded-md border border-border bg-background px-2 py-1 text-base text-foreground md:text-sm"
          >
            {organizations.length === 0 ? (
              <option value="">Looking for the organizations you are in…</option>
            ) : null}
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(organizationId)}
            disabled={!organizationId || loading}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Reload"}
          </Button>
        </div>
      </header>

      {storeSwitch && (
        <div className="rounded-md border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">The record store itself</span>
            <span className="text-xs text-muted-foreground">
              Where {nameOf(organizationId)}&apos;s tables, fields and records are kept
            </span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {storeSwitch.switched_on
                  ? `On for ${nameOf(organizationId)}`
                  : `Off for ${nameOf(organizationId)}`}
              </span>
              <Switch
                checked={storeSwitch.switched_on}
                disabled={busy === "__store__" || !organizationId}
                onCheckedChange={(on: boolean) => void setStore(on)}
                aria-label="The record store, for this organization"
              />
            </div>
          </div>
          <div className="mt-1 text-muted-foreground">{storeSwitch.why}</div>
          {storeSwitch.switched_on ? (
            <Button variant="outline" size="sm" className="mt-2" onClick={openTables}>
              <Table2 className="size-4" />
              Open {nameOf(organizationId)}&apos;s tables
            </Button>
          ) : null}
        </div>
      )}

      {exits.map((exit) => {
        const overdue = exit.status === "open" && new Date(exit.exit_date) < new Date();
        return (
          <div
            key={exit.id}
            className={`rounded-md border p-3 text-sm ${
              overdue ? "border-destructive text-destructive" : "border-border"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <ShieldAlert className="size-4" />
              Two permission engines are running side by side — the exit is named
            </div>
            <div className="mt-1 text-muted-foreground">
              <span className="text-foreground">Owner:</span> {exit.owner_name} ·{" "}
              <span className="text-foreground">Date:</span> {exit.exit_date} ·{" "}
              <span className="text-foreground">Status:</span> {exit.status}
              {overdue && " — PAST ITS DATE. The ramp stops here until the owner names a new one."}
            </div>
            <div className="mt-1 text-muted-foreground">
              <span className="text-foreground">Trigger:</span> {exit.exit_trigger}
            </div>
          </div>
        );
      })}

      {error && (
        <div className="rounded-md border border-destructive p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!organizationId && (
        <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
          The ramp is set per organization, so there is nothing to show until one is chosen.
          Pick the organization above.
        </div>
      )}

      {consumers?.map((c) => {
        const landed = Boolean(c.landed_at);
        const green = c.gate_verdict === "green";
        return (
          <div key={c.consumer_id} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-6 text-sm text-muted-foreground">{c.ramp_order}</span>
              <span className="font-medium">{c.label}</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{c.knob_key}</code>
              {c.batch && (
                <span className="text-xs text-muted-foreground">
                  ramped in one batch with the rest of “{c.batch}”
                </span>
              )}
              {c.no_rollback && (
                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-3.5" /> no rollback
                </span>
              )}

              <span className={`ml-auto text-sm ${verdictClass(c.gate_verdict)}`}>
                {c.gate_verdict ? VERDICT_TEXT[c.gate_verdict] : "Gate has not run"}
                {c.gate_verdict && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    lost {c.gate_lost ?? 0} · gained {c.gate_gained ?? 0}
                  </span>
                )}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void runGate(c.consumer_id)}
                disabled={busy === c.consumer_id || !organizationId}
              >
                {busy === c.consumer_id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Run Test 1
              </Button>

              {/* RULE 1: no landed code, no switch. Nothing to press, and a
                  sentence below saying who owns it. */}
              {landed ? (
                <div className="flex items-center gap-2">
                  {c.switched_on ? (
                    <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <X className="size-4 text-muted-foreground" />
                  )}
                  <Switch
                    checked={c.switched_on}
                    disabled={busy === c.consumer_id}
                    onCheckedChange={(on) => void setSwitch(c, on)}
                    aria-label={`Switch ${c.label} onto the unified store`}
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-2 text-sm text-muted-foreground">
              {landed ? (
                <>
                  {c.gate_why ??
                    "Test 1 has not run for this consumer in this organization yet. Run it before switching."}
                  {!green && c.gate_verdict && (
                    <span className="ml-1 text-foreground">
                      The switch will refuse while this is the answer.
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-foreground">Not ready. </span>
                  {c.not_ready_why} There is no switch for it until its code lands.
                </>
              )}
            </div>

            <div className="mt-1 text-xs text-muted-foreground">
              {c.owning_lane}
              {c.record_types.length > 0 && <> · reads travel over {c.record_types.join(", ")}</>}
              {c.gate_ran_at && <> · gate last ran {new Date(c.gate_ran_at).toLocaleString()}</>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
