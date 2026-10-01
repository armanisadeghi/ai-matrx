/**
 * THE IN-PLACE CHAT HOST — the ONE chat menu opens conversations in the page
 * that hosts a chat panel, and the most recent LIVE host owns it.
 *
 * PROVEN FAILING BEFORE PASSING: with the old "last registration wins, a
 * release clears only itself" store, releasing B after A then B registered
 * left NO host while A was still mounted — "hands back to the host
 * underneath" goes RED.
 */
import {
  currentInPlaceChatHost,
  registerInPlaceChatHost,
  type InPlaceChatHost,
} from "./in-place-chat-host";

const host = (id: string): InPlaceChatHost => ({
  activeConversationId: id,
  openConversation: jest.fn(),
  startNewChat: jest.fn(),
  startWithAgent: jest.fn(),
});

describe("in-place chat host", () => {
  it("is null on an ordinary page and the registered host on a hosting page", () => {
    expect(currentInPlaceChatHost()).toBeNull();
    const a = host("a");
    const release = registerInPlaceChatHost(a);
    expect(currentInPlaceChatHost()).toBe(a);
    release();
    expect(currentInPlaceChatHost()).toBeNull();
  });

  it("hands back to the host underneath when the top one leaves", () => {
    const a = host("a");
    const b = host("b");
    const releaseA = registerInPlaceChatHost(a);
    const releaseB = registerInPlaceChatHost(b);
    expect(currentInPlaceChatHost()).toBe(b);
    releaseB();
    expect(currentInPlaceChatHost()).toBe(a);
    releaseA();
    expect(currentInPlaceChatHost()).toBeNull();
  });

  it("a host released out of order never steals the menu from the live one", () => {
    const a = host("a");
    const b = host("b");
    const releaseA = registerInPlaceChatHost(a);
    const releaseB = registerInPlaceChatHost(b);
    releaseA();
    expect(currentInPlaceChatHost()).toBe(b);
    releaseB();
    expect(currentInPlaceChatHost()).toBeNull();
  });
});
