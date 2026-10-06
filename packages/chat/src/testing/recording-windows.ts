/**
 * Test host whose windows port records every open/close — for suites that
 * run package thunks or components which open windows. Replaces any host a
 * previous test configured.
 */

import { _resetChatHostForTests, configureChat } from "../host/configure";
import type { ChatWindowsPort } from "../host/contract";
import type { ChatWindowId } from "../host/windows";
import { createFakeDb } from "./fake-db";

export interface RecordedWindowCall {
  id: ChatWindowId;
  data?: unknown;
  instanceId?: string;
}

export interface RecordingWindows {
  opened: RecordedWindowCall[];
  closed: RecordedWindowCall[];
  port: ChatWindowsPort;
}

export function configureRecordingWindows(): RecordingWindows {
  const opened: RecordedWindowCall[] = [];
  const closed: RecordedWindowCall[] = [];
  const port: ChatWindowsPort = {
    open: (id, data, instanceId) => void opened.push({ id, data, instanceId }),
    close: (id, instanceId) => void closed.push({ id, instanceId }),
    isOpen: (id, instanceId) =>
      opened.some((c) => c.id === id && c.instanceId === instanceId) &&
      !closed.some((c) => c.id === id && c.instanceId === instanceId),
  };
  _resetChatHostForTests();
  configureChat({ db: createFakeDb().db, windows: port });
  return { opened, closed, port };
}
