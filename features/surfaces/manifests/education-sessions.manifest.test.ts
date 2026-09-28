import {
  educationSessionsManifest,
  EDUCATION_SESSIONS_SURFACE_NAME,
} from "./education-sessions.manifest";

describe("Study sessions surface", () => {
  it("declares the visible session list and its canonical delete target", () => {
    expect(educationSessionsManifest.surfaceName).toBe(
      EDUCATION_SESSIONS_SURFACE_NAME,
    );
    expect(educationSessionsManifest.values.map((value) => value.name)).toEqual(
      expect.arrayContaining(["session_list", "history_filters"]),
    );
    expect(educationSessionsManifest.writeTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "delete_sessions",
          mode: "entity",
          applyPolicy: "ask",
          updatesValue: "session_list",
        }),
      ]),
    );
  });
});
