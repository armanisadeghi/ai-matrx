"use client";

// features/admin/relationships/components/EntityRelationshipOrbitPageBody.tsx
//
// Client wrapper around EntityRelationshipOrbit for the [token] route body —
// the core component takes onSelectToken as an in-place re-center callback
// (used by EntityRelationshipOrbitWindow), but on the actual route a neighbor
// click has to navigate to that token's own page instead.

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { EntityRelationshipOrbit } from "./EntityRelationshipOrbit";
import type { RelationshipRule } from "../types";

interface Props {
  token: string;
  rules: RelationshipRule[];
}

export function EntityRelationshipOrbitPageBody({ token, rules }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <EntityRelationshipOrbit
      token={token}
      rules={rules}
      onSelectToken={(next) =>
        startTransition(() =>
          router.push(`/administration/relationships/explorer/${next}`),
        )
      }
    />
  );
}
