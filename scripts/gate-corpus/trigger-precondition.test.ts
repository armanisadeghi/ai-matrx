import assert from "node:assert/strict";
import { test } from "node:test";
import { unexpectedUserTriggers } from "./trigger-precondition";

test("auth.users: only the mirror trigger passes", () => {
  assert.deepEqual(unexpectedUserTriggers("auth.users", ["on_auth_user_mirror"]), []);
});
test("auth.users: any extra trigger fails, by name", () => {
  assert.deepEqual(unexpectedUserTriggers("auth.users", ["on_auth_user_mirror", "on_auth_user_created"]), [
    "on_auth_user_created",
  ]);
});
test("the allowance is per table: the mirror name elsewhere still fails", () => {
  assert.deepEqual(unexpectedUserTriggers("auth.oauth_clients", ["on_auth_user_mirror"]), ["on_auth_user_mirror"]);
});
test("zero triggers passes", () => {
  assert.deepEqual(unexpectedUserTriggers("auth.oauth_clients", []), []);
});
