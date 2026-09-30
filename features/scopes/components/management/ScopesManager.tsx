// features/scopes/components/management/ScopesManager.tsx
//
// Per-org scopes page. Minimal org-identity header (logo / name / role +
// links back to the org overview and settings), followed by a stack of
// OrgScopeTypeSection cards — one per scope type — that drive the same
// in-line preview + add/edit + open-detail flow used on the org overview.
//
// Fully canonical (Lane F W7): reads from the scopesTree slice via
// ensureScopeTree + makeSelectScopeTypesForOrg, writes through the sanctioned
// RPC-backed thunks. No features/scope-system or features/agent-context
// imports remain.

"use client";

import { useSearchParams } from "next/navigation";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpDown,
  FolderTree,
  LayoutTemplate,
  ListChecks,
  Plus,
  Settings as SettingsIcon,
  Undo2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InlineMediaRef } from "@ai-matrx/media/react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  makeSelectScopeTypesForOrg,
  selectTreeError,
  selectTreeStatus,
} from "@/features/scopes/redux/selectors/tree";
import { ReadGate, readStatusOf } from "@/components/read-state/ReadGate";
import { UntrustedCount } from "@/components/official/stale-data/UntrustedCount";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { updateScopeType } from "@/features/scopes/redux/thunks/scopeTreeMutations";
import { OrgScopeTypeSection } from "@/features/scopes/components/management/OrgScopeTypeSection";
import { ScopeOnboarding } from "@/features/scopes/components/management/ScopeOnboarding";
import { AddScopeModal } from "@/features/scopes/components/management/AddScopeModal";
import { TemplateGalleryDrawer } from "@/features/scopes/components/management/TemplateGalleryDrawer";
import { ReorderDialog } from "@/features/scopes/components/management/ReorderDialog";
import { ArchivedDisclosure } from "@ai-matrx/design-system";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { scopesService } from "@/features/scopes/service/scopesService";
import { scopeStore } from "@/features/scopes/service/scopeStore";
import { ScopeGlyph } from "@/features/scopes/components/ScopeGlyph";
import type { ArchivedScopeTypeRow } from "@/features/scopes/types";
import { useScopeSuggestions } from "@/features/kg-suggestions/hooks/useScopeSuggestions";
import { KgSuggestionHint } from "@/features/kg-suggestions/components/KgSuggestionHint";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { Organization } from "@/features/organizations/types";

interface ScopesManagerProps {
  organization: Pick<
    Organization,
    "id" | "name" | "slug" | "logoUrl"
  >;
  role?: string | null;
}

export function ScopesManager({ organization, role }: ScopesManagerProps) {
  const dispatch = useAppDispatch();
  const selectScopeTypesForOrg = useMemo(
    () => makeSelectScopeTypesForOrg(),
    [],
  );
  const scopeTypes = useAppSelector((s) =>
    selectScopeTypesForOrg(s, organization.id),
  );
  const treeError = useAppSelector(selectTreeError);
  // "No scope types yet" (the onboarding) is an answer only after the tree LOADED (lane
  // SCOPES-READ-SWITCH-VALIDATE, 2026-09-30): while it loads, the firm's owner was shown "Scopes · 0 types ·
  // 0 scopes" and "What does your organization revolve around?" for her own seven types.
  const treeStatus = useAppSelector(selectTreeStatus);
  const treeRead = readStatusOf({ status: treeStatus, error: treeError });
  const countsTrusted = treeRead === "ready" || (treeRead === "loading" && scopeTypes.length > 0);
  const [addScopeOpen, setAddScopeOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const addressSearch = useSearchParams();
  const addressedTemplateId = addressSearch.get("template");
  const dropAddressedTemplate = () => {
    const next = new URLSearchParams(addressSearch.toString());
    next.delete("template");
    const query = next.toString();
    replaceAddressWithoutNavigating(query ? `${window.location.pathname}?${query}` : window.location.pathname);
  };
  const [reorderTypesOpen, setReorderTypesOpen] = useState(false);
  // THE ARCHIVED-ITEMS LAW (common-docs/policies/archived-items.md): the
  // default list hides removed scope types, and revealing them is ONE click
  // here — the canonical `ArchivedDisclosure`, never a local copy. The rows
  // are read on demand; the boot tree stays the live working set (F6).
  const [showArchived, setShowArchived] = useState(false);
  const [archivedTypes, setArchivedTypes] = useState<ArchivedScopeTypeRow[]>([]);
  const [archiveReadFailed, setArchiveReadFailed] = useState(false);
  const [restoreTarget, setRestoreTarget] =
    useState<ArchivedScopeTypeRow | null>(null);
  const [restoring, setRestoring] = useState(false);
  const suggestions = useScopeSuggestions();
  const orgScopes = useMemo(
    () => scopeTypes.flatMap((t) => t.scopes),
    [scopeTypes],
  );
  const orgSuggestions = orgScopes.flatMap((sc) => suggestions.forScope(sc.id));

  useEffect(() => {
    void dispatch(ensureScopeTree());
  }, [dispatch]);

  const loadArchived = React.useCallback(async () => {
    const res = await scopesService.listArchivedScopeTypes(organization.id);
    if (isScopesRpcErr(res)) {
      // Nothing fails silently: an archive we could not read says so instead
      // of rendering as "Archived (0)".
      toast.error(`Could not read the archive: ${res.error.message}`);
      setArchiveReadFailed(true);
      return;
    }
    setArchivedTypes(res.data.types);
    setArchiveReadFailed(false);
  }, [organization.id]);

  useEffect(() => {
    void loadArchived();
  }, [loadArchived]);

  async function restoreType(row: ArchivedScopeTypeRow) {
    setRestoring(true);
    try {
      const res = await scopeStore.restoreScopeType(row.id);
      if (isScopesRpcErr(res)) {
        toast.error(`Restore failed: ${res.error.message}`);
        return;
      }
      toast.success(`${row.label_plural} restored`);
      setRestoreTarget(null);
      await Promise.all([
        dispatch(ensureScopeTree({ refresh: true })),
        loadArchived(),
      ]);
    } finally {
      setRestoring(false);
    }
  }

  const slug = organization.slug ?? organization.id;
  const totalScopes = orgScopes.length;
  const canManage = role === "owner" || role === "admin";

  const orderedTypes = useMemo(
    () => [...scopeTypes].sort((a, b) => a.sort_order - b.sort_order),
    [scopeTypes],
  );

  async function saveTypeOrder(orderedIds: string[]) {
    const results = await Promise.all(
      orderedIds.map((id, i) =>
        dispatch(updateScopeType({ type_id: id, sort_order: i + 1 })),
      ),
    );
    const failed = results.find(isScopesRpcErr);
    if (failed) throw new Error(failed.error.message);
    toast.success("Order saved");
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 md:p-5">
        <div className="flex items-start gap-4">
          {organization.logoUrl ? (
            <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14">
              <InlineMediaRef
                ref={organization.logoUrl}
                size="fill"
                fit="cover"
                rounded="md"
                fallback={null}
                className="border border-border"
                alt={organization.name}
              />
            </div>
          ) : (
            <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-md bg-muted flex items-center justify-center">
              <FolderTree className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Link
                href={`/organizations/${slug}`}
                className="text-xl md:text-2xl font-bold text-foreground hover:text-primary transition-colors"
              >
                {organization.name}
              </Link>
              {role && (
                <Badge variant="outline" className="text-[10px] capitalize">
                  {role}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Scopes</span>
              {" · "}
              <UntrustedCount
                value={scopeTypes.length}
                trustworthy={countsTrusted}
                label="Scope types"
              />{" "}
              type{scopeTypes.length === 1 && countsTrusted ? "" : "s"}
              {" · "}
              <UntrustedCount
                value={totalScopes}
                trustworthy={countsTrusted}
                label="Scopes"
              />{" "}
              scope{totalScopes === 1 && countsTrusted ? "" : "s"}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <Link
                href={`/organizations/${slug}`}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" />
                Org overview
              </Link>
              <Link
                href={`/organizations/${slug}/settings`}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <SettingsIcon className="h-3 w-3" />
                Org settings
              </Link>
              <Link
                href={`/organizations/${slug}/context-items`}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <ListChecks className="h-3 w-3" />
                All context items
              </Link>
              <Link
                href="/scopes"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <FolderTree className="h-3 w-3" />
                All scopes
              </Link>
            </div>
          </div>
        </div>
      </Card>

      {orgSuggestions.length > 0 && (
        <KgSuggestionHint
          variant="banner"
          rows={orgSuggestions}
          accept={suggestions.accept}
          reject={suggestions.reject}
          defer={suggestions.defer}
          label={organization.name}
          align="start"
        />
      )}

      <ReadGate
        status={treeRead}
        error={treeError}
        what="this organization's scopes"
        isEmpty={scopeTypes.length === 0}
        onRetry={() => void dispatch(ensureScopeTree({ refresh: true }))}
        empty={
          <Card className="p-6 md:p-8">
            <ScopeOnboarding orgId={organization.id} />
          </Card>
        }
      >
        <>
          {orderedTypes.map((scopeType) => (
            <OrgScopeTypeSection
              key={scopeType.id}
              scopeType={scopeType}
              orgId={organization.id}
              orgSlugOrId={slug}
            />
          ))}

          <div className="flex items-center justify-center gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddScopeOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Scope Type
            </Button>
            <span className="text-muted-foreground/50">·</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGalleryOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <LayoutTemplate className="h-4 w-4 mr-1.5" />
              Add from template
            </Button>
            {canManage && scopeTypes.length > 1 && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReorderTypesOpen(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowUpDown className="h-4 w-4 mr-1.5" />
                  Reorder types
                </Button>
              </>
            )}
          </div>
        </>
      </ReadGate>

      <ArchivedDisclosure
        // read-gate-exempt: 0 hides this control and a failed first read is said by the toast in loadArchived; a failed refresh keeps the count marked stale
        // A failed archive read with nothing known renders no control (count 0) and is
        // said by the toast; a failed refresh keeps the last count (stale-while-error).
        count={archivedTypes.length}
        countLabel={archiveReadFailed && archivedTypes.length > 0 ? `${archivedTypes.length}, may be out of date` : undefined}
        open={showArchived}
        onOpenChange={setShowArchived}
        className="mt-2"
        contentClassName="space-y-2"
      >
        {archivedTypes.map((row) => (
          <Card
            key={row.id}
            className="p-3 flex items-center gap-3 border-dashed opacity-90"
          >
            <ScopeGlyph icon={row.icon} className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground truncate">
                {row.label_plural}
              </div>
              <div className="text-xs text-muted-foreground">
                Removed{" "}
                {new Date(row.deleted_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
                {row.archived_scope_count > 0
                  ? ` \u00b7 ${row.archived_scope_count} ${
                      row.archived_scope_count === 1
                        ? row.label_singular.toLowerCase()
                        : row.label_plural.toLowerCase()
                    } went with it`
                  : ""}
              </div>
            </div>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRestoreTarget(row)}
              >
                <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                Restore
              </Button>
            )}
          </Card>
        ))}
      </ArchivedDisclosure>

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
        title={`Restore ${restoreTarget?.label_plural ?? ""}?`}
        description={
          restoreTarget
            ? restoreTarget.archived_scope_count > 0
              ? `This brings the type back on this page, together with the ${restoreTarget.archived_scope_count} ${
                  restoreTarget.archived_scope_count === 1
                    ? restoreTarget.label_singular.toLowerCase()
                    : restoreTarget.label_plural.toLowerCase()
                } and the context items that were removed with it. Anything removed separately beforehand stays removed.`
              : "This brings the type back on this page, together with the context items that were removed with it. Anything removed separately beforehand stays removed."
            : ""
        }
        confirmLabel={restoring ? "Restoring\u2026" : "Restore"}
        busy={restoring}
        onConfirm={() => {
          if (restoreTarget) void restoreType(restoreTarget);
        }}
      />

      <AddScopeModal
        open={addScopeOpen}
        onOpenChange={setAddScopeOpen}
        orgId={organization.id}
      />
      {/* THE LINK FINISHES ITS SENTENCE (lane HANDOVER, 2026-09-27): the Templates page's
          "Apply to <organization>" lands here with `?template=<id>`, which nothing read, so the
          person arrived on the empty scopes page with no template in sight. It opens the drawer on
          that template; closing it drops the address's template. */}
      <TemplateGalleryDrawer
        open={galleryOpen || addressedTemplateId !== null}
        onOpenChange={(next) => {
          setGalleryOpen(next);
          if (!next && addressedTemplateId !== null) dropAddressedTemplate();
        }}
        orgId={organization.id}
        initialTemplateId={addressedTemplateId}
      />
      <ReorderDialog
        open={reorderTypesOpen}
        onOpenChange={setReorderTypesOpen}
        title="Reorder scope types"
        description="Drag the handle or use the arrows, then save."
        items={orderedTypes.map((t) => ({
          id: t.id,
          label: t.label_plural,
          sublabel: t.label_singular,
        }))}
        onSave={saveTypeOrder}
      />
    </div>
  );
}

export default ScopesManager;
