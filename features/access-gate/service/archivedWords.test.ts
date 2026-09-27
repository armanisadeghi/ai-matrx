/**
 * An archived record is in Trash and can come back. The gate used to say "This
 * message template was deleted … It was removed, so there's nothing here to
 * open" about a template its owner could restore in one click.
 */
import {
  archivedExplanation,
  archivedHeadline,
  mayRestoreArchived,
} from "@/features/access-gate/service/archivedWords";
import type { AccessDeniedContext } from "@/features/access-gate/types";

function context(over: Partial<AccessDeniedContext> = {}): AccessDeniedContext {
  return {
    status: "deleted",
    disclosure: "full",
    level: "none",
    isOwner: false,
    entity: { token: "message_template", label: "Message template", title: "Welcome sequence — day 1" },
    owner: { userId: "u1", displayName: "Rosa Delgado", avatarUrl: null, creatorHandle: null },
    organization: null,
    ancestor: null,
    request: null,
    canRequest: false,
    ...over,
  };
}

describe("an archived record is said as archived, never as deleted", () => {
  it("the headline says Trash, not deleted", () => {
    const headline = archivedHeadline(context());
    expect(headline).toBe("This message template is in Trash");
    expect(headline.toLowerCase()).not.toContain("deleted");
  });

  it("its owner may restore it, and is told so", () => {
    const owner = context({ isOwner: true });
    expect(mayRestoreArchived(owner)).toBe(true);
    expect(archivedExplanation(owner)).toContain("Restore it");
    expect(archivedExplanation(owner)).not.toMatch(/removed|nothing here/i);
  });

  it("an editor or admin may restore it", () => {
    expect(mayRestoreArchived(context({ level: "edit" }))).toBe(true);
    expect(mayRestoreArchived(context({ level: "admin" }))).toBe(true);
  });

  it("a viewer is not offered a Restore the store would refuse, and is told who can", () => {
    const viewer = context({ level: "view" });
    expect(mayRestoreArchived(viewer)).toBe(false);
    expect(archivedExplanation(viewer)).toBe(
      "It was archived, not erased. Rosa Delgado can restore it from Trash.",
    );
  });

  it("with nobody to name it still says it can come back", () => {
    expect(archivedExplanation(context({ owner: null }))).toContain("can restore it from Trash");
  });

  it("never offers Restore on any other state", () => {
    for (const status of ["denied", "missing", "anonymous", "ok", "error"] as const) {
      expect(mayRestoreArchived(context({ status, isOwner: true, level: "admin" }))).toBe(false);
    }
  });
});
