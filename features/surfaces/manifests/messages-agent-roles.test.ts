/**
 * THE DISCLOSURE LAW + THE NO-HARDCODED-AGENTS LAW on the messages surface.
 *
 * The conversation pane runs four fixed AI jobs. Two things can silently go
 * wrong and neither shows on screen:
 *
 *  1. The menu and the runtime drift — the surface discloses one set of jobs
 *     while the provider resolves another, so a user inspects a mandate that is
 *     not the one that ran. Both readers take the SAME list, and this proves it.
 *  2. A raw agent UUID appears as a role default, which is exactly what the
 *     Mandate system exists to prevent.
 */

import { messagesManifest } from "./messages.manifest";
import {
  MESSAGING_MANDATE_KEYS,
  MESSAGING_MANDATE_KEY_LIST,
  MESSAGING_MANDATE_ROLES,
} from "@/features/messaging/lib/messagingMandates";

describe("matrx-user/messages discloses its four fixed AI jobs", () => {
  const roles = messagesManifest.agentRoles ?? [];

  it("registers one role per conversation intelligence", () => {
    expect(roles).toHaveLength(MESSAGING_MANDATE_ROLES.length);
    expect(roles).toHaveLength(4);
  });

  it("discloses exactly the mandates the provider resolves", () => {
    const disclosed = roles.map((role) => role.mandateKey).sort();
    expect(disclosed).toEqual([...MESSAGING_MANDATE_KEY_LIST].sort());
  });

  it("names a mandate and NEVER a raw agent id", () => {
    roles.forEach((role) => {
      expect(role.mandateKey).toBeTruthy();
      // Mutually exclusive by law: code names the job, the DB decides the Holder.
      expect(role.defaultAgentId).toBeNull();
      expect(role.mandateKey).toMatch(/^messaging\./);
    });
  });

  it("marks every job as human-pressed, never scheduled", () => {
    // An automatic run on a page nobody is watching is the black box the
    // disclosure law is aimed at; all four are buttons.
    roles.forEach((role) => expect(role.autoRun).toBe("never"));
  });

  it("keeps a stable, unique name per role", () => {
    const names = roles.map((role) => role.name);
    expect(new Set(names).size).toBe(names.length);
    names.forEach((name) => expect(name).toMatch(/^[a-z0-9_]+$/));
  });
});

describe("the capability→mandate map is total", () => {
  it("has a mandate for every capability the package exposes", () => {
    // The package's four capability names. A fifth arriving in the package
    // without a mandate here would render nothing and say nothing; this fails
    // instead.
    expect(Object.keys(MESSAGING_MANDATE_KEYS).sort()).toEqual([
      "actionItems",
      "catchUp",
      "draftReply",
      "summarize",
    ]);
  });

  it("gives every role a product sentence, not an agent description", () => {
    MESSAGING_MANDATE_ROLES.forEach((role) => {
      expect(role.description.length).toBeGreaterThan(20);
      expect(role.description).not.toMatch(/agent/i);
    });
  });
});
