/**
 * HOST RE-EXPORT ONLY — ErrorNotice (THE inline error card) lives in `@ai-matrx/design-system`
 * (moved whole, chat host-slot batch 2, 2026-10-08). Its Alchemy Menu arrives through
 * `ErrorActionsProvider` and its corner menu / right-click menu through `ErrorCardMenusProvider`,
 * both mounted in `components/agent-copy/AlchemyHost.tsx`. 150 files import this path; codemod next
 * batch. Guard: `components/errors/__tests__/error-renders-carry-alchemy.test.ts`.
 */
export { ErrorNotice, type ErrorNoticeProps } from "@ai-matrx/design-system";
