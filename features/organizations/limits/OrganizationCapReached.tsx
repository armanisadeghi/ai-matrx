"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Button, EmptyState } from "@ai-matrx/design-system/controls";

/** What every create-organization door shows instead of its form at the cap. */
export function OrganizationCapReached({
  count,
  cap,
  onNavigate,
}: {
  count: number;
  cap: number;
  onNavigate?: () => void;
}) {
  return (
    <EmptyState
      icon={<Building2 />}
      title="Organization limit reached"
      line={`In ${count} of ${cap} allowed. Leave or archive one.`}
      action={
        <Button variant="outline" asChild onClick={onNavigate}>
          <Link href="/organizations">Manage organizations</Link>
        </Button>
      }
    />
  );
}
