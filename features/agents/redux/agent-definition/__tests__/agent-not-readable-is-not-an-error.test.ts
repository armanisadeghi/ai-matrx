/**
 * An expected "agent not readable" refusal is logged as information, never as
 * an error (verifier round 3, claim 11: the red "1 Issue" dev badge on a chat
 * whose agent sits in another organization, while the page already said so).
 * The refusal keeps its code through a thunk's `.unwrap()` serialization.
 */
import { miniSerializeError } from "@reduxjs/toolkit";
import { logFailure } from "@/lib/errors/expectedRefusal";
import { agentNotReadableError, isAgentNotReadable } from "../agent-not-readable";

it("the refusal is recognized as thrown and as serialized by unwrap()", () => {
  const refusal = agentNotReadableError("a-1");
  expect(isAgentNotReadable(refusal)).toBe(true);
  expect(isAgentNotReadable(miniSerializeError(refusal))).toBe(true);
  expect(isAgentNotReadable(new Error("network down"))).toBe(false);
});

it("logs the refusal as info and any other failure as an error", () => {
  const info = jest.spyOn(console, "info").mockImplementation(() => {});
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  logFailure("[t]", miniSerializeError(agentNotReadableError("a-1")));
  expect(error).not.toHaveBeenCalled();
  expect(info).toHaveBeenCalledTimes(1);
  logFailure("[t]", new Error("network down"));
  expect(error).toHaveBeenCalledTimes(1);
  info.mockRestore();
  error.mockRestore();
});
