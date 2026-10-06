/**
 * Frame-local copy of Alchemy's pure envelope contract.
 *
 * Source: aidream/apps/shared/alchemy/src/operate/agent-payload.ts and
 * fenced-code.ts. Keep this file dependency-free: importing `/operate` brings
 * the host runtime into the opaque, no-network frame.
 */
export type FrameAgentPayload = {
  kind: string;
  location: string;
  description: string;
  data: unknown;
  summary?: string;
  attributes?: Record<string, string | number | boolean | null | undefined>;
  context?: Record<string, string | number | boolean | null | undefined>;
  dataFormat?: string;
  instructions?: string;
};

export type FrameAgentPayloadEnvironment = {
  url?: string;
  route?: string;
  capturedAt?: string;
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const xmlName = (name: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name))
    throw new Error(`Invalid AI envelope name: ${name}`);
  return name;
};
const presentEntries = (values?: FrameAgentPayload["context"]) =>
  Object.entries(values ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );

export function fencedFrameCodeBlock(text: string, language: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
  return `${fence}${language}\n${text}${text.endsWith("\n") ? "" : "\n"}${fence}`;
}

export function fenceFrameJsonBlock(json: string): string {
  return fencedFrameCodeBlock(json.trimEnd(), "json");
}

export function serializeFrameAgentPayload(
  input: FrameAgentPayload,
  environment: FrameAgentPayloadEnvironment = {},
): string {
  const kind = xmlName(input.kind);
  const url = environment.url ?? "";
  const route = environment.route ?? "";
  const attrs = presentEntries(input.attributes)
    .map(([key, value]) => ` ${xmlName(key)}="${escapeXml(String(value))}"`)
    .join("");
  const entries: Array<[string, string]> = [
    ["location", input.location],
    ...(url ? [["url", url] as [string, string]] : []),
    ...(route ? [["route", route] as [string, string]] : []),
    ["copied", input.description],
    ["copied-at", environment.capturedAt ?? new Date().toISOString()],
    ...presentEntries(input.context).map(([key, value]): [string, string] => [
      xmlName(key),
      String(value),
    ]),
  ];
  const dataFormat = input.dataFormat ?? "json";
  if (dataFormat !== "json" && !/^[a-z][a-z0-9-]*$/.test(dataFormat))
    throw new Error(`Invalid AI envelope data format: ${dataFormat}`);
  const context = entries
    .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
    .join("\n");
  const summary = input.summary
    ? `<summary>\n${escapeXml(input.summary)}\n</summary>\n`
    : "";
  const instructions = input.instructions?.trim()
    ? `<instructions>\n${input.instructions.trim().replace(/<\/instructions>/gi, "<\\/instructions>")}\n</instructions>\n\n`
    : "";
  const head = `${instructions}<${kind}${attrs}>\n<context>\n${context}\n</context>\n${summary}<data format="${dataFormat}">\n`;
  if (dataFormat === "json") {
    const json = JSON.stringify(input.data, null, 2);
    if (json === undefined)
      throw new Error("AI envelope data must be JSON serializable.");
    const safeJson = json
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");
    return `${head}${fenceFrameJsonBlock(safeJson)}\n</data>\n</${kind}>`;
  }
  if (typeof input.data !== "string")
    throw new Error(`AI envelope ${dataFormat} data must be text.`);
  return `${head}${fencedFrameCodeBlock(input.data, dataFormat === "text" ? "text" : dataFormat)}\n</data>\n</${kind}>`;
}
