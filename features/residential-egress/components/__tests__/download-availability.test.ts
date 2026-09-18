/**
 * The download buttons appear ONLY when there is something to download.
 *
 * This is the guard for a live defect: the page linked three installers at a
 * release tag whose packaging workflow had never run, so every button was a
 * 404 handed to a non-technical person. There is no trustworthy reachability
 * test from a browser, so the knob is the switch — blank means "not published
 * yet" — and this test is what keeps "blank" from ever resolving to a button
 * again.
 *
 * It fails on the code as it was written (the old resolver returned a URL for
 * `""` only after passing it through a regex it could not satisfy — and, more
 * to the point, returned a user-facing sentence naming the setting key).
 */

import {
  HELPER_NOT_PUBLISHED_SENTENCE,
  resolveDownloadBaseUrl,
} from "../ConnectComputerPage";
import { HELPER_DOWNLOAD_BASE_URL_KNOB } from "../../types";

function knob(effective_value: unknown, origin = "platform") {
  return [{ key: HELPER_DOWNLOAD_BASE_URL_KNOB, origin, effective_value }];
}

describe("resolveDownloadBaseUrl", () => {
  it("publishes nothing when the knob is blank", () => {
    expect(resolveDownloadBaseUrl(knob(""))).toEqual({ published: false });
    expect(resolveDownloadBaseUrl(knob("   "))).toEqual({ published: false });
  });

  it("publishes nothing when the knob row is absent or missing", () => {
    expect(resolveDownloadBaseUrl([])).toEqual({ published: false });
    expect(resolveDownloadBaseUrl(knob("https://x.test", "missing"))).toEqual({
      published: false,
    });
  });

  it("publishes nothing for a value that is not a web address", () => {
    expect(resolveDownloadBaseUrl(knob("egress-latest"))).toEqual({
      published: false,
    });
    expect(resolveDownloadBaseUrl(knob(null))).toEqual({ published: false });
    expect(resolveDownloadBaseUrl(knob(42))).toEqual({ published: false });
  });

  it("publishes the base URL, trailing slashes trimmed, when one is set", () => {
    expect(
      resolveDownloadBaseUrl(
        knob("https://github.com/example/releases/download/egress-latest//"),
      ),
    ).toEqual({
      published: true,
      baseUrl: "https://github.com/example/releases/download/egress-latest",
    });
  });

  it("says the not-published sentence in words a person can act on", () => {
    // No setting key, no table, no route, and none of the four banned words.
    expect(HELPER_NOT_PUBLISHED_SENTENCE).not.toMatch(
      /proxy|egress|residential|\bIP\b|knob|helper_download|platform\./i,
    );
    expect(HELPER_NOT_PUBLISHED_SENTENCE).toContain("not published yet");
  });
});
