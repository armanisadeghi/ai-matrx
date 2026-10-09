// features/make/describe/__tests__/a-sentence-goes-to-the-door-that-can-build-it.test.ts — lane MAKE-WORKS.
//
// THE USE CASE. Arman (2026-10-09): "when I go to /make and I tell it exactly what I want, there isn't a
// solid workflow that runs and gets it done for me properly." The five sentences below are the ones the
// lane ran end to end. Before the guided run every one went to the template builder, so "an agency OS
// with clients, retainers, a dashboard and a 90-day plan" came back as bare tables with no page, no
// dashboard and no plan — the template builder cannot make a page.
//
// BREAKS THIS CATCHES: a workspace-shaped sentence sent only to the template builder · a plain tracker
// sent to the Space Builder (minutes of work for what a template does in seconds) · a workspace that also
// asks for a form or booking losing the form · follow-ups that repeat what was already made.

import { followUpsFor, planFor } from "../plan";

describe("a sentence goes to the door that can build it", () => {
  it.each([
    ["a content calendar for my 6 agency clients with post dates, platforms, approval status and a weekly view", "data"],
    ["an agency OS with clients, retainers, a dashboard and a 90-day plan", "page"],
    ["a lead tracker with stages and follow-up reminders", "data"],
    ["a booking page for discovery calls", "data"],
    ["track my team's PTO", "data"],
    ["a client workspace with an intake form and a booking page", "both"],
    ["a wiki for our onboarding SOPs", "page"],
  ] as const)("%s → %s", (sentence, route) => {
    expect(planFor(sentence).route).toBe(route);
  });

  it("shows every step before anything runs, and a workspace with a form makes the Space first", () => {
    expect(planFor("track my team's PTO").steps).toEqual(["design", "check", "build", "open"]);
    expect(planFor("an agency OS with a dashboard").steps).toEqual(["space", "open"]);
    expect(planFor("a client workspace with an intake form").steps).toEqual(["space", "design", "check", "build", "open"]);
  });

  it("offers at most three follow-ups, never one for something already made", () => {
    const made = [
      { kind: "table", title: "Clients" },
      { kind: "form", title: "New client" },
    ];
    const ups = followUpsFor("a content calendar for my agency clients", "data", made);
    expect(ups.length).toBeGreaterThan(0);
    expect(ups.length).toBeLessThanOrEqual(3);
    expect(ups).toContain("Add a client portal");
    expect(ups.some((u) => /form/i.test(u))).toBe(false);
    expect(followUpsFor("a booking page for discovery calls", "data", [{ kind: "booking", title: "Discovery call" }]).some((u) => /booking/i.test(u))).toBe(false);
  });

  it("offers 'remind me 2 days before' for a dated table it made, and never when a reminder was already asked for", () => {
    const made = [
      { kind: "table", title: "Clients" },
      { kind: "table", title: "Posts" },
    ];
    expect(followUpsFor("a content calendar for my agency clients", "data", made)[0]).toBe("Remind me 2 days before each post");
    expect(followUpsFor("a content calendar - remind me the day before", "data", made).some((u) => /remind/i.test(u))).toBe(false);
    expect(followUpsFor("a client list", "data", [{ kind: "table", title: "Clients" }]).some((u) => /remind/i.test(u))).toBe(false);
  });
});
