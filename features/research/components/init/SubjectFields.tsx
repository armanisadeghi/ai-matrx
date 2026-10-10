"use client";

/**
 * What the research is ABOUT: subject type + identifiers (website, social
 * handles). Written to rs_topic.subject_type / rs_topic.subject at creation;
 * the server's social capture lane and voice stage read them
 * (aidream research/subject.py). Shape + URL params: utils/subject.ts.
 */

import { SocialAccountField } from "@/features/marketing/social/components/SocialAccountInput";
import { isSocialPlatform } from "@/features/marketing/social/types";
import { useState } from "react";
import { Button, Field, Select } from "@ai-matrx/design-system/controls";
import {
  SOCIAL_PLATFORMS,
  SUBJECT_TYPES,
  type ResearchSubjectInput,
  type SubjectType,
} from "@/features/research/utils/subject";

export function SubjectFields({
  value,
  onChange,
}: {
  value: ResearchSubjectInput;
  onChange: (next: ResearchSubjectInput) => void;
}) {
  const typed = value.type !== "topic";
  // An empty form is compact: the three platforms people research most, plus any already filled in.
  const [showAll, setShowAll] = useState(false);
  const FIRST = 3;
  const visible = SOCIAL_PLATFORMS.filter(
    (p, i) => showAll || i < FIRST || Boolean(value.handles?.[p.value]?.trim()),
  );
  const hidden = SOCIAL_PLATFORMS.length - visible.length;
  const setHandle = (platform: string, handle: string) =>
    onChange({ ...value, handles: { ...(value.handles ?? {}), [platform]: handle } });

  return (
    <div className="space-y-3" data-testid="research-subject-fields">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-foreground shrink-0">
          Researching a
        </label>
        <Select<SubjectType>
          aria-label="Subject type"
          value={value.type}
          options={SUBJECT_TYPES}
          onValueChange={(type) => onChange({ ...value, type })}
        />
      </div>
      {typed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* ui-exception: a website domain is a raw value, not prose */}
          <Field
            aria-label="Website"
            placeholder="Website (example.com)"
            value={value.domain ?? ""}
            onChange={(e) => onChange({ ...value, domain: e.target.value })}
          />
          {visible.map((p) => (
            <div key={p.value} className="min-w-0">
              <SocialAccountField
                label={`${p.label} handle or link`}
                value={value.handles?.[p.value] ?? ""}
                onChange={(text) => setHandle(p.value, text)}
                contextPlatform={isSocialPlatform(p.value) ? p.value : null}
              />
            </div>
          ))}
          {hidden > 0 ? (
            <div className="sm:col-span-2">
              <Button variant="quiet" onClick={() => setShowAll(true)}>
                {hidden} more platforms
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
