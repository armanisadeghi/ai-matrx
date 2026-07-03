import {
  Frame,
  JsonPath,
  JsonStreamTokenizer,
  JsonToken,
  ObjectFrame,
} from "./reusable-logic";

export type Flashcard = {
  front?: string;
  back?: string;
  card_kind?: string;
  difficulty?: string;
  topic?: string;
  tags?: string[];
  [key: string]: unknown;
};

export type FlashcardStreamEvent =
  | { type: "identified"; at: number }
  | { type: "title"; title: string; at: number }
  | { type: "cards_start"; at: number }
  | { type: "card_start"; index: number; at: number }
  | { type: "card_front"; index: number; front: string; at: number }
  | {
      type: "card_field";
      index: number;
      key: string;
      value: unknown;
      at: number;
    }
  | { type: "card_complete"; index: number; card: Flashcard; at: number }
  | { type: "cards_complete"; count: number; at: number }
  | { type: "complete"; title: string; cards: Flashcard[]; at: number }
  | { type: "error"; reason: string; at: number };

export type FlashcardParserOptions = {
  onEvent: (event: FlashcardStreamEvent) => void;

  /**
   * The primary marker key.
   * The parser identifies the stream as a flashcard set as soon as it sees this key
   * as the first key in the root object.
   */
  titleKey?: string;

  /**
   * The cards array key.
   */
  cardsKey?: string;

  /**
   * Optional universal identifier support:
   * {
   *   "__kind": "flashcard_set",
   *   "flashcard_set_title": "...",
   *   "cards": [...]
   * }
   */
  identifierKey?: string;
  identifierValue?: string;
};

export class FlashcardStreamParser {
  private readonly titleKey: string;
  private readonly cardsKey: string;
  private readonly identifierKey: string;
  private readonly identifierValue: string;

  private readonly stack: Frame[] = [];
  private readonly cards: Flashcard[] = [];
  private readonly stringCardFields = new Set([
    "front",
    "back",
    "card_kind",
    "difficulty",
    "topic",
  ]);

  private tokenizer: JsonStreamTokenizer;
  private root: unknown;
  private rootDone = false;
  private failed = false;
  private identified = false;
  private title = "";

  constructor(private readonly options: FlashcardParserOptions) {
    this.titleKey = options.titleKey ?? "flashcard_set_title";
    this.cardsKey = options.cardsKey ?? "cards";
    this.identifierKey = options.identifierKey ?? "__kind";
    this.identifierValue = options.identifierValue ?? "flashcard_set";

    this.tokenizer = new JsonStreamTokenizer((token) =>
      this.handleToken(token),
    );
  }

  push(chunk: string): void {
    if (this.failed || this.rootDone) return;

    try {
      this.tokenizer.push(chunk);
    } catch (error) {
      this.fail(
        error instanceof Error ? error.message : String(error),
        this.tokenizer.position,
      );
    }
  }

  end(): void {
    if (this.failed) return;

    try {
      this.tokenizer.end();
    } catch (error) {
      this.fail(
        error instanceof Error ? error.message : String(error),
        this.tokenizer.position,
      );
      return;
    }

    if (!this.rootDone) {
      this.fail(
        "Stream ended before the flashcard JSON object was complete.",
        this.tokenizer.position,
      );
    }
  }

  private handleToken(token: JsonToken): void {
    if (this.failed) return;

    if (this.rootDone) {
      this.fail(
        "Unexpected token after complete flashcard JSON object.",
        token.at,
      );
      return;
    }

    if (token.type === "punct") {
      this.handlePunctuation(token);
      return;
    }

    if (token.type === "string") {
      this.handleString(token);
      return;
    }

    this.beginScalar(token.value, token.at);
  }

  private handleString(token: Extract<JsonToken, { type: "string" }>): void {
    const frame = this.currentFrame();

    if (
      frame?.kind === "object" &&
      (frame.expecting === "keyOrEnd" || frame.expecting === "key")
    ) {
      this.acceptObjectKey(frame, token.value, token.at);
      return;
    }

    this.beginScalar(token.value, token.at);
  }

  private handlePunctuation(
    token: Extract<JsonToken, { type: "punct" }>,
  ): void {
    switch (token.value) {
      case "{":
        this.beginCompound("object", token.at);
        return;

      case "[":
        this.beginCompound("array", token.at);
        return;

      case "}":
        this.closeCompound("object", token.at);
        return;

      case "]":
        this.closeCompound("array", token.at);
        return;

      case ":":
        this.acceptColon(token.at);
        return;

      case ",":
        this.acceptComma(token.at);
        return;
    }
  }

  private beginCompound(kind: "object" | "array", at: number): void {
    const value = kind === "object" ? {} : [];
    const path = this.placeValue(value, kind, at, false);

    if (!path || this.failed) return;

    this.onCompoundStart(path, kind, at);

    if (kind === "object") {
      this.stack.push({
        kind: "object",
        path,
        value: value as Record<string, unknown>,
        expecting: "keyOrEnd",
        keyCount: 0,
      });
    } else {
      this.stack.push({
        kind: "array",
        path,
        value: value as unknown[],
        expecting: "valueOrEnd",
        nextIndex: 0,
      });
    }
  }

  private beginScalar(value: unknown, at: number): void {
    this.placeValue(value, "scalar", at, true);
  }

  private placeValue(
    value: unknown,
    valueKind: "object" | "array" | "scalar",
    at: number,
    finalizedImmediately: boolean,
  ): JsonPath | null {
    if (this.root === undefined) {
      if (valueKind !== "object") {
        this.fail("Root value must be a JSON object.", at);
        return null;
      }

      this.root = value;
      return [];
    }

    const parent = this.currentFrame();

    if (!parent) {
      this.fail("Unexpected value after root object.", at);
      return null;
    }

    let path: JsonPath;

    if (parent.kind === "object") {
      if (parent.expecting !== "value") {
        this.fail(
          `Unexpected value inside object. Expected ${parent.expecting}.`,
          at,
        );
        return null;
      }

      if (parent.currentKey === undefined) {
        this.fail("Internal parser error: missing object key.", at);
        return null;
      }

      const key = parent.currentKey;
      path = [...parent.path, key];

      this.validatePlacement(path, valueKind, at);
      if (this.failed) return null;

      parent.value[key] = value;
      parent.currentKey = undefined;
      parent.expecting = "commaOrEnd";
    } else {
      if (parent.expecting !== "valueOrEnd" && parent.expecting !== "value") {
        this.fail(
          `Unexpected value inside array. Expected ${parent.expecting}.`,
          at,
        );
        return null;
      }

      const index = parent.nextIndex;
      path = [...parent.path, index];

      this.validatePlacement(path, valueKind, at);
      if (this.failed) return null;

      parent.value.push(value);
      parent.nextIndex += 1;
      parent.expecting = "commaOrEnd";
    }

    if (finalizedImmediately) {
      this.onValueFinalized(path, value, at);
    }

    return path;
  }

  private acceptObjectKey(frame: ObjectFrame, key: string, at: number): void {
    if (frame.expecting !== "keyOrEnd" && frame.expecting !== "key") {
      this.fail(`Unexpected object key "${key}".`, at);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(frame.value, key)) {
      this.fail(`Duplicate key "${key}" is not allowed.`, at);
      return;
    }

    if (frame.path.length === 0 && frame.keyCount === 0) {
      const isTitleMarker = key === this.titleKey;
      const isUniversalMarker = key === this.identifierKey;

      if (!isTitleMarker && !isUniversalMarker) {
        this.fail(
          `This does not look like a flashcard stream. Expected first key "${this.titleKey}" or "${this.identifierKey}".`,
          at,
        );
        return;
      }

      if (isTitleMarker) {
        this.markIdentified(at);
      }
    }

    frame.currentKey = key;
    frame.keyCount += 1;
    frame.expecting = "colon";
  }

  private acceptColon(at: number): void {
    const frame = this.currentFrame();

    if (!frame || frame.kind !== "object" || frame.expecting !== "colon") {
      this.fail("Unexpected colon.", at);
      return;
    }

    frame.expecting = "value";
  }

  private acceptComma(at: number): void {
    const frame = this.currentFrame();

    if (!frame || frame.expecting !== "commaOrEnd") {
      this.fail("Unexpected comma.", at);
      return;
    }

    if (frame.kind === "object") {
      frame.expecting = "key";
    } else {
      frame.expecting = "value";
    }
  }

  private closeCompound(kind: "object" | "array", at: number): void {
    const frame = this.currentFrame();

    if (!frame || frame.kind !== kind) {
      this.fail(
        `Unexpected closing ${kind === "object" ? "brace" : "bracket"}.`,
        at,
      );
      return;
    }

    if (frame.kind === "object") {
      if (frame.expecting !== "keyOrEnd" && frame.expecting !== "commaOrEnd") {
        this.fail(`Object closed too early. Expected ${frame.expecting}.`, at);
        return;
      }
    } else {
      if (
        frame.expecting !== "valueOrEnd" &&
        frame.expecting !== "commaOrEnd"
      ) {
        this.fail(`Array closed too early. Expected ${frame.expecting}.`, at);
        return;
      }
    }

    this.stack.pop();

    if (this.stack.length === 0) {
      this.rootDone = true;
    }

    this.onValueFinalized(frame.path, frame.value, at);
  }

  private onCompoundStart(
    path: JsonPath,
    kind: "object" | "array",
    at: number,
  ): void {
    if (this.isCardsPath(path)) {
      if (kind !== "array") {
        this.fail(`"${this.cardsKey}" must be an array.`, at);
        return;
      }

      this.emit({ type: "cards_start", at });
      return;
    }

    if (this.isCardPath(path)) {
      if (kind !== "object") {
        this.fail("Each card must be an object.", at);
        return;
      }

      this.emit({
        type: "card_start",
        index: path[1] as number,
        at,
      });
    }
  }

  private onValueFinalized(path: JsonPath, value: unknown, at: number): void {
    if (this.failed) return;

    if (this.isIdentifierPath(path)) {
      if (value !== this.identifierValue) {
        this.fail(
          `Invalid identifier value. Expected "${this.identifierValue}".`,
          at,
        );
        return;
      }

      this.markIdentified(at);
      return;
    }

    if (this.isTitlePath(path)) {
      if (typeof value !== "string") {
        this.fail(`"${this.titleKey}" must be a string.`, at);
        return;
      }

      this.title = value;
      this.emit({ type: "title", title: value, at });
      return;
    }

    if (this.isCardFieldPath(path)) {
      const index = path[1] as number;
      const key = path[2] as string;

      if (this.stringCardFields.has(key) && typeof value !== "string") {
        this.fail(`Card field "${key}" must be a string.`, at);
        return;
      }

      if (key === "tags") {
        if (
          !Array.isArray(value) ||
          !value.every((tag) => typeof tag === "string")
        ) {
          this.fail(`Card field "tags" must be an array of strings.`, at);
          return;
        }
      }

      this.emit({
        type: "card_field",
        index,
        key,
        value,
        at,
      });

      if (key === "front") {
        this.emit({
          type: "card_front",
          index,
          front: value as string,
          at,
        });
      }

      return;
    }

    if (this.isCardPath(path)) {
      const index = path[1] as number;
      const card = value as Flashcard;

      if (typeof card.front !== "string") {
        this.fail(`Card ${index} is missing a valid "front" string.`, at);
        return;
      }

      if (typeof card.back !== "string") {
        this.fail(`Card ${index} is missing a valid "back" string.`, at);
        return;
      }

      this.cards[index] = card;

      this.emit({
        type: "card_complete",
        index,
        card,
        at,
      });

      return;
    }

    if (this.isCardsPath(path)) {
      this.emit({
        type: "cards_complete",
        count: this.cards.length,
        at,
      });

      return;
    }

    if (path.length === 0) {
      if (!this.identified) {
        this.fail(
          "JSON completed, but the flashcard marker was never found.",
          at,
        );
        return;
      }

      if (!this.title) {
        this.fail(
          `JSON completed, but "${this.titleKey}" was missing or empty.`,
          at,
        );
        return;
      }

      const rootObject = value as Record<string, unknown>;

      if (!Array.isArray(rootObject[this.cardsKey])) {
        this.fail(
          `JSON completed, but "${this.cardsKey}" was missing or invalid.`,
          at,
        );
        return;
      }

      this.emit({
        type: "complete",
        title: this.title,
        cards: this.cards,
        at,
      });
    }
  }

  private validatePlacement(
    path: JsonPath,
    valueKind: "object" | "array" | "scalar",
    at: number,
  ): void {
    if (this.isTitlePath(path) && valueKind !== "scalar") {
      this.fail(`"${this.titleKey}" must be a string value.`, at);
      return;
    }

    if (this.isCardsPath(path) && valueKind !== "array") {
      this.fail(`"${this.cardsKey}" must be an array.`, at);
      return;
    }

    if (this.isCardPath(path) && valueKind !== "object") {
      this.fail("Each card inside the cards array must be an object.", at);
      return;
    }

    if (this.isCardFieldPath(path)) {
      const key = path[2] as string;

      if (this.stringCardFields.has(key) && valueKind !== "scalar") {
        this.fail(`Card field "${key}" must be a string.`, at);
        return;
      }

      if (key === "tags" && valueKind !== "array") {
        this.fail(`Card field "tags" must be an array.`, at);
      }
    }
  }

  private markIdentified(at: number): void {
    if (this.identified) return;

    this.identified = true;
    this.emit({ type: "identified", at });
  }

  private fail(reason: string, at: number): void {
    if (this.failed) return;

    this.failed = true;
    this.emit({ type: "error", reason, at });
  }

  private emit(event: FlashcardStreamEvent): void {
    this.options.onEvent(event);
  }

  private currentFrame(): Frame | undefined {
    return this.stack[this.stack.length - 1];
  }

  private isTitlePath(path: JsonPath): boolean {
    return path.length === 1 && path[0] === this.titleKey;
  }

  private isIdentifierPath(path: JsonPath): boolean {
    return path.length === 1 && path[0] === this.identifierKey;
  }

  private isCardsPath(path: JsonPath): boolean {
    return path.length === 1 && path[0] === this.cardsKey;
  }

  private isCardPath(path: JsonPath): boolean {
    return (
      path.length === 2 &&
      path[0] === this.cardsKey &&
      typeof path[1] === "number"
    );
  }

  private isCardFieldPath(path: JsonPath): boolean {
    return (
      path.length === 3 &&
      path[0] === this.cardsKey &&
      typeof path[1] === "number" &&
      typeof path[2] === "string"
    );
  }
}

export function createFlashcardStreamParser(
  options: FlashcardParserOptions,
): FlashcardStreamParser {
  return new FlashcardStreamParser(options);
}
