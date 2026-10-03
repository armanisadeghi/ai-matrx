import {
  GOOGLE_TASK_CREATE_RECOVERY_KEY,
  normalizeGoogleTaskCreateRequest,
  readGoogleTaskCreateRecovery,
  sameGoogleTaskCreateScope,
  validateGoogleTaskCreateRequest,
  writeGoogleTaskCreateRecovery,
  type StorageDoor,
} from "./googleTaskCreateRecovery";

function memoryStorage(raw: string | null = null): StorageDoor & { raw(): string | null } {
  let value = raw;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    removeItem: () => { value = null; },
    raw: () => value,
  };
}

test("normalizes the exact reviewed create before it receives a stable key", () => {
  expect(normalizeGoogleTaskCreateRequest({
    organizationId: "org", connectionId: "connection", taskListId: "list",
    callerStableKey: "stable_key_123456", title: "  Review me  ", notes: "  one note  ", dueDate: "2026-10-08",
  })).toEqual({
    organization_id: "org", connection_id: "connection", task_list_id: "list",
    caller_stable_key: "stable_key_123456", title: "Review me", notes: "one note", due: "2026-10-08T00:00:00.000Z",
  });
});

const validRequest = {
  organization_id: "org", connection_id: "connection", task_list_id: "list_1",
  caller_stable_key: "stable_key_123456", title: "Reviewed task", notes: null, due: null,
};

test.each([
  ["short caller key", { ...validRequest, caller_stable_key: "x" }],
  ["invalid caller key characters", { ...validRequest, caller_stable_key: "invalid key 123456" }],
  ["blank title", { ...validRequest, title: "   " }],
  ["overlong title", { ...validRequest, title: "t".repeat(1025) }],
  ["overlong notes", { ...validRequest, notes: "n".repeat(8193) }],
  ["blank notes", { ...validRequest, notes: "   " }],
  ["overlong organization id", { ...validRequest, organization_id: "o".repeat(129) }],
  ["overlong connection id", { ...validRequest, connection_id: "c".repeat(129) }],
  ["invalid list id", { ...validRequest, task_list_id: "list/unsafe" }],
  ["arbitrary due text", { ...validRequest, due: "tomorrow" }],
  ["impossible due date", { ...validRequest, due: "2026-02-30T00:00:00Z" }],
  ["hour 24 due date", { ...validRequest, due: "2026-10-08T24:00:00Z" }],
  ["year zero due date", { ...validRequest, due: "0000-10-08T00:00:00Z" }],
  ["invalid offset due date", { ...validRequest, due: "2026-10-08T00:00:00+24:00" }],
  ["unknown field", { ...validRequest, injected: true }],
])("rejects recovered request constraint: %s", (_name, request) => {
  expect(validateGoogleTaskCreateRequest(request)).toBeNull();
});

test("trims selected text and canonicalizes an aware due timestamp like the server", () => {
  expect(validateGoogleTaskCreateRequest({
    ...validRequest,
    title: "  Reviewed task  ",
    notes: "  Exact note  ",
    due: "2026-10-08T15:42:19.123456-07:00",
  })).toEqual({
    ...validRequest,
    title: "Reviewed task",
    notes: "Exact note",
    due: "2026-10-08T00:00:00.000Z",
  });
});

test("an attempting record is durably changed to uncertain on restore", () => {
  const storage = memoryStorage(JSON.stringify({
    version: 1, actor_id: "user", phase: "attempting",
    request: { organization_id: "org", connection_id: "connection", task_list_id: "list", caller_stable_key: "stable_key_123456", title: "Maybe", notes: null, due: null },
  }));
  const restored = readGoogleTaskCreateRecovery(storage, "user");
  expect(restored.record?.phase).toBe("uncertain");
  expect(JSON.parse(storage.raw() ?? "null").phase).toBe("uncertain");
});

test.each([
  ["malformed", "{bad", "malformed task recovery record"],
  ["foreign", JSON.stringify({ version: 1, actor_id: "other", phase: "uncertain", request: {} }), "another signed-in person"],
])("%s recovery is loud and never becomes a request", (_name, raw, warning) => {
  const restored = readGoogleTaskCreateRecovery(memoryStorage(raw), "user");
  expect(restored.record).toBeNull();
  expect(restored.warning).toContain(warning);
});

test("scope comparison binds actor, organization, exact connection and list", () => {
  const storage = memoryStorage();
  const record = {
    version: 1 as const, actor_id: "user", phase: "reviewed_unattempted" as const,
    request: { organization_id: "org", connection_id: "connection", task_list_id: "list", caller_stable_key: "stable_key_123456", title: "Exact", notes: null, due: null },
  };
  expect(writeGoogleTaskCreateRecovery(storage, record)).toBe(true);
  expect(storage.getItem(GOOGLE_TASK_CREATE_RECOVERY_KEY)).not.toBeNull();
  expect(sameGoogleTaskCreateScope(record, { actorId: "user", organizationId: "org", connectionId: "connection", taskListId: "list" })).toBe(true);
  expect(sameGoogleTaskCreateScope(record, { actorId: "user", organizationId: "org", connectionId: "other", taskListId: "list" })).toBe(false);
});
