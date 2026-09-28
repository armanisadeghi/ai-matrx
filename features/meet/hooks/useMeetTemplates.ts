"use client";

// features/meet/hooks/useMeetTemplates.ts
//
// The person's meeting templates: their OWN (`meet.personal_templates`, user
// rung) and their ORGANIZATION's (`meet.templates`, organization rung — written
// only by those the knob's own write door says may: owners and admins). Read with
// `platform.knob_resolve`, written with `platform.knob_override_set` through the
// scoped-config service. Needs an active organization (a user rung lives inside
// one); without one there are no templates to show and nothing to save into.

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import {
  fetchKnobWriteDoor,
  knobRefusalSentence,
  setKnobOverride,
} from "@/lib/scoped-config/service";
import {
  parseTemplateList,
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

export function useMeetTemplates(
  organizationId: string | null,
  userId: string | null,
): MeetTemplates {
  const [lists, setLists] = useState<Record<TemplateScope, MeetingTemplate[]>>({
    organization: [],
    personal: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [mayWriteOrganization, setMayWriteOrganization] = useState(false);

  useEffect(() => {
    if (organizationId === null || userId === null) return undefined;
    let live = true;
    const read = (key: string, forUser: boolean) =>
      supabase
        .schema("platform")
        .rpc("knob_resolve", {
          p_feature: "meet",
          p_key: key,
          p_organization_id: organizationId,
          // The organization list is read WITHOUT the person, so a personal
          // override of the same key could never shadow it.
          p_user_id: (forUser ? userId : null) as string,
        })
        .then(({ data, error }) => (error ? [] : parseTemplateList(data)));
    void Promise.all([
      read(KEY.organization, false),
      read(KEY.personal, true),
    ]).then(([organization, personal]) => {
      if (!live) return;
      setLists({ organization, personal });
      setLoaded(true);
    });
    void fetchKnobWriteDoor({ fullKey: "meet.templates", organizationId })
      .then((door) => live && setMayWriteOrganization(door.mayWrite))
      .catch(() => live && setMayWriteOrganization(false));
    return () => {
      live = false;
    };
  }, [organizationId, userId]);

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
    setLists((current) => ({ ...current, [scope]: next }));
  };

  return {
    loaded,
    mayWriteOrganization,
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
