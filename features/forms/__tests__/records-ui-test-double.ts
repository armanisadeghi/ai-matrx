// features/forms/__tests__/records-ui-test-double.ts
//
// Shared Jest test double for `@ai-matrx/records-ui`, used by every suite in this directory
// that mounts `PublicFormRunner`. Peer commit 8e26dc5def made `PublicFormRunner` import
// `RecordsUiProvider` from the package alongside `FormRunner`; a hand-rolled mock exporting
// only `FormRunner` leaves `RecordsUiProvider` `undefined` and React kills the render with
// "Element type is invalid".
//
// Per forcing-function-tests §4 ("doubles replace what the SUT calls, never what it is"), this
// double models the whole door: `jest.requireActual` keeps every real export — including
// `RecordsUiProvider`, a plain context provider, not the UI under test — and only `FormRunner`
// (the presentational component the suites need to inspect props on, without rendering the
// real record-picker UI) is replaced. A future export `PublicFormRunner` starts using from the
// package arrives here already real, instead of rendering as `undefined`.
//
// `mockFormRunnerCalls` is exported (not a per-file closure) so both suites read the same
// captured-props array; `mockRecordsUiFormRunnerFactory`'s name is prefixed "mock" so
// babel-plugin-jest-hoist allows passing it straight into `jest.mock(...)` from another file.

export const mockFormRunnerCalls: Array<Record<string, unknown>> = [];

export function mockRecordsUiFormRunnerFactory(): Record<string, unknown> {
  const actual = jest.requireActual("@ai-matrx/records-ui") as Record<string, unknown>;
  return {
    ...actual,
    FormRunner: (props: Record<string, unknown>) => {
      mockFormRunnerCalls.push(props);
      return null;
    },
  };
}
