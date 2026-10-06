/**
 * Every brand-scoped AI action on these screens names the brand's organization itself, so
 * `callApi` never stops to ask "Which organization is this for?" over the open dialog.
 */

jest.mock("@/lib/api/call-api", () => ({ callApi: jest.fn(() => ({})) }));
jest.mock("@/utils/supabase/webDb", () => ({ requireAuthenticatedSupabaseSession: jest.fn() }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import { evaluateSourceRequest, generateStoryAngles, ingestSourceRequests } from "../../api";
import { draftCrisisHolding, makePressClip, writePressHeadlines } from "../api";

const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const dispatch = (async () => ({})) as unknown as AppDispatch;
const intake = {} as Parameters<typeof draftCrisisHolding>[3]["intake"];

it.each([
  ["Make clip", () => makePressClip(dispatch, "site", ORG, { url: "https://e.com/a", client_name: "ERI" })],
  ["Headlines", () => writePressHeadlines(dispatch, "site", ORG, { formats: ["news"] })],
  ["Crisis holding", () => draftCrisisHolding(dispatch, "site", ORG, { intake, counsel_review_mode: false })],
  ["Find stories", () => generateStoryAngles(dispatch, "site", ORG)],
  ["Add requests", () => ingestSourceRequests(dispatch, "digest", ORG)],
  ["Score request", () => evaluateSourceRequest(dispatch, "req", ORG)],
])("%s passes the brand's organization explicitly", async (_name, act) => {
  (callApi as jest.Mock).mockClear();
  await act().catch(() => undefined);
  expect(callApi).toHaveBeenCalledWith(expect.objectContaining({ scopeOverrides: { organization_id: ORG } }));
});
