// features/crm/gmail/the-client-writes-no-sent-record.test.ts
//
// 🚨 ONE WRITER FOR A SENT GMAIL MESSAGE, AND IT IS THE SERVER.
//
// Until 2026-09-17 the browser wrote the `crm.interaction` row itself and then
// wrote its `platform.associations` edges, while `POST /gmail/send-reviewed`
// asked nothing at all: no eligibility, no blocklist, no `crm.sending_event`. So
// any caller that was not this browser — a script, a future tool, a replayed
// approval — mailed people who had unsubscribed, and because no sending event
// existed, a bounce or a complaint could never be correlated back to the message
// (`/projects/google-native/VERIFY-B1-B2-R4.md` V4, amendment A8). The gate and
// the record moved to the outbound spine, which is the same authority the
// campaign path asks.
//
// TWO WRITERS WOULD BE THE DEFECT COMING BACK: the same send would land on the
// timeline twice, or land twice with different facts. So this proves the browser
// writes NOTHING on a send — behaviourally (the real transport, with the HTTP
// call stubbed, touching no Supabase client) and as a CENSUS over the feature's
// own source, because a future edit could add a write this behavioural test does
// not happen to run through.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const GMAIL_DIR = __dirname;

/** Our own CRM organization — a real uuid, because the kernel validates one. */
const ORGANIZATION_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

/** Every write door the browser HAS. Touching any of them here is the defect. */
const supabaseCalls: string[] = [];
const associationCalls: string[] = [];

jest.mock("@/utils/supabase/client", () => {
  const trap = (path: string): unknown =>
    new Proxy(() => undefined, {
      get: (_target, key) => trap(`${path}.${String(key)}`),
      apply: () => {
        supabaseCalls.push(path);
        return trap(`${path}()`);
      },
    });
  return { supabase: trap("supabase"), createClient: trap("createClient") };
});
jest.mock("@/features/scopes/host/associationsStore", () => ({
  getAssociationsStore: () => ({
    add: (...args: unknown[]) => {
      associationCalls.push(JSON.stringify(args));
      return Promise.resolve({ ok: true });
    },
  }),
}));

/** The HTTP call, stubbed: this test is about what ELSE the send touches. */
const posted: { path: string; body: Record<string, unknown> }[] = [];
jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: (path: string, body: Record<string, unknown>) => {
    posted.push({ path, body });
    return Promise.resolve({
      json: () =>
        Promise.resolve({
          message_id: "gmail-1",
          to: "ada@example.com",
          cc: [],
          interaction_id: "interaction-1",
          record_failure: null,
          associations_written: ["party:party-1"],
          association_failures: [],
          sending_event_id: "event-1",
          sending_event_gap: null,
          compliance: { envelope: false, footer_appended: false, reason: "1:1." },
          warnings: [],
          audit_columns_written: ["approved_by", "approved_at"],
        }),
    } as unknown as Response);
  },
}));

// eslint-disable-next-line import/first -- after the mocks above
import { sendReviewedGmail } from "@/features/google-workspace/service";

describe("a reviewed send writes nothing from the browser", () => {
  beforeEach(() => {
    supabaseCalls.length = 0;
    associationCalls.length = 0;
    posted.length = 0;
  });

  it("posts the record context and touches no Supabase client and no association store", async () => {
    const outcome = await sendReviewedGmail({
      connectionId: "conn-1",
      to: "Ada <ada@example.com>",
      cc: [],
      subject: "Following up",
      body: "As promised.",
      context: {
        // A real uuid: the fail-closed organization kernel validates the shape,
        // so "org-1" would be refused before any networking (which is the point
        // of it — see `lib/api/organization-context.ts`).
        organizationId: ORGANIZATION_ID,
        partyId: "party-1",
        dealId: "deal-1",
        projectId: "project-1",
        contactPointId: "point-1",
        mediumId: "medium-1",
        ccAttribution: [],
        draftedBy: {
          agentId: "agent-1",
          runId: "run-1",
          label: "the follow-up writer",
          assistId: "assist-1",
        },
      },
    });
    // 🚨 NO ROW AND NO EDGE FROM HERE. Either list being non-empty is the second
    // writer, back again.
    expect(supabaseCalls).toEqual([]);
    expect(associationCalls).toEqual([]);
    // The record context went ON THE REQUEST, which is what the server writes from.
    expect(posted).toHaveLength(1);
    expect(posted[0]!.body).toMatchObject({
      organization_id: ORGANIZATION_ID,
      party_id: "party-1",
      deal_id: "deal-1",
      project_id: "project-1",
      contact_point_id: "point-1",
      medium_id: "medium-1",
      drafted_by_agent_id: "agent-1",
      drafted_by_run_id: "run-1",
      drafted_by_label: "the follow-up writer",
      approval_assist_id: "assist-1",
      user_confirmed: true,
    });
    // 🚨 WHO APPROVED IT IS NEVER CLAIMED BY THE CLIENT — the server stamps the
    // authenticated caller, and its model does not accept the field.
    expect(Object.keys(posted[0]!.body)).not.toContain("approved_by");
    // And the row the server wrote is what comes back.
    expect(outcome.interactionId).toBe("interaction-1");
    expect(outcome.sendingEventId).toBe("event-1");
  });
});

describe("CENSUS: nothing in features/crm/gmail can write a sent record", () => {
  const sources = readdirSync(GMAIL_DIR).filter(
    (name) => name.endsWith(".ts") || name.endsWith(".tsx"),
  );

  it("has sources to measure", () => {
    expect(sources.length).toBeGreaterThan(8);
  });

  it("no module imports the Supabase client or the association store", () => {
    const offenders: string[] = [];
    for (const name of sources) {
      // A reader's own test may mock them (this file does) — the ban is on the
      // shipped modules.
      if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
      const source = readFileSync(join(GMAIL_DIR, name), "utf8");
      if (/from "@\/utils\/supabase\/client"/.test(source)) offenders.push(name);
      if (/from "@\/features\/scopes\/host\/associationsStore"/.test(source)) {
        // `GmailSentRecordDetails` may READ associations to show the edges; only
        // a write (`.add(`) is the defect.
        if (/getAssociationsStore\(\)\s*\.\s*add\s*\(/.test(source)) {
          offenders.push(name);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no module inserts into crm.interaction", () => {
    const offenders: string[] = [];
    for (const name of sources) {
      const source = readFileSync(join(GMAIL_DIR, name), "utf8");
      if (/\.from\(\s*"interaction"\s*\)/.test(source)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  it("the deleted writers have not come back", () => {
    // `service.ts` (`recordGmailSendInteraction`, `gmailInteractionRow`,
    // `sendMetadata`, `gmailWriteRefusalSentence`, `narrowGmailSendReceipt`) and
    // `associations.ts` (`recordGmailSendAssociations`) are GONE — not shimmed,
    // not deprecated (no legacy, pre-launch). A file back under either name is
    // the second writer returning under its old address.
    expect(existsSync(join(GMAIL_DIR, "service.ts"))).toBe(false);
    expect(existsSync(join(GMAIL_DIR, "associations.ts"))).toBe(false);
  });
});
