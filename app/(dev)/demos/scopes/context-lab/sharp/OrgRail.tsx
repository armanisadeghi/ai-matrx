"use client";

// INSIDE 4 — Org Rail. The Slack workspace switcher, for context.
//
// A slim icon rail of the user's organizations (initial squares) plus two
// fixed slots at the bottom of the rail — Projects and Tasks — honoring the
// "projects and tasks at the bottom" rule spatially. The pane shows only the
// active org's types → scopes, so three orgs never stack vertically. Scale
// comes from switching, not scrolling.

import React, { useState } from "react";
import { Briefcase, Check, SquareCheckBig } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import { orgInitials, type PickerData, type SelectionApi } from "./engine";

interface OrgRailProps {
  data: PickerData;
  sel: SelectionApi;
  height?: number;
  footer?: React.ReactNode;
}

type Pane = { kind: "org"; orgId: string } | { kind: "projects" } | { kind: "tasks" };

function CheckTarget({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background",
      )}
    >
      {on && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}

export function OrgRail({ data, sel, height = 288, footer }: OrgRailProps) {
  const [pane, setPane] = useState<Pane>(() =>
    data.orgs[0] ? { kind: "org", orgId: data.orgs[0].id } : { kind: "projects" },
  );

  const activeOrg =
    pane.kind === "org"
      ? (data.orgs.find((o) => o.id === pane.orgId) ?? null)
      : null;

  const railButton = (
    active: boolean,
    onClick: () => void,
    label: string,
    child: React.ReactNode,
    dot: boolean,
  ) => (
    <button
      key={label}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "relative flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-semibold transition-colors",
        active
          ? "bg-primary/15 text-primary ring-1 ring-primary/40"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {child}
      {dot && (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" />
      )}
    </button>
  );

  return (
    <div className="flex w-full flex-col text-sm">
      <div className="flex" style={{ height }}>
        {/* rail */}
        <div className="flex w-11 shrink-0 flex-col items-center gap-1.5 border-r border-border py-2">
          {data.orgs.map((org) =>
            railButton(
              pane.kind === "org" && pane.orgId === org.id,
              () => setPane({ kind: "org", orgId: org.id }),
              org.name,
              orgInitials(org.name),
              sel.hasOrg(org.id) ||
                data.flatScopes.some(
                  (fs) => fs.org.id === org.id && sel.hasScope(fs.scope.id),
                ),
            ),
          )}
          <div className="mt-auto flex flex-col items-center gap-1.5">
            <div className="h-px w-6 bg-border" />
            {railButton(
              pane.kind === "projects",
              () => setPane({ kind: "projects" }),
              "Projects",
              <Briefcase className="h-4 w-4" />,
              sel.selection.projectIds.length > 0,
            )}
            {railButton(
              pane.kind === "tasks",
              () => setPane({ kind: "tasks" }),
              "Tasks",
              <SquareCheckBig className="h-4 w-4" />,
              sel.selection.taskIds.length > 0,
            )}
          </div>
        </div>

        {/* pane */}
        <div className="min-w-0 flex-1 overflow-y-auto p-1.5 scrollbar-thin">
          {pane.kind === "org" && activeOrg && (
            <>
              <button
                onClick={() => sel.toggleOrg(activeOrg.id)}
                className="flex h-7 w-full items-center gap-2 rounded px-1.5 text-left hover:bg-muted"
              >
                <CheckTarget on={sel.hasOrg(activeOrg.id)} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  Everything in {activeOrg.name}
                </span>
              </button>
              {activeOrg.scope_types.length === 0 && (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No scope types in this organization yet.
                </div>
              )}
              {activeOrg.scope_types.map((type) => {
                const c = resolveColor(type);
                const TIcon = resolveIcon(type.icon);
                return (
                  <div key={type.id} className="mt-1">
                    <div
                      className={cn(
                        "flex h-5 items-center gap-1.5 px-1.5 text-[11px] font-semibold",
                        c.fg,
                      )}
                    >
                      <TIcon className="h-3 w-3" />
                      {type.label_plural}
                      <span className="font-normal text-muted-foreground/70">
                        {type.scopes.length}
                      </span>
                    </div>
                    {type.scopes.length === 0 ? (
                      <div className="px-2 py-0.5 text-[11px] text-muted-foreground/70">
                        None yet.
                      </div>
                    ) : (
                      type.scopes.map((scope) => (
                        <button
                          key={scope.id}
                          onClick={() => sel.toggleScope(scope.id)}
                          className="flex h-6 w-full items-center gap-2 rounded px-1.5 pl-5 text-left hover:bg-muted"
                        >
                          <CheckTarget on={sel.hasScope(scope.id)} />
                          <span className="min-w-0 flex-1 truncate text-[13px]">
                            {scope.name}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                );
              })}
            </>
          )}

          {pane.kind === "projects" &&
            (data.projects.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                No projects yet.
              </div>
            ) : (
              data.projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => sel.toggleProject(p.id)}
                  className="flex h-6 w-full items-center gap-2 rounded px-1.5 text-left hover:bg-muted"
                >
                  <CheckTarget on={sel.hasProject(p.id)} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground/60">
                    {p.orgId
                      ? (data.orgs.find((o) => o.id === p.orgId)?.name ?? "")
                      : "unassigned"}
                  </span>
                </button>
              ))
            ))}

          {pane.kind === "tasks" &&
            (data.tasks.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                No tasks yet.
              </div>
            ) : (
              data.tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => sel.toggleTask(t.id)}
                  className="flex h-6 w-full items-center gap-2 rounded px-1.5 text-left hover:bg-muted"
                >
                  <CheckTarget on={sel.hasTask(t.id)} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {t.title}
                  </span>
                  {t.status && (
                    <span className="shrink-0 text-[10px] text-muted-foreground/60">
                      {t.status}
                    </span>
                  )}
                </button>
              ))
            ))}
        </div>
      </div>

      {footer}
    </div>
  );
}
