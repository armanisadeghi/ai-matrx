"use client";

import React, { useState } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { SkillsBrowser } from "@/features/skills/components/SkillsBrowser";
import { SkillDetailEditor } from "@/features/skills/components/SkillDetailEditor";
import { SkillIngestPanel } from "@/features/skills/components/SkillIngestPanel";
import { SkillCategoryTreeEditor } from "@/features/skills/components/SkillCategoryTreeEditor";
import { SectionFooter } from "../SectionFooter";
import { selectSelectedItemId, setSelectedItemId } from "../../redux/ui/slice";

/** SkillsSection is the agent-connections panel surface for the Skills
 * feature. It mode-routes between the browser, detail/edit form, the
 * admin-only filesystem ingest panel, and the categories tree.
 *
 * Mode is local state — agent-connections already owns the section
 * navigation; this is the per-section sub-mode.
 */
type Mode = "list" | "detail" | "create" | "ingest" | "categories";

export function SkillsSection() {
  const dispatch = useAppDispatch();
  const selectedItemId = useAppSelector(selectSelectedItemId);
  const [mode, setMode] = useState<Mode>("list");

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

  if (mode === "detail" && selectedItemId) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <SkillDetailEditor skillId={selectedItemId} onBack={goList} />
      </div>
    );
  }

  if (mode === "create") {
    return (
      <div className="flex flex-col h-full min-h-0">
        <SkillDetailEditor skillId="" isNew onBack={goList} />
      </div>
    );
  }

  if (mode === "ingest") {
    return (
      <div className="flex flex-col h-full min-h-0">
        <SkillIngestPanel onBack={goList} />
      </div>
    );
  }

  if (mode === "categories") {
    return (
      <div className="flex flex-col h-full min-h-0">
        <SkillCategoryTreeEditor onBack={goList} />
      </div>
    );
  }

  return (
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

export default SkillsSection;
