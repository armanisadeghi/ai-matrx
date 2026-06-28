/**
 * Inserts text at the current cursor position in a contenteditable editor
 * identified by `data-editor-id`.
 */
export function insertTextAtCursor(editorId: string, text: string): boolean {
  try {
    const editor = document.querySelector(
      `[data-editor-id="${editorId}"]`,
    ) as HTMLDivElement | null;
    if (!editor) {
      console.error("[editor-text-insertion] Editor not found:", editorId);
      return false;
    }

    editor.focus();

    const selection = window.getSelection();
    if (!selection) {
      console.error("[editor-text-insertion] Selection not available");
      return false;
    }

    let range: Range;

    if (selection.rangeCount > 0) {
      range = selection.getRangeAt(0);
    } else {
      range = document.createRange();
      const lastNode = editor.lastChild;
      if (lastNode) {
        if (lastNode.nodeType === Node.TEXT_NODE) {
          range.setStart(lastNode, lastNode.textContent?.length ?? 0);
        } else {
          range.setStartAfter(lastNode);
        }
      } else {
        range.setStart(editor, 0);
      }
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    if (!range.collapsed) {
      range.deleteContents();
    }

    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);

    editor.focus();

    return true;
  } catch (error) {
    console.error("[editor-text-insertion] Error inserting text:", error);
    return false;
  }
}
