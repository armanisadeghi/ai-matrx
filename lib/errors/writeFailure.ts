// lib/errors/writeFailure.ts — A FAILED WRITE IS SAID IN WORDS, WITH A REMEDY.
//
// Lives in `@ai-matrx/data/db` (the rule and its incidents are in that module's
// header); this path keeps every app importer unchanged and `WriteRefusedError`
// one class for the app and `@ai-matrx/chat`. `toastWriteFailure` (beside this
// file) puts the words on screen.
export {
  assertWriteLanded,
  describeWriteFailure,
  personSentence,
  serverMessageFromBody,
  WriteRefusedError,
  type WriteFailureWords,
} from "@ai-matrx/data/db";
