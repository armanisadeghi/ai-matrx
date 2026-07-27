// features/scopes/components/management/TemplatesGalleryPanel.tsx
//
// /scopes/templates — read-only catalog browser. Lets users see the
// available scope-type / context-item templates organized by category.
// Applying a template is a write operation; Phase 4 surfaces the entry
// point and routes to the legacy applier until the chokepoint-backed
// `applyTemplate` RPC ships.

"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useTemplates } from "@/features/scopes/hooks/useTemplates";
import { useActiveContext } from "@/features/scopes/hooks/useActiveContext";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createScopesScope,
  SCOPES_SURFACE_NAME,
} from "@/features/surfaces/manifests/scopes.manifest";
import {
  buildScopesDirectoryValues,
  currentSelection,
} from "@/features/scopes/lib/scopes-surface-scope";

export function TemplatesGalleryPanel() {
  const { templates, status, error, refresh } = useTemplates();
  const active = useActiveContext();
  const { organizations } = useScopeTree();

  const targetOrg = useMemo(
    () =>
      organizations.find((o) => o.id === active.organizationId) ??
      organizations[0] ??
      null,
    [organizations, active.organizationId],
  );

  const grouped = useMemo(() => {
    const out: Record<string, typeof templates> = {};
    for (const t of templates) {
      const cat = t.category || "general";
      if (!out[cat]) out[cat] = [];
      out[cat].push(t);
    }
    return out;
  }, [templates]);

  // ── Surface emitter (`matrx-user/scopes`, view "templates") ────────────
  const getScope = () =>
    createScopesScope({
      current_view: "templates",
      ...buildScopesDirectoryValues(organizations, active),
      ...(status === "ready"
        ? {
            template_count: templates.length,
            templates_summary: templates.map((t) => ({
              id: t.id,
              key: t.key,
              name: t.name,
              description: t.description,
              category: t.category,
              scope_type_count: t.scope_type_count,
              context_item_count: t.context_item_count,
            })),
            template_categories: Object.keys(grouped),
          }
        : {}),
      ...(targetOrg ? { template_target_organization_id: targetOrg.id } : {}),
      selection: currentSelection(),
    });
  const wrap = (body: ReactNode) => (
    <SurfaceRuntimeProvider
      surfaceName={SCOPES_SURFACE_NAME}
      getScope={getScope}
      isEditable={false}
    >
      {body}
    </SurfaceRuntimeProvider>
  );

  if (status === "loading" && templates.length === 0) {
    return wrap(
      <div className="space-y-3">
        <div className="h-7 w-56 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="p-4">
              <div className="h-4 w-32 bg-muted animate-pulse rounded mb-2" />
              <div className="h-3 w-full bg-muted animate-pulse rounded" />
              <div className="h-3 w-2/3 bg-muted animate-pulse rounded mt-1" />
            </Card>
          ))}
        </div>
      </div>,
    );
  }

  if (status === "error") {
    return wrap(
      <Card className="p-4 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
        <div className="text-sm">
          <div className="font-medium">Couldn't load templates</div>
          <div className="text-xs text-muted-foreground">{error}</div>
          <button
            onClick={() => void refresh()}
            className="text-xs text-primary hover:underline mt-1"
          >
            Try again
          </button>
        </div>
      </Card>,
    );
  }

  if (templates.length === 0) {
    return wrap(
      <Card className="p-6 text-sm text-muted-foreground text-center">
        No templates available yet.
      </Card>,
    );
  }

  return wrap(
    <div className="space-y-5">
      {Object.entries(grouped).map(([category, list]) => (
        <section key={category} className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase">
            {category}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((t) => (
              <Card key={t.id} className="p-3 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <DynamicIcon
                    name={t.icon || "Sparkles"}
                    className="h-4 w-4 text-primary shrink-0 mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{t.name}</div>
                    <div className="text-[11px] text-muted-foreground line-clamp-2">
                      {t.description}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {t.scope_type_count} type
                    {t.scope_type_count === 1 ? "" : "s"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {t.context_item_count} item
                    {t.context_item_count === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="mt-auto pt-1 flex items-center gap-2">
                  {targetOrg ? (
                    <Link
                      href={`/organizations/${targetOrg.slug ?? targetOrg.id}/scopes?template=${t.id}`}
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <Zap className="h-3 w-3" />
                      Apply to {targetOrg.name}
                    </Link>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      Pick an org first
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>,
  );
}

export default TemplatesGalleryPanel;
