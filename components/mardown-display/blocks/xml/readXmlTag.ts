/** Dependency-free XML tag reader shared by XML chrome and stream boundaries. */

export interface ReadXmlTag {
  tagName: string;
  raw: string;
  isClosing: boolean;
  isSelfClosing: boolean;
  attributes: Array<{ name: string; value: string }>;
}

const XML_NAME_START = /[A-Za-z_]/;
const XML_NAME_CHARACTER = /[\w.:-]/;

export function readXmlTag(content: string, start: number): ReadXmlTag | null {
  let cursor = start + 1;
  const isClosing = content[cursor] === "/";
  if (isClosing) cursor++;
  if (!XML_NAME_START.test(content[cursor] ?? "")) return null;
  const nameStart = cursor;
  while (XML_NAME_CHARACTER.test(content[cursor] ?? "")) cursor++;
  const tagName = content.slice(nameStart, cursor);
  const attributes: Array<{ name: string; value: string }> = [];
  if (isClosing) {
    while (/\s/.test(content[cursor] ?? "")) cursor++;
    if (content[cursor] !== ">") return null;
    return {
      tagName,
      raw: content.slice(start, cursor + 1),
      isClosing,
      isSelfClosing: false,
      attributes,
    };
  }
  while (cursor < content.length) {
    while (/\s/.test(content[cursor] ?? "")) cursor++;
    if (content[cursor] === ">")
      return {
        tagName,
        raw: content.slice(start, cursor + 1),
        isClosing,
        isSelfClosing: false,
        attributes,
      };
    if (content[cursor] === "/") {
      cursor++;
      while (/\s/.test(content[cursor] ?? "")) cursor++;
      if (content[cursor] !== ">") return null;
      return {
        tagName,
        raw: content.slice(start, cursor + 1),
        isClosing,
        isSelfClosing: true,
        attributes,
      };
    }
    if (!XML_NAME_START.test(content[cursor] ?? "")) return null;
    const attributeStart = cursor;
    while (XML_NAME_CHARACTER.test(content[cursor] ?? "")) cursor++;
    const name = content.slice(attributeStart, cursor);
    while (/\s/.test(content[cursor] ?? "")) cursor++;
    if (content[cursor] !== "=") return null;
    cursor++;
    while (/\s/.test(content[cursor] ?? "")) cursor++;
    const quote = content[cursor];
    if (quote !== '"' && quote !== "'") return null;
    const valueStart = ++cursor;
    while (cursor < content.length && content[cursor] !== quote) cursor++;
    if (cursor === content.length) return null;
    attributes.push({ name, value: content.slice(valueStart, cursor) });
    cursor++;
  }
  return null;
}
