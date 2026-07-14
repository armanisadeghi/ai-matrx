"use client";

// features/education/classes/components/ClassPicker.tsx
//
// "Which class(es) is this in?" — the canonical, importable control for tagging
// ANY education artifact to a class from the artifact's own surface. It is a
// thin wrapper over the canonical Surface-B `EntityScopeTagger`, locked to the
// Class scope type. It writes LOCAL scope tags (platform.associations), NEVER
// the global active context (features/scopes/FEATURE.md §Global vs local) — the
// exact edge the class hub reads back.
//
// Drop this on any artifact detail view: <ClassPicker entityType="fc_set" entityId={id} />

import { useEffect, useRef } from "react";
import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { EntityScopeTagger } from "@/features/scopes/components/entity-context/EntityScopeTagger";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import type { EntityType } from "@/features/scopes/types";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";
import { useClasses } from "../hooks/useClasses";

interface ClassPickerProps {
  /** Any registered entity token (fc_set, assessment, note, study_media, …). */
  entityType: EntityTypeToken;
  entityId: string;
  className?: string;
  /** Tagger display variant. Defaults to the compact dropdown (best in forms). */
  variant?: "sidebar" | "compact" | "dropdown";
  onAfterSave?: (scopeIds: string[]) => void;
}

export function ClassPicker({
  entityType,
  entityId,
  className,
  variant = "dropdown",
  onAfterSave,
}: ClassPickerProps) {
  const { classTypeId, orgId } = useClasses();
  const { organizations, refresh } = useScopeTree();

  // The class scope type + its classes are created through the legacy scope
  // path; make sure the canonical tree the tagger reads has caught up once.
  const refreshed = useRef(false);
  useEffect(() => {
    if (refreshed.current || !classTypeId) return;
    const personal = organizations.find((o) => o.id === orgId);
    const hasType = personal?.scope_types.some((t) => t.id === classTypeId);
    if (!hasType) {
      refreshed.current = true;
      void refresh();
    }
  }, [classTypeId, organizations, orgId, refresh]);

  if (!classTypeId) {
    return (
      <div className={className}>
        <Link
          href="/education/classes"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <GraduationCap className="h-3.5 w-3.5" />
          Add a class to organize this
        </Link>
      </div>
    );
  }

  return (
    <EntityScopeTagger
      // EntityScopeTagger is still typed on the LEGACY `EntityType` union, which
      // is mid-convergence onto `EntityTypeToken` (features/scopes/FEATURE.md).
      // fc_set/assessment/study_media are registered tokens and tag correctly at
      // runtime (associations FK-validates the token); this boundary cast bridges
      // the narrow prop type until the union converges. Do NOT widen it here.
      entityType={entityType as EntityType}
      entityId={entityId}
      organizationId={orgId}
      scopeTypeAllowlist={[classTypeId]}
      variant={variant}
      title="Classes"
      className={className}
      onAfterSave={onAfterSave}
    />
  );
}
