import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("SMS Mandate authority", () => {
  test("the signed transport boundary never selects an agent", () => {
    const inbound = source("lib/sms/receive.ts");
    const route = source("app/api/webhooks/twilio/sms/route.ts");

    expect(inbound).not.toContain("preferred_agent_id");
    expect(inbound).not.toContain("preferred_agent_version_id");
    expect(route).not.toContain("Boolean(context.agentId)");
    expect(route).toContain("canonical Mandate Bindings");
  });

  test("the settings surface writes only the canonical Binding and delivery switch", () => {
    const hook = source("features/sms/hooks/useSmsAssistantProgram.ts");
    const settings = source(
      "features/sms/components/SmsAssistantSettingsSection.tsx",
    );

    expect(hook).toContain('rpc("set_my_sms_assistant_enabled"');
    expect(hook).not.toContain('rpc("configure_my_sms_assistant"');
    expect(hook).not.toContain('rpc("configure_my_sms_assistant_version"');
    expect(hook).not.toContain('rpc("disconnect_my_sms_assistant"');
    expect(settings).toContain("MandateAgentPicker");
    expect(settings).toContain("SMS_ASSISTANT_OWNER_BETA_MANDATE");
    expect(settings).not.toContain("AgentListDropdown");
    expect(settings).toContain("Holder keeps its complete tool set");
    expect(settings).toContain("consequential actions pause");
    expect(settings).not.toContain("Agent tools remain disabled");
  });
});
