/* Exact-run cleanup only. It never navigates, logs in, imports, or writes product data. */
const fs = require("node:fs/promises");
const syncFs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  chromium,
} = require("/Users/armanisadeghi/code/matrx-frontend/node_modules/playwright");
const RUN = "34008769-a909-4255-82e8-733f2a95cca2";
const ROOT = `/Users/armanisadeghi/code/matrx-frontend/.matrx/surface-check-artifacts/proton-retry-canary/run-${RUN}`;
const PROFILE = `${ROOT}/cft-private-profile-e3f2f013-9311-4409-88c8-e5821daa621e`;
const FIXTURE = `${ROOT}/proton-input.json`;
const PROOF = `${ROOT}/proof.json`;
const EVIDENCE = `/Users/armanisadeghi/code/matrx-frontend/.matrx/surface-check-artifacts/proton-retry-canary/recovery-${RUN}.json`;
const PROOF_SHA =
  "93dce9ce77a99a57a8ae191e71dc2da492c37f3c128b03fbac2acef0d94efedf";
const KEYS = [
  "version",
  "runId",
  "originalProofSha256",
  "profile",
  "fixture",
  "actorSha256",
  "sessionId",
  "logout",
  "browser",
  "profileRemoval",
  "fixtureRemoval",
  "complete",
];
const LOGOUT_KEYS = ["state", "proof", "retryUsed"];
const BROWSER_KEYS = ["attemptId", "state"];
const logoutOrder = { not_started: 0, attempted: 1, proven: 2 };
const removalOrder = { not_started: 0, attempted: 1, removed: 2 };
const assert = (value, code) => {
  if (!value) throw new Error(code);
};
const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
const hash = (value) =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const plain = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) =>
  plain(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
function initialState() {
  return {
    version: 1,
    runId: RUN,
    originalProofSha256: PROOF_SHA,
    profile: PROFILE,
    fixture: FIXTURE,
    actorSha256: null,
    sessionId: null,
    logout: { state: "not_started", proof: null, retryUsed: false },
    browser: { attemptId: null, state: "closed" },
    profileRemoval: "not_started",
    fixtureRemoval: "not_started",
    complete: false,
  };
}
function validateState(state) {
  assert(exact(state, KEYS), "recovery_receipt_shape");
  assert(
    state.version === 1 &&
      state.runId === RUN &&
      state.originalProofSha256 === PROOF_SHA &&
      state.profile === PROFILE &&
      state.fixture === FIXTURE,
    "recovery_receipt_mismatch",
  );
  assert(
    exact(state.logout, LOGOUT_KEYS) && exact(state.browser, BROWSER_KEYS),
    "recovery_receipt_shape",
  );
  assert(
    Object.hasOwn(logoutOrder, state.logout.state) &&
      Object.hasOwn(removalOrder, state.profileRemoval) &&
      Object.hasOwn(removalOrder, state.fixtureRemoval),
    "recovery_receipt_state",
  );
  assert(
    ["open", "closed"].includes(state.browser.state) &&
      typeof state.logout.retryUsed === "boolean" &&
      typeof state.complete === "boolean",
    "recovery_receipt_type",
  );
  const identity = hash(state.actorSha256) && uuid(state.sessionId);
  assert(
    (state.actorSha256 === null && state.sessionId === null) || identity,
    "recovery_receipt_identity",
  );
  assert(
    state.browser.attemptId === null || uuid(state.browser.attemptId),
    "recovery_receipt_attempt",
  );
  if (state.logout.state === "not_started")
    assert(
      state.actorSha256 === null &&
        state.sessionId === null &&
        state.logout.proof === null &&
        !state.logout.retryUsed,
      "recovery_receipt_causality",
    );
  else {
    assert(
      identity && uuid(state.browser.attemptId),
      "recovery_receipt_causality",
    );
    assert(
      state.logout.state === "attempted"
        ? state.logout.proof === null
        : ["204", "exact_session_absent"].includes(state.logout.proof),
      "recovery_receipt_causality",
    );
  }
  const removalStarted =
    state.profileRemoval !== "not_started" ||
    state.fixtureRemoval !== "not_started";
  if (removalStarted)
    assert(
      state.logout.state === "proven" &&
        state.browser.state === "closed" &&
        uuid(state.browser.attemptId),
      "recovery_receipt_causality",
    );
  if (state.fixtureRemoval !== "not_started")
    assert(state.profileRemoval === "removed", "recovery_receipt_order");
  if (state.complete)
    assert(
      state.profileRemoval === "removed" && state.fixtureRemoval === "removed",
      "recovery_receipt_complete",
    );
  if (state.browser.attemptId === null)
    assert(
      state.logout.state === "not_started" &&
        state.browser.state === "closed" &&
        !removalStarted &&
        !state.complete,
      "recovery_receipt_causality",
    );
  return state;
}
function validateTransition(previous, next) {
  validateState(previous);
  validateState(next);
  assert(
    next.version === previous.version &&
      next.runId === previous.runId &&
      next.originalProofSha256 === previous.originalProofSha256 &&
      next.profile === previous.profile &&
      next.fixture === previous.fixture,
    "recovery_receipt_immutable",
  );
  assert(
    logoutOrder[next.logout.state] >= logoutOrder[previous.logout.state] &&
      removalOrder[next.profileRemoval] >=
        removalOrder[previous.profileRemoval] &&
      removalOrder[next.fixtureRemoval] >=
        removalOrder[previous.fixtureRemoval],
    "recovery_receipt_regression",
  );
  assert(
    !previous.logout.retryUsed || next.logout.retryUsed,
    "recovery_receipt_regression",
  );
  assert(!previous.complete || next.complete, "recovery_receipt_reopen");
  if (previous.actorSha256 !== null)
    assert(
      previous.actorSha256 === next.actorSha256 &&
        previous.sessionId === next.sessionId,
      "recovery_receipt_identity_changed",
    );
  if (previous.logout.state === "not_started" && next.logout.state === "proven")
    throw Error("recovery_receipt_logout_jump");
  if (
    previous.profileRemoval === "not_started" &&
    next.profileRemoval === "removed"
  )
    throw Error("recovery_receipt_removal_jump");
  if (
    previous.fixtureRemoval === "not_started" &&
    next.fixtureRemoval === "removed"
  )
    throw Error("recovery_receipt_removal_jump");
  if (
    previous.browser.attemptId &&
    next.browser.attemptId !== previous.browser.attemptId
  ) {
    const beforeRemoval =
      previous.profileRemoval === "not_started" &&
      previous.fixtureRemoval === "not_started" &&
      !previous.complete &&
      next.profileRemoval === "not_started" &&
      next.fixtureRemoval === "not_started" &&
      !next.complete;
    const preservesLogoutFacts =
      previous.logout.state === next.logout.state &&
      previous.logout.proof === next.logout.proof &&
      previous.logout.retryUsed === next.logout.retryUsed;
    const isQuiescenceRecovery =
      beforeRemoval &&
      previous.browser.state === "open" &&
      next.browser.state === "open" &&
      preservesLogoutFacts;
    const isClosedNotStartedRetry =
      beforeRemoval &&
      previous.browser.state === "closed" &&
      previous.logout.state === "not_started" &&
      next.browser.state === "open" &&
      preservesLogoutFacts;
    const isBoundedPresentRetry =
      beforeRemoval &&
      previous.browser.state === "closed" &&
      previous.logout.state === "attempted" &&
      previous.logout.retryUsed === false &&
      previous.profileRemoval === "not_started" &&
      previous.fixtureRemoval === "not_started" &&
      next.browser.state === "open" &&
      next.logout.state === "attempted" &&
      next.logout.retryUsed === true;
    assert(
      isQuiescenceRecovery || isClosedNotStartedRetry || isBoundedPresentRetry,
      "recovery_receipt_attempt_replace",
    );
  }
  return next;
}
function transition(state, patch) {
  return validateState({ ...state, ...patch });
}
function atomicJson(target, value, { fsync = syncFs.fsyncSync } = {}) {
  const temporary = `${target}.tmp`;
  const descriptor = syncFs.openSync(
    temporary,
    syncFs.constants.O_WRONLY |
      syncFs.constants.O_CREAT |
      syncFs.constants.O_TRUNC |
      syncFs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    syncFs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fsync(descriptor);
  } finally {
    syncFs.closeSync(descriptor);
  }
  syncFs.renameSync(temporary, target);
  const directory = syncFs.openSync(
    path.dirname(target),
    syncFs.constants.O_RDONLY,
  );
  try {
    fsync(directory);
  } finally {
    syncFs.closeSync(directory);
  }
}
function createStore(file, write = atomicJson) {
  let prior;
  return {
    async read() {
      try {
        prior = validateState(JSON.parse(await fs.readFile(file, "utf8")));
        return prior;
      } catch (error) {
        if (error?.code === "ENOENT") {
          prior = initialState();
          return prior;
        }
        throw error;
      }
    },
    async persist(next) {
      validateTransition(prior, next);
      write(file, next);
      prior = next;
      return next;
    },
  };
}
function recoveryCookieSession(cookies) {
  assert(
    cookies.filter((cookie) => cookie.name === "sb-matrx-auth-v2").length === 0,
    "recovery_cookie_direct_ambiguous",
  );
  const chunks = [];
  for (const cookie of cookies) {
    const match = /^sb-matrx-auth-v2\.(0|[1-9]\d*)$/.exec(cookie.name);
    if (!match) continue;
    assert(
      cookie.domain === ".aimatrx.com" &&
        cookie.path === "/" &&
        cookie.secure === false &&
        typeof cookie.value === "string",
      "recovery_cookie_scope_ambiguous",
    );
    chunks.push({ index: Number(match[1]), value: cookie.value });
  }
  assert(chunks.length === 2, "recovery_cookie_chunk_count");
  chunks.sort((left, right) => left.index - right.index);
  assert(
    chunks[0].index === 0 && chunks[1].index === 1,
    "recovery_cookie_chunks_noncontiguous",
  );
  const encoded = chunks.map((chunk) => chunk.value).join("");
  assert(
    encoded.length <= 16 * 1024 && encoded.startsWith("base64-"),
    "recovery_cookie_encoding",
  );
  const payload = encoded.slice(7);
  assert(/^[A-Za-z0-9_-]+$/.test(payload), "recovery_cookie_base64url");
  const decoded = Buffer.from(payload, "base64url");
  assert(
    decoded.length <= 12 * 1024 && decoded.toString("base64url") === payload,
    "recovery_cookie_base64url_roundtrip",
  );
  const session = JSON.parse(decoded);
  assert(
    typeof session?.access_token === "string" &&
      session.access_token.length > 20 &&
      session.access_token.length <= 8 * 1024,
    "recovery_cookie_access_token",
  );
  return session;
}
async function exactExistingOrAbsent(target, parent, expected, absentAllowed) {
  try {
    const stat = await fs.lstat(target);
    assert(!stat.isSymbolicLink() && stat[expected](), "owned_path_invalid");
    assert(
      (await fs.realpath(target)) === target && path.dirname(target) === parent,
      "owned_path_invalid",
    );
    return true;
  } catch (error) {
    if (error?.code === "ENOENT" && absentAllowed) return false;
    throw error;
  }
}
async function runRecoveryStateMachine(ops) {
  let state = await ops.store.read();
  let context = null;
  const save = async (next) => {
    state = await ops.store.persist(next);
  };
  const start = async (patch = {}) => {
    const attemptId = crypto.randomUUID();
    await save(
      transition(state, { ...patch, browser: { attemptId, state: "open" } }),
    );
    context = await ops.launch();
  };
  const close = async () => {
    assert(context, "recovery_context_missing");
    await ops.close(context);
    context = null;
    await save(
      transition(state, {
        browser: { attemptId: state.browser.attemptId, state: "closed" },
      }),
    );
  };
  try {
    await ops.preflight(
      state,
      state.logout.state === "proven" && state.browser.state === "closed",
    );
    if (state.browser.state === "open") {
      await start();
      await close();
    }
    if (state.logout.state === "attempted") {
      const outcome = await ops.reconcile(state);
      if (outcome === "absent")
        await save(
          transition(state, {
            logout: {
              ...state.logout,
              state: "proven",
              proof: "exact_session_absent",
            },
          }),
        );
      else if (outcome === "present" && !state.logout.retryUsed) {
        await start({ logout: { ...state.logout, retryUsed: true } });
        const verified = await ops.verify(context);
        assert(
          verified.actorSha256 === state.actorSha256 &&
            verified.sessionId === state.sessionId,
          "recovery_identity_changed",
        );
        assert(
          (await ops.logout(verified.token)) === 204,
          "local_logout_failed",
        );
        await save(
          transition(state, {
            logout: { ...state.logout, state: "proven", proof: "204" },
          }),
        );
        await close();
      } else throw Error("logout_outcome_unknown");
    }
    if (state.logout.state === "not_started") {
      await start();
      const verified = await ops.verify(context);
      await save(
        transition(state, {
          actorSha256: verified.actorSha256,
          sessionId: verified.sessionId,
          logout: { state: "attempted", proof: null, retryUsed: false },
        }),
      );
      assert((await ops.logout(verified.token)) === 204, "local_logout_failed");
      await save(
        transition(state, {
          logout: { ...state.logout, state: "proven", proof: "204" },
        }),
      );
      await close();
    }
    assert(
      state.logout.state === "proven" && state.browser.state === "closed",
      "recovery_quiescence_missing",
    );
    if (state.profileRemoval !== "removed") {
      await save(transition(state, { profileRemoval: "attempted" }));
      if (await ops.profileExists(true)) await ops.removeProfile();
      await save(transition(state, { profileRemoval: "removed" }));
    }
    if (state.fixtureRemoval !== "removed") {
      await save(transition(state, { fixtureRemoval: "attempted" }));
      if (await ops.fixtureExists(true)) await ops.removeFixture();
      await save(transition(state, { fixtureRemoval: "removed" }));
    }
    await save(transition(state, { complete: true }));
    return { ok: true, state };
  } catch (error) {
    if (context) {
      try {
        await close();
      } catch {}
    }
    return {
      ok: false,
      state,
      error: String(error?.message || "recovery_refused"),
    };
  }
}
async function buildProductionOperations() {
  require("dotenv").config({
    path: path.resolve(__dirname, "../../.env.local"),
    quiet: true,
  });
  const proofBytes = await fs.readFile(PROOF);
  assert(sha256(proofBytes) === PROOF_SHA, "original_proof_changed");
  assert(
    JSON.parse(proofBytes).runId === RUN &&
      JSON.parse(proofBytes).attempts.length === 0,
    "run_not_zero_attempts",
  );
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert(
    key?.startsWith("sb_publishable_"),
    "canonical_publishable_key_unavailable",
  );
  const exactFetch = (url, options) =>
    fetch(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  async function verify(context) {
    const session = recoveryCookieSession(
      await context.cookies("https://www.aimatrx.com"),
    );
    const response = await exactFetch(
      "https://db.matrxserver.com/auth/v1/user",
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    );
    assert(response.status === 200, "canonical_user_verification_failed");
    const user = await response.json();
    const claims = JSON.parse(
      Buffer.from(session.access_token.split(".")[1] || "", "base64url"),
    );
    assert(
      user?.email === "admin@admin.com" &&
        uuid(user.id) &&
        uuid(claims.session_id),
      "recovery_identity_not_admin",
    );
    return {
      token: session.access_token,
      actorSha256: sha256(user.id),
      sessionId: claims.session_id,
    };
  }
  return {
    store: createStore(EVIDENCE),
    preflight: (state, absent) =>
      Promise.all([
        exactExistingOrAbsent(PROFILE, ROOT, "isDirectory", absent),
        exactExistingOrAbsent(FIXTURE, ROOT, "isFile", absent),
      ]),
    launch: () =>
      chromium.launchPersistentContext(PROFILE, {
        executablePath:
          "/Users/armanisadeghi/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        headless: true,
      }),
    close: (context) => context.close(),
    verify,
    logout: async (token) =>
      (
        await exactFetch(
          "https://db.matrxserver.com/auth/v1/logout?scope=local",
          {
            method: "POST",
            headers: { apikey: key, Authorization: `Bearer ${token}` },
          },
        )
      ).status,
    reconcile: (state) =>
      require("./reconcile-proton-cookie-session-34008769.cjs").reconcileExactSession(
        state,
      ),
    profileExists: (absent) =>
      exactExistingOrAbsent(PROFILE, ROOT, "isDirectory", absent),
    fixtureExists: (absent) =>
      exactExistingOrAbsent(FIXTURE, ROOT, "isFile", absent),
    removeProfile: () => fs.rm(PROFILE, { recursive: true, force: false }),
    removeFixture: () => fs.rm(FIXTURE, { force: false }),
  };
}
async function main() {
  const result = await runRecoveryStateMachine(
    await buildProductionOperations(),
  );
  if (!result.ok) throw Error("exact_recovery_incomplete");
}
module.exports = {
  atomicJson,
  createStore,
  initialState,
  validateState,
  validateTransition,
  transition,
  recoveryCookieSession,
  runRecoveryStateMachine,
  buildProductionOperations,
};
if (require.main === module) {
  if (
    process.env.MATRX_PROTON_COOKIE_RECOVERY !==
    "RECOVER_EXACT_RUN_UNDER_REVIEW"
  )
    throw Error("inert_recovery_requires_explicit_arm");
  main().catch(() => {
    process.stderr.write(
      "Exact Proton recovery refused; retained material was preserved when incomplete\n",
    );
    process.exitCode = 1;
  });
}
