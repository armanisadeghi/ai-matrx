/**
 * The indexed switch's path rules (access ladder T-12). These decide which responses the proxy
 * stamps `X-Robots-Tag` on, so a wrong answer is either an Anyone-link page a crawler may list
 * or a published record the switch silently stops governing.
 */
import {
  isNeverIndexedPath,
  recordCandidatesForPath,
  robotsFor,
} from "../search-engine-indexed";

describe("isNeverIndexedPath — Anyone-link and secure-link pages", () => {
  it.each([
    "/s/8186b2df3a6943ceab439c2ebf6cb95a",
    "/secure/abc",
    "/open/chat/7dd4b164-dd5d-44ba-a97e-8c581cfb28fc",
    "/r/tok",
    "/q/tok",
    "/sign/tok",
    "/rsvp/sec",
    "/f/form",
    "/capture/sheet",
    "/unsubscribe/tok",
  ])("%s is never indexed", (path) => {
    expect(isNeverIndexedPath(path)).toBe(true);
  });

  it.each(["/s", "/s/", "/search", "/secure", "/podcast/x", "/p/my-app", "/"])(
    "%s is not a link page",
    (path) => {
      expect(isNeverIndexedPath(path)).toBe(false);
    },
  );
});

describe("recordCandidatesForPath — published-record pages", () => {
  it("a podcast slug is an episode, then a show", () => {
    expect(recordCandidatesForPath("/podcast/my-episode")).toEqual([
      { type: "pc_episode", key: "my-episode" },
      { type: "pc_show", key: "my-episode" },
    ]);
  });

  it("the studio and sub-routes are not records", () => {
    expect(recordCandidatesForPath("/podcast/studio")).toBeNull();
    expect(recordCandidatesForPath("/podcast")).toBeNull();
    expect(recordCandidatesForPath("/podcast/x/feed.xml")).toBeNull();
  });

  it("the id-addressed public viewer follows its own type, only when enrolled", () => {
    expect(recordCandidatesForPath("/p/e/note/abc")).toEqual([{ type: "note", key: "abc" }]);
    expect(recordCandidatesForPath("/p/e/dm_conversation/abc")).toBeNull();
  });

  it("apps, shared canvases and learning articles", () => {
    expect(recordCandidatesForPath("/p/my-app")).toEqual([{ type: "app", key: "my-app" }]);
    expect(recordCandidatesForPath("/canvas/shared/abc")).toEqual([
      { type: "shared_canvas_item", key: "abc" },
    ]);
    expect(recordCandidatesForPath("/education/learn/chem/acids")).toEqual([
      { type: "learn_doc", key: "chem/acids" },
    ]);
    expect(recordCandidatesForPath("/education/learn/admin")).toBeNull();
  });

  it("an Anyone-link page is never a record candidate", () => {
    expect(recordCandidatesForPath("/s/token")).toBeNull();
  });
});

describe("robotsFor", () => {
  it("only a definite true is indexed", () => {
    expect(robotsFor(true)).toEqual({ index: true, follow: true });
    expect(robotsFor(false)).toEqual({ index: false, follow: false });
    expect(robotsFor(null)).toEqual({ index: false, follow: false });
  });
});
