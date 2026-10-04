/**
 * Test helper: the <ChatProvider> a suite mounts around a real chat surface.
 * Package hooks (useChatHost and everything built on it) read the host from
 * React context, so `configureChat` alone is not enough for a rendered tree.
 * Every port the suite does not pass is the package default.
 */

import type { ComponentProps, ReactNode } from "react";
import { ChatProvider } from "../react";
import { createFakeDb } from "./fake-db";

// One host object per module: configureChat caches by reference.
const TEST_HOST = {
  db: createFakeDb().db,
  server: { baseUrl: () => "https://server.test" },
};

/** Pass the suite's own `store` so package selectors read the store the test seeds. */
export function ChatHostTestProvider({
  children,
  store,
}: {
  children: ReactNode;
  store?: ComponentProps<typeof ChatProvider>["store"];
}) {
  return (
    <ChatProvider host={TEST_HOST} store={store}>
      {children}
    </ChatProvider>
  );
}
