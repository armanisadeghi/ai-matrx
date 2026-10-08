// features/education/classes/hooks/useClassParts.ts
//
// The parts of a class (units, lessons, sections) and what each one holds.
// A part is a scope under the per-org "Unit" scope type; part → class is the
// `scope → scope` edge with role `part_of`; content in a part is a plain
// content → part edge (beside its content → class edge). Scope writes go
// through the canonical scope thunks (the one scope writer), edges through
// the class's container links / `associationsService` (the one edge writer).
// No table, no parent column (Data Doctrine R7). See ../classParts.ts.

"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { associationsService } from "@/features/scopes/service/associationsService";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import {
  selectAllScopeTypes,
  selectScopeTypesByOrg,
  selectScopeTypesLoadedForOrg,
} from "@/features/scopes/redux/selectors/admin";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  createScope,
  createScopeType,
  deleteScope,
  updateScope,
} from "@/features/scopes/redux/thunks/scopeTreeMutations";
import { unwrapScopesRpc, type ScopeNode } from "@/features/scopes/types";
import {
  CLASS_PART_EDGE_ROLE,
  CLASS_PART_SCOPE_TYPE_SEED,
  CLASS_PART_SCOPE_TYPE_SLUG,
} from "../constants";
import {
  itemKey,
  partMembership,
  partScopeSlug,
  sortParts,
  type ClassPart,
} from "../classParts";
import type { UseClassContentReturn } from "./useClassContent";

interface MembershipRead {
  /** The comma-joined part ids this read answers for. */
  key: string;
  membership: Map<string, Set<string>>;
  error: string | null;
}

const EMPTY_READ: MembershipRead = {
  key: "",
  membership: new Map(),
  error: null,
};

/** One read of every edge into the class's parts (`assoc_for_targets`). */
async function fetchMembership(key: string): Promise<MembershipRead> {
  const ids = key.split(",");
  const res = await associationsService.listForTargets("scope", ids);
  if (!res.ok) {
    console.error(
      "[useClassParts] reading what the parts hold failed:",
      res.error,
    );
    return { key, membership: new Map(), error: res.error.message };
  }
  return { key, membership: partMembership(res.data.edges, ids), error: null };
}

export interface UseClassPartsReturn {
  parts: ClassPart[];
  /** "Unit" / "Units" — the part type's own labels (renameable in the scopes UI). */
  nounSingular: string;
  nounPlural: string;
  /** Item keys (`token:id`) each part holds. */
  membership: Map<string, Set<string>>;
  /** Why reading what the parts hold failed (null when it succeeded). */
  membershipError: string | null;
  membershipLoading: boolean;
  /** The ids of the parts that hold this item. */
  partsHolding: (token: string, id: string) => string[];
  createPart: (name: string) => Promise<ClassPart>;
  renamePart: (partId: string, name: string) => Promise<void>;
  /** Takes the part off the class and archives it (the items stay in the class). */
  removePart: (partId: string) => Promise<void>;
  addToPart: (token: string, id: string, partId: string) => Promise<void>;
  removeFromPart: (token: string, id: string, partId: string) => Promise<void>;
  reloadMembership: () => Promise<void>;
}

export function useClassParts(
  cls: { id: string; organizationId: string | null },
  content: UseClassContentReturn,
): UseClassPartsReturn {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const allTypes = useAppSelector(selectAllScopeTypes);
  const partTypes = allTypes.filter(
    (t) => t.slug === CLASS_PART_SCOPE_TYPE_SLUG,
  );
  // Only the class's own organization's type — never another org's labels.
  const ownType = partTypes.find(
    (t) => t.organization_id === cls.organizationId,
  );
  const nameById = new Map<string, string>(
    partTypes.flatMap((t) =>
      t.scopes.map((s): [string, string] => [s.id, s.name]),
    ),
  );

  // A part outside the loaded scope tree (another organization's) still gets its name.
  const { titleFor } = useEntityTitles(
    content.partIds
      .filter((id) => !nameById.has(id))
      .map((id) => ({ token: "scope", id, label: null })),
  );
  const parts = sortParts(
    content.partIds.map((id) => ({
      id,
      name: nameById.get(id) ?? titleFor({ token: "scope", id, label: null }),
    })),
  );

  // What the parts hold, read for one id list (the key). Loading is derived —
  // the read answers for a key the render has not seen yet.
  const partIdsKey = content.partIds.join(",");
  const [read, setRead] = useState<MembershipRead>(EMPTY_READ);
  const membership = partIdsKey ? read.membership : EMPTY_READ.membership;
  const membershipError = partIdsKey ? read.error : null;
  const membershipLoading = partIdsKey !== "" && read.key !== partIdsKey;

  // The id list is the key: re-read whenever the class gains or loses a part.
  useEffect(() => {
    if (!partIdsKey) return;
    let live = true;
    void fetchMembership(partIdsKey).then((next) => {
      if (live) setRead(next);
    });
    return () => {
      live = false;
    };
  }, [partIdsKey]);

  async function rereadMembership(): Promise<void> {
    if (partIdsKey) setRead(await fetchMembership(partIdsKey));
  }

  async function ensurePartType(org: string): Promise<string> {
    if (!selectScopeTypesLoadedForOrg(store.getState(), org))
      await dispatch(ensureScopeTree());
    const existing = selectScopeTypesByOrg(store.getState(), org).find(
      (t) => t.slug === CLASS_PART_SCOPE_TYPE_SLUG,
    );
    if (existing) return existing.id;
    const created = await dispatch(
      createScopeType({
        org_id: org,
        label_singular: CLASS_PART_SCOPE_TYPE_SEED.labelSingular,
        label_plural: CLASS_PART_SCOPE_TYPE_SEED.labelPlural,
        icon: CLASS_PART_SCOPE_TYPE_SEED.icon,
        color: CLASS_PART_SCOPE_TYPE_SEED.color,
        description: CLASS_PART_SCOPE_TYPE_SEED.description,
        slug: CLASS_PART_SCOPE_TYPE_SLUG,
      }),
    ).then(unwrapScopesRpc);
    return created.id;
  }

  async function createPart(name: string): Promise<ClassPart> {
    const org = cls.organizationId;
    // A part lives in its class's own organization — never the active one.
    if (!org)
      throw new Error(
        "This class has no organization, so it cannot hold parts.",
      );
    const typeId = await ensurePartType(org);
    const scope = (await dispatch(
      createScope({
        org_id: org,
        type_id: typeId,
        name: name.trim(),
        description: "",
        settings: {},
        slug: partScopeSlug(name, crypto.randomUUID().slice(0, 8)),
      }),
    ).then(unwrapScopesRpc)) as ScopeNode;
    const linked = await content.links.attach(
      "scope" as EntityTypeToken,
      scope.id,
      undefined,
      undefined,
      { role: CLASS_PART_EDGE_ROLE },
    );
    if (!linked.ok) {
      // Never leave an orphan part behind: archive it, then say what happened.
      await dispatch(deleteScope({ scope_id: scope.id })).then(unwrapScopesRpc);
      throw new Error(
        `"${scope.name}" could not be added to the class: ${linked.error ?? "the write was refused"}.`,
      );
    }
    return { id: scope.id, name: scope.name };
  }

  async function renamePart(partId: string, name: string): Promise<void> {
    await dispatch(updateScope({ scope_id: partId, name: name.trim() })).then(
      unwrapScopesRpc,
    );
  }

  async function removePart(partId: string): Promise<void> {
    const unlinked = await content.links.detach(
      "scope" as EntityTypeToken,
      partId,
      CLASS_PART_EDGE_ROLE,
    );
    if (!unlinked.ok)
      throw new Error(
        unlinked.error ?? "The part could not be taken off the class.",
      );
    await dispatch(deleteScope({ scope_id: partId })).then(unwrapScopesRpc);
  }

  async function addToPart(
    token: string,
    id: string,
    partId: string,
  ): Promise<void> {
    const res = await associationsService.add({
      sourceType: token,
      sourceId: id,
      targetType: "scope",
      targetId: partId,
      orgId: cls.organizationId ?? undefined,
    });
    if (!res.ok) throw new Error(res.error.message);
    await rereadMembership();
  }

  async function removeFromPart(
    token: string,
    id: string,
    partId: string,
  ): Promise<void> {
    const res = await associationsService.remove({
      sourceType: token,
      sourceId: id,
      targetType: "scope",
      targetId: partId,
    });
    if (!res.ok) throw new Error(res.error.message);
    await rereadMembership();
  }

  function partsHolding(token: string, id: string): string[] {
    const key = itemKey(token, id);
    return parts.filter((p) => membership.get(p.id)?.has(key)).map((p) => p.id);
  }

  return {
    parts,
    nounSingular:
      ownType?.label_singular || CLASS_PART_SCOPE_TYPE_SEED.labelSingular,
    nounPlural: ownType?.label_plural || CLASS_PART_SCOPE_TYPE_SEED.labelPlural,
    membership,
    membershipError,
    membershipLoading,
    partsHolding,
    createPart,
    renamePart,
    removePart,
    addToPart,
    removeFromPart,
    reloadMembership: rereadMembership,
  };
}
