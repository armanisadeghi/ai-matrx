/**
 * HOST RE-EXPORT ONLY — TextInputDialog lives in `@ai-matrx/design-system` (moved whole, chat host-slot
 * batch 2, 2026-10-08); its multiline box is ProTextarea through `WritingBoxProvider` (AlchemyHost).
 * Kept one batch because seven test files `jest.mock` this path; codemod them with the importers next.
 */
export { TextInputDialog, type TextInputDialogProps } from "@ai-matrx/design-system";
