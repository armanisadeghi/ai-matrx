// app/api/forms/[formId]/__tests__/the-visit-and-submit-routes.test.ts — lane TYPEFORM-2.
//
// THE VISIT ROUTE counts a public form's views honestly and no faster than the knob allows: one hit
// from `custom.form_visit_admit` (bucket = the server's forwarded address) before `custom.form_visit`,
// and 429 with nothing counted past it. THE SUBMIT ROUTE lifts the hidden fields and the visit key
// out of the answers — so they are never typed as Fields — and hands them to the door as the two
// reserved keys, with the honeypot taken out by name.

jest.mock("server-only", () => ({}));
jest.mock("next/server", () => ({
  NextResponse: {
    json: (value: unknown, init: { status?: number } = {}) => ({ status: init.status ?? 200, json: async () => value }),
  },
}));

const admitFormVisit = jest.fn();
const markFormVisit = jest.fn();
const publicForm = jest.fn();
const submitPublicForm = jest.fn();
jest.mock("@/features/forms/service", () => ({
  admitFormVisit: (...a: unknown[]) => admitFormVisit(...a),
  markFormVisit: (...a: unknown[]) => markFormVisit(...a),
  publicForm: (...a: unknown[]) => publicForm(...a),
  submitPublicForm: (...a: unknown[]) => submitPublicForm(...a),
}));

import { POST as visit } from "../visit/route";
import { POST as submit } from "../submit/route";

const FORM_ID = "47209f01-8d15-421a-be1a-bd3de4578a18";
const params = { params: Promise.resolve({ formId: FORM_ID }) };
const VISIT = "k9Qm2LxP0aZt7vBnWc4R";
const request = (body: unknown, headers: Record<string, string> = {}) =>
  ({
    json: async () => body,
    headers: new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", ...headers }),
    url: `https://app.example.com/api/forms/${FORM_ID}/x`,
  }) as unknown as Request;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("the visit route", () => {
  it("takes one hit from the store's rate window under the forwarded address, then counts", async () => {
    admitFormVisit.mockResolvedValue(true);
    markFormVisit.mockResolvedValue("counted");
    const res = (await visit(request({ visit: VISIT, event: "view" }), params)) as unknown as { status: number; json(): Promise<unknown> };
    expect(res.status).toBe(200);
    expect(admitFormVisit).toHaveBeenCalledWith(FORM_ID, "203.0.113.7");
    expect(markFormVisit).toHaveBeenCalledWith({ formId: FORM_ID, visit: VISIT, event: "view", field: null });
  });

  it("refuses with 429 past the knob, and counts nothing", async () => {
    admitFormVisit.mockResolvedValue(false);
    const res = (await visit(request({ visit: VISIT, event: "reach", field: "company" }), params)) as unknown as { status: number };
    expect(res.status).toBe(429);
    expect(markFormVisit).not.toHaveBeenCalled();
  });

  it("refuses a malformed visit key before touching the store", async () => {
    const res = (await visit(request({ visit: "short", event: "view" }), params)) as unknown as { status: number };
    expect(res.status).toBe(400);
    expect(admitFormVisit).not.toHaveBeenCalled();
  });
});

describe("the submit route", () => {
  it("lifts the hidden fields, the visit key and the honeypot out of the answers", async () => {
    publicForm.mockResolvedValue({
      form_id: FORM_ID,
      honeypot_key: "website_url_hp",
      fields: [{ id: "f1", key: "company", label: "Company", type: "text", config: {}, multi: false, required: true }],
    });
    submitPublicForm.mockResolvedValue({ state: "accepted", message: null, record_id: "r1", submission_id: "s1" });
    const res = (await submit(
      request(
        {
          values: {
            company: "Ironline Fitness",
            website_url_hp: "",
            _hidden: { utm_source: "instagram", ref: "spring" },
            _visit: VISIT,
          },
          clientKey: null,
        },
        { origin: "https://app.example.com" },
      ),
      params,
    )) as unknown as { status: number };
    expect(res.status).toBe(200);
    const sent = submitPublicForm.mock.calls[0]![0] as { values: Record<string, unknown>; honeypot: string | null; bucket: string };
    expect(sent.values).toEqual({ company: "Ironline Fitness", _hidden: { utm_source: "instagram", ref: "spring" }, _visit: VISIT });
    expect(sent.honeypot).toBe("");
    expect(sent.bucket).toBe("203.0.113.7");
  });

  it("sends no reserved keys when the link carried none", async () => {
    publicForm.mockResolvedValue({ form_id: FORM_ID, honeypot_key: null, fields: [{ id: "f1", key: "company", label: "Company", type: "text", config: {}, multi: false }] });
    submitPublicForm.mockResolvedValue({ state: "accepted", message: null, record_id: "r1", submission_id: "s1" });
    await submit(request({ values: { company: "Ironline Fitness" } }), params);
    const sent = submitPublicForm.mock.calls[0]![0] as { values: Record<string, unknown> };
    expect(Object.keys(sent.values)).toEqual(["company"]);
  });
});
