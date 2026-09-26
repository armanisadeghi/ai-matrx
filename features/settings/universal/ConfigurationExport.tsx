"use client";

// features/settings/universal/ConfigurationExport.tsx
//
// "Copy configuration" and "Compare" for an organization's effective settings —
// platform value + the organization's own value + where the answer came from —
// read from `platform.knob_configuration` (lib/scoped-config/history.ts). Compare
// answers against another organization the person belongs to, or against the same
// organization at an earlier moment, replayed from the settings change log.

import { useState } from "react";
import { ClipboardCopy, GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { showManualCopy } from "@/components/dialogs/clipboard-fallback/ClipboardFallbackHost";
import { extractErrorMessage } from "@/utils/errors";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { formatKnobValue } from "@/lib/scoped-config/ladder";
import {
  diffConfigurations,
  fetchOrganizationConfiguration,
  type ConfigurationDifference,
} from "@/lib/scoped-config/history";

async function copyText(text: string, title: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${title} copied.`);
  } catch {
    showManualCopy({ text, title, description: "Your browser blocked the clipboard; copy it from here." });
  }
}

export function ConfigurationExport(props: {
  organizationId: string;
  organizationName: string;
}) {
  const { organizationId, organizationName } = props;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"date" | "organization">("date");
  const [otherOrg, setOtherOrg] = useState<string>("");
  const [asOf, setAsOf] = useState<string>("");
  const [result, setResult] = useState<{
    leftName: string;
    rightName: string;
    rows: ConfigurationDifference[];
    note: string | null;
  } | null>(null);
  const { organizations } = useUserOrganizations();
  const others = organizations.filter((org) => org.id !== organizationId);

  const copy = async () => {
    setBusy(true);
    try {
      const config = await fetchOrganizationConfiguration(organizationId);
      await copyText(
        JSON.stringify({ organization: organizationName, ...config }, null, 2),
        `${organizationName}'s configuration`,
      );
    } catch (err) {
      toast.error(`The configuration could not be read: ${extractErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const compare = async () => {
    setBusy(true);
    setResult(null);
    try {
      const now = await fetchOrganizationConfiguration(organizationId);
      if (mode === "organization") {
        const other = others.find((org) => org.id === otherOrg);
        if (!other) return;
        const theirs = await fetchOrganizationConfiguration(other.id);
        setResult({
          leftName: organizationName,
          rightName: other.name,
          rows: diffConfigurations(now, theirs),
          note: null,
        });
      } else {
        if (!asOf) return;
        const at = new Date(asOf).toISOString();
        const then = await fetchOrganizationConfiguration(organizationId, at);
        const since = then.history_covers_platform_since;
        setResult({
          leftName: `On ${new Date(asOf).toLocaleString()}`,
          rightName: "Now",
          rows: diffConfigurations(then, now),
          note:
            since && new Date(at) < new Date(since)
              ? `Platform changes are recorded from ${new Date(since).toLocaleDateString()}; values before that are shown as they are now.`
              : null,
        });
      }
    } catch (err) {
      toast.error(`The comparison could not be made: ${extractErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const canCompare = mode === "organization" ? Boolean(otherOrg) : Boolean(asOf);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void copy()}>
        <ClipboardCopy className="mr-1.5 h-4 w-4" />
        Copy configuration
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(true)}>
        <GitCompareArrows className="mr-1.5 h-4 w-4" />
        Compare
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Compare {organizationName}&rsquo;s configuration</DialogTitle>
            <DialogDescription>
              Every setting whose value in effect differs, against an earlier moment or another organization you belong to.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-end gap-2">
            <Select value={mode} onValueChange={(v) => setMode(v as "date" | "organization")}>
              <SelectTrigger className="w-56" aria-label="Compare against">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">This organization at an earlier moment</SelectItem>
                <SelectItem value="organization">Another organization</SelectItem>
              </SelectContent>
            </Select>
            {mode === "date" ? (
              <Input
                type="datetime-local"
                aria-label="Moment to compare against"
                className="w-56"
                value={asOf}
                onChange={(event) => setAsOf(event.target.value)}
              />
            ) : (
              <Select value={otherOrg} onValueChange={setOtherOrg}>
                <SelectTrigger className="w-56" aria-label="Organization to compare against">
                  <SelectValue placeholder={others.length ? "Pick an organization" : "You belong to no other organization"} />
                </SelectTrigger>
                <SelectContent>
                  {others.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" disabled={busy || !canCompare} onClick={() => void compare()}>
              {busy ? "Comparing…" : "Compare"}
            </Button>
          </div>
          {result && (
            <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
              {result.note && <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">{result.note}</p>}
              {result.rows.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">No differences — every setting has the same value in effect.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Setting ({result.rows.length} differ)</th>
                      <th className="px-3 py-1.5 font-medium">{result.leftName}</th>
                      <th className="px-3 py-1.5 font-medium">{result.rightName}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.rows.map((row) => (
                      <tr key={row.key}>
                        <td className="px-3 py-1.5">
                          <div className="font-medium">{row.label}</div>
                          <code className="text-[10px] text-muted-foreground">{row.key}</code>
                        </td>
                        <td className="px-3 py-1.5">
                          {row.left === undefined ? "—" : formatKnobValue(row.left)}
                          {row.leftOrigin === "organization" && <span className="ml-1 text-muted-foreground">(own)</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          {row.right === undefined ? "—" : formatKnobValue(row.right)}
                          {row.rightOrigin === "organization" && <span className="ml-1 text-muted-foreground">(own)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
