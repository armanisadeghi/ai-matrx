/**
 * THE ONE LIST — what the upload picker offers IS what the server reads.
 *
 * 2026-09-12: the picker's `accept` read
 * `.pdf,.doc,.docx,.txt,.md,.rtf,.epub,.pptx,audio/*,video/*` while the server
 * had readers for PDF and OpenXML Office only. A person uploaded a 599-byte
 * `.txt` — their own checklist, the simplest source there is — and the server
 * refused it. The file dialog was inviting exactly the files that would be
 * thrown away.
 *
 * So this constant is the ONLY place a Masterwork upload picker gets its
 * `accept` from, and it is the same list the server publishes in
 * `aidream/aidream/services/distillation/source_types.py` (`UPLOAD_ACCEPT`) —
 * which is itself derived from the orchestrator's adapter routing table, so a
 * type cannot be advertised anywhere unless something actually reads it.
 *
 * The two copies are diffed by a guard that fails on any drift:
 * `aidream/aidream/services/distillation/tests/test_upload_accept_has_a_reader.py`
 * (`test_the_frontend_picker_advertises_exactly_this_list`). Change one side
 * and that test names the difference.
 *
 * `.doc` / `.epub` are deliberately absent: nothing reads them yet. When a
 * reader lands, the server list grows and this one grows with it.
 */
export const MASTERWORK_UPLOAD_ACCEPT =
  ".pdf,.docx,.pptx,.xlsx,.txt,.text,.log,.md,.markdown,.mdown,.rtf,audio/*,video/*";

/** What we read, in the words we say it to a person. */
export const MASTERWORK_READABLE_SUMMARY =
  "PDFs, Word documents, PowerPoint decks, Excel sheets, plain text, Markdown and RTF — plus audio and video recordings";
