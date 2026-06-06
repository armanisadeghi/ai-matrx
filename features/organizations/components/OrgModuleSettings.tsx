"use client";

/**
 * OrgModuleSettings — per-module org rules.
 *
 * PLACEHOLDER UI (deliberately). Every scopeable module from the resource
 * catalogue is listed with the org-level controls we intend to build, all
 * disabled and marked "coming soon" so this doubles as the build tasklist. As
 * each control gets a real backing column/RPC, flip it from disabled to live.
 *
 * Planned backing (per the knowledge docs):
 *   - Members can add     → who may contribute this kind to the org
 *   - Needs approval      → hold contributions as `permissions.status = 'pending'`
 *                           until an admin approves (column already exists)
 *   - Scopeable           → `shareable_resource_registry.is_scopeable` (to add)
 *   - Default access      → default permission_level for new org shares
 *   - Auto-ingest         → feed this kind into the knowledge graph automatically
 */

import React from "react";
import { Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  type OrgResourceEntry,
} from "../resource-catalogue";

interface ColumnDef {
  key: string;
  label: string;
  help: string;
}

const COLUMNS: ColumnDef[] = [
  {
    key: "contribute",
    label: "Members can add",
    help: "Allow members to contribute their own items of this kind to the org.",
  },
  {
    key: "approval",
    label: "Needs approval",
    help: "Hold member contributions as pending until an admin approves them. Backed by permissions.status ('pending') — already in the DB.",
  },
  {
    key: "scopeable",
    label: "Scopeable",
    help: "Allow tagging items of this kind to scopes. Will be backed by shareable_resource_registry.is_scopeable (column to add).",
  },
  {
    key: "autoingest",
    label: "Auto-ingest",
    help: "Automatically feed this kind into the org knowledge graph.",
  },
];

export function OrgModuleSettings() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Coming soon.</span> These
          per-module rules are placeholders that map out the org-level controls
          we&apos;re building. Nothing here is wired yet — it&apos;s the tasklist.
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
                          key={col.key}
                          className="text-left font-medium text-xs text-muted-foreground px-3 py-2 whitespace-nowrap"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 cursor-help">
                                {col.label}
                                <Info className="h-3 w-3 opacity-50" />
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
                    {entries.map((entry) => (
                      <ModuleRow key={entry.key} entry={entry} />
                    ))}
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

function ModuleRow({ entry }: { entry: OrgResourceEntry }) {
  const Icon = entry.icon;
  return (
    <tr className="border-b border-border last:border-0 hover:bg-accent/30">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium">{entry.labelPlural}</span>
        </div>
      </td>
      {COLUMNS.map((col) => (
        <td key={col.key} className="px-3 py-2">
          {/* Defaults reflect today's behavior: contributions on, approval off. */}
          <Switch
            disabled
            defaultChecked={col.key === "contribute" || col.key === "scopeable"}
            aria-label={`${col.label} for ${entry.labelPlural} (coming soon)`}
          />
        </td>
      ))}
      <td className="px-3 py-2">
        <Select disabled>
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <SelectValue placeholder="Viewer" />
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
}
