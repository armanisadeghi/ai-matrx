"use client";

/**
 * /administration/mandates/overrides-preview/[mandateKey] — the simple
 * Overrides tab on its own, at the system level, beside the untouched
 * workspace. The new mandate record page will mount `MandateOverridesSimple`
 * as a tab; this route exists so it can be seen and tested before then.
 */

import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import { useMandateWorkspaceData } from "@/features/mandates/workspace/useMandateWorkspaceData";
import { useMandateDisplayName } from "@/features/mandates/useMandateDisplayName";
import { Button } from "@/components/ui/button";
import {
  MANDATE_LIST_PREVIEW_HREF,
  mandateRecordPreviewHref,
} from "@/features/mandates/record-next/record-tabs";
import { MandateOverridesSimple } from "./MandateOverridesSimple";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function OverridesPreviewPage({ mandateKey }: { mandateKey: string }) {
  const { data, loading, error, failure, refresh } =
    useMandateWorkspaceData(mandateKey);
  const resolvedKey = data ? data.mandate.mandate_key : mandateKey;
  const name = useMandateDisplayName(resolvedKey, data?.mandate.label);
  // The new pages this one sits beside — the list preview and the record
  // preview — never the old ones.
  const mandateHref = mandateRecordPreviewHref(resolvedKey);

  return (
    <div className="h-full overflow-y-auto">
      <CrumbTrailHeader
        backHref={MANDATE_LIST_PREVIEW_HREF}
        trail={[
          { label: "Mandates", href: MANDATE_LIST_PREVIEW_HREF },
          { label: name, href: mandateHref },
          { label: "Overrides" },
        ]}
      />
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        {data ? (
          <MandateOverridesSimple
            data={data}
            level="system"
            onChanged={refresh}
          />
        ) : loading ? (
          <div className="space-y-1 rounded-lg border border-border p-2" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-muted/60" />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span
              className={
                failure && failure.kind !== "load-failed"
                  ? "text-muted-foreground"
                  : "text-destructive"
              }
            >
              {failure && failure.kind !== "load-failed"
                ? "Mandate not found"
                : (failure?.message ?? error ?? "This mandate could not be read.")}
              <ErrorAlchemyMenu error={failure?.message} />
            </span>
            {failure?.retryable ? (
              <Button size="sm" variant="outline" onClick={refresh}>
                Retry
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
