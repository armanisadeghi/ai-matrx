"use client";

/**
 * Platform default word rules — the 80/20 rule set every new site starts from.
 * Its own page because the list runs long and the job is different from
 * "set the baseline number" (that is seo-value-settings).
 */

import { DefaultRulesEditor } from "@/features/marketing/seo/value-system/settings/DefaultRulesEditor";

export default function SeoDefaultRulesPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] overflow-y-auto p-4">
      <div className="mx-auto max-w-5xl">
        <DefaultRulesEditor />
      </div>
    </div>
  );
}
