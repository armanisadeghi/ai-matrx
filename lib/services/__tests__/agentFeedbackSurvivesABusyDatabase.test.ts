/**
 * @jest-environment node
 *
 * THE RED TWIN for the report crew C lost twice on 2026-09-20.
 *
 * This suite fails on the tree as it stood before `withTransientRetry` reached
 * `agent-feedback.service.ts`: `resolveAgentUserId` threw on the first `57014`
 * and `submitFeedback` returned `agent feedback cannot be attributed: …
 * canceling statement due to statement timeout [57014]`, with the caller's
 * description discarded. It passes after.
 *
 * WHAT IS FAKED AND WHAT IS NOT. Only the Supabase leaf — a stub that answers
 * exactly what PostgREST answers, including the verbatim error crew C saw. The
 * service's real code decides whether to ask again, what to attribute the row
 * to, and what to tell the caller; none of that is stubbed, because all of it
 * is what the defect turned on.
 *
 * THE USE CASE (owner's law: never fake test data). Crew C is entering a real
 * itinerary for a US National Parks trip — Zion, Bryce Canyon and Capitol Reef
 * over eight days — through the live system, and files the limitations it hits
 * as it goes. The report below is the shape of the one it actually lost.
 */

const STATEMENT_TIMEOUT = {
  code: "57014",
  message: "canceling statement due to statement timeout",
  details: null,
  hint: null,
};

const AGENT_ACCOUNT_ID = "9b1c2d3e-4f50-4a61-8b72-0c3d4e5f6a7b";
const SYSTEM_ORG_ID = "1f2e3d4c-5b6a-4978-8697-a5b4c3d2e1f0";

const CREW_REPORT = {
  feedback_type: "bug" as const,
  description:
    "Eight-day Zion / Bryce Canyon / Capitol Reef itinerary: the day-by-day " +
    "table accepted the drive legs but dropped the trailhead permit column on save.",
  route: "the itinerary table on the trip record",
  priority: "high" as const,
};

/** How many times the service asked for the service account. */
let lookupCalls = 0;
/** The row the service tried to insert, exactly as it built it. */
let insertedRow: Record<string, unknown> | null = null;

function makeStubClient() {
  const singleRow = (row: unknown) => ({
    data: row,
    error: null,
  });

  return {
    // `public.lookup_user_by_email` — busy the FIRST time, fine the second.
    rpc: async (fn: string) => {
      if (fn !== "lookup_user_by_email") {
        throw new Error(`stub client got an unexpected rpc: ${fn}`);
      }
      lookupCalls++;
      if (lookupCalls === 1) return { data: null, error: STATEMENT_TIMEOUT };
      return { data: [{ user_id: AGENT_ACCOUNT_ID }], error: null };
    },
    schema: (name: string) => {
      if (name === "iam") {
        return {
          from: () => ({
            select: () => ({
              eq: () => ({
                single: async () =>
                  singleRow({ organization_id: SYSTEM_ORG_ID }),
              }),
            }),
          }),
        };
      }
      if (name === "users") {
        return {
          from: (table: string) => {
            if (table === "profiles") {
              return {
                select: () => ({
                  eq: () => ({ maybeSingle: async () => singleRow(null) }),
                }),
              };
            }
            return {
              insert: (row: Record<string, unknown>) => {
                insertedRow = row;
                return {
                  select: () => ({
                    single: async () =>
                      singleRow({
                        // The nullable columns a real `users.user_feedback`
                        // row carries; the mapper refuses a row without them,
                        // and a stub that skips them is not the real shape.
                        id: "aa11bb22-cc33-4d44-8e55-f66077889900",
                        created_at: "2026-09-20T22:00:00.000Z",
                        updated_at: "2026-09-20T22:00:00.000Z",
                        resolved_at: null,
                        resolved_by: null,
                        user_confirmed_at: null,
                        parent_id: null,
                        category_id: null,
                        assigned_to: null,
                        admin_notes: null,
                        admin_direction: null,
                        admin_decision: "pending",
                        ai_assessment: null,
                        ai_solution_proposal: null,
                        ai_suggested_priority: null,
                        ai_complexity: null,
                        ai_estimated_files: null,
                        autonomy_score: null,
                        resolution_notes: null,
                        work_priority: null,
                        testing_instructions: null,
                        testing_url: null,
                        testing_result: null,
                        has_open_issues: false,
                        image_file_ids: [],
                        ...row,
                      }),
                  }),
                };
              },
            };
          },
        };
      }
      throw new Error(`stub client got an unexpected schema: ${name}`);
    },
  };
}

jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: () => makeStubClient(),
}));

describe("an agent's report survives a database that is busy for one moment", () => {
  beforeEach(() => {
    lookupCalls = 0;
    insertedRow = null;
    jest.resetModules();
  });

  it("files crew C's limitation after a 57014, instead of destroying it", async () => {
    const { submitFeedback } = await import("../agent-feedback.service");

    const result = await submitFeedback(undefined, "crew C", CREW_REPORT);

    // THE CLAIM: before the fix this was `{ success: false, error: "agent
    // feedback cannot be attributed: … [57014]" }` and the description was gone.
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    // It asked twice — the first answer was "not right now", not "no".
    expect(lookupCalls).toBe(2);

    // The report that landed is the one the crew wrote, attributed to the
    // service account, homed to the platform organization.
    expect(insertedRow).not.toBeNull();
    expect(insertedRow!.description).toBe(CREW_REPORT.description);
    expect(insertedRow!.user_id).toBe(AGENT_ACCOUNT_ID);
    expect(insertedRow!.organization_id).toBe(SYSTEM_ORG_ID);
    expect(insertedRow!.route).toBe(CREW_REPORT.route);
    expect(insertedRow!.priority).toBe("high");
  });
});
