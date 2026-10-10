/**
 * STOPGAP, delete with the queue in jest.setup.ts / jest.chat-host.setup.ts once @ai-matrx/chat's
 * host/ui-slots no longer pulls the store, mandates/service and host/db at import time.
 * Runs the queued chat-UI slot registrations after the suite's own jest.mock calls are in place.
 */
beforeAll(() => {
  const g = globalThis as { __deferredChatUi?: Array<() => void> };
  for (const register of g.__deferredChatUi ?? []) register();
});
