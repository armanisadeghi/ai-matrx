// features/education/classes/hooks/useClassAssignments.ts
//
// The class ASSIGNMENTS surface data + owner controls. Reads edu_class_assignments
// (owner or active member — the membership-gated RPC, NOT assoc_for_entity, so an
// enrolled student in the teacher's org can read them despite having no org
// access). Titles + routes come from the SAME useEntityTitles + education
// entityRoutes map the class content hub uses (never a parallel resolver). Every
// mutation is an owner-gated edu_class_* RPC — the client isOwner is not the boundary.

"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import { educationEntityRoute } from "@/features/education/data/entityRoutes";
import type { LucideIcon } from "lucide-react";
import {
  getClassAssignments,
  assignResource,
  unassignResource,
} from "../service";
import type { AssignableToken, ClassAssignment } from "../types";

/** An assignment enriched with its resolved title, route, icon, and group. */
export interface ClassAssignmentItem extends ClassAssignment {
  title: string;
  href: string | null;
  Icon: LucideIcon;
  group: string;
}

export interface UseClassAssignmentsReturn {
  assignments: ClassAssignmentItem[];
  loading: boolean;
  error: string | null;
  acting: boolean;
  refresh: () => Promise<void>;
  assign: (
    token: AssignableToken,
    resourceId: string,
    dueDate?: string | null,
    title?: string,
  ) => Promise<{ ok: boolean }>;
  unassign: (token: string, resourceId: string) => Promise<{ ok: boolean }>;
  setDueDate: (
    token: AssignableToken,
    resourceId: string,
    dueDate: string | null,
  ) => Promise<void>;
  /** Keys `${token}:${id}` of already-assigned resources (for the picker). */
  assignedKeys: Set<string>;
}

export function useClassAssignments(
  classId: string | null,
  enabled = true,
): UseClassAssignmentsReturn {
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!classId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      setAssignments(await getClassAssignments(classId));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load assignments.",
      );
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [classId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { titleFor, loading: titlesLoading } = useEntityTitles(
    assignments.map((a) => ({ token: a.token, id: a.resourceId })),
  );

  const items: ClassAssignmentItem[] = assignments.map((a) => {
    const route = educationEntityRoute(a.token);
    return {
      ...a,
      title: titleFor({ token: a.token, id: a.resourceId }),
      href: route.href(a.resourceId),
      Icon: route.Icon,
      group: route.group,
    };
  });

  const act = useCallback(
    async (fn: () => Promise<void>, okMsg: string): Promise<{ ok: boolean }> => {
      setActing(true);
      try {
        await fn();
        await refresh();
        toast.success(okMsg);
        return { ok: true };
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong.");
        return { ok: false };
      } finally {
        setActing(false);
      }
    },
    [refresh],
  );

  const assign = useCallback<UseClassAssignmentsReturn["assign"]>(
    (token, resourceId, dueDate) => {
      if (!classId) return Promise.resolve({ ok: false });
      return act(
        () => assignResource(classId, token, resourceId, dueDate),
        "Assigned to the class.",
      );
    },
    [classId, act],
  );

  const unassign = useCallback<UseClassAssignmentsReturn["unassign"]>(
    (token, resourceId) => {
      if (!classId) return Promise.resolve({ ok: false });
      return act(
        () => unassignResource(classId, token, resourceId),
        "Assignment removed.",
      );
    },
    [classId, act],
  );

  const setDueDate = useCallback<UseClassAssignmentsReturn["setDueDate"]>(
    async (token, resourceId, dueDate) => {
      if (!classId) return;
      // Re-assigning with a new due date preserves assigned_at server-side.
      await act(
        () => assignResource(classId, token, resourceId, dueDate),
        dueDate ? "Due date updated." : "Due date cleared.",
      );
    },
    [classId, act],
  );

  const assignedKeys = new Set(
    assignments.map((a) => `${a.token}:${a.resourceId}`),
  );

  return {
    assignments: items,
    loading: loading || titlesLoading,
    error,
    acting,
    refresh,
    assign,
    unassign,
    setDueDate,
    assignedKeys,
  };
}
