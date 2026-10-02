import {
  ACCESSORY_KEYS,
  DOUBLE_TAP_MS,
  MODIFIER_OFF,
  afterKey,
  applyModifiers,
  cellAt,
  controlCode,
  createGestureRecognizer,
  flingStep,
  keySequence,
  keyboardInset,
  spanBetween,
  tapModifier,
  visibleHeightBelow,
  wordBounds,
} from "../index";

const NONE = { ctrl: false, alt: false };
const NORMAL = { applicationCursor: false };

describe("accessory keys", () => {
  it("are Termius's groups, in order", () => {
    const groups = ACCESSORY_KEYS.reduce<string[][]>((acc, k) => {
      (acc[k.group] ??= []).push(k.label);
      return acc;
    }, []);
    expect(groups).toEqual([
      ["Esc", "Tab", "Ctrl", "Alt"],
      ["←", "↓", "↑", "→"],
      ["|", "/", "~", "-"],
      ["Home", "End", "PgUp", "PgDn"],
      ["Paste", "Hide"],
    ]);
  });

  it("send xterm's sequences: CSI in normal mode, SS3 in application cursor mode", () => {
    expect(keySequence("up", NONE, NORMAL)).toBe("\x1b[A");
    expect(keySequence("left", NONE, NORMAL)).toBe("\x1b[D");
    expect(keySequence("up", NONE, { applicationCursor: true })).toBe("\x1bOA");
    expect(keySequence("home", NONE, NORMAL)).toBe("\x1b[H");
    expect(keySequence("end", NONE, NORMAL)).toBe("\x1b[F");
    expect(keySequence("pgup", NONE, NORMAL)).toBe("\x1b[5~");
    expect(keySequence("pgdn", NONE, NORMAL)).toBe("\x1b[6~");
    expect(keySequence("esc", NONE, NORMAL)).toBe("\x1b");
    expect(keySequence("tab", NONE, NORMAL)).toBe("\t");
    expect(keySequence("pipe", NONE, NORMAL)).toBe("|");
    expect(keySequence("tilde", NONE, NORMAL)).toBe("~");
    expect(keySequence("ctrl", NONE, NORMAL)).toBeNull();
    expect(keySequence("paste", NONE, NORMAL)).toBeNull();
  });

  it("carry modifiers the way a desktop keyboard does", () => {
    expect(keySequence("left", { ctrl: true, alt: false }, NORMAL)).toBe("\x1b[1;5D");
    expect(keySequence("right", { ctrl: false, alt: true }, NORMAL)).toBe("\x1b[1;3C");
    expect(keySequence("up", { ctrl: true, alt: true }, { applicationCursor: true })).toBe("\x1b[1;7A");
    expect(keySequence("pgdn", { ctrl: true, alt: false }, NORMAL)).toBe("\x1b[6;5~");
    expect(keySequence("slash", { ctrl: true, alt: false }, NORMAL)).toBe("\x1f");
    expect(keySequence("esc", { ctrl: false, alt: true }, NORMAL)).toBe("\x1b\x1b");
  });
});

describe("Ctrl and Alt applied to typed keys", () => {
  it("Ctrl-C is ETX, Ctrl-D EOT, Ctrl-[ ESC, Ctrl-Space NUL", () => {
    expect(applyModifiers("c", { ctrl: true, alt: false })).toEqual({ data: "\x03", consumed: true });
    expect(applyModifiers("C", { ctrl: true, alt: false }).data).toBe("\x03");
    expect(applyModifiers("d", { ctrl: true, alt: false }).data).toBe("\x04");
    expect(controlCode("[")).toBe("\x1b");
    expect(controlCode(" ")).toBe("\x00");
    expect(controlCode("?")).toBe("\x7f");
    expect(controlCode("é")).toBeNull();
  });

  it("Alt prefixes ESC; both together give ESC + control code", () => {
    expect(applyModifiers("b", { ctrl: false, alt: true }).data).toBe("\x1bb");
    expect(applyModifiers("c", { ctrl: true, alt: true }).data).toBe("\x1b\x03");
  });

  it("a paste passes through untouched and does not use up the modifier", () => {
    expect(applyModifiers("ls -la\r", { ctrl: true, alt: false })).toEqual({ data: "ls -la\r", consumed: false });
  });

  it("a hardware cursor key under a latched modifier is re-encoded", () => {
    expect(applyModifiers("\x1b[D", { ctrl: true, alt: false })).toEqual({ data: "\x1b[1;5D", consumed: true });
    expect(applyModifiers("\x1bOA", { ctrl: false, alt: true })).toEqual({ data: "\x1b[1;3A", consumed: true });
  });

  it("no modifier: untouched, not consumed", () => {
    expect(applyModifiers("x", { ctrl: false, alt: false })).toEqual({ data: "x", consumed: false });
  });
});

describe("Ctrl latch: tap fires once, double-tap locks", () => {
  it("one tap = next key only", () => {
    const once = tapModifier(MODIFIER_OFF, 1000);
    expect(once.state).toBe("once");
    expect(afterKey(once).state).toBe("off");
  });

  it("two taps within the window lock until tapped again", () => {
    const locked = tapModifier(tapModifier(MODIFIER_OFF, 1000), 1000 + DOUBLE_TAP_MS);
    expect(locked.state).toBe("locked");
    expect(afterKey(afterKey(locked)).state).toBe("locked");
    expect(tapModifier(locked, 9000).state).toBe("off");
  });

  it("a slow second tap turns it off instead of locking", () => {
    expect(tapModifier(tapModifier(MODIFIER_OFF, 1000), 1000 + DOUBLE_TAP_MS + 1).state).toBe("off");
  });
});

describe("gestures", () => {
  const LH = 15.6; // 13px × 1.2

  it("a still touch is a tap", () => {
    const g = createGestureRecognizer({ lineHeight: LH });
    g.down({ x: 10, y: 10, t: 0 });
    g.move({ x: 13, y: 12, t: 50 });
    expect(g.up({ x: 13, y: 12, t: 90 })).toEqual([{ kind: "tap", x: 10, y: 10 }]);
  });

  it("dragging up scrolls toward newer lines in whole lines, keeping the remainder", () => {
    const g = createGestureRecognizer({ lineHeight: LH });
    g.down({ x: 100, y: 300, t: 0 });
    const a = g.move({ x: 100, y: 280, t: 16 }); // 20px past slop start
    expect(a).toEqual([{ kind: "scroll", lines: 1 }]);
    const b = g.move({ x: 100, y: 260, t: 32 }); // +20px, carry 4.4 + 20 = 24.4 → 1 line
    expect(b).toEqual([{ kind: "scroll", lines: 1 }]);
    const c = g.move({ x: 100, y: 350, t: 48 }); // finger back down 90px → older lines
    expect(c[0]).toMatchObject({ kind: "scroll" });
    expect((c[0] as { lines: number }).lines).toBeLessThan(0);
  });

  it("a quick release flings with the finger's velocity; a slow one does not", () => {
    const quick = createGestureRecognizer({ lineHeight: LH });
    quick.down({ x: 0, y: 400, t: 0 });
    quick.move({ x: 0, y: 300, t: 40 });
    const out = quick.up({ x: 0, y: 200, t: 80 });
    const fling = out.find((a) => a.kind === "fling") as { velocity: number } | undefined;
    expect(fling?.velocity).toBeGreaterThan(0);

    const slow = createGestureRecognizer({ lineHeight: LH });
    slow.down({ x: 0, y: 400, t: 0 });
    slow.move({ x: 0, y: 380, t: 500 });
    expect(slow.up({ x: 0, y: 379, t: 1000 }).some((a) => a.kind === "fling")).toBe(false);
  });

  it("press and hold selects; dragging extends; lifting ends", () => {
    const g = createGestureRecognizer({ lineHeight: LH });
    g.down({ x: 40, y: 50, t: 0 });
    expect(g.longPress()).toEqual([{ kind: "select-start", x: 40, y: 50 }]);
    expect(g.move({ x: 120, y: 80, t: 700 })).toEqual([{ kind: "select-extend", x: 120, y: 80 }]);
    expect(g.up({ x: 120, y: 80, t: 900 })).toEqual([{ kind: "select-end" }]);
  });

  it("a hold that already moved is a scroll, never a selection", () => {
    const g = createGestureRecognizer({ lineHeight: LH });
    g.down({ x: 0, y: 100, t: 0 });
    g.move({ x: 0, y: 60, t: 100 });
    expect(g.longPress()).toEqual([]);
  });

  it("momentum decays to a stop", () => {
    let v = 0.5;
    let frames = 0;
    while (v !== 0 && frames < 1000) {
      v = flingStep(v, 16).velocity;
      frames++;
    }
    expect(v).toBe(0);
    expect(frames).toBeGreaterThan(10);
    expect(frames).toBeLessThan(200);
  });
});

describe("selection math", () => {
  it("a long press picks the whole path, URL or flag", () => {
    const line = "cat /usr/local/etc/nginx.conf && open https://aimatrx.com/x?y=1";
    expect(line.slice(wordBounds(line, 8).start, wordBounds(line, 8).end)).toBe("/usr/local/etc/nginx.conf");
    const u = wordBounds(line, 45);
    expect(line.slice(u.start, u.end)).toBe("https://aimatrx.com/x?y=1");
    expect(wordBounds(line, 3)).toEqual({ start: 3, end: 4 }); // the space
  });

  it("spans wrap across rows in either drag direction", () => {
    expect(spanBetween({ col: 78, row: 10 }, { col: 1, row: 11 }, 80)).toEqual({ col: 78, row: 10, length: 4 });
    expect(spanBetween({ col: 1, row: 11 }, { col: 78, row: 10 }, 80)).toEqual({ col: 78, row: 10, length: 4 });
  });

  it("maps a touch point to a buffer cell, clamped, with scrollback offset", () => {
    const box = { left: 8, top: 100, width: 800, height: 240 }; // 80×24 → 10×10 cells
    const grid = { cols: 80, rows: 24, viewportY: 500 };
    expect(cellAt({ x: 8 + 35, y: 100 + 25 }, box, grid)).toEqual({ col: 3, row: 502 });
    expect(cellAt({ x: 5000, y: -50 }, box, grid)).toEqual({ col: 79, row: 500 });
  });
});

describe("visual viewport", () => {
  it("sees the keyboard only when it is keyboard-sized", () => {
    expect(keyboardInset(852, { height: 852, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(852, { height: 800, offsetTop: 0 })).toBe(0); // toolbar, not keyboard
    expect(keyboardInset(852, { height: 516, offsetTop: 0 })).toBe(336);
    expect(keyboardInset(852, null)).toBe(0);
  });

  it("gives a terminal at y=150 exactly the room above the keyboard", () => {
    expect(visibleHeightBelow(150, { height: 516, offsetTop: 0 }, 852)).toBe(366);
    expect(visibleHeightBelow(150, { height: 516, offsetTop: 40 }, 852)).toBe(406);
    expect(visibleHeightBelow(150, null, 852)).toBe(702);
    expect(visibleHeightBelow(900, { height: 516, offsetTop: 0 }, 852)).toBe(0);
  });
});
