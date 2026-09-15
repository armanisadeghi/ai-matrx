const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const syncFs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  atomicJson,
  createStore,
  initialState,
  validateState,
  recoveryCookieSession,
  runRecoveryStateMachine,
} = require("./proton-cookie-recovery-34008769.cjs");
const actor = "a".repeat(64);
const sessionId = "11111111-1111-4111-8111-111111111111";
async function root() {
  return fs.mkdtemp(path.join(os.tmpdir(), "proton-recovery-"));
}
async function owned(dir) {
  await fs.mkdir(path.join(dir, "profile"));
  await fs.writeFile(path.join(dir, "fixture"), "fixture");
}
function cookie(token = "x".repeat(32), direct = false) {
  const value = `base64-${Buffer.from(JSON.stringify({ access_token: token })).toString("base64url")}`;
  const mid = Math.ceil(value.length / 2);
  const item = (name, value) => ({
    name,
    value,
    domain: ".aimatrx.com",
    path: "/",
    secure: false,
  });
  return [
    item("sb-matrx-auth-v2.0", value.slice(0, mid)),
    item("sb-matrx-auth-v2.1", value.slice(mid)),
    ...(direct ? [item("sb-matrx-auth-v2", value)] : []),
  ];
}
function ops(
  store,
  dir,
  {
    fail,
    reconcile = "absent",
    trace = [],
    persisted = [],
    closeFails = false,
    launchFails = false,
    verifyFails = false,
  } = {},
) {
  const saved = store.persist.bind(store);
  store.persist = async (next) => {
    persisted.push(next);
    if (fail?.(next)) throw Error("persist_failed");
    return saved(next);
  };
  const exists = async (file) => {
    try {
      await fs.lstat(file);
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  };
  return {
    store,
    preflight: async () => {},
    launch: async () => {
      trace.push("launch");
      if (launchFails) throw Error("profile_lock");
      return {};
    },
    close: async () => {
      trace.push("close");
      if (closeFails) throw Error("close_failed");
    },
    verify: async () => {
      trace.push("verify");
      if (verifyFails) throw Error("verify_failed");
      return { token: "t", actorSha256: actor, sessionId };
    },
    logout: async () => {
      trace.push("logout");
      return 204;
    },
    reconcile: async () => {
      trace.push("reconcile");
      return reconcile;
    },
    profileExists: () => exists(path.join(dir, "profile")),
    fixtureExists: () => exists(path.join(dir, "fixture")),
    removeProfile: async () => {
      trace.push("rm-profile");
      await fs.rm(path.join(dir, "profile"), { recursive: true });
    },
    removeFixture: async () => {
      trace.push("rm-fixture");
      await fs.rm(path.join(dir, "fixture"));
    },
  };
}
test("closed receipt validation rejects unknown/type/causal records", () => {
  const base = initialState();
  for (const item of [
    { ...base, extra: true },
    { ...base, complete: "true" },
    { ...base, logout: { ...base.logout, retryUsed: "false" } },
    { ...base, fixtureRemoval: "removed" },
    {
      ...base,
      actorSha256: actor,
      sessionId,
      logout: { state: "proven", proof: "204", retryUsed: false },
    },
  ])
    assert.throws(() => validateState(item));
});
test("cookie parser rejects direct cookie and overlong token", () => {
  assert.equal(recoveryCookieSession(cookie()).access_token.length, 32);
  assert.throws(
    () => recoveryCookieSession(cookie("x".repeat(8193))),
    /access_token/,
  );
  assert.throws(
    () => recoveryCookieSession(cookie("x".repeat(32), true)),
    /direct/,
  );
});
test("response loss resumes from exact absence without launch", async () => {
  const dir = await root();
  try {
    await owned(dir);
    const file = path.join(dir, "receipt.json");
    const receipt = initialState();
    receipt.actorSha256 = actor;
    receipt.sessionId = sessionId;
    receipt.browser = { attemptId: sessionId, state: "closed" };
    receipt.logout = { state: "attempted", proof: null, retryUsed: false };
    atomicJson(file, receipt);
    const trace = [];
    const result = await runRecoveryStateMachine(
      ops(createStore(file), dir, { trace }),
    );
    assert.equal(result.ok, true);
    assert.equal(trace.includes("launch"), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("present exact session durably starts one same-session retry before logout", async () => {
  const dir = await root();
  try {
    await owned(dir);
    const file = path.join(dir, "receipt.json");
    const receipt = initialState();
    receipt.actorSha256 = actor;
    receipt.sessionId = sessionId;
    receipt.browser = { attemptId: sessionId, state: "closed" };
    receipt.logout = { state: "attempted", proof: null, retryUsed: false };
    atomicJson(file, receipt);
    const trace = [];
    const persisted = [];
    const result = await runRecoveryStateMachine(
      ops(createStore(file), dir, { reconcile: "present", trace, persisted }),
    );
    assert.equal(result.ok, true);
    const intent = persisted.find((state) => state.browser.state === "open");
    assert.ok(intent.browser.attemptId !== sessionId);
    assert.equal(intent.logout.retryUsed, true);
    assert.deepEqual(trace.slice(0, 4), [
      "reconcile",
      "launch",
      "verify",
      "logout",
    ]);
    assert.ok(trace.indexOf("close") < trace.indexOf("rm-profile"));
    assert.ok(trace.indexOf("rm-profile") < trace.indexOf("rm-fixture"));
    assert.equal(trace.filter((step) => step === "logout").length, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("open receipt restarts by quiescing a fresh context before normal authentication", async () => {
  const dir = await root();
  try {
    await owned(dir);
    const file = path.join(dir, "receipt.json");
    const receipt = initialState();
    receipt.browser = { attemptId: sessionId, state: "open" };
    atomicJson(file, receipt);
    const trace = [];
    const persisted = [];
    const result = await runRecoveryStateMachine(
      ops(createStore(file), dir, { trace, persisted }),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(trace.slice(0, 5), [
      "launch",
      "close",
      "launch",
      "verify",
      "logout",
    ]);
    const attemptIds = [
      ...new Set(
        persisted
          .filter((state) => state.browser.state === "open")
          .map((state) => state.browser.attemptId),
      ),
    ];
    assert.equal(attemptIds.length, 2);
    assert.notEqual(attemptIds[0], attemptIds[1]);
    assert.equal(
      persisted.find((state) => state.browser.attemptId === attemptIds[0])
        .actorSha256,
      null,
    );
    assert.ok(trace.lastIndexOf("close") < trace.indexOf("rm-profile"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("competing profile lock refuses without auth or removal", async () => {
  const dir = await root();
  try {
    await owned(dir);
    const file = path.join(dir, "receipt.json");
    const receipt = initialState();
    receipt.browser = { attemptId: sessionId, state: "open" };
    atomicJson(file, receipt);
    const trace = [];
    const result = await runRecoveryStateMachine(
      ops(createStore(file), dir, { trace, launchFails: true }),
    );
    assert.equal(result.ok, false);
    assert.deepEqual(trace, ["launch"]);
    await fs.stat(path.join(dir, "profile"));
    await fs.stat(path.join(dir, "fixture"));
    const durable = JSON.parse(await fs.readFile(file, "utf8"));
    assert.equal(durable.browser.state, "open");
    assert.notEqual(durable.browser.attemptId, sessionId);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("closed not-started receipt after verify failure can launch a fresh attempt", async () => {
  const dir = await root();
  try {
    await owned(dir);
    const file = path.join(dir, "receipt.json");
    const first = await runRecoveryStateMachine(
      ops(createStore(file), dir, { verifyFails: true }),
    );
    assert.equal(first.ok, false);
    const failedReceipt = JSON.parse(await fs.readFile(file, "utf8"));
    assert.equal(failedReceipt.browser.state, "closed");
    const trace = [];
    const second = await runRecoveryStateMachine(
      ops(createStore(file), dir, { trace }),
    );
    assert.equal(second.ok, true);
    assert.deepEqual(trace.slice(0, 3), ["launch", "verify", "logout"]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("close failure retains both owned children", async () => {
  const dir = await root();
  try {
    await owned(dir);
    const result = await runRecoveryStateMachine(
      ops(createStore(path.join(dir, "receipt.json")), dir, {
        closeFails: true,
      }),
    );
    assert.equal(result.ok, false);
    await fs.stat(path.join(dir, "profile"));
    await fs.stat(path.join(dir, "fixture"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
async function restart(field, removed) {
  const dir = await root();
  try {
    await owned(dir);
    const file = path.join(dir, "receipt.json");
    let failed = false;
    const first = await runRecoveryStateMachine(
      ops(createStore(file), dir, {
        fail: (next) => !failed && next[field] === "removed" && (failed = true),
      }),
    );
    assert.equal(first.ok, false);
    await assert.rejects(fs.stat(path.join(dir, removed)));
    const second = await runRecoveryStateMachine(ops(createStore(file), dir));
    assert.equal(second.ok, true);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
test("profile rm then receipt failure restarts with absent profile", () =>
  restart("profileRemoval", "profile"));
test("fixture rm then receipt failure restarts with absent fixture", () =>
  restart("fixtureRemoval", "fixture"));
test("post-rename fsync failure is a lifecycle refusal", async () => {
  const dir = await root();
  try {
    await owned(dir);
    let calls = 0;
    const store = createStore(path.join(dir, "receipt.json"), (file, value) =>
      atomicJson(file, value, {
        fsync(fd) {
          if (++calls === 2) throw Error("fsync");
          syncFs.fsyncSync(fd);
        },
      }),
    );
    const result = await runRecoveryStateMachine(ops(store, dir));
    assert.equal(result.ok, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
