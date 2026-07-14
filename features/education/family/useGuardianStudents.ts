"use client";

// features/education/family/useGuardianStudents.ts
//
// Loads every guardian link the current user participates in (via
// familyService.listLinks → the guardian_list_links RPC) and buckets them into
// the three dashboard sections: students I can view, requests I sent (pending),
// and my consent inbox (pending requests awaiting MY approval). Also exposes the
// consent mutations, each reloading the list on success.
//
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { familyService } from "./familyService";
import type { GuardianLinkBuckets, GuardianLinkView } from "./types";

function bucket(links: GuardianLinkView[]): GuardianLinkBuckets {
  const students: GuardianLinkView[] = [];
  const sent: GuardianLinkView[] = [];
  const inbox: GuardianLinkView[] = [];
  for (const l of links) {
    if (l.role === "guardian") {
      if (l.status === "active") students.push(l);
      else if (l.status === "pending") sent.push(l);
    } else if (l.role === "student" && l.status === "pending") {
      inbox.push(l);
    }
  }
  return { students, sent, inbox };
}

export interface UseGuardianStudentsResult {
  buckets: GuardianLinkBuckets;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useGuardianStudents(): UseGuardianStudentsResult {
  const [buckets, setBuckets] = useState<GuardianLinkBuckets>({
    students: [],
    sent: [],
    inbox: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const res = await familyService.listLinks();
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setBuckets(bucket(res.data ?? []));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return {
    buckets,
    loading,
    error,
    reload: () => setNonce((n) => n + 1),
  };
}
