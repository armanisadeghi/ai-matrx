#!/usr/bin/env tsx
/**
 * Matrx Ship CLI
 *
 * Universal deployment tool that:
 * 1. Provisions a new ship instance on your server (init)
 * 2. Collects git metadata (commit hash, message, code stats)
 * 3. Sends version data to the matrx-ship API
 * 4. Stages, commits, and pushes changes
 *
 * Usage:
 *   pnpm ship "commit message"                              # Patch bump
 *   pnpm ship:minor "commit message"                        # Minor bump
 *   pnpm ship:major "commit message"                        # Major bump
 *   pnpm ship:init my-project "My Project"                  # Auto-provision instance
 *   pnpm ship:init --url URL --key KEY                      # Manual config (legacy)
 *   pnpm ship:setup --token TOKEN [--server URL]            # Save server credentials
 *   pnpm ship:history                                       # Import full git history
 *   pnpm ship:update                                        # Update CLI to latest version
 *   pnpm ship status                                        # Show current version
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import * as path from "path";
import { homedir } from "os";
import { extractErrorMessage } from "@/utils/errors";

// ── Constants ─────────────────────────────────────────────────────────

const DEFAULT_MCP_SERVER = "https://mcp.dev.codematrx.com";
const REPO_RAW =
  "https://raw.githubusercontent.com/armanisadeghi/matrx-ship/main";
const GLOBAL_CONFIG_DIR = path.join(homedir(), ".config", "matrx-ship");
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, "server.json");

// ── Types ─────────────────────────────────────────────────────────────

interface ShipConfig {
  url: string;
  apiKey: string;
  projectName?: string;
}

interface ServerConfig {
  server: string;
  token: string;
}

// ── Configuration ────────────────────────────────────────────────────

function findConfigFile(): string | null {
  let dir = process.cwd();
  while (true) {
    const configPath = path.join(dir, ".matrx-ship.json");
    if (existsSync(configPath)) return configPath;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isPlaceholderUrl(url: string): boolean {
  return (
    url.includes("yourdomain.com") ||
    url.includes("YOUR") ||
    url.includes("example.com") ||
    url.includes("localhost") ||
    url === "" ||
    url === "https://" ||
    url === "http://"
  );
}

function isPlaceholderKey(key: string): boolean {
  return (
    key === "" ||
    key.includes("YOUR") ||
    key.includes("your") ||
    key.includes("xxx") ||
    key === "sk_ship_YOUR_API_KEY_HERE"
  );
}

/** Returns the correct command prefix based on whether the project has package.json */
function shipCmd(sub?: string): string {
  const hasPackageJson = existsSync(path.join(process.cwd(), "package.json"));
  if (hasPackageJson) {
    return sub ? `pnpm ship:${sub}` : "pnpm ship";
  }
  return sub
    ? `bash scripts/matrx/ship.sh ${sub}`
    : "bash scripts/matrx/ship.sh";
}

function loadConfig(): ShipConfig {
  const envUrl = process.env.MATRX_SHIP_URL;
  const envKey = process.env.MATRX_SHIP_API_KEY;

  if (envUrl && envKey) {
    return { url: envUrl.replace(/\/+$/, ""), apiKey: envKey };
  }

  const configPath = findConfigFile();
  if (!configPath) {
    console.error("❌ No .matrx-ship.json found in this project.");
    console.error("");
    console.error("   To set up, run:");
    console.error(`     ${shipCmd("init")} my-project "My Project Name"`);
    console.error("");
    console.error("   Or set environment variables:");
    console.error(
      "     export MATRX_SHIP_URL=https://ship-myproject.dev.codematrx.com",
    );
    console.error("     export MATRX_SHIP_API_KEY=sk_ship_xxxxx");
    process.exit(1);
  }

  let config!: ShipConfig;
  try {
    const raw = readFileSync(configPath, "utf-8");
    config = JSON.parse(raw);
  } catch {
    console.error(`❌ Failed to parse ${configPath}`);
    console.error(
      "   Make sure it contains valid JSON with 'url' and 'apiKey'.",
    );
    process.exit(1);
  }

  if (!config.url || !config.apiKey) {
    console.error(`❌ Missing fields in ${configPath}`);
    console.error('   Required: { "url": "...", "apiKey": "..." }');
    process.exit(1);
  }

  if (isPlaceholderUrl(config.url)) {
    console.error("❌ Your .matrx-ship.json still has a placeholder URL.");
    console.error(`   Current:  ${config.url}`);
    console.error("");
    console.error("   Run this to auto-provision an instance:");
    console.error(`     ${shipCmd("init")} my-project "My Project Name"`);
    process.exit(1);
  }

  if (isPlaceholderKey(config.apiKey)) {
    console.error("❌ Your .matrx-ship.json still has a placeholder API key.");
    console.error(
      "   Update it with the real key from your matrx-ship instance.",
    );
    console.error(`   Config file: ${configPath}`);
    process.exit(1);
  }

  return { ...config, url: config.url.replace(/\/+$/, "") };
}

// ── Server Config (global) ──────────────────────────────────────────

function loadServerConfig(): ServerConfig | null {
  // 1. Environment variables (highest priority)
  const envToken = process.env.MATRX_SHIP_SERVER_TOKEN;
  const envServer = process.env.MATRX_SHIP_SERVER || DEFAULT_MCP_SERVER;
  if (envToken) {
    return { server: envServer, token: envToken };
  }

  // 2. Global config file
  if (existsSync(GLOBAL_CONFIG_FILE)) {
    try {
      const raw = readFileSync(GLOBAL_CONFIG_FILE, "utf-8");
      const config = JSON.parse(raw);
      if (config.token) {
        return {
          server: config.server || DEFAULT_MCP_SERVER,
          token: config.token,
        };
      }
    } catch {
      // Ignore corrupt file
    }
  }

  return null;
}

function saveServerConfig(config: ServerConfig): void {
  mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
  writeFileSync(
    GLOBAL_CONFIG_FILE,
    JSON.stringify(config, null, 2) + "\n",
    "utf-8",
  );
  // Restrict permissions
  try {
    execSync(`chmod 600 "${GLOBAL_CONFIG_FILE}"`, { stdio: "ignore" });
  } catch {
    // Windows doesn't have chmod
  }
}

// ── Git Helpers ──────────────────────────────────────────────────────

function getGitCommit(): string | null {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return null;
  }
}

function getCommitMessage(): string | null {
  try {
    return execSync("git log -1 --pretty=%B").toString().trim();
  } catch {
    return null;
  }
}

function getCodeStats(): {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
} {
  try {
    const stats = execSync("git diff --numstat HEAD~1 HEAD").toString().trim();
    let linesAdded = 0;
    let linesDeleted = 0;
    let filesChanged = 0;

    if (stats) {
      for (const line of stats.split("\n")) {
        const [added, deleted] = line.trim().split(/\s+/);
        if (added !== "-" && deleted !== "-") {
          linesAdded += parseInt(added) || 0;
          linesDeleted += parseInt(deleted) || 0;
          filesChanged += 1;
        }
      }
    }

    return { linesAdded, linesDeleted, filesChanged };
  } catch {
    return { linesAdded: 0, linesDeleted: 0, filesChanged: 0 };
  }
}

function hasUncommittedChanges(): boolean {
  try {
    const status = execSync("git status --porcelain", { encoding: "utf-8" });
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

function isGitRepo(): boolean {
  try {
    execSync("git rev-parse --git-dir", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ── MCP Client ──────────────────────────────────────────────────────

async function callMcpTool(
  serverConfig: ServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const mcpUrl = `${serverConfig.server.replace(/\/+$/, "")}/mcp`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${serverConfig.token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: toolName, arguments: args },
        id: 1,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 401) {
      throw new Error(
        "Authentication failed. Your server token is invalid.\n" +
          "   Run: pnpm ship:setup --token YOUR_TOKEN",
      );
    }

    if (!response.ok) {
      throw new Error(
        `Server returned ${response.status}: ${response.statusText}`,
      );
    }

    // Parse SSE response
    const body = await response.text();
    const dataLine = body.split("\n").find((l) => l.startsWith("data: "));
    if (!dataLine) {
      throw new Error("Unexpected response format from MCP server");
    }

    const json = JSON.parse(dataLine.replace("data: ", ""));

    if (json.result?.content?.[0]?.text) {
      const text = json.result.content[0].text;
      try {
        return JSON.parse(text);
      } catch {
        // If the text isn't JSON, return it wrapped
        return { message: text };
      }
    }

    if (json.error) {
      throw new Error(json.error.message || "MCP tool call failed");
    }

    return json;
  } catch (error) {
    clearTimeout(timeout);
    const msg = extractErrorMessage(error);

    if (msg.includes("abort") || msg.includes("timeout")) {
      throw new Error(
        `Connection to MCP server timed out.\n` +
          `   Server: ${serverConfig.server}\n` +
          "   Is the server running?",
      );
    }
    if (
      msg.includes("fetch failed") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ENOTFOUND")
    ) {
      throw new Error(
        `Cannot reach MCP server at ${serverConfig.server}\n` +
          "   Possible causes:\n" +
          "     - The server is not running\n" +
          "     - The URL is wrong\n" +
          "     - Network/firewall is blocking the connection\n" +
          `\n   To verify: curl ${serverConfig.server}/health`,
      );
    }
    throw error;
  }
}

// ── API Client ───────────────────────────────────────────────────────

async function shipVersion(
  config: ShipConfig,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${config.url}/api/ship`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = (await response.json()) as Record<string, unknown>;
    return { ok: response.ok, data };
  } catch (error) {
    const msg = extractErrorMessage(error);

    if (msg.includes("abort") || msg.includes("timeout")) {
      throw new Error(
        `Connection to ${config.url} timed out after 15 seconds.\n` +
          "   Is the matrx-ship server running?",
      );
    }
    if (
      msg.includes("fetch failed") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ENOTFOUND")
    ) {
      throw new Error(
        `Cannot reach ${config.url}\n` +
          "   Possible causes:\n" +
          "     - The matrx-ship server is not running\n" +
          "     - The URL in .matrx-ship.json is wrong\n" +
          "     - DNS hasn't propagated yet\n" +
          "     - Network/firewall is blocking the connection\n" +
          `\n   To verify, try: curl ${config.url}/health`,
      );
    }
    throw new Error(`Network error: ${msg}`);
  }
}

async function getStatus(config: ShipConfig): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${config.url}/api/version`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = (await response.json()) as Record<string, unknown>;

    console.log("\n📦 Current Version Status");
    console.log(`   Server:  ${config.url}`);
    console.log(`   Version: v${data.version}`);
    console.log(`   Build:   #${data.buildNumber}`);
    console.log(`   Status:  ${data.deploymentStatus || "unknown"}`);
    if (data.gitCommit) console.log(`   Commit:  ${data.gitCommit}`);
    if (data.commitMessage) console.log(`   Message: ${data.commitMessage}`);
    console.log(`   Deployed: ${data.deployedAt}`);
    console.log();
  } catch (error) {
    const msg = extractErrorMessage(error);
    if (
      msg.includes("fetch failed") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("abort")
    ) {
      console.error(`❌ Cannot reach ${config.url}`);
      console.error("   Is the matrx-ship server running?");
      console.error(`   Try: curl ${config.url}/health`);
    } else {
      console.error("❌ Failed to fetch status:", msg);
    }
    process.exit(1);
  }
}

// ── Commands ─────────────────────────────────────────────────────────

async function handleSetup(args: string[]): Promise<void> {
  let token = "";
  let server = DEFAULT_MCP_SERVER;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--token" || args[i] === "-t") && args[i + 1]) {
      token = args[i + 1];
      i++;
    } else if ((args[i] === "--server" || args[i] === "-s") && args[i + 1]) {
      server = args[i + 1];
      i++;
    }
  }

  if (!token) {
    console.error(`❌ Usage: ${shipCmd("setup")} --token YOUR_SERVER_TOKEN`);
    console.error("");
    console.error(
      "   The server token is the MCP bearer token from your deployment server.",
    );
    console.error(
      "   This is a one-time setup per machine — the token is saved globally.",
    );
    console.error("");
    console.error("   Options:");
    console.error("     --token, -t   MCP server bearer token (required)");
    console.error(
      `     --server, -s  MCP server URL (default: ${DEFAULT_MCP_SERVER})`,
    );
    console.error("");
    console.error(
      "   You can also set the MATRX_SHIP_SERVER_TOKEN environment variable instead.",
    );
    process.exit(1);
  }

  server = server.replace(/\/+$/, "");

  // Verify connection
  console.log(`🔍 Verifying connection to ${server}...`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(`${server}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = (await response.json()) as Record<string, unknown>;
    if (data.status !== "ok") throw new Error("Health check failed");
    console.log(`✅ Connected to server manager`);
  } catch (error) {
    const msg = extractErrorMessage(error);
    console.error(`❌ Cannot reach ${server}/health`);
    if (msg.includes("abort")) {
      console.error("   Connection timed out.");
    } else {
      console.error(`   Error: ${msg}`);
    }
    console.error(
      "   Make sure the MCP server URL is correct and the server is running.",
    );
    process.exit(1);
  }

  // Save
  saveServerConfig({ server, token });
  console.log(`💾 Server credentials saved to ${GLOBAL_CONFIG_FILE}`);
  console.log("");
  console.log("   You can now provision instances in any project:");
  const hasPackageJson = existsSync(path.join(process.cwd(), "package.json"));
  if (hasPackageJson) {
    console.log('     pnpm ship:init my-project "My Project Name"');
  } else {
    console.log(
      '     bash scripts/matrx/ship.sh init my-project "My Project Name"',
    );
  }
  console.log("");
}

async function handleInit(args: string[]): Promise<void> {
  // Detect legacy mode: init --url URL --key KEY
  if (args.includes("--url") || args.includes("--key")) {
    return handleLegacyInit(args);
  }

  // New auto-provision mode: init PROJECT_NAME "Display Name" [--token TOKEN] [--server URL]
  let projectName = "";
  let displayName = "";
  let tokenOverride = "";
  let serverOverride = "";

  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--token" || args[i] === "-t") && args[i + 1]) {
      tokenOverride = args[i + 1];
      i++;
    } else if ((args[i] === "--server" || args[i] === "-s") && args[i + 1]) {
      serverOverride = args[i + 1];
      i++;
    } else if (!args[i].startsWith("--")) {
      positional.push(args[i]);
    }
  }

  projectName = positional[0] || "";
  displayName = positional[1] || "";

  // If no project name given, derive from current directory
  if (!projectName) {
    projectName = path
      .basename(process.cwd())
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-");
    if (!projectName) {
      console.error("❌ Could not determine project name from directory.");
      console.error(
        `   Usage: ${shipCmd("init")} my-project "My Project Name"`,
      );
      process.exit(1);
    }
    console.log(`📁 Using project name from directory: ${projectName}`);
  }

  if (!displayName) {
    // Convert kebab-case to Title Case
    displayName = projectName
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  // Validate project name
  if (
    !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(projectName) &&
    !/^[a-z0-9]$/.test(projectName)
  ) {
    console.error(`❌ Invalid project name: "${projectName}"`);
    console.error("   Must be lowercase letters, numbers, and hyphens only.");
    console.error("   Examples: real-singles, matrx-platform, clawdbot");
    process.exit(1);
  }

  // Load server config
  let serverConfig: ServerConfig | null = null;

  if (tokenOverride) {
    serverConfig = {
      server: serverOverride || DEFAULT_MCP_SERVER,
      token: tokenOverride,
    };
  } else {
    serverConfig = loadServerConfig();
  }

  if (!serverConfig) {
    console.error("❌ No server token found.");
    console.error("");
    console.error(
      "   You need to configure your server credentials first (one-time per machine):",
    );
    console.error(`     ${shipCmd("setup")} --token YOUR_MCP_SERVER_TOKEN`);
    console.error("");
    console.error("   Or pass the token directly:");
    console.error(
      `     ${shipCmd("init")} ${projectName} "${displayName}" --token YOUR_TOKEN`,
    );
    console.error("");
    console.error("   Or set the environment variable:");
    console.error("     export MATRX_SHIP_SERVER_TOKEN=your_token_here");
    process.exit(1);
  }

  console.log("");
  console.log("🚀 Provisioning matrx-ship instance...");
  console.log(`   Project:  ${projectName}`);
  console.log(`   Display:  ${displayName}`);
  console.log(`   Server:   ${serverConfig!.server}`);
  console.log("");

  // Call MCP app_create
  let result!: Record<string, unknown>;
  try {
    result = await callMcpTool(serverConfig!, "app_create", {
      name: projectName,
      display_name: displayName,
    });
  } catch (error) {
    console.error("❌ Failed to provision instance");
    console.error(
      "   ",
      extractErrorMessage(error),
    );
    process.exit(1);
  }

  // Handle "already exists" — try to retrieve the existing instance
  const errorMsg = typeof result.error === "string" ? result.error : "";
  if (errorMsg.toLowerCase().includes("already exists")) {
    console.log(
      `ℹ️  Instance '${projectName}' already exists. Retrieving info...`,
    );
    try {
      const existing = await callMcpTool(serverConfig!, "app_get", {
        name: projectName,
      });
      if (existing.url && existing.api_key) {
        result = {
          success: true,
          url: existing.url,
          api_key: existing.api_key,
        };
      } else if (existing.instance && typeof existing.instance === "object") {
        const inst = existing.instance as Record<string, unknown>;
        if (inst.url && inst.api_key) {
          result = { success: true, url: inst.url, api_key: inst.api_key };
        }
      }
    } catch {
      // app_get may not exist — fall through to error
    }

    if (!result.success) {
      console.error(
        `❌ Instance '${projectName}' already exists on the server but could not retrieve its config.`,
      );
      console.error("");
      console.error("   Check the admin UI for the URL and API key:");
      console.error(`     ${serverConfig!.server}/admin/`);
      console.error("");
      console.error("   Then configure manually:");
      const hasPackageJson = existsSync(
        path.join(process.cwd(), "package.json"),
      );
      if (hasPackageJson) {
        console.error(
          `     pnpm ship:init --url https://ship-${projectName}.dev.codematrx.com --key YOUR_API_KEY`,
        );
      } else {
        console.error(
          `     bash scripts/matrx/ship.sh init --url https://ship-${projectName}.dev.codematrx.com --key YOUR_API_KEY`,
        );
      }
      process.exit(1);
    }
  } else if (result.error) {
    console.error(`❌ ${result.error}`);
    process.exit(1);
  }

  if (!result.success) {
    console.error("❌ Instance creation failed");
    console.error("   ", JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const instanceUrl = result.url as string;
  const apiKey = result.api_key as string;

  // Write .matrx-ship.json
  const configPath = path.join(process.cwd(), ".matrx-ship.json");
  const config: ShipConfig = { url: instanceUrl, apiKey };
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

  // Add to .gitignore if needed
  const gitignorePath = path.join(process.cwd(), ".gitignore");
  if (existsSync(gitignorePath)) {
    const gitignore = readFileSync(gitignorePath, "utf-8");
    if (!gitignore.includes(".matrx-ship.json")) {
      writeFileSync(
        gitignorePath,
        gitignore.trimEnd() +
          "\n\n# Matrx Ship config (contains API key)\n.matrx-ship.json\n",
      );
      console.log("📄 Added .matrx-ship.json to .gitignore");
    }
  }

  // Wait for the instance to boot
  console.log("⏳ Waiting for instance to boot (migrations + seeding)...");
  let healthy = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${instanceUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = (await response.json()) as Record<string, unknown>;
      if (data.status === "ok") {
        healthy = true;
        break;
      }
    } catch {
      // Still booting
      process.stdout.write(".");
    }
  }

  if (!healthy) {
    console.log("");
    console.log("⚠️  Instance may still be starting up. Check manually:");
    console.log(`   curl ${instanceUrl}/health`);
  }

  console.log("");
  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║   ✅ Instance provisioned and configured!                    ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝",
  );
  console.log("");
  console.log(`   🌐 URL:       ${instanceUrl}`);
  console.log(`   🔧 Admin:     ${instanceUrl}/admin`);
  console.log(`   🔑 API Key:   ${apiKey}`);
  console.log(`   📄 Config:    ${configPath}`);
  console.log("");
  const hasPackageJson = existsSync(path.join(process.cwd(), "package.json"));
  console.log("   You're ready to ship:");
  if (hasPackageJson) {
    console.log('     pnpm ship "your first commit message"');
  } else {
    console.log('     bash scripts/matrx/ship.sh "your first commit message"');
  }
  console.log("");
}

async function handleLegacyInit(args: string[]): Promise<void> {
  let url = "";
  let key = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) {
      url = args[i + 1];
      i++;
    } else if (args[i] === "--key" && args[i + 1]) {
      key = args[i + 1];
      i++;
    }
  }

  if (!url || !key) {
    console.error(`❌ Usage: ${shipCmd("init")} --url URL --key API_KEY`);
    process.exit(1);
  }

  url = url.replace(/\/+$/, "");

  // Verify connection
  console.log(`🔍 Checking connection to ${url}...`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(`${url}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = (await response.json()) as Record<string, unknown>;
    if (data.status !== "ok")
      throw new Error("Health check returned non-ok status");
    console.log(`✅ Connected to ${data.service} (project: ${data.project})`);
  } catch (error) {
    const msg = extractErrorMessage(error);
    console.error(`❌ Cannot reach ${url}/health`);
    if (
      msg.includes("fetch failed") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ENOTFOUND")
    ) {
      console.error("   The server doesn't appear to be running at that URL.");
    } else if (msg.includes("abort")) {
      console.error("   Connection timed out after 10 seconds.");
    } else {
      console.error(`   Error: ${msg}`);
    }
    process.exit(1);
  }

  const config: ShipConfig = { url, apiKey: key };
  const configPath = path.join(process.cwd(), ".matrx-ship.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`📄 Config saved to ${configPath}`);
  console.log('\n   You can now run: pnpm ship "your commit message"');
  console.log();
}

/**
 * A sync pause (`python3 scripts/sync-main.py --pause`, AI Matrx repos) refuses every push from
 * this checkout during a planned tree move. sync-main is the ONE reader of the pause; exit 3 =
 * paused (its SYNC PAUSED line is already on stderr). Repos without sync-main are unaffected.
 */
function refuseWhileSyncPaused(): void {
  let root: string;
  try {
    root = execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
  } catch {
    return;
  }
  const reader = path.join(root, "scripts", "sync-main.py");
  if (!existsSync(reader)) return;
  try {
    execSync(`python3 "${reader}" --pause-active`, { stdio: "inherit", cwd: root });
  } catch (error) {
    if ((error as { status?: number }).status === 3) {
      console.error("ship: SYNC PAUSED — nothing was committed or pushed");
      process.exit(3);
    }
    console.error("ship: WARNING the sync-pause check could not run — shipping as if not paused");
  }
}

async function handleShip(args: string[]): Promise<void> {
  const isMajor = args.includes("--major");
  const isMinor = args.includes("--minor");
  const commitMessage = args.find((arg) => !arg.startsWith("--"));

  if (!commitMessage) {
    console.error("❌ Error: Commit message is required");
    console.error('\n   Usage: pnpm ship "Your commit message"');
    console.error('          pnpm ship:minor "Your commit message"');
    console.error('          pnpm ship:major "Your commit message"');
    return void process.exit(1);
  }

  if (!isGitRepo()) {
    console.error("❌ Error: Not in a git repository");
    return void process.exit(1);
  }

  if (!hasUncommittedChanges()) {
    console.log("⚠️  No uncommitted changes detected. Nothing to ship!");
    return void process.exit(0);
  }

  refuseWhileSyncPaused();

  const config = loadConfig();
  const bumpType = isMajor ? "major" : isMinor ? "minor" : "patch";

  console.log("🚀 Starting ship process...\n");

  // Step 1: Send version data to API
  console.log("📦 Step 1/4: Creating version...");
  const gitCommit = getGitCommit();
  const codeStats = getCodeStats();

  try {
    const result = await shipVersion(config, {
      bumpType,
      gitCommit,
      commitMessage,
      linesAdded: codeStats.linesAdded,
      linesDeleted: codeStats.linesDeleted,
      filesChanged: codeStats.filesChanged,
    });

    if (!result.ok) {
      throw new Error(
        (result.data.error as string) || "Failed to create version",
      );
    }

    if (result.data.duplicate) {
      console.log(
        `⚠️  Version already exists for commit ${gitCommit}. Continuing...`,
      );
    } else {
      console.log(
        `✅ Version v${result.data.version} (build #${result.data.buildNumber}) created`,
      );
    }
  } catch (error) {
    console.error("\n❌ Failed to create version");
    console.error(
      "   ",
      extractErrorMessage(error),
    );
    process.exit(1);
  }

  // Step 2: Stage all changes
  console.log("\n📝 Step 2/4: Staging changes...");
  try {
    execSync("git add .", { stdio: "inherit" });
    console.log("✅ Changes staged");
  } catch {
    console.error("\n❌ Failed to stage changes");
    process.exit(1);
  }

  // Step 3: Create commit
  console.log("\n💾 Step 3/4: Creating commit...");
  try {
    const escapedMessage = commitMessage.replace(/"/g, '\\"');
    execSync(`git commit -m "${escapedMessage}"`, { stdio: "inherit" });
    console.log("✅ Commit created");
  } catch {
    console.error("\n❌ Failed to create commit");
    console.error("   Tip: Make sure you have changes to commit");
    process.exit(1);
  }

  // Step 4: Push to remote
  console.log("\n⬆️  Step 4/4: Pushing to remote...");
  try {
    execSync("git push", { stdio: "inherit" });
    console.log("✅ Pushed to remote");
  } catch {
    console.error("\n❌ Failed to push to remote");
    console.error("   Your commit was created locally but not pushed.");
    console.error("   You can manually push with: git push");
    process.exit(1);
  }

  console.log("\n✨ Ship complete!");
  console.log(`   Commit: "${commitMessage}"`);
  console.log("   Changes have been pushed to remote\n");
}

// ── History Import ────────────────────────────────────────────────────

interface GitCommitEntry {
  hash: string;
  date: string;
  message: string;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
}

function parseGitLog(raw: string): GitCommitEntry[] {
  const entries: GitCommitEntry[] = [];
  // Split by our delimiter. Each block starts with "hash\x1edate\x1emessage"
  // followed optionally by a shortstat line.
  const blocks = raw.split("\n");
  let current: Partial<GitCommitEntry> | null = null;

  for (const line of blocks) {
    const trimmed = line.trim();
    if (!trimmed) {
      // Blank line — finalize current entry if stat line not expected
      continue;
    }

    // Check if this is a commit line (contains our \x1e separators)
    if (trimmed.includes("\x1e")) {
      // Save previous entry
      if (current?.hash) {
        entries.push({
          hash: current.hash,
          date: current.date || "",
          message: current.message || "",
          linesAdded: current.linesAdded || 0,
          linesDeleted: current.linesDeleted || 0,
          filesChanged: current.filesChanged || 0,
        });
      }
      const parts = trimmed.split("\x1e");
      current = {
        hash: parts[0],
        date: parts[1] || "",
        message: parts[2] || "",
        linesAdded: 0,
        linesDeleted: 0,
        filesChanged: 0,
      };
    } else if (current && /files? changed/.test(trimmed)) {
      // This is a shortstat line for the current commit
      const filesMatch = trimmed.match(/(\d+) files? changed/);
      const addMatch = trimmed.match(/(\d+) insertions?\(\+\)/);
      const delMatch = trimmed.match(/(\d+) deletions?\(-\)/);
      current.filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0;
      current.linesAdded = addMatch ? parseInt(addMatch[1]) : 0;
      current.linesDeleted = delMatch ? parseInt(delMatch[1]) : 0;
    }
  }

  // Push the last entry
  if (current?.hash) {
    entries.push({
      hash: current.hash,
      date: current.date || "",
      message: current.message || "",
      linesAdded: current.linesAdded || 0,
      linesDeleted: current.linesDeleted || 0,
      filesChanged: current.filesChanged || 0,
    });
  }

  return entries;
}

function assignVersions(
  entries: GitCommitEntry[],
  startVersion: string,
): { version: string; buildNumber: number; entry: GitCommitEntry }[] {
  let [major, minor, patch] = startVersion.split(".").map(Number);
  return entries.map((entry, i) => {
    if (i > 0) patch++;
    return {
      version: `${major}.${minor}.${patch}`,
      buildNumber: i + 1,
      entry,
    };
  });
}

async function handleHistory(args: string[]): Promise<void> {
  const isDry = args.includes("--dry") || args.includes("--dry-run");
  const isClear = args.includes("--clear");
  let since = "";
  let startVersion = "0.0.1";
  let branch = "";
  const batchSize = 200;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--since" || args[i] === "-s") && args[i + 1]) {
      since = args[i + 1];
      i++;
    } else if (
      (args[i] === "--start-version" || args[i] === "-v") &&
      args[i + 1]
    ) {
      startVersion = args[i + 1];
      i++;
    } else if ((args[i] === "--branch" || args[i] === "-b") && args[i + 1]) {
      branch = args[i + 1];
      i++;
    }
  }

  if (!isGitRepo()) {
    console.error("❌ Not in a git repository");
    process.exit(1);
  }

  const config = loadConfig();

  console.log("");
  console.log("📚 Matrx Ship — History Import");
  console.log("══════════════════════════════════════════");
  console.log(`   Server:         ${config.url}`);
  console.log(`   Start version:  ${startVersion}`);
  if (since) console.log(`   Since:          ${since}`);
  if (branch) console.log(`   Branch:         ${branch}`);
  if (isClear) console.log(`   Clear existing: YES`);
  if (isDry) console.log(`   Mode:           DRY RUN (no changes)`);
  console.log("");

  // Build the git log command
  // %h = short hash, %aI = author date ISO, %s = subject
  // --shortstat adds file change summary after each commit
  let gitCmd = `git log --reverse --format="%h\x1e%aI\x1e%s" --shortstat`;
  if (since) gitCmd += ` --since="${since}"`;
  if (branch) gitCmd += ` ${branch}`;

  console.log("🔍 Reading git history...");
  let raw!: string;
  try {
    raw = execSync(gitCmd, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
  } catch (error) {
    console.error("❌ Failed to read git history");
    console.error(
      "   ",
      extractErrorMessage(error),
    );
    process.exit(1);
  }

  const entries = parseGitLog(raw);

  if (entries.length === 0) {
    console.log("⚠️  No commits found in git history.");
    process.exit(0);
  }

  const versioned = assignVersions(entries, startVersion);

  console.log(`   Found ${versioned.length} commits`);
  console.log(
    `   Oldest: ${entries[0].date.split("T")[0]}  ${entries[0].hash}  ${entries[0].message.substring(0, 60)}`,
  );
  console.log(
    `   Newest: ${entries[entries.length - 1].date.split("T")[0]}  ${entries[entries.length - 1].hash}  ${entries[entries.length - 1].message.substring(0, 60)}`,
  );
  console.log(
    `   Versions: ${versioned[0].version} → ${versioned[versioned.length - 1].version}`,
  );

  // Calculate total stats
  const totalAdded = entries.reduce((sum, e) => sum + e.linesAdded, 0);
  const totalDeleted = entries.reduce((sum, e) => sum + e.linesDeleted, 0);
  const totalFiles = entries.reduce((sum, e) => sum + e.filesChanged, 0);
  console.log(
    `   Total: +${totalAdded.toLocaleString()} / -${totalDeleted.toLocaleString()} across ${totalFiles.toLocaleString()} file changes`,
  );
  console.log("");

  if (isDry) {
    console.log("── Preview (first 20 commits) ──────────────────────");
    for (const v of versioned.slice(0, 20)) {
      const stats =
        v.entry.filesChanged > 0
          ? ` (+${v.entry.linesAdded}/-${v.entry.linesDeleted}, ${v.entry.filesChanged}f)`
          : "";
      console.log(
        `   ${v.version} #${v.buildNumber}  ${v.entry.hash}  ${v.entry.date.split("T")[0]}  ${v.entry.message.substring(0, 50)}${stats}`,
      );
    }
    if (versioned.length > 20) {
      console.log(`   ... and ${versioned.length - 20} more`);
    }
    console.log("");
    console.log("   This is a dry run. To actually import, run without --dry:");
    console.log(
      "     pnpm ship:history" +
        (isClear ? " --clear" : "") +
        (since ? ` --since ${since}` : ""),
    );
    console.log("");
    return;
  }

  // Send to API in batches
  console.log("📤 Importing to server...");

  let totalImported = 0;
  let totalSkipped = 0;
  let totalCleared = 0;

  for (let i = 0; i < versioned.length; i += batchSize) {
    const batch = versioned.slice(i, i + batchSize);
    const isFirst = i === 0;

    const payload = {
      versions: batch.map((v) => ({
        version: v.version,
        buildNumber: v.buildNumber,
        gitCommit: v.entry.hash,
        commitMessage: v.entry.message,
        linesAdded: v.entry.linesAdded,
        linesDeleted: v.entry.linesDeleted,
        filesChanged: v.entry.filesChanged,
        deployedAt: v.entry.date,
      })),
      clearExisting: isFirst && isClear,
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const response = await fetch(`${config.url}/api/ship/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          (data.error as string) || `Server returned ${response.status}`,
        );
      }

      totalImported += (data.imported as number) || 0;
      totalSkipped += (data.skipped as number) || 0;
      if (data.cleared) totalCleared += data.cleared as number;

      const progress = Math.min(i + batchSize, versioned.length);
      process.stdout.write(
        `\r   Progress: ${progress}/${versioned.length} commits processed`,
      );
    } catch (error) {
      console.error(`\n\n❌ Failed at batch starting index ${i}`);
      console.error(
        "   ",
        extractErrorMessage(error),
      );
      if (totalImported > 0) {
        console.log(
          `\n   Partial import: ${totalImported} versions were imported before the error.`,
        );
        console.log(
          "   You can re-run the command safely — duplicates will be skipped.",
        );
      }
      process.exit(1);
    }
  }

  console.log(""); // Clear progress line
  console.log("");
  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║   ✅ History import complete!                                ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝",
  );
  console.log("");
  console.log(`   Imported:  ${totalImported} version(s)`);
  if (totalSkipped > 0)
    console.log(`   Skipped:   ${totalSkipped} (already existed)`);
  if (totalCleared > 0)
    console.log(
      `   Cleared:   ${totalCleared} (pre-existing versions removed)`,
    );
  console.log(
    `   Range:     ${versioned[0].version} → ${versioned[versioned.length - 1].version}`,
  );
  console.log(`   Builds:    #1 → #${versioned.length}`);
  console.log("");
  console.log(
    "   The next 'pnpm ship' will continue from where this left off.",
  );
  console.log(`   View history at: ${config.url}/admin/versions`);
  console.log("");
}

// ── Self-Update ──────────────────────────────────────────────────────

const ALL_SHIP_SCRIPTS: Record<string, string> = {
  ship: "__CLI_PATH__",
  "ship:minor": "__CLI_PATH__ --minor",
  "ship:major": "__CLI_PATH__ --major",
  "ship:init": "__CLI_PATH__ init",
  "ship:setup": "__CLI_PATH__ setup",
  "ship:history": "__CLI_PATH__ history",
  "ship:update": "__CLI_PATH__ update",
};

function ensurePackageJsonScripts(cliRelPath: string): boolean {
  const pkgPath = path.join(process.cwd(), "package.json");
  if (!existsSync(pkgPath)) return false;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    if (!pkg.scripts) pkg.scripts = {};

    const prefix = `tsx ${cliRelPath}`;
    let changed = false;

    for (const [name, template] of Object.entries(ALL_SHIP_SCRIPTS)) {
      const cmd = template.replace("__CLI_PATH__", prefix);
      if (pkg.scripts[name] !== cmd) {
        pkg.scripts[name] = cmd;
        changed = true;
      }
    }

    if (changed) {
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
    }
    return changed;
  } catch {
    return false;
  }
}

function ensureGitignore(): boolean {
  const gitignorePath = path.join(process.cwd(), ".gitignore");
  if (!existsSync(gitignorePath)) return false;

  try {
    const content = readFileSync(gitignorePath, "utf-8");
    if (content.includes(".matrx-ship.json")) return false;

    writeFileSync(
      gitignorePath,
      content.trimEnd() +
        "\n\n# Matrx Ship config (contains API key)\n.matrx-ship.json\n",
    );
    return true;
  } catch {
    return false;
  }
}

function ensureTsxDependency(): void {
  const pkgPath = path.join(process.cwd(), "package.json");
  if (!existsSync(pkgPath)) return;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const hasTsx =
      pkg.dependencies?.tsx ||
      pkg.devDependencies?.tsx ||
      pkg.optionalDependencies?.tsx;

    if (!hasTsx) {
      console.log("📦 Installing tsx (required for ship CLI)...");
      try {
        execSync("pnpm add -D tsx", { stdio: "inherit" });
        console.log("✅ tsx installed");
      } catch {
        console.log("⚠️  Could not auto-install tsx. Run: pnpm add -D tsx");
      }
    }
  } catch {
    // Ignore
  }
}

async function handleUpdate(): Promise<void> {
  console.log("");
  console.log("🔄 Updating Matrx Ship CLI...");
  console.log("");

  // Determine where the current script lives
  const currentScript = path.resolve(process.argv[1]);
  const scriptDir = path.dirname(currentScript);
  const cwd = process.cwd();
  const relPath = path.relative(cwd, currentScript);
  const hasPackageJson = existsSync(path.join(cwd, "package.json"));

  console.log(`   Script:  ${relPath}`);

  // Download the latest ship.ts
  console.log("   Downloading latest CLI from GitHub...");
  let content!: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(`${REPO_RAW}/cli/ship.ts`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(
        `GitHub returned ${response.status}: ${response.statusText}`,
      );
    }
    content = await response.text();

    if (!content.includes("Matrx Ship CLI")) {
      throw new Error("Downloaded file doesn't look like the ship CLI");
    }
  } catch (error) {
    const msg = extractErrorMessage(error);
    console.error(`❌ Failed to download update`);
    if (msg.includes("abort")) {
      console.error("   Connection timed out. Check your internet connection.");
    } else {
      console.error(`   ${msg}`);
    }
    process.exit(1);
  }

  // Ensure directory exists and write the file
  mkdirSync(scriptDir, { recursive: true });
  writeFileSync(currentScript, content, "utf-8");
  console.log("   ✅ CLI script updated");

  // For non-Node projects, also update the bash wrapper
  if (!hasPackageJson) {
    console.log("   Downloading latest bash wrapper...");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`${REPO_RAW}/cli/ship.sh`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const wrapperContent = await response.text();
        const wrapperPath = path.join(scriptDir, "ship.sh");
        writeFileSync(wrapperPath, wrapperContent, "utf-8");
        try {
          execSync(`chmod +x "${wrapperPath}"`, { stdio: "ignore" });
        } catch {
          // Windows doesn't have chmod
        }
        console.log("   ✅ Bash wrapper updated");
      }
    } catch {
      console.log("   ⚠️  Could not update bash wrapper (ship.sh)");
    }
  }

  if (hasPackageJson) {
    // Ensure package.json has all ship:* scripts
    const scriptsUpdated = ensurePackageJsonScripts(relPath);
    if (scriptsUpdated) {
      console.log("   ✅ package.json scripts updated");
    } else {
      console.log("   ✓  package.json scripts already up to date");
    }

    // Ensure tsx is installed
    ensureTsxDependency();
  }

  // Ensure .gitignore has .matrx-ship.json
  const gitignoreUpdated = ensureGitignore();
  if (gitignoreUpdated) {
    console.log("   ✅ Added .matrx-ship.json to .gitignore");
  }

  console.log("");
  console.log("   ✅ Matrx Ship CLI is up to date!");
  if (hasPackageJson) {
    console.log("   Run 'pnpm ship help' to see all commands.");
  } else {
    const wrapperRel = path.relative(cwd, path.join(scriptDir, "ship.sh"));
    console.log(`   Run 'bash ${wrapperRel} help' to see all commands.`);
  }
  console.log("");
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "setup") {
    await handleSetup(args.slice(1));
  } else if (command === "init") {
    await handleInit(args.slice(1));
  } else if (command === "history") {
    await handleHistory(args.slice(1));
  } else if (command === "update") {
    await handleUpdate();
  } else if (command === "status") {
    const config = loadConfig();
    await getStatus(config);
  } else if (command === "help" || command === "--help" || command === "-h") {
    const hasPackageJson = existsSync(path.join(process.cwd(), "package.json"));

    // Build command examples that match the invocation style
    const cmd = (sub: string) =>
      hasPackageJson ? `pnpm ship:${sub}` : `bash scripts/matrx/ship.sh ${sub}`;
    const ship = hasPackageJson ? "pnpm ship" : "bash scripts/matrx/ship.sh";
    const minor = hasPackageJson ? "pnpm ship:minor" : `${ship} --minor`;
    const major = hasPackageJson ? "pnpm ship:major" : `${ship} --major`;

    console.log(`
Matrx Ship CLI - Universal Deployment Tool

Usage:
  ${ship} "commit message"                  Patch version bump + deploy
  ${minor} "commit message"                 Minor version bump + deploy
  ${major} "commit message"                 Major version bump + deploy

Setup Commands:
  ${cmd("setup")} --token TOKEN             Save server credentials (one-time per machine)
  ${cmd("init")} PROJECT "Display Name"     Auto-provision an instance on the server
  ${cmd("init")} --url URL --key KEY        Manual config (provide your own URL + key)

History:
  ${cmd("history")}                         Import full git history into ship
  ${cmd("history")} --dry                   Preview what would be imported
  ${cmd("history")} --clear                 Clear existing versions and reimport
  ${cmd("history")} --since 2024-01-01      Only import commits after a date
  ${cmd("history")} --branch main           Import from a specific branch

Maintenance:
  ${cmd("update")}                          Update CLI to the latest version
  ${ship} status                            Show current version from server
  ${ship} help                              Show this help

Environment Variables:
  MATRX_SHIP_SERVER_TOKEN   Server token for provisioning (or use ${cmd("setup")})
  MATRX_SHIP_SERVER         MCP server URL (default: ${DEFAULT_MCP_SERVER})
  MATRX_SHIP_URL            Instance URL (overrides .matrx-ship.json)
  MATRX_SHIP_API_KEY        Instance API key (overrides .matrx-ship.json)

Quick Start:
  1. One-time: ${cmd("setup")} --token YOUR_SERVER_TOKEN
  2. Per project: ${cmd("init")} my-project "My Project"
  3. Import history: ${cmd("history")}
  4. Ship: ${ship} "your commit message"
  5. Update CLI: ${cmd("update")}
`);
  } else {
    await handleShip(args);
  }
}

main().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
