/** The one-click offers do what they say, and are never offered when they cannot. */

const scheduleMember = jest.fn(async () => undefined);
const getTemplateById = jest.fn();
const updateTemplate = jest.fn(async () => ({}));
jest.mock("@/features/crm/outreach-lists/service", () => ({
  scheduleMember: (...a: unknown[]) => scheduleMember(...(a as [])),
}));
jest.mock("@/features/message-templates/services/message-templates-service", () => ({
  getTemplateById: (...a: unknown[]) => getTemplateById(...(a as [])),
  updateTemplate: (...a: unknown[]) => updateTemplate(...(a as [])),
}));

import {
  canPerformOutreachOffer,
  performOutreachOffer,
  stripTrackingPixels,
} from "../outreachOffers";
import type { AdvisoryOffer } from "../service";

const target = { memberId: "m1", templateId: "t1" };
const hold: AdvisoryOffer = { label: "Hold", action: "hold_until", detail: { until: "2026-10-01T12:00:00+00:00" } };

beforeEach(() => jest.clearAllMocks());

test("hold / schedule set the member's next attempt to the offered time", async () => {
  expect(canPerformOutreachOffer(target, hold)).toBe(true);
  await performOutreachOffer(target, hold);
  expect(scheduleMember).toHaveBeenCalledWith("m1", "2026-10-01T12:00:00+00:00");
});

test("an offer with nothing to act on is not offered as a button", () => {
  expect(canPerformOutreachOffer({ memberId: null, templateId: "t1" }, hold)).toBe(false);
  expect(canPerformOutreachOffer(target, { label: "x", action: "schedule_at", detail: {} })).toBe(false);
  expect(canPerformOutreachOffer(target, { label: "Flatten", action: "flatten_attachments" })).toBe(false);
});

test("strip removes a 1x1 beacon and saves the template", async () => {
  expect(stripTrackingPixels('Hi <img src="https://t.x/o.gif" width="1" height="1"> there')).toBe("Hi  there");
  getTemplateById.mockResolvedValue({ id: "t1", content: 'Hi <img src="https://t.x/o.gif" width="1" height="1">' });
  await performOutreachOffer(target, { label: "Strip the beacon", action: "strip_tracking" });
  expect(updateTemplate).toHaveBeenCalledWith({ id: "t1", content: "Hi " });
});

test("rewrite swaps the promise for the rewritten line, and says so when the line is not in the template", async () => {
  getTemplateById.mockResolvedValue({ id: "t1", content: "We guarantee coverage. Bye" });
  const offer: AdvisoryOffer = { label: "Use the rewritten line", action: "rewrite_line", detail: { original: "We guarantee coverage.", replacement: "Worth a look." } };
  await performOutreachOffer(target, offer);
  expect(updateTemplate).toHaveBeenCalledWith({ id: "t1", content: "Worth a look. Bye" });
  getTemplateById.mockResolvedValue({ id: "t1", content: "{{party.bio}}" });
  expect(await performOutreachOffer(target, offer)).toMatch(/merge field/);
});
