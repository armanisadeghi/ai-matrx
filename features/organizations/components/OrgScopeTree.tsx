"use client";

/**
 * OrgScopeTree — a compact read-only tree of an org's scope types and their
 * scopes (no items), for the Manage page. Each type links to its scope-type
 * editor; each scope links to its detail editor. Self-fetches from Redux.
 *
 * Rendering uses rounded "elbow" connectors color-themed per scope type so the
 * tree reads like a polished file-tree rather than a plain bulleted list.
 */

import React from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopeTypes,
  selectScopeTypesByOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  fetchScopes,
  selectScopesByType,
} from "@/features/agent-context/redux/scope/scopesSlice";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import {
  resolveColor,
  SCOPE_ICON_SURFACE,
} from "@/features/scope-system/constants/scope-colors";
import type { ScopeType } from "@/features/agent-context/redux/scope/types";

export function OrgScopeTree({ orgId, slug }: { orgId: string; slug: string }) {
  const dispatch = useAppDispatch();
  const scopeTypes = useAppSelector((s) => selectScopeTypesByOrg(s, orgId));

  React.useEffect(() => {
    if (!orgId) return;
    dispatch(fetchScopeTypes(orgId));
    dispatch(fetchScopes({ org_id: orgId }));
  }, [dispatch, orgId]);

  if (scopeTypes.length === 0) {
    return (
      <div className="text-center py-6 border-2 border-dashed border-border rounded-lg">
        <p className="text-sm text-muted-foreground mb-3">No scopes yet.</p>
        <Button asChild size="sm">
          <Link href={`/organizations/${slug}/scopes`}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Set up scopes
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {scopeTypes.map((type) => (
        <ScopeTypeNode key={type.id} type={type} slug={slug} />
      ))}
    </ul>
  );
}

function ScopeTypeNode({ type, slug }: { type: ScopeType; slug: string }) {
  const scopes = useAppSelector((s) => selectScopesByType(s, type.id));
  const Icon = resolveIcon(type.icon);
  const color = resolveColor(type);

  return (
    <li>
      {/* Branch header */}
      <Link
        href={`/organizations/${slug}/scopes/${type.id}`}
        className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-accent/50 transition-colors"
      >
        <span
          className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ring-1 ${SCOPE_ICON_SURFACE} ${color.fg} ${color.ring}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-foreground truncate">
          {type.label_plural}
        </span>
        <span
          className={`text-[10px] font-semibold tabular-nums leading-none px-1.5 py-0.5 rounded-full ring-1 ${SCOPE_ICON_SURFACE} ${color.fg} ${color.ring}`}
        >
          {scopes.length}
        </span>
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
      </Link>

      {/* Leaves with rounded elbow connectors, tinted to the branch color */}
      <ul className={`ml-[1.4rem] ${color.fg}`}>
        {scopes.length === 0 ? (
          <li className="relative flex items-center">
            <Connector isLast />
            <span className="py-1 text-xs text-muted-foreground italic">
              No {type.label_singular.toLowerCase()} yet
            </span>
          </li>
        ) : (
          scopes.map((sc, i) => (
            <li key={sc.id} className="relative flex items-stretch">
              <Connector isLast={i === scopes.length - 1} />
              <Link
                href={`/organizations/${slug}/scopes/${type.id}/${sc.id}`}
                className="group/leaf flex flex-1 items-center gap-2 rounded-md py-1 pl-1 pr-1.5 text-sm text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
              >
                <span
                  className={`h-2 w-2 rounded-full bg-current ring-2 ring-current/25 shrink-0`}
                />
                <span className="truncate">{sc.name}</span>
                <ChevronRight className="ml-auto h-3 w-3 opacity-0 group-hover/leaf:opacity-100 transition-opacity shrink-0" />
              </Link>
            </li>
          ))
        )}
      </ul>
    </li>
  );
}

/**
 * A single tree connector cell: a vertical rail with a rounded elbow into the
 * leaf row. The rail continues past the row unless it's the last child.
 */
function Connector({ isLast }: { isLast?: boolean }) {
  return (
    <span className="relative w-4 shrink-0 self-stretch" aria-hidden>
      {/* rounded elbow: down from the rail, curving right into the leaf */}
      <span className="absolute left-0 top-0 h-1/2 w-2.5 rounded-bl-[8px] border-l-2 border-b-2 border-current/55" />
      {/* continuation of the rail to the next sibling */}
      {!isLast && (
        <span className="absolute left-0 top-1/2 bottom-0 w-0.5 bg-current/55" />
      )}
    </span>
  );
}
