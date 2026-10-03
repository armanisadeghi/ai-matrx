"use client";

// features/meet/hooks/useMeetTemplates.ts
//
// The person's meeting templates: their OWN (`meet.personal_templates`, user
// rung) and their ORGANIZATION's (`meet.templates`, organization rung — written
// only by those the knob's own write door says may: owners and admins). Read with
// `platform.knob_resolve`, written with `platform.knob_override_set` through the
// scoped-config service. Needs an active organization (a user rung lives inside
// one); without one there are no templates to show and nothing to save into.
// The lists live in the store (meetingsSlice `templatesByKey`), read once per
// organization and person per tab.

import { useEffect } from "react";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { knobRefusalSentence, setKnobOverride } from "@/lib/scoped-config/service";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  loadMeetTemplates,
  meetTemplatesKey,
  meetTemplatesWritten,
  selectMeetTemplates,
} from "@/features/meet/redux/meetingsSlice";
import {
  withTemplate,
  withoutTemplate,
  type MeetingTemplate,
  type ScopedTemplate,
  type TemplateScope,
} from "@/features/meet/lib/meeting-template";

const KEY: Record<TemplateScope, string> = {
  organization: "templates",
  personal: "personal_templates",
};

export interface MeetTemplates {
  readonly loaded: boolean;
  readonly templates: readonly ScopedTemplate[];
  readonly mayWriteOrganization: boolean;
  save(template: MeetingTemplate, scope: TemplateScope): Promise<void>;
  remove(template: ScopedTemplate): Promise<void>;
}

const NO_TEMPLATES: MeetingTemplate[] = [];

export function useMeetTemplates(
  organizationId: string | null,
  userId: string | null,
): MeetTemplates {
  const dispatch = useAppDispatch();
  // Read once per organization and person per tab (meetingsSlice): a woken or
  // remounted meeting home renders the store.
  const key = organizationId !== null && userId !== null ? meetTemplatesKey(organizationId, userId) : null;
  const entry = useAppSelector((state) => (key ? selectMeetTemplates(state, key) : undefined));

  useEffect(() => {
    if (organizationId === null || userId === null) return;
    void dispatch(loadMeetTemplates({ organizationId, userId }));
  }, [dispatch, organizationId, userId]);

  const lists: Record<TemplateScope, MeetingTemplate[]> = {
    organization: entry?.organization ?? NO_TEMPLATES,
    personal: entry?.personal ?? NO_TEMPLATES,
  };

  const write = async (scope: TemplateScope, next: MeetingTemplate[]) => {
    if (userId === null) throw new Error("Sign in to save templates.");
    // Held until an organization is known — boot's answer first, then the
    // person is asked; never picked for them.
    const orgId = organizationId ?? (await ensureOrgId(null));
    const result = await setKnobOverride({
      feature: "meet",
      key: KEY[scope],
      scopeKind: scope === "personal" ? "user" : "organization",
      scopeId: scope === "personal" ? userId : orgId,
      organizationId: orgId,
      value: next,
    });
    if (!result.ok) throw new Error(knobRefusalSentence(result));
    dispatch(meetTemplatesWritten({ key: meetTemplatesKey(orgId, userId), scope, templates: next }));
  };

  return {
    loaded: entry?.loaded ?? false,
    mayWriteOrganization: entry?.mayWriteOrganization ?? false,
    templates: [
      ...lists.personal.map((t) => ({ ...t, scope: "personal" as const })),
      ...lists.organization.map((t) => ({
        ...t,
        scope: "organization" as const,
      })),
    ],
    save: (template, scope) =>
      write(scope, withTemplate(lists[scope], template)),
    remove: (template) =>
      write(
        template.scope,
        withoutTemplate(lists[template.scope], template.id),
      ),
  };
}
