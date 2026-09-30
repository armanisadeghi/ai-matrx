// lib/detail/__tests__/harness.tsx
//
// The test seat for the Detail primitive in THIS repo: `@ai-matrx/detail/testing`
// (the package's own stub-port seat) bound to jest's mock factory, plus the one
// host-specific default — the remedy phrase a developer here actually reads.
// One seat, no twin: the stubs, shells and mount live in the package.

import type { DetailHostPorts } from "@ai-matrx/detail/react";
import { makePortsWith, type StubPorts } from "@ai-matrx/detail/testing";

export {
  FILE_TYPE,
  StubDockedShell,
  StubPageShell,
  StubWindowShell,
  clickByLabel,
  instance,
  mount,
  type Mounted,
  type StubPorts,
} from "@ai-matrx/detail/testing";

const makeJestPorts = makePortsWith(jest.fn);

export function makePorts(overrides: Partial<DetailHostPorts> = {}): StubPorts {
  return makeJestPorts({
    remedy: { typeMap: "the item registry (features/item-presentation/registry.tsx)" },
    ...overrides,
  });
}
