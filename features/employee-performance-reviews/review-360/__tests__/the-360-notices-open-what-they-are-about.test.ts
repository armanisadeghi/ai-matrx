// Lane HR-360-2 (2026-10-08) — a 360 notice carries a subject and a link.
// Red before: the notify steps carried only text, so the in-app subject was the generic "A table you follow
// changed", the email subject was the automation's name, and deep_link was empty.
import { NOTICE_SUBJECT, RESPOND_LINK, provisionReview360 } from "../service";

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

const declared: unknown[] = [];
jest.mock("@ai-matrx/records/typed-table", () => {
  const actual = jest.requireActual("@ai-matrx/records/typed-table");
  return {
    ...actual,
    ensureTypedTable: async () => ({ ok: true, data: { table: "t1" } }),
    ensureAppAutomations: async (_c: unknown, _d: unknown, specs: unknown[]) => {
      declared.push(...specs);
      return { ok: true, data: [] };
    },
    confidentialGate: async () => ({ ok: true, data: "t1" }),
  };
});

it("the respondent's notice opens her half, and the HR notice opens the review", async () => {
  const client = {
    config: { organizationId: "o1" },
    workHasAssignment: async () => ({ ok: true, data: true }),
    automations: async () => ({ ok: true, data: { automations: [] } }),
    tableFind: async () => ({ ok: true, data: { id: "t1", level: "confidential", maker_is_reader: true, readers: [] } }),
  };
  await provisionReview360(client as never, "o1", (async () => ({ ok: true })) as never).catch(() => undefined);
  const notify = (declared as Array<{ actions: Array<{ do: string; subject?: string; link?: string }> }>).flatMap((s) => s.actions).filter((a) => a.do === "notify");
  const respondent = notify.find((a) => a.subject === NOTICE_SUBJECT.respondent);
  const hr = notify.find((a) => a.subject === NOTICE_SUBJECT.hr);
  expect(respondent?.link).toBe(RESPOND_LINK);
  expect(RESPOND_LINK).toBe("/hr/performance/respond/{{record_id}}?org={{organization_id}}");
  expect(hr?.link).toBe("{{review_link}}");
});
