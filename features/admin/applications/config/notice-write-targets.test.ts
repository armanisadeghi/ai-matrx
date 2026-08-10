/**
 * `app_notice` writes a broadcast every installed client shows once. The
 * failures these tests exist to prevent are the loud ones: a half-authored
 * notice reaching the save payload, an invented severity level, a non-https
 * URL shipped to the fleet, and — the quiet one — dropping the forward-compat
 * `extras` keys the schema promises to round-trip.
 */

import { buildNoticeDraftWrite } from "@/features/admin/applications/config/notice-write-targets";
import {
  EMPTY_NOTICE_DRAFT,
  NOTICE_LEVELS,
  type NoticeDraft,
} from "@/features/admin/applications/config/schema";

const CURRENT: NoticeDraft = {
  ...EMPTY_NOTICE_DRAFT,
  enabled: false,
  level: "info",
  title: "Old title",
  body: "Old body",
  url: "https://old.example.com",
  extras: { experimental_key: { keep: true } },
};

const VALID = {
  level: "warning",
  title: "Scheduled maintenance",
  body: "Matrx will be unavailable Saturday 02:00–04:00 UTC.",
};

describe("buildNoticeDraftWrite", () => {
  it("replaces the notice and enables it", () => {
    const next = buildNoticeDraftWrite(CURRENT, VALID);
    expect(next.enabled).toBe(true);
    expect(next.level).toBe("warning");
    expect(next.title).toBe("Scheduled maintenance");
    expect(next.body).toBe(VALID.body);
  });

  it("clears the url when it is omitted (replace, not merge)", () => {
    const next = buildNoticeDraftWrite(CURRENT, VALID);
    expect(next.url).toBe("");
  });

  it("preserves forward-compat extras from the stored notice", () => {
    const next = buildNoticeDraftWrite(CURRENT, VALID);
    expect(next.extras).toEqual({ experimental_key: { keep: true } });
  });

  it("accepts and trims an https url", () => {
    const next = buildNoticeDraftWrite(CURRENT, {
      ...VALID,
      url: "  https://status.example.com/incident  ",
    });
    expect(next.url).toBe("https://status.example.com/incident");
  });

  it("accepts every level in the real vocabulary", () => {
    for (const level of NOTICE_LEVELS) {
      expect(buildNoticeDraftWrite(CURRENT, { ...VALID, level }).level).toBe(
        level,
      );
    }
  });

  it.each([
    ["a non-object value", "just a string"],
    ["an array value", [{ ...VALID }]],
    ["null", null],
  ])("throws on %s", (_label, value) => {
    expect(() => buildNoticeDraftWrite(CURRENT, value)).toThrow(
      /expects an object value/,
    );
  });

  it("throws on an unknown field rather than coercing it away", () => {
    expect(() =>
      buildNoticeDraftWrite(CURRENT, { ...VALID, serverity: "high" }),
    ).toThrow(/unknown field\(s\) serverity/);
  });

  it("throws on a level outside the vocabulary, naming the real options", () => {
    expect(() =>
      buildNoticeDraftWrite(CURRENT, { ...VALID, level: "urgent" }),
    ).toThrow(/must be one of info \| warning \| critical/);
  });

  it.each(["title", "body"] as const)("throws on a missing %s", (key) => {
    const value: Record<string, unknown> = { ...VALID };
    delete value[key];
    expect(() => buildNoticeDraftWrite(CURRENT, value)).toThrow(
      new RegExp(`${key} is required`),
    );
  });

  it.each(["title", "body"] as const)(
    "throws on a whitespace-only %s",
    (key) => {
      expect(() =>
        buildNoticeDraftWrite(CURRENT, { ...VALID, [key]: "   " }),
      ).toThrow(new RegExp(`${key} must not be empty`));
    },
  );

  it("throws on a non-https url", () => {
    expect(() =>
      buildNoticeDraftWrite(CURRENT, { ...VALID, url: "http://insecure.test" }),
    ).toThrow(/valid https:\/\/ URL/);
  });

  it("throws on a malformed url", () => {
    expect(() =>
      buildNoticeDraftWrite(CURRENT, { ...VALID, url: "not a url" }),
    ).toThrow(/valid https:\/\/ URL/);
  });
});
