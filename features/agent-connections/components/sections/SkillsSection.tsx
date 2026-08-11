"use client";

import React, { useRef, useState } from "react";

import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";
import { SkillsBrowser } from "@/features/skills/components/SkillsBrowser";
import { SkillDetailEditor } from "@/features/skills/components/SkillDetailEditor";
import { SkillIngestPanel } from "@/features/skills/components/SkillIngestPanel";
import { SkillCategoryTreeEditor } from "@/features/skills/components/SkillCategoryTreeEditor";
import {
  selectAllSkills,
  selectSkillsStatus,
} from "@/features/skills/redux/skillsSelectors";
import {
  CONNECTIONS_SKILLS_SURFACE_NAME,
  createConnectionsSkillsScope,
  type ConnectionsSkillsDraftSnapshot,
  type ConnectionsSkillsListEntry,
} from "@/features/surfaces/manifests/connections-skills.manifest";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { SectionFooter } from "../SectionFooter";
import { selectSelectedItemId, setSelectedItemId, selectViewScope } from "../../redux/ui/slice";
import { SIDEBAR_SECTIONS } from "../../constants";

/** SkillsSection is the agent-connections panel surface for the Skills
 * feature. It mode-routes between the browser, detail/edit form, the
 * admin-only filesystem ingest panel, and the categories tree.
 *
 * Mode is local state — agent-connections already owns the section
 * navigation; this is the per-section sub-mode.
 */
type Mode = "list" | "detail" | "create" | "ingest" | "categories";

const AVAILABLE_SECTIONS = SIDEBAR_SECTIONS.map((s) => ({
  value: s.value,
  slug: s.urlSegment ?? s.value,
}));

export function SkillsSection() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const selectedItemId = useAppSelector(selectSelectedItemId);
  const [mode, setMode] = useState<Mode>("list");
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // The skill editor's staged form, handed up so the `skill_draft_*` read
  // twins report what is ON SCREEN rather than the last saved row. A ref, not
  // state — `getScope` reads it at Run time and the draft must not re-render
  // this section on every keystroke. Null whenever the editor is unmounted.
  const draftRef = useRef<ConnectionsSkillsDraftSnapshot | null>(null);
  const onDraftSnapshot = React.useCallback(
    (snapshot: ConnectionsSkillsDraftSnapshot | null) => {
      draftRef.current = snapshot;
    },
    [],
  );

  // External selection (e.g., toast deep-link) puts us into detail mode.
  React.useEffect(() => {
    if (selectedItemId && mode === "list") {
      setMode("detail");
    } else if (!selectedItemId && mode === "detail") {
      setMode("list");
    }
  }, [selectedItemId, mode]);

  const goList = () => {
    dispatch(setSelectedItemId(null));
    setMode("list");
  };

  // ── Surface Values: `matrx-user/connections-skills` ───────────────────
  // Nested under the hub shell's `matrx-user/agent-connections` provider —
  // this one registers deeper, so it wins while the Skills vertical is
  // mounted. Scope reads live Redux state at Run time.
  const getScope = () => {
    const state = store.getState();
    const skills = selectAllSkills(state);
    const viewScope = selectViewScope(state);
    let viewScopeId: string | null = null;
    if (viewScope === "organization") viewScopeId = selectOrganizationId(state);
    else if (viewScope === "project") viewScopeId = selectProjectId(state);
    else if (viewScope === "task") viewScopeId = selectTaskId(state);
    const selectedId = selectSelectedItemId(state);
    const selected = selectedId
      ? skills.find((s) => s.id === selectedId)
      : undefined;
    const list: ConnectionsSkillsListEntry[] = skills.map((s) => ({
      id: s.id,
      skill_id: s.skillId,
      label: s.label,
      skill_type: s.skillType,
      is_active: s.isActive,
      is_system: s.isSystem,
    }));
    const byType: Record<string, number> = {};
    for (const s of skills) {
      byType[s.skillType] = (byType[s.skillType] ?? 0) + 1;
    }
    return createConnectionsSkillsScope({
      active_section: "skills",
      view_scope: viewScope,
      available_sections: AVAILABLE_SECTIONS,
      skills_view_mode: modeRef.current,
      skills_status: selectSkillsStatus(state),
      skills_count: skills.length,
      skills_list_summary: list,
      skills_by_type_counts: byType,
      view_scope_id: viewScopeId ?? undefined,
      selected_item_id: selectedId ?? undefined,
      selected_skill_id: selectedId ?? undefined,
      selected_skill_summary: selected
        ? {
            id: selected.id,
            skill_id: selected.skillId,
            label: selected.label,
            description: selected.description,
            skill_type: selected.skillType,
            is_active: selected.isActive,
            is_system: selected.isSystem,
            is_public: selected.isPublic,
          }
        : undefined,
      ...(draftRef.current ?? {}),
    });
  };

  let body: React.ReactNode;
  if (mode === "detail" && selectedItemId) {
    body = (
      <div className="flex flex-col h-full min-h-0">
        <SkillDetailEditor
          skillId={selectedItemId}
          onBack={goList}
          surfaceName={CONNECTIONS_SKILLS_SURFACE_NAME}
          onDraftSnapshot={onDraftSnapshot}
        />
      </div>
    );
  } else if (mode === "create") {
    body = (
      <div className="flex flex-col h-full min-h-0">
        <SkillDetailEditor
          skillId=""
          isNew
          onBack={goList}
          surfaceName={CONNECTIONS_SKILLS_SURFACE_NAME}
          onDraftSnapshot={onDraftSnapshot}
        />
      </div>
    );
  } else if (mode === "ingest") {
    body = (
      <div className="flex flex-col h-full min-h-0">
        <SkillIngestPanel onBack={goList} />
      </div>
    );
  } else if (mode === "categories") {
    body = (
      <div className="flex flex-col h-full min-h-0">
        <SkillCategoryTreeEditor onBack={goList} />
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col h-full min-h-0">
        <SkillsBrowser
          onSelect={(id) => {
            dispatch(setSelectedItemId(id));
            setMode("detail");
          }}
          onNew={() => setMode("create")}
          onIngest={() => setMode("ingest")}
          onCategories={() => setMode("categories")}
        />
        <SectionFooter
          description="Reusable skills that provide domain-specific knowledge and workflows to agents. Loaded with progressive disclosure — descriptions first, body on invocation."
          learnMoreLabel="Learn more about skills"
          learnMoreHref="#"
        />
      </div>
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName={CONNECTIONS_SKILLS_SURFACE_NAME}
      getScope={getScope}
    >
      {body}
    </SurfaceRuntimeProvider>
  );
}

export default SkillsSection;
