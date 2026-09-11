import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(__dirname, "../ScrollVoiceAssistantLauncherImpl.tsx"),
  "utf8",
);
const textSource = readFileSync(
  join(__dirname, "../ScrollAssistantLauncherImpl.tsx"),
  "utf8",
);

describe("guest ambient assistant boundary", () => {
  it("keeps mandate resolution inside the authenticated subtree", () => {
    const guestStart = source.indexOf("function GuestAmbientVoiceAssistant");
    const activeStart = source.indexOf("function ActiveAmbientVoiceAssistant");
    const guestSource = source.slice(guestStart, activeStart);

    expect(guestSource).not.toContain("useMandate(");
    expect(guestSource).not.toContain("useMandateChain(");
    expect(guestSource).not.toContain("useAgentLauncher(");
    expect(source).toContain("function AuthenticatedAmbientVoiceAssistant");
    expect(source).toContain(
      "if (!isAuthenticated) {\n    return <GuestAmbientVoiceAssistant",
    );
  });

  it("keeps the text assistant's mandate resolution inside its authenticated subtree", () => {
    const guestStart = textSource.indexOf("function GuestAmbientAssistant");
    const activeStart = textSource.indexOf("function AuthenticatedAmbientAssistant");
    const guestSource = textSource.slice(guestStart, activeStart);

    expect(guestSource).not.toContain("useMandateChain(");
    expect(guestSource).not.toContain("useAgentLauncher(");
    expect(textSource).toContain("function AuthenticatedAmbientAssistant");
    expect(textSource).toContain("if (!isAuthenticated) {");
  });
});
