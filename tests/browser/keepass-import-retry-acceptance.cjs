/* Explicitly armed, localhost-only acceptance for the real KeePass XML dialog. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const ARM = "RUN_UNDER_REVIEW";
const WORKTREE = path.resolve(__dirname, "..", "..");
const RUN = crypto.randomUUID();
const RUN_ROOT = path.join(
  WORKTREE,
  ".matrx",
  "keepass-localhost-acceptance",
  `run-${RUN}`,
);
const PROFILE = path.join(RUN_ROOT, "private-profile");
const FIXTURE = path.join(RUN_ROOT, "keepass.xml");
const LEDGER = path.join(RUN_ROOT, "recovery-receipts.json");

function localOrigin(value, port) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      (!port || url.port === port)
    );
  } catch {
    return false;
  }
}
function runtimeConfig(env = process.env) {
  const frontend = env.MATRX_KEEPASS_LOCAL_FRONTEND,
    api = env.MATRX_KEEPASS_LOCAL_API;
  assert(env.MATRX_KEEPASS_IMPORT_CANARY === ARM, "explicit_arm_required");
  assert(localOrigin(frontend, "3001"), "localhost_frontend_required");
  assert(localOrigin(api), "localhost_api_required");
  assert(
    env.NEXT_PUBLIC_BACKEND_URL_PROD === api,
    "compiled_backend_origin_required",
  );
  assert(
    env.AI_ADMIN_USERNAME === "admin@admin.com" &&
      typeof env.AI_ADMIN_PASSWORD === "string" &&
      env.AI_ADMIN_PASSWORD.length > 0,
    "verified_admin_env_required",
  );
  return { frontend: new URL(frontend).origin, api: new URL(api).origin };
}
function exactRetry(first, retry) {
  return (
    first.key === retry.key &&
    first.body === retry.body &&
    first.id === retry.id
  );
}
function entry(x) {
  return `<Entry><UUID>${x.uuid}</UUID><String><Key>Title</Key><Value>${x.title}</Value></String><String><Key>UserName</Key><Value>${x.username}</Value></String><String><Key>Password</Key><Value>${x.password}</Value></String><String><Key>URL</Key><Value>${x.url}</Value></String><String><Key>Notes</Key><Value>${x.notes}</Value></String></Entry>`;
}
function xml(entries) {
  return `<?xml version="1.0" encoding="utf-8"?><KeePassFile><Meta><Generator>KeePassXC</Generator><DatabaseName>Acceptance</DatabaseName></Meta><Root><Group><UUID>AAAAAAAAAAAAAAAAAAAAAA==</UUID><Name>Acceptance</Name>${entries.join("")}</Group></Root></KeePassFile>`;
}
function name(kind) {
  return `KeePass localhost ${kind} ${RUN}`;
}
async function save(ledger) {
  await fs.writeFile(LEDGER, JSON.stringify(ledger), { mode: 0o600 });
}
function expectedSource(x) {
  return {
    source: "keepass_xml",
    version: 1,
    entry_xml: x.entryXml,
    group_path: ["Acceptance"],
    meta_xml: [
      "<Generator>KeePassXC</Generator>",
      "<DatabaseName>Acceptance</DatabaseName>",
    ],
    excluded_binary_definition_count: 0,
  };
}
function assertSource(value, expected) {
  assert.deepEqual(
    JSON.parse(value),
    expectedSource(expected),
    "encrypted_source_preservation_required",
  );
}
function assertCreate(body, x, actor) {
  assert(
    body?.display_name === x.title &&
      body.definition_key === "website_login" &&
      body.source === "system_import",
    "owned_create_identity_required",
  );
  assert.deepEqual(
    body.principal,
    { type: "user" },
    "owned_create_principal_required",
  );
  assert.deepEqual(
    body.login_urls,
    [x.url],
    "owned_create_destination_required",
  );
  assert(
    body.uri_match_mode === "never" && body.browser_fill_enabled === false,
    "owned_create_custody_required",
  );
  const fields = new Map(
    (body.fields || []).map((field) => [field.field_key, field]),
  );
  assert.deepEqual(
    [...fields.keys()].sort(),
    ["import_notes", "import_source_record", "password", "username"],
    "owned_create_fields_required",
  );
  assert(
    fields.get("username")?.value === x.username &&
      fields.get("password")?.value === x.password &&
      fields.get("import_notes")?.value === x.notes,
    "owned_create_values_required",
  );
  assert(
    fields.get("import_source_record")?.handling === "revealable" &&
      fields.get("import_source_record")?.editable === false &&
      fields.get("import_source_record")?.inject_into_sandbox === false,
    "owned_source_custody_required",
  );
  assert(
    actor.email === "admin@admin.com" && actor.id,
    "canonical_admin_actor_required",
  );
}
function apiUrl(config, pathname) {
  const url = new URL(pathname, config.api);
  assert(url.origin === config.api, "api_origin_escape_refused");
  return url;
}
async function api(config, actor, pathname, init = {}) {
  assert(
    actor?.token && actor?.orgId && actor.email === "admin@admin.com",
    "authenticated_local_request_context_required",
  );
  return fetch(apiUrl(config, pathname), {
    ...init,
    headers: {
      Authorization: `Bearer ${actor.token}`,
      "X-Organization-Id": actor.orgId,
      ...(init.headers || {}),
    },
  });
}
async function listOwned(config, actor, names) {
  const response = await api(
    config,
    actor,
    "/api/vault/items?principal_type=user",
  );
  assert(response.ok(), "owned_reconciliation_list_required");
  const body = await response.json();
  assert(Array.isArray(body?.items), "owned_reconciliation_shape_required");
  return body.items.filter((item) => names.has(item?.display_name));
}
async function reconcile(config, actor, ledger, names) {
  const items = await listOwned(config, actor, names);
  for (const item of items) {
    assert(typeof item.id === "string", "owned_reconciliation_id_required");
    if (!ledger.ids.includes(item.id)) ledger.ids.push(item.id);
  }
  await save(ledger);
  return items;
}
async function cleanup(config, actor, ledger, names) {
  if (!actor?.token || !actor.orgId) return false;
  for (const item of await reconcile(config, actor, ledger, names)) {
    const response = await api(
      config,
      actor,
      `/api/vault/items/${encodeURIComponent(item.id)}`,
      { method: "DELETE" },
    );
    assert.equal(response.status, 204, "owned_cleanup_delete_required");
  }
  assert.equal(
    (await listOwned(config, actor, names)).length,
    0,
    "owned_cleanup_baseline_required",
  );
  ledger.cleaned = true;
  await save(ledger);
  return true;
}

async function main() {
  const config = runtimeConfig();
  await fs.mkdir(RUN_ROOT, { recursive: true, mode: 0o700 });
  const retry = {
    title: name("retry"),
    username: `retry-${RUN}@example.invalid`,
    password: `Synthetic-${RUN}`,
    url: "https://retry.example.invalid/login",
    notes: "Synthetic retry fixture",
    uuid: "AQAAAAAAAAAAAAAAAAAAAA==",
  };
  const cancelOne = {
    title: name("cancel-one"),
    username: `cancel-one-${RUN}@example.invalid`,
    password: `Synthetic-${RUN}-one`,
    url: "https://cancel.example.invalid/one",
    notes: "Synthetic cancellation fixture one",
    uuid: "AgAAAAAAAAAAAAAAAAAAAA==",
  };
  const cancelTwo = {
    title: name("cancel-two"),
    username: `cancel-two-${RUN}@example.invalid`,
    password: `Synthetic-${RUN}-two`,
    url: "https://cancel.example.invalid/two",
    notes: "Synthetic cancellation fixture two",
    uuid: "AwAAAAAAAAAAAAAAAAAAAA==",
  };
  for (const item of [retry, cancelOne, cancelTwo]) item.entryXml = entry(item);
  const names = new Set([retry.title, cancelOne.title, cancelTwo.title]);
  const ledger = { run: RUN, keys: [], ids: [], cleaned: false };
  await save(ledger);
  await fs.writeFile(FIXTURE, xml([retry.entryXml]), { mode: 0o600 });
  let context;
  let page;
  let actor;
  let primaryFailure;
  try {
    context = await chromium.launchPersistentContext(PROFILE, {
      headless: true,
    });
    page = await context.newPage();
    const login = page.waitForResponse(
      (response) =>
        response.url().includes("/auth/v1/token") &&
        response.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.goto(`${config.frontend}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.locator("#email").fill(process.env.AI_ADMIN_USERNAME);
    await page.locator("#password").fill(process.env.AI_ADMIN_PASSWORD);
    await Promise.all([
      page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 }),
      page.getByRole("button", { name: "Sign in", exact: true }).click(),
    ]);
    const session = await (await login).json();
    assert(
      session?.user?.email === "admin@admin.com" &&
        typeof session?.user?.id === "string" &&
        typeof session?.access_token === "string",
      "canonical_admin_session_required",
    );
    actor = {
      id: session.user.id,
      email: session.user.email,
      token: session.access_token,
      orgId: undefined,
    };
    let first;
    let cancelReached;
    let signalCancelReached;
    let releaseCancel;
    const cancelReachedPromise = new Promise((resolve) => {
      signalCancelReached = resolve;
    });
    const releaseCancelPromise = new Promise((resolve) => {
      releaseCancel = resolve;
    });
    let cancellationPhase = false;
    await context.route("**/api/vault/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin !== config.api) return route.abort("blockedbyclient");
      // The dialog needs real local read/limits traffic. Only creates are
      // intercepted; every other Vault route may continue solely to the same
      // already-validated loopback origin (cleanup included).
      if (request.method() !== "POST" || url.pathname !== "/api/vault/items")
        return route.continue();
      const headers = request.headers(),
        bodyText = request.postData() || "",
        body = request.postDataJSON();
      assert(
        headers.authorization === `Bearer ${actor.token}` &&
          /^[0-9a-f-]{36}$/i.test(headers["x-organization-id"] || ""),
        "bound_create_auth_required",
      );
      actor.orgId = headers["x-organization-id"];
      const expected = [retry, cancelOne, cancelTwo].find(
        (item) => item.title === body?.display_name,
      );
      assert(expected, "unexpected_create_refused");
      assertCreate(body, expected, actor);
      const key = headers["idempotency-key"];
      assert(
        typeof key === "string" && key.length > 0,
        "idempotency_key_required",
      );
      if (!ledger.keys.includes(key)) {
        ledger.keys.push(key);
        await save(ledger);
      }
      const response = await route.fetch();
      assert(response.ok(), "create_must_complete");
      const created = await response.json();
      assert(typeof created?.id === "string", "create_receipt_required");
      if (!ledger.ids.includes(created.id)) {
        ledger.ids.push(created.id);
        await save(ledger);
      }
      const receipt = { key, body: bodyText, id: created.id };
      if (expected === retry && !first) {
        first = receipt;
        return route.abort("failed");
      }
      if (expected === retry) {
        assert(exactRetry(first, receipt), "same_key_body_and_item_required");
        return route.fulfill({ response });
      }
      if (expected === cancelOne) {
        assert(cancellationPhase, "unexpected_cancel_create");
        cancelReached = true;
        signalCancelReached();
        await releaseCancelPromise;
        return route.fulfill({ response });
      }
      return route.fulfill({ response });
    });
    await page.goto(`${config.frontend}/vault`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page
      .getByRole("button", { name: "Import passwords", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").click();
    await page
      .getByRole("option", { name: "KeePass / KeePassXC XML", exact: true })
      .click();
    await dialog.locator('input[type="file"]').setInputFiles(FIXTURE);
    await dialog
      .getByText(/1 selected; 0 skipped; 0 invalid; 0 unsupported/i)
      .waitFor({ timeout: 20_000 });
    await dialog
      .getByText(
        "I approve disclosure of the listed destination and public-key metadata.",
        { exact: true },
      )
      .click();
    await dialog
      .getByRole("button", { name: "Import selected records", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Retry current row", exact: true })
      .waitFor({ timeout: 20_000 });
    await dialog
      .getByRole("button", { name: "Retry current row", exact: true })
      .click();
    await dialog
      .getByText(/Imported 1; skipped 0; failed 0/i)
      .waitFor({ timeout: 20_000 });
    assert(first && ledger.ids.length === 1, "response_loss_receipt_required");
    assert.equal(
      (await reconcile(config, actor, ledger, new Set([retry.title]))).length,
      1,
      "response_loss_exactly_one_item",
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Import passwords", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").click();
    await page
      .getByRole("option", { name: "KeePass / KeePassXC XML", exact: true })
      .click();
    await dialog.locator('input[type="file"]').setInputFiles(FIXTURE);
    await dialog
      .getByText(/0 selected; 1 skipped; 0 invalid; 0 unsupported/i)
      .waitFor({ timeout: 20_000 });
    await page.keyboard.press("Escape");
    await fs.writeFile(FIXTURE, xml([cancelOne.entryXml, cancelTwo.entryXml]), {
      mode: 0o600,
    });
    cancellationPhase = true;
    await page
      .getByRole("button", { name: "Import passwords", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").click();
    await page
      .getByRole("option", { name: "KeePass / KeePassXC XML", exact: true })
      .click();
    await dialog.locator('input[type="file"]').setInputFiles(FIXTURE);
    await dialog
      .getByText(/2 selected; 0 skipped; 0 invalid; 0 unsupported/i)
      .waitFor({ timeout: 20_000 });
    await dialog
      .getByText(
        "I approve disclosure of the listed destination and public-key metadata.",
        { exact: true },
      )
      .click();
    await dialog
      .getByRole("button", { name: "Import selected records", exact: true })
      .click();
    await Promise.race([
      cancelReachedPromise,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("cancel_dispatch_barrier_required")),
          20_000,
        ),
      ),
    ]);
    assert(
      cancelReached && cancellationPhase,
      "cancel_dispatch_barrier_required",
    );
    await dialog
      .getByRole("button", { name: "Stop after current row", exact: true })
      .click();
    releaseCancel();
    await dialog
      .getByText(
        /Imported 1; skipped 0; failed 0\. Stopped after the confirmed current row/i,
      )
      .waitFor({ timeout: 20_000 });
    const owned = await reconcile(config, actor, ledger, names);
    assert.equal(owned.length, 2, "cancel_exactly_one_current_row_required");
    assert(
      !owned.some((item) => item.display_name === cancelTwo.title),
      "cancel_second_row_refused",
    );
    for (const item of [retry, cancelOne]) {
      const ownedItem = owned.find((row) => row.display_name === item.title);
      const response = await api(
        config,
        actor,
        `/api/vault/items/${encodeURIComponent(ownedItem.id)}/reveal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field_key: "import_source_record" }),
        },
      );
      assert(response.ok(), "encrypted_source_reveal_required");
      assertSource((await response.json()).value, item);
    }
  } catch (error) {
    primaryFailure = error;
  } finally {
    let cleanupFailure;
    try {
      if (!(await cleanup(config, actor, ledger, names)))
        cleanupFailure = new Error("owned_cleanup_context_unavailable");
    } catch {
      cleanupFailure = new Error("owned_cleanup_failed");
    }
    if (page) {
      try {
        await page.goto(`${config.frontend}/sign-out`, {
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        });
        await page
          .getByRole("button", { name: "Sign Out", exact: true })
          .click();
        const first = page.getByRole("button", {
          name: "I understand, continue",
          exact: true,
        });
        if (await first.isVisible().catch(() => false)) {
          await first.click();
          await page
            .getByRole("button", { name: /^I am .+\. Sign me out$/ })
            .click();
        }
        await page.waitForURL((url) => url.pathname === "/login", {
          timeout: 15_000,
        });
      } catch {
        cleanupFailure ||= new Error("browser_logout_required");
      }
    }
    if (context) {
      try {
        await context.clearCookies();
        await context.close();
      } catch {
        cleanupFailure ||= new Error("browser_close_required");
      }
    }
    await fs.rm(FIXTURE, { force: true });
    await fs.rm(PROFILE, { recursive: true, force: true });
    if (ledger.cleaned) await fs.rm(LEDGER, { force: true });
    if (primaryFailure) throw primaryFailure;
    if (cleanupFailure) throw cleanupFailure;
  }
  process.stdout.write(
    "PASS: localhost KeePass retry, duplicate, cancellation, preservation, and cleanup\n",
  );
}
module.exports = { exactRetry, localOrigin, runtimeConfig, assertSource };
if (require.main === module) {
  if (process.env.MATRX_KEEPASS_IMPORT_CANARY !== ARM)
    throw new Error("inert_canary_requires_explicit_arm");
  main().catch((error) => {
    process.stderr.write(
      `Acceptance refused: ${/^[a-z0-9_]+$/.test(error.message) ? error.message : "keepass_local_canary_failed"}\n`,
    );
    process.exitCode = 1;
  });
}
