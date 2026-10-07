"use client";

// features/esign/templates/TemplatesPage.tsx — /esign/templates: every template I can use.

import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import { Button as ControlButton } from "@ai-matrx/design-system/controls";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAccessToken, selectAuthReady, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { templateListConfig } from "./listConfig";

export function TemplatesPage() {
  const ready = useAppSelector(selectAuthReady) && !!useAppSelector(selectUserId) && !!useAppSelector(selectAccessToken);
  const action = (
    <ControlButton variant="primary" asChild icon={<LayoutTemplate className="h-4 w-4" />} collapse="container">
      <Link href="/esign/templates/new">New template</Link>
    </ControlButton>
  );
  return (
    <>
      <RecordPageHeader backHref="/esign" parents={[{ label: "E-Signatures", href: "/esign" }]} record={{ name: "Templates" }} />
      {ready ? (
        <EntityListPage config={templateListConfig} headerActions={action} emptyAction={action} />
      ) : (
        <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground" role="status">
          Loading your templates…
        </div>
      )}
    </>
  );
}
