import { addUtmSource, stripOwnUtmSource } from "../url-utm";

test("copy gets the link its author wrote — our utm_source is removed, theirs kept", () => {
  expect(stripOwnUtmSource(addUtmSource("https://maps.test/alton"))).toBe("https://maps.test/alton");
  expect(stripOwnUtmSource(addUtmSource("https://x.test/a?b=1"))).toBe("https://x.test/a?b=1");
  expect(stripOwnUtmSource("https://x.test/?utm_source=newsletter")).toBe("https://x.test/?utm_source=newsletter");
  expect(stripOwnUtmSource("https://x.test")).toBe("https://x.test");
});
