"use client";

/**
 * OrgScopeTree — a compact read-only tree of an org's scope types and their
 * scopes (no items), for the Manage page. Each type links to its scope-type
 * editor; each scope links to its detail editor. Self-fetches from Redux.
 */

import React from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
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
    <div className="space-y-3">
      {scopeTypes.map((type) => (
        <ScopeTypeNode key={type.id} type={type} slug={slug} />
      ))}
    </div>
  );
}

function ScopeTypeNode({ type, slug }: { type: ScopeType; slug: string }) {
  const scopes = useAppSelector((s) => selectScopesByType(s, type.id));
  const Icon = resolveIcon(type.icon);
  const color = resolveColor(type);

  return (
    <div>
      <Link
        href={`/organizations/${slug}/scopes/${type.id}`}
        className="group flex items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-accent/50 transition-colors"
      >
        <span className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${color.fg}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-foreground">{type.label_plural}</span>
        <Badge variant="secondary" className="text-[10px]">
          {scopes.length}
        </Badge>
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </Link>

      <div className="ml-[1.4rem] mt-0.5 border-l border-border pl-3 space-y-0.5">
        {scopes.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1">
            No {type.label_singular.toLowerCase()} yet
          </p>
        ) : (
          scopes.map((sc) => (
            <Link
              key={sc.id}
              href={`/organizations/${slug}/scopes/${type.id}/${sc.id}`}
              className="group flex items-center gap-2 py-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
              <span className="truncate">{sc.name}</span>
              <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
