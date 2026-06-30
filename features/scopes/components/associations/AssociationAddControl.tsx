// features/scopes/components/associations/AssociationAddControl.tsx
//
// The "Add" half of <EntityAssociator>. One control per allowed target type.
// It picks a target entity and hands the choice back to the parent, which
// owns the actual `add(...)` write through the useAssociations primitive —
// this control NEVER touches the slice, the thunks, or appContextSlice.
//
// Pickers are REUSED, not reinvented:
//   • project / task → <EntityTargetPicker> (the canonical scope-tree picker).
//   • scope / scope_type → the scope tree itself (selectors), rendered as a
//     compact searchable list so it works on mobile and inside popovers.
//   • category → a plain text entry (the categories UI lands later; gated
//     behind allowedTargetTypes so callers can omit it entirely).

"use client";

import { useState } from "react";
import { Check, Plus, Search, Tag, X } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { idMatchesQuery } from "@/utils/search-scoring";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import {
  makeSelectScopeTypesForOrg,
  selectTreeStatus,
} from "@/features/scopes/redux/selectors/tree";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { EntityTargetPicker } from "@/features/scopes/components/entity-context/EntityTargetPicker";
import type {
  AssociationTargetType,
  ScopeTypeNode,
} from "@/features/scopes/types";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

/** A target the user chose to attach: the type + id, plus a resolved label so
 *  the parent can persist it (as the edge's `label`) without a round-trip. */
export interface ChosenTarget {
  targetType: AssociationTargetType;
  targetId: string;
  label: string | null;
  /** Org the target belongs to, when the picker knows it. */
  orgId?: string | null;
}

interface AssociationAddControlProps {
  targetType: AssociationTargetType;
  /** ids already attached as this target type — hidden from the picker. */
  attachedIds: Set<string>;
  onChoose: (target: ChosenTarget) => void;
  /** Optional org override; defaults to the active org. */
  organizationId?: string | null;
  className?: string;
}

const TARGET_LABEL: Record<AssociationTargetType, string> = {
  organization: "organization",
  scope: "scope",
  scope_type: "scope type",
  project: "project",
  task: "task",
  context_item: "context item",
  thread: "thread",
  war_room: "war room",
  category: "category",
  conversation: "conversation",
  fc_set: "flashcard set",
  fc_card: "flashcard",
  file: "file",
  quiz_session: "quiz",
};

export function AssociationAddControl(props: AssociationAddControlProps) {
  const { targetType } = props;

  // The scope-tree picker handles project + task end-to-end (search, lazy
  // task buckets, orphan projects, cascade) — just adapt its callback shape.
  if (targetType === "project" || targetType === "task") {
    return (
      <EntityTargetPicker
        kind={targetType}
        value={null}
        organizationId={props.organizationId}
        className={props.className}
        label={`Add ${TARGET_LABEL[targetType]}…`}
        onSelect={(id, displayName) => {
          if (!id) return;
          if (props.attachedIds.has(id)) return;
          props.onChoose({
            targetType,
            targetId: id,
            label: displayName,
            orgId: props.organizationId,
          });
        }}
      />
    );
  }

  if (targetType === "scope" || targetType === "scope_type") {
    return <ScopeTreeAddControl {...props} mode={targetType} />;
  }

  // Free-text targets (category for now) — a plain id/label entry.
  return <FreeTextAddControl {...props} />;
}

// ─── scope / scope_type picker over the scope tree ───────────────────────

function ScopeTreeAddControl(
  props: AssociationAddControlProps & { mode: "scope" | "scope_type" },
) {
  const { mode } = props;
  useScopeTree(); // populate the tree slice (no-op if already loaded)
  const treeStatus = useAppSelector(selectTreeStatus);
  const activeOrgId = useAppSelector(selectActiveOrganizationId);
  const orgId = props.organizationId ?? activeOrgId;

  const [selectScopeTypesForOrg] = useState(() => makeSelectScopeTypesForOrg());
  const scopeTypes = useAppSelector((s) => selectScopeTypesForOrg(s, orgId));

  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const choose = (targetId: string, label: string | null) => {
    if (props.attachedIds.has(targetId)) return;
    props.onChoose({ targetType: mode, targetId, label, orgId });
    setExpanded(false);
    setSearch("");
  };

  const label = mode === "scope" ? "scope" : "scope type";

  return (
    <div className={props.className}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors text-left cursor-pointer"
      >
        <Plus className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="text-xs flex-1 truncate">Add {label}…</span>
      </button>

      {expanded && (
        <div className="ml-2 mr-1 mb-1 rounded-md border border-border/50 bg-card/80 overflow-hidden">
          <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border/40">
            <Search className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label}…`}
              className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/50 min-w-0"
              style={{ fontSize: "16px" }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto py-0.5">
            {treeStatus === "loading" && scopeTypes.length === 0 && (
              <div className="space-y-1 px-2 py-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            )}

            {treeStatus !== "loading" && scopeTypes.length === 0 && (
              <div className="px-2 py-2 text-[11px] text-muted-foreground">
                {orgId
                  ? "No scopes defined for this organization."
                  : "Select an organization first."}
              </div>
            )}

            {mode === "scope_type"
              ? renderScopeTypeOptions(scopeTypes, q, props.attachedIds, choose)
              : renderScopeOptions(scopeTypes, q, props.attachedIds, choose)}
          </div>
        </div>
      )}
    </div>
  );
}

function renderScopeTypeOptions(
  scopeTypes: ScopeTypeNode[],
  q: string,
  attached: Set<string>,
  choose: (id: string, label: string | null) => void,
) {
  const rows = scopeTypes.filter((t) => {
    if (attached.has(t.id)) return false;
    if (!q) return true;
    return (
      t.label_singular.toLowerCase().includes(q) ||
      t.label_plural.toLowerCase().includes(q) ||
      idMatchesQuery({ id: t.id }, q)
    );
  });
  if (rows.length === 0) return <EmptyRow text="No matching scope types" />;
  return rows.map((t) => (
    <OptionRow
      key={t.id}
      icon={
        <DynamicIcon name={t.icon} color={t.color} className="h-3.5 w-3.5" />
      }
      label={t.label_singular}
      onClick={() => choose(t.id, t.label_singular)}
    />
  ));
}

function renderScopeOptions(
  scopeTypes: ScopeTypeNode[],
  q: string,
  attached: Set<string>,
  choose: (id: string, label: string | null) => void,
) {
  let any = false;
  const groups = scopeTypes.map((t) => {
    const scopes = t.scopes.filter((s) => {
      if (attached.has(s.id)) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) || idMatchesQuery({ id: s.id }, q)
      );
    });
    if (scopes.length === 0) return null;
    any = true;
    return (
      <div key={t.id}>
        <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider flex items-center gap-1">
          <DynamicIcon name={t.icon} color={t.color} className="h-3 w-3" />
          {t.label_plural}
        </div>
        {scopes.map((s) => (
          <OptionRow
            key={s.id}
            label={s.name}
            indent
            onClick={() => choose(s.id, s.name)}
          />
        ))}
      </div>
    );
  });
  if (!any) return <EmptyRow text="No matching scopes" />;
  return groups;
}

function OptionRow({
  icon,
  label,
  indent,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  indent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full text-[11px] px-2 py-1.5 text-left hover:bg-accent/60 transition-colors",
        indent && "pl-5",
      )}
    >
      {icon ?? <span className="w-3.5 flex-shrink-0" />}
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="px-2 py-2 text-[11px] text-muted-foreground">{text}</div>
  );
}

// ─── free-text target (category) ─────────────────────────────────────────

function FreeTextAddControl(props: AssociationAddControlProps) {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState("");
  const label = TARGET_LABEL[props.targetType];

  const submit = () => {
    const id = value.trim();
    if (!id || props.attachedIds.has(id)) return;
    props.onChoose({
      targetType: props.targetType,
      targetId: id,
      label: id,
      orgId: props.organizationId,
    });
    setValue("");
    setExpanded(false);
  };

  return (
    <div className={props.className}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors text-left cursor-pointer"
      >
        <Tag className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="text-xs flex-1 truncate">Add {label}…</span>
      </button>
      {expanded && (
        <div className="ml-2 mr-1 mb-1 flex items-center gap-1.5 rounded-md border border-border/50 bg-card/80 px-2 py-1.5">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setExpanded(false);
            }}
            placeholder={`${label} id`}
            className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/50 min-w-0"
            style={{ fontSize: "16px" }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            className="text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default AssociationAddControl;
