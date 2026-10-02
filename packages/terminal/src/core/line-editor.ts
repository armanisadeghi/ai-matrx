/**
 * A shell-style line editor for a terminal whose other end is NOT a PTY (a one-shot exec API, a
 * read-only backend): prompt, cursor editing, history recall, Ctrl shortcuts, multi-line paste
 * that runs line by line. The terminal shows exactly what a shell would; the host only runs the
 * submitted line and calls `done()` when its output is written.
 *
 * Pure: it writes through `host.write` and never touches the DOM or xterm.
 */

export interface LineEditorHost {
  /** Bytes to the terminal (prompt, echo, cursor moves). */
  write(data: string): void;
  /** The prompt to draw before the line (may carry ANSI colour). Read on every redraw. */
  prompt(): string;
  /** Previous commands, oldest first. Read on every recall. */
  history(): readonly string[];
  /** Enter on a non-empty line. The editor is `busy` until the host calls `done()`. */
  onSubmit(line: string): void;
  /** Ctrl-C while busy (stop the running command). */
  onInterrupt?(): void;
  /** Ctrl-L: clear the screen (the editor redraws the prompt afterwards). */
  onClearScreen?(): void;
  /** The PERSON changed the line (typing, deleting, recalling history, Ctrl-C). Never for setLine. */
  onChange?(line: string): void;
}

export interface LineEditor {
  /** Keystrokes / pastes from the terminal. */
  input(data: string): void;
  /** Draw the prompt and the current line on a fresh row. */
  prompt(): void;
  /** Replace the line from outside (an agent staging a command) and redraw it. Not a user change. */
  setLine(text: string): void;
  /** Redraw the current row (after the prompt itself changed, e.g. a new cwd). */
  refresh(): void;
  /** A submitted command finished: prompt again, then run the next pasted line, if any. */
  done(): void;
  readonly line: string;
  readonly busy: boolean;
}

const CSI = "\x1b[";

export function createLineEditor(host: LineEditorHost): LineEditor {
  let line = "";
  let cursor = 0;
  /** Index into history while recalling; null = editing a new line. */
  let recall: number | null = null;
  let busy = false;
  /** Lines of a multi-line paste still waiting to run. */
  const queue: string[] = [];
  /** What the person typed while a command ran (a shell keeps typeahead too); replayed after. */
  let typeahead = "";

  const changed = () => host.onChange?.(line);

  function redraw(): void {
    host.write(`\r${CSI}K${host.prompt()}${line}`);
    const back = line.length - cursor;
    if (back > 0) host.write(`${CSI}${back}D`);
  }

  function promptRow(): void {
    host.write(`${host.prompt()}${line}`);
    const back = line.length - cursor;
    if (back > 0) host.write(`${CSI}${back}D`);
  }

  function submit(): void {
    const text = line;
    line = "";
    cursor = 0;
    recall = null;
    host.write("\r\n");
    if (!text.trim()) {
      promptRow();
      next();
      return;
    }
    busy = true;
    host.onSubmit(text);
  }

  /** Run the next queued paste line, if any. */
  function next(): void {
    const queued = queue.shift();
    if (queued === undefined) return;
    line = queued;
    cursor = line.length;
    host.write(line);
    submit();
  }

  function insert(text: string): void {
    line = line.slice(0, cursor) + text + line.slice(cursor);
    cursor += text.length;
    if (cursor === line.length) host.write(text);
    else redraw();
  }

  function setFromHistory(index: number | null): void {
    const history = host.history();
    recall = index;
    line = index === null ? "" : (history[index] ?? "");
    cursor = line.length;
    redraw();
    changed();
  }

  function paste(data: string): void {
    const parts = data.replace(/\r\n?/g, "\n").split("\n");
    const first = parts.shift() ?? "";
    if (first) insert(first);
    if (parts.length === 0) {
      changed();
      return;
    }
    // A newline inside the paste: run what is on the line now, queue the rest one per command.
    queue.push(...parts.filter((p, i) => p !== "" || i < parts.length - 1));
    changed();
    submit();
  }

  function input(data: string): void {
    if (busy) {
      if (data === "\x03") {
        typeahead = "";
        host.onInterrupt?.();
      } else {
        // Text and Enter only: a cursor key typed blind has nothing sensible to act on later.
        typeahead += data.replace(/\x1b(?:\[[0-9;]*[A-Za-z~]|O[A-Za-z])/g, "").replace(/[^\r\n\t\x20-\x7e\u00a0-\uffff]/g, "");
      }
      return;
    }
    // Bracketed paste markers (xterm's paste in bracketed mode) are not ours to echo.
    const clean = data.replace(/\x1b\[20[01]~/g, "");
    if (clean.length > 1 && !clean.startsWith("\x1b")) {
      paste(clean);
      return;
    }
    switch (clean) {
      case "\r":
      case "\n":
        submit();
        return;
      case "\x7f":
      case "\b":
        if (cursor === 0) return;
        line = line.slice(0, cursor - 1) + line.slice(cursor);
        cursor -= 1;
        redraw();
        changed();
        return;
      case `${CSI}3~`:
        if (cursor >= line.length) return;
        line = line.slice(0, cursor) + line.slice(cursor + 1);
        redraw();
        changed();
        return;
      case `${CSI}A`:
      case "\x1bOA": {
        const history = host.history();
        if (history.length === 0) return;
        setFromHistory(recall === null ? history.length - 1 : Math.max(0, recall - 1));
        return;
      }
      case `${CSI}B`:
      case "\x1bOB": {
        if (recall === null) return;
        const nextIndex = recall + 1;
        setFromHistory(nextIndex >= host.history().length ? null : nextIndex);
        return;
      }
      case `${CSI}C`:
      case "\x1bOC":
        if (cursor < line.length) {
          cursor += 1;
          host.write(`${CSI}C`);
        }
        return;
      case `${CSI}D`:
      case "\x1bOD":
        if (cursor > 0) {
          cursor -= 1;
          host.write(`${CSI}D`);
        }
        return;
      case "\x01":
      case `${CSI}H`:
      case "\x1bOH":
        if (cursor > 0) {
          host.write(`${CSI}${cursor}D`);
          cursor = 0;
        }
        return;
      case "\x05":
      case `${CSI}F`:
      case "\x1bOF": {
        const distance = line.length - cursor;
        if (distance > 0) {
          host.write(`${CSI}${distance}C`);
          cursor = line.length;
        }
        return;
      }
      case "\x0b":
        line = line.slice(0, cursor);
        redraw();
        changed();
        return;
      case "\x15":
        line = line.slice(cursor);
        cursor = 0;
        redraw();
        changed();
        return;
      case "\x0c":
        host.onClearScreen?.();
        redraw();
        return;
      case "\x03":
        host.write("^C\r\n");
        line = "";
        cursor = 0;
        recall = null;
        queue.length = 0;
        promptRow();
        changed();
        return;
      default:
        if (clean.length === 1 && clean >= " ") {
          insert(clean);
          changed();
        }
    }
  }

  return {
    input,
    prompt: promptRow,
    refresh: redraw,
    setLine(text) {
      line = text;
      cursor = text.length;
      recall = null;
      if (!busy) redraw();
    },
    done() {
      busy = false;
      promptRow();
      if (queue.length > 0) {
        next();
        return;
      }
      if (typeahead) {
        const pending = typeahead;
        typeahead = "";
        if (pending.length === 1) input(pending);
        else paste(pending);
      }
    },
    get line() {
      return line;
    },
    get busy() {
      return busy;
    },
  };
}
