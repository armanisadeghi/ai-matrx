/* Explicitly armed, localhost-only acceptance for the real KeePass XML dialog. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
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
      (url.hostname === "127.0.0.1" ||
        url.hostname === "::1" ||
        url.hostname === "localhost" ||
        url.hostname.endsWith(".localhost")) &&
      (!port || url.port === port)
    );
  } catch {
    return false;
  }
}
function parsePreviewLease(raw) {
  const values = Object.fromEntries(
    String(raw)
      .split("\n")
      .flatMap((line) => {
        const index = line.indexOf("=");
        return index > 0 ? [[line.slice(0, index), line.slice(index + 1)]] : [];
      }),
  );
  return values;
}
function assertPreviewAttestation(lease, config, expected, deps = {}) {
  assert(lease.ROOT === expected.worktree, "preview_checkout_mismatch");
  assert(
    lease.OWNER_HOST === new URL(config.frontend).hostname,
    "preview_host_mismatch",
  );
  assert(
    lease.PORT === "3001" && /^\d+$/.test(lease.PID || ""),
    "preview_lease_invalid",
  );
  const alive =
    deps.isAlive ||
    ((pid) => {
      try {
        process.kill(Number(pid), 0);
        return true;
      } catch {
        return false;
      }
    });
  const processCwd =
    deps.processCwd ||
    ((pid) =>
      execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
        encoding: "utf8",
      })
        .split("\n")
        .find((line) => line.startsWith("n"))
        ?.slice(1));
  assert(alive(lease.PID), "preview_pid_not_live");
  assert(
    processCwd(lease.PID) === expected.worktree,
    "preview_process_checkout_mismatch",
  );
}
function previewLeasePath(env = process.env) {
  return (
    env.MATRX_KEEPASS_PREVIEW_LEASE ||
    path.join(
      env.MATRX_PREVIEW_STATE_DIR ||
        path.join("/tmp", `matrx-frontend-preview-${process.getuid()}`),
      "shared-next-dev.meta",
    )
  );
}
async function readPreviewAttestation(config, env = process.env) {
  const lease = parsePreviewLease(
    await fs.readFile(previewLeasePath(env), "utf8"),
  );
  const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: WORKTREE,
    encoding: "utf8",
  }).trim();
  assertPreviewAttestation(lease, config, {
    worktree: WORKTREE,
  });
  return { lease, sourceHead };
}
function assertVaultOrigin(url, config) {
  assert(new URL(url).origin === config.api, "foreign_vault_origin_refused");
}
function requestDigest(bodyText) {
  return crypto.createHash("sha256").update(bodyText).digest("hex");
}
function runtimeConfig(env = process.env) {
  const frontend = env.MATRX_KEEPASS_LOCAL_FRONTEND,
    api = env.MATRX_KEEPASS_LOCAL_API;
  assert(env.MATRX_KEEPASS_IMPORT_CANARY === ARM, "explicit_arm_required");
  assert(localOrigin(frontend, "3001"), "localhost_frontend_required");
  assert(localOrigin(api), "localhost_api_required");
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
    first.digest === retry.digest &&
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
  assert(response.ok, "owned_reconciliation_list_required");
  const body = await response.json();
  assert(Array.isArray(body?.items), "owned_reconciliation_shape_required");
  return body.items.filter((item) => names.has(item?.display_name));
}
async function reconcile(config, actor, ledger, names, deps = {}) {
  const items = await listOwned(config, actor, names);
  for (const item of items) {
    assert(typeof item.id === "string", "owned_reconciliation_id_required");
    const attempt = ledger.attempts.find(
      (candidate) => candidate.name === item.display_name,
    );
    assert(attempt, "owned_reconciliation_attempt_required");
    if (!attempt.itemIds.includes(item.id)) attempt.itemIds.push(item.id);
  }
  await (deps.save || save)(ledger);
  return items;
}
function bodyIdentity(body) {
  return {
    definitionKey: body.definition_key,
    source: body.source,
    principal: body.principal?.type,
    fieldKeys: (body.fields || []).map((field) => field.field_key).sort(),
    loginUrlCount: Array.isArray(body.login_urls) ? body.login_urls.length : -1,
    browserFillEnabled: body.browser_fill_enabled,
  };
}
async function recordAttempt(ledger, name, key, body, bodyText, deps = {}) {
  const identity = bodyIdentity(body);
  const digest = requestDigest(bodyText);
  const existing = ledger.attempts.find((attempt) => attempt.name === name);
  if (existing) {
    assert(
      existing.key === key &&
        JSON.stringify(existing.body) === JSON.stringify(identity) &&
        existing.digest === digest,
      "attempt_mapping_mismatch",
    );
    return existing;
  }
  const attempt = { name, key, digest, body: identity, itemIds: [] };
  ledger.attempts.push(attempt);
  await (deps.save || save)(ledger);
  return attempt;
}
async function cleanup(config, actor, ledger, names, deps = {}) {
  const failures = [];
  if (!actor?.token || !actor.orgId)
    return [new Error("owned_cleanup_context_unavailable")];
  let items = [];
  try {
    items = await reconcile(config, actor, ledger, names, deps);
  } catch (error) {
    failures.push(error);
  }
  const ids = new Set([
    ...items.map((item) => item.id),
    ...ledger.attempts.flatMap((attempt) => attempt.itemIds),
  ]);
  for (const id of ids) {
    try {
      const response = await api(
        config,
        actor,
        `/api/vault/items/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      assert.equal(response.status, 204, "owned_cleanup_delete_required");
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    assert.equal(
      (await listOwned(config, actor, names)).length,
      0,
      "owned_cleanup_baseline_required",
    );
  } catch (error) {
    failures.push(error);
  }
  if (failures.length === 0)
    try {
      ledger.cleaned = true;
      await (deps.save || save)(ledger);
    } catch (error) {
      ledger.cleaned = false;
      failures.push(error);
    }
  return failures;
}
function finalFailure(primary, cleanupFailures) {
  return cleanupFailures.length
    ? new AggregateError(
        [...cleanupFailures, ...(primary ? [primary] : [])],
        "keepass_cleanup_incomplete",
      )
    : primary;
}
async function removeArtifact(remove, target, code, failures) {
  try {
    await remove(target);
  } catch {
    failures.push(new Error(code));
  }
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
  const ledger = {
    run: RUN,
    sourceHead: null,
    baseline: null,
    attempts: [],
    cleaned: false,
  };
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
    const preview = await readPreviewAttestation(config);
    ledger.sourceHead = preview.sourceHead;
    await save(ledger);
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
    let resolveActorBound;
    const actorBound = new Promise((resolve) => {
      resolveActorBound = resolve;
    });
    let observedAllowedVaultRequest = false;
    context.on("request", (request) => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/vault/")) return;
      assertVaultOrigin(request.url(), config);
      observedAllowedVaultRequest = true;
      const headers = request.headers();
      if (
        headers.authorization === `Bearer ${actor.token}` &&
        /^[0-9a-f-]{36}$/i.test(headers["x-organization-id"] || "")
      ) {
        actor.orgId = headers["x-organization-id"];
        resolveActorBound();
      }
    });
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
      const attempt = await recordAttempt(
        ledger,
        expected.title,
        key,
        body,
        bodyText,
      );
      const response = await route.fetch();
      assert(response.ok(), "create_must_complete");
      const created = await response.json();
      assert(typeof created?.id === "string", "create_receipt_required");
      if (!attempt.itemIds.includes(created.id))
        attempt.itemIds.push(created.id);
      await save(ledger);
      const receipt = { key, digest: requestDigest(bodyText), id: created.id };
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
    await page
      .getByRole("button", { name: "Import passwords", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").click();
    await page
      .getByRole("option", { name: "KeePass / KeePassXC XML", exact: true })
      .click();
    await dialog.locator('input[type="file"]').setInputFiles(FIXTURE);
    await Promise.race([
      actorBound,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("request_actor_preflight_required")),
          20_000,
        ),
      ),
    ]);
    assert(observedAllowedVaultRequest, "allowed_vault_request_not_observed");
    const baseline = await listOwned(config, actor, names);
    assert.equal(baseline.length, 0, "owned_baseline_required");
    ledger.baseline = {
      names: [...names],
      count: 0,
      organizationId: actor.orgId,
    };
    await save(ledger);
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
    assert(
      first &&
        ledger.attempts.length === 1 &&
        ledger.attempts[0].itemIds.includes(first.id),
      "response_loss_receipt_required",
    );
    const retryItems = await reconcile(
      config,
      actor,
      ledger,
      new Set([retry.title]),
    );
    assert.equal(retryItems.length, 1, "response_loss_exactly_one_item");
    assert(
      ledger.attempts[0].key === first.key &&
        ledger.attempts[0].itemIds.length === 1 &&
        ledger.attempts[0].itemIds[0] === retryItems[0].id,
      "response_loss_durable_mapping_required",
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
      assert(response.ok, "encrypted_source_reveal_required");
      assertSource((await response.json()).value, item);
    }
  } catch (error) {
    primaryFailure = error;
  } finally {
    let cleanupFailures;
    try {
      cleanupFailures = await cleanup(config, actor, ledger, names);
    } catch (error) {
      cleanupFailures = [error];
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
        cleanupFailures.push(new Error("browser_logout_required"));
      }
    }
    if (context) {
      try {
        await context.clearCookies();
        await context.close();
      } catch {
        cleanupFailures.push(new Error("browser_close_required"));
      }
    }
    await removeArtifact(
      (target) => fs.rm(target, { force: true }),
      FIXTURE,
      "fixture_removal_required",
      cleanupFailures,
    );
    await removeArtifact(
      (target) => fs.rm(target, { recursive: true, force: true }),
      PROFILE,
      "profile_removal_required",
      cleanupFailures,
    );
    if (cleanupFailures.length === 0 && ledger.cleaned) {
      await removeArtifact(
        (target) => fs.rm(target, { force: true }),
        LEDGER,
        "ledger_removal_required",
        cleanupFailures,
      );
    }
    const failure = finalFailure(primaryFailure, cleanupFailures);
    if (failure) throw failure;
  }
  process.stdout.write(
    "PASS: localhost KeePass retry, duplicate, cancellation, preservation, and cleanup\n",
  );
}
module.exports = {
  exactRetry,
  localOrigin,
  runtimeConfig,
  assertSource,
  parsePreviewLease,
  assertPreviewAttestation,
  assertVaultOrigin,
  requestDigest,
  listOwned,
  reconcile,
  cleanup,
  finalFailure,
  recordAttempt,
  removeArtifact,
};
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
