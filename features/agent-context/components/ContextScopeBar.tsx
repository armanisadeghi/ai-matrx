"use client";

import {
  Building2,
  FolderKanban,
  ListTodo,
  User,
  ChevronRight,
  Tag,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import type { ContextScopeLevel } from "../types";
import type { ScopeState } from "../hooks/useContextScope";
import { useAncestors } from "../hooks/useHierarchy";
import type { HierarchyNodeType } from "../service/hierarchyService";

const SCOPE_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  user: User,
  organization: Building2,
  project: FolderKanban,
  task: ListTodo,
  scope: Tag,
};

const ACCENT: Record<string, string> = {
  user: "text-blue-500",
  organization: "text-violet-500",
  project: "text-amber-500",
  task: "text-sky-500",
  scope: "text-emerald-500",
};

function getScopeIcon(scopeType: ContextScopeLevel, scopeState?: ScopeState) {
  if (
    scopeType === "scope" &&
    scopeState?.scopeIcon &&
    SCOPE_ICONS[scopeState.scopeIcon]
  ) {
    return SCOPE_ICONS[scopeState.scopeIcon];
  }
  return SCOPE_ICONS[scopeType] ?? Tag;
}

function getScopeAccent(scopeType: ContextScopeLevel, scopeState?: ScopeState) {
  if (scopeType === "scope" && scopeState?.scopeColor) {
    return scopeState.scopeColor;
  }
  return ACCENT[scopeType] ?? ACCENT.scope;
}

type Props = {
  scope: ScopeState;
  onScopeChange: (scope: ScopeState) => void;
};

export function ContextScopeBar({ scope, onScopeChange }: Props) {
  const isFixedHierarchy = scope.scopeType !== "scope";
  const { data: ancestors } = useAncestors(
    isFixedHierarchy ? (scope.scopeType as HierarchyNodeType) : "user",
    isFixedHierarchy && scope.scopeId !== "default" ? scope.scopeId : null,
  );

  const chain =
    isFixedHierarchy && ancestors && ancestors.length > 0
      ? ancestors
      : [
          {
            type: scope.scopeType as string,
            id: scope.scopeId,
            name: scope.scopeName,
          },
        ];

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink
            href="/agent-context"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.preventDefault();
              onScopeChange({
                scopeType: "user",
                scopeId: "default",
                scopeName: "My Context",
              });
            }}
          >
            Context
          </BreadcrumbLink>
        </BreadcrumbItem>

        {chain.map((crumb, idx) => {
          const crumbType = crumb.type as ContextScopeLevel;
          const Icon = getScopeIcon(
            crumbType,
            crumbType === "scope" ? scope : undefined,
          );
          const accent = getScopeAccent(
            crumbType,
            crumbType === "scope" ? scope : undefined,
          );
          const isLast = idx === chain.length - 1;

          return (
            <span key={`${crumb.type}-${crumb.id}`} className="contents">
              <BreadcrumbSeparator>
                <ChevronRight className="h-3 w-3" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="text-xs flex items-center gap-1">
                    <Icon className={`h-3 w-3 ${accent}`} />
                    <span className="font-medium">{crumb.name}</span>
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    href="#"
                    className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      onScopeChange({
                        scopeType: crumbType,
                        scopeId: crumb.id,
                        scopeName: crumb.name,
                      });
                    }}
                  >
                    <Icon className={`h-3 w-3 ${accent}`} />
                    {crumb.name}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
