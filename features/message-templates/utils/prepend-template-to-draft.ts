/**
 * Places a message template above an existing draft without changing any of
 * the draft's bytes. Empty drafts receive only the trimmed template content.
 */
export function prependTemplateToDraft(
  templateContent: string,
  existingDraft: string,
): string {
  const template = templateContent.trim();
  return existingDraft ? `${template}\n\n${existingDraft}` : template;
}
