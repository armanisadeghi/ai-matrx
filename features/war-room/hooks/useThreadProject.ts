"use client";

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectProjectById } from "@/features/agent-context/redux/projectsSlice";
import { getProject } from "@/features/projects/service";
import type { Project } from "@/features/projects/types";
import {
  selectEffectiveThreadProjectId,
  selectThreadPickerOption,
} from "@/features/war-room/redux/selectors";
import { reportWarRoomError } from "@/features/war-room/utils/reportWarRoomError";

/** Resolved project for a tile — always hydrates full project fields when needed. */
export function useThreadProject(threadId: string) {
  const flavor = useAppSelector((s) => selectThreadPickerOption(threadId)(s));
  const projectId = useAppSelector((s) =>
    selectEffectiveThreadProjectId(threadId)(s),
  );
  const cached = useAppSelector((s) =>
    projectId ? selectProjectById(s, projectId) : undefined,
  );
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(flavor === "project" && !!projectId);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void getProject(projectId)
      .then((row) => {
        if (cancelled) return;
        setProject(row);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // Clear loading so a failed fetch can't wedge the tile in a forever
        // spinner — and surface the failure loudly.
        setLoading(false);
        reportWarRoomError("useThreadProject", err);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const applyPatch = (patch: Partial<Project>) => {
    setProject((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const displayProject: Project | null =
    project ??
    (cached
      ? {
          id: cached.id,
          name: cached.name,
          slug: cached.slug,
          description: cached.description ?? null,
          organizationId: cached.organization_id,
          isPersonal: cached.is_personal,
          status: "active",
          createdAt: cached.created_at ?? "",
          updatedAt: "",
        }
      : null);

  return {
    flavor,
    projectId,
    project: displayProject,
    loading: loading && !displayProject,
    isProjectThread: flavor === "project",
    applyPatch,
  };
}
