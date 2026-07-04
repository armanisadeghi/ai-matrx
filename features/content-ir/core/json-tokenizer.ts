/**
 * Character-level incremental JSON tokenizer. Survives chunk boundaries
 * mid-token (strings, escapes, unicode sequences, primitives). Pure — no
 * React, no Redux, no IO.
 *
 * Moved from app/(dev)/demos/json-block-detector/reusable-logic.ts (the demo
 * is now a consumer of this library).
 */

export type Punct = "{" | "}" | "[" | "]" | ":" | ",";

export type JsonToken =
  | { type: "punct"; value: Punct; at: number }
  | { type: "string"; value: string; at: number }
  | { type: "number"; value: number; at: number }
  | { type: "boolean"; value: boolean; at: number }
  | { type: "null"; value: null; at: number };

export class JsonStreamTokenizer {
  private mode: "normal" | "string" | "escape" | "unicode" | "primitive" =
    "normal";
  private pos = 0;

  private stringBuffer = "";
  private primitiveBuffer = "";
  private unicodeBuffer = "";
  private tokenStart = 0;

  constructor(private readonly onToken: (token: JsonToken) => void) {}

  get position(): number {
    return this.pos;
  }

  push(chunk: string): void {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      const at = this.pos;
      this.pos += 1;

      if (this.mode === "primitive") {
        if (this.isDelimiter(ch)) {
          this.emitPrimitive();
          this.handleNormalChar(ch, at);
        } else {
          this.primitiveBuffer += ch;
        }
        continue;
      }

      if (this.mode === "string") {
        if (ch === '"') {
          this.onToken({
            type: "string",
            value: this.stringBuffer,
            at: this.tokenStart,
          });
          this.stringBuffer = "";
          this.mode = "normal";
          continue;
        }

        if (ch === "\\") {
          this.mode = "escape";
          continue;
        }

        if (ch === "\n" || ch === "\r") {
          throw new Error(`Invalid unescaped newline in JSON string at ${at}`);
        }

        this.stringBuffer += ch;
        continue;
      }

      if (this.mode === "escape") {
        if (ch === "u") {
          this.unicodeBuffer = "";
          this.mode = "unicode";
          continue;
        }

        const escaped: Record<string, string> = {
          '"': '"',
          "\\": "\\",
          "/": "/",
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "\t",
        };

        if (!(ch in escaped)) {
          throw new Error(`Invalid JSON escape sequence at ${at}`);
        }

        this.stringBuffer += escaped[ch];
        this.mode = "string";
        continue;
      }

      if (this.mode === "unicode") {
        if (!/[0-9a-fA-F]/.test(ch)) {
          throw new Error(`Invalid unicode escape at ${at}`);
        }

        this.unicodeBuffer += ch;

        if (this.unicodeBuffer.length === 4) {
          this.stringBuffer += String.fromCharCode(
            parseInt(this.unicodeBuffer, 16),
          );
          this.unicodeBuffer = "";
          this.mode = "string";
        }

        continue;
      }

      this.handleNormalChar(ch, at);
    }
  }

  end(): void {
    if (this.mode === "primitive") {
      this.emitPrimitive();
      return;
    }

    if (this.mode !== "normal") {
      throw new Error(
        `Stream ended while parsing JSON ${this.mode} at ${this.pos}`,
      );
    }
  }

  private handleNormalChar(ch: string, at: number): void {
    if (/\s/.test(ch)) return;

    if (
      ch === "{" ||
      ch === "}" ||
      ch === "[" ||
      ch === "]" ||
      ch === ":" ||
      ch === ","
    ) {
      this.onToken({ type: "punct", value: ch, at });
      return;
    }

    if (ch === '"') {
      this.mode = "string";
      this.stringBuffer = "";
      this.tokenStart = at;
      return;
    }

    if (/[-0-9tfn]/.test(ch)) {
      this.mode = "primitive";
      this.primitiveBuffer = ch;
      this.tokenStart = at;
      return;
    }

    throw new Error(`Unexpected character "${ch}" at ${at}`);
  }

  private emitPrimitive(): void {
    const raw = this.primitiveBuffer;
    const at = this.tokenStart;

    this.primitiveBuffer = "";
    this.mode = "normal";

    let value: unknown;

    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON primitive "${raw}" at ${at}`);
    }

    if (typeof value === "number") {
      this.onToken({ type: "number", value, at });
      return;
    }

    if (typeof value === "boolean") {
      this.onToken({ type: "boolean", value, at });
      return;
    }

    if (value === null) {
      this.onToken({ type: "null", value, at });
      return;
    }

    throw new Error(`Unsupported JSON primitive "${raw}" at ${at}`);
  }

  private isDelimiter(ch: string): boolean {
    return (
      /\s/.test(ch) ||
      ch === "{" ||
      ch === "}" ||
      ch === "[" ||
      ch === "]" ||
      ch === ":" ||
      ch === ","
    );
  }
}
