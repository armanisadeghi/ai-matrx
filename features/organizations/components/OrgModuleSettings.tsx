"use client";

/**
 * OrgModuleSettings — per-module org rules, live.
 *
 * Every scopeable module from the resource catalogue, with org-level controls
 * persisted to `org_module_settings` (admin-gated RPC). Two controls are
 * enforced server-side today (Members can add + Needs approval, via
 * `share_resource_with_org`); the rest are saved for upcoming enforcement and
 * labelled accordingly. Non-admins see the controls read-only.
 */

import React from "react";
import { Info, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CONTENT_ROLES,
  entriesByRole,
  moduleKey,
  type OrgResourceEntry,
} from "../resource-catalogue";
import {
  getOrgModuleSettings,
  setOrgModuleSetting,
  DEFAULT_MODULE_SETTING,
  type OrgModuleSetting,
  type PermissionLevel,
} from "../orgModuleSettings";

type ToggleField = "membersCanAdd" | "requiresApproval" | "isScopeable" | "autoIngest";

interface ColumnDef {
  field: ToggleField;
  label: string;
  help: string;
  enforced: boolean;
}

const COLUMNS: ColumnDef[] = [
  {
    field: "membersCanAdd",
    label: "Members can add",
    help: "Allow non-admin members to contribute their own items of this kind. Enforced now in share_resource_with_org.",
    enforced: true,
  },
  {
    field: "requiresApproval",
    label: "Needs approval",
    help: "Hold member contributions as pending until an admin approves. Enforced now — pending shares appear in Member contributions.",
    enforced: true,
  },
  {
    field: "isScopeable",
    label: "Scopeable",
    help: "Whether items of this kind can be tagged to scopes in this org. Saved now; tag-time enforcement is coming.",
    enforced: false,
  },
  {
    field: "autoIngest",
    label: "Auto-ingest",
    help: "Automatically feed this kind into the org knowledge graph. Saved now; pipeline enforcement is coming.",
    enforced: false,
  },
];

export function OrgModuleSettings({
  orgId,
  canEdit,
}: {
  orgId: string;
  canEdit: boolean;
}) {
  const [settings, setSettings] = React.useState<Map<string, OrgModuleSetting>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const map = await getOrgModuleSettings(orgId);
      if (!cancelled) {
        setSettings(map);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  function settingFor(entry: OrgResourceEntry): OrgModuleSetting {
    return settings.get(moduleKey(entry)) ?? DEFAULT_MODULE_SETTING;
  }

  async function persist(entry: OrgResourceEntry, next: OrgModuleSetting) {
    const key = moduleKey(entry);
    const prev = settings.get(key);
    // Optimistic
    setSettings((m) => new Map(m).set(key, next));
    setSavingKey(key);
    const result = await setOrgModuleSetting(orgId, key, next);
    setSavingKey(null);
    if (!result.success) {
      // Revert
      setSettings((m) => {
        const copy = new Map(m);
        if (prev) copy.set(key, prev);
        else copy.delete(key);
        return copy;
      });
      toast.error(result.error ?? "Couldn't save — admins only.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Changes save instantly.{" "}
          <span className="font-medium text-foreground">Members can add</span> and{" "}
          <span className="font-medium text-foreground">Needs approval</span> are
          enforced now; the rest are saved for upcoming enforcement.
          {!canEdit && " You have read-only access."}
        </p>
      </div>

      <TooltipProvider delayDuration={300}>
        {CONTENT_ROLES.map((role) => {
          const entries = entriesByRole(role.id);
          if (entries.length === 0) return null;
          return (
            <div key={role.id}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`h-2 w-2 rounded-full ${role.accentBar}`} />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {role.title}
                </h3>
              </div>

              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left font-medium text-xs text-muted-foreground px-3 py-2 min-w-[160px]">
                        Module
                      </th>
                      {COLUMNS.map((col) => (
                        <th
                          key={col.field}
                          className="text-left font-medium text-xs text-muted-foreground px-3 py-2 whitespace-nowrap"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 cursor-help">
                                {col.label}
                                {col.enforced ? (
                                  <Check className="h-3 w-3 text-emerald-500" />
                                ) : (
                                  <Info className="h-3 w-3 opacity-50" />
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">{col.help}</p>
                            </TooltipContent>
                          </Tooltip>
                        </th>
                      ))}
                      <th className="text-left font-medium text-xs text-muted-foreground px-3 py-2 whitespace-nowrap min-w-[140px]">
                        Default access
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => {
                      const s = settingFor(entry);
                      const key = moduleKey(entry);
                      const saving = savingKey === key;
                      const Icon = entry.icon;
                      return (
                        <tr key={entry.key} className="border-b border-border last:border-0 hover:bg-accent/30">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="font-medium">{entry.labelPlural}</span>
                              {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                            </div>
                          </td>
                          {COLUMNS.map((col) => (
                            <td key={col.field} className="px-3 py-2">
                              <Switch
                                checked={s[col.field]}
                                disabled={!canEdit || saving}
                                onCheckedChange={(checked) =>
                                  persist(entry, { ...s, [col.field]: checked })
                                }
                                aria-label={`${col.label} for ${entry.labelPlural}`}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            <Select
                              value={s.defaultPermission}
                              disabled={!canEdit || saving}
                              onValueChange={(v) =>
                                persist(entry, { ...s, defaultPermission: v as PermissionLevel })
                              }
                            >
                              <SelectTrigger className="h-7 w-[120px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="viewer">Viewer</SelectItem>
                                <SelectItem value="editor">Editor</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
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
          );
        })}
      </TooltipProvider>
    </div>
  );
}
