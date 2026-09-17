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
 * 2026-09-17 — the other half of that incident, closed. An expert tried to put
 * a book he owns into a Masterwork and was stopped in 11 seconds: `.epub` was
 * not in this list, so his file could not even be selected in the OS dialog,
 * and no error ever fired because nothing was ever submitted. Neither was any
 * image type — so the most natural way a person digitises paper, photographing
 * each page with their phone, was impossible too. Readers now exist for both
 * (`content_processing/sources/ebook.py`, `.../page_photo.py`) and the list
 * grew with them, which is the only way it is ever allowed to grow.
 *
 * 2026-09-17, the same day: `audio/*` / `video/*` alone were a SECOND dead end.
 * A TUS upload carries `application/octet-stream`, so the server's recording
 * gate (a mime-prefix check) refused every uploaded recording — a 9-hour
 * `.m4b` audiobook included, for a file the server's own chunker splits with
 * no duration ceiling. And a native file dialog does not reliably show a
 * `.m4b` behind a wildcard. The recording extensions are named now, and the
 * server's `is_recording` reads them.
 *
 * `.doc` (legacy binary Word) remains deliberately absent: nothing reads it.
 * A copy-protected ebook IS selectable and IS uploaded — and is then refused
 * with a sentence that names the lawful ways in (`protected_message`). We
 * detect protection; we never remove it.
 */
export const MASTERWORK_UPLOAD_ACCEPT =
  ".pdf,.docx,.pptx,.xlsx,.txt,.text,.log,.md,.markdown,.mdown,.rtf,.csv,.epub,.mobi,.prc,.azw,.azw3,.fb2,.html,.htm,.xhtml,.mhtml,.mht,.jpg,.jpeg,.png,.heic,.heif,.webp,.tiff,.tif,.bmp,.avif,.mp3,.m4a,.m4b,.aac,.flac,.ogg,.oga,.opus,.wav,.wma,.aiff,.aif,.webm,.mp4,.m4v,.mov,.mkv,.avi,.wmv,audio/*,video/*";

/** What we read, in the words we say it to a person. */
export const MASTERWORK_READABLE_SUMMARY =
  "PDFs, Word documents, PowerPoint decks, Excel sheets, plain text, Markdown, RTF and CSV; ebooks (EPUB, MOBI, AZW3, FB2) and saved web pages; photos and scans of pages, including straight off a phone — plus audio and video recordings, including audiobooks (M4B, M4A, AAC, FLAC, OGG, WMA) of any length";

/**
 * Just the photo/scan half of the list, for a picker that offers "photograph
 * pages" as its own lane (a phone's camera roll, multi-select). It is a SLICE
 * of the one list above, never a second list — the guard diffs the whole
 * string, and this is derived from it so it cannot drift on its own.
 */
export const MASTERWORK_PHOTO_ACCEPT = MASTERWORK_UPLOAD_ACCEPT.split(",")
  .filter((token) =>
    [".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tiff", ".tif", ".bmp", ".avif"].includes(
      token,
    ),
  )
  .join(",");
