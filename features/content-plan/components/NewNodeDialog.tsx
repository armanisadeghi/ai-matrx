"use client";

/**
 * Create a plan.node. Slug auto-derives from the label via the canonical
 * `convertToKebabCase` (editable before save); every DB rejection (slug
 * shape, duplicate route, brandless site, cross-site parent) surfaces
 * verbatim in the toast — the trigger is the contract.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { convertToKebabCase } from "@/utils/text/stringUtils";

import { useCreatePlanNode } from "../data/hooks";
import {
  PLAN_NODE_TYPES,
  type PlanNodeRow,
  type PlanNodeType,
} from "../types";
import { CategorySelect } from "./CategorySelect";

export function NewNodeDialog({
  siteId,
  organizationId,
  parent,
  open,
  onOpenChange,
  onCreated,
}: {
  siteId: string;
  /** The SITE's org (web.site.organization_id) — the DB guard verifies it. */
  organizationId: string;
  /** null = create a root node (home or a top-level pillar/index). */
  parent: PlanNodeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (node: PlanNodeRow) => void;
}) {
  const create = useCreatePlanNode(siteId);
  const statusCategories = useCategories({
    dimension: CATEGORY_DIMENSIONS.planStatus,
  });

  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [nodeType, setNodeType] = useState<PlanNodeType>(
    parent ? "article" : "pillar",
  );
  const [statusId, setStatusId] = useState<string | null>(null);

  // Reset per open — adjust-state-during-render (react.dev pattern), no effect.
  const openKey = open ? `open:${parent?.id ?? "root"}` : "closed";
  const [prevOpenKey, setPrevOpenKey] = useState(openKey);
  if (prevOpenKey !== openKey) {
    setPrevOpenKey(openKey);
    if (open) {
      setLabel("");
      setSlug("");
      setSlugTouched(false);
      setNodeType(
        parent
          ? parent.node_type === "pillar"
            ? "cluster"
            : "article"
          : "pillar",
      );
      // Default new nodes to "planned" when the seed status exists.
      const planned = statusCategories.categories.find(
        (category) => category.slug === "planned",
      );
      setStatusId(planned?.id ?? null);
    }
  }

  // Slug auto-derives from the label until the user edits it — computed,
  // never synced via effect.
  const effectiveSlug =
    nodeType === "home"
      ? ""
      : slugTouched
        ? slug
        : convertToKebabCase(label);

  const submit = () => {
    // Late-bind the "planned" default: categories may not have been loaded
    // yet when the dialog opened (the open-time default would stay null).
    const resolvedStatusId =
      statusId ??
      statusCategories.categories.find(
        (category) => category.slug === "planned",
      )?.id ??
      null;
    create.mutate(
      {
        site_id: siteId,
        organization_id: organizationId,
        parent_id: parent?.id ?? null,
        node_type: nodeType,
        label: label.trim(),
        slug: nodeType === "home" ? null : effectiveSlug.trim() || null,
        status_id: resolvedStatusId,
      },
      {
        onSuccess: (node) => {
          onOpenChange(false);
          toast.success(`"${node.label}" added at ${node.route}.`);
          onCreated(node);
        },
        onError: (error) =>
          toast.error(`Could not create the node: ${extractErrorMessage(error)}`),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {parent ? `New node under "${parent.label}"` : "New root node"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {parent ? (
            <p className="font-mono text-xs text-muted-foreground">
              {(parent.route ?? "").replace(/\/+$/, "")}/
              {nodeType === "home" ? "" : effectiveSlug || "…"}
            </p>
          ) : null}
          <div>
            <Label className="text-xs">Label</Label>
            <Input
              autoFocus
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Knee Pain Treatment"
              className="h-8"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Node type</Label>
              <Select
                value={nodeType}
                onValueChange={(next) => setNodeType(next as PlanNodeType)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_NODE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <CategorySelect
                dimension={CATEGORY_DIMENSIONS.planStatus}
                value={statusId}
                onChange={setStatusId}
                placeholder="Status"
              />
            </div>
          </div>
          {nodeType !== "home" ? (
            <div>
              <Label className="text-xs">Slug</Label>
              <Input
                value={effectiveSlug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
                placeholder="knee-pain-treatment"
                className="h-8 font-mono"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!label.trim() || create.isPending}
            onClick={submit}
          >
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
