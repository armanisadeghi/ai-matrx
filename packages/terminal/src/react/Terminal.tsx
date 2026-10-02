"use client";

/**
 * <Terminal> — xterm 6 (DOM renderer) with everything a host would otherwise rebuild: fit to its
 * box or to the visual viewport, theme that follows the app's `.dark` class, Ctrl-C hook, phone
 * touch (momentum scroll, long-press word select, copy), and the keyboard accessory bar with
 * one-shot / locked Ctrl and Alt. Transport-free: bytes in through the handle's `write`, keys
 * out through `onData`, size out through `onResize`. Any PTY (desktop relay, cloud sandbox,
 * local process) plugs in with three lines.
 */
import "@xterm/xterm/css/xterm.css";
import "../styles.css";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { ITerminalOptions, Terminal as XTerm } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";

import { ACCESSORY_KEYS, applyModifiers, keySequence } from "../core/keys";
import type { AccessoryKeyId } from "../core/keys";
import { MODIFIER_OFF, afterKey, isActive, tapModifier } from "../core/modifiers";
import type { ModifierLatch } from "../core/modifiers";
import { LONG_PRESS_MS, createGestureRecognizer, flingStep } from "../core/gesture";
import type { GestureAction } from "../core/gesture";
import { cellAt, spanBetween, wordBounds } from "../core/selection";
import type { Cell } from "../core/selection";
import { TERMINAL_DEFAULTS, TERMINAL_FONT_FAMILY, terminalTheme } from "../core/theme";
import { visibleHeightBelow } from "../core/viewport";
import { AccessoryBar } from "./AccessoryBar";

export interface TerminalSize {
  cols: number;
  rows: number;
}

/** What a host drives the terminal with. Stable for the terminal's life. */
export interface TerminalHandle {
  /** Write output; resolves once xterm has parsed it (use it to pace credit-based streams). */
  write(data: string | Uint8Array): Promise<void>;
  /** Clear screen, scrollback and modes — before writing a fresh screen snapshot. */
  reset(): void;
  /** Clear the scrollback, keep the prompt line. */
  clear(): void;
  focus(): void;
  blur(): void;
  /** Visible text of the whole buffer (scrollback included), lines joined with \n. */
  getText(): string;
  readonly cols: number;
  readonly rows: number;
  /** The underlying xterm, for what this package does not wrap (read-mostly use). */
  readonly xterm: XTerm;
}

export interface TerminalProps {
  /** Keystrokes and pastes, already modified by the accessory bar's Ctrl / Alt. */
  onData?: (data: string) => void;
  /** Grid size after every fit (and once at start). */
  onResize?: (size: TerminalSize) => void;
  onReady?: (handle: TerminalHandle) => void;
  /**
   * Hardware Ctrl-C (no Shift/Alt/Meta). Return true to consume it — e.g. send a SIGINT frame
   * because the page's own shortcuts eat the key. Default: xterm sends ETX (0x03) through onData.
   */
  onInterrupt?: () => boolean;
  /** "auto" follows the `dark` class on <html>. */
  theme?: "auto" | "dark" | "light";
  fontSize?: number;
  lineHeight?: number;
  scrollback?: number;
  /** Side padding, px. */
  padding?: number;
  /** Translate bare \n to \r\n (for line-oriented output that is not a PTY). */
  convertEol?: boolean;
  cursorBlink?: boolean;
  disableStdin?: boolean;
  /** Clickable URLs. Default true. */
  links?: boolean;
  /** Phone touch gestures. "auto" = when the primary pointer is coarse. */
  touch?: "auto" | "on" | "off";
  /** The keyboard accessory bar. "auto" = when the primary pointer is coarse. */
  accessory?: "auto" | "on" | "off";
  /**
   * "container": fill the parent box (it must have a height). "viewport": grow from where the
   * terminal starts down to the bottom of the VISUAL viewport, so the last row and the accessory
   * bar sit right above the on-screen keyboard.
   */
  fit?: "container" | "viewport";
  autoFocus?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  /** Rendered over the terminal (e.g. a reconnecting veil). */
  children?: ReactNode;
}

interface Latches {
  ctrl: ModifierLatch;
  alt: ModifierLatch;
}

function prefersDark(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

function coarsePointer(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

export function Terminal(props: TerminalProps) {
  const {
    theme = "auto",
    fontSize = TERMINAL_DEFAULTS.fontSize,
    lineHeight = TERMINAL_DEFAULTS.lineHeight,
    scrollback = TERMINAL_DEFAULTS.scrollback,
    padding = TERMINAL_DEFAULTS.padding,
    convertEol = false,
    cursorBlink = true,
    disableStdin = false,
    links = true,
    touch = "auto",
    accessory = "auto",
    fit = "container",
    autoFocus = false,
  } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const handleRef = useRef<TerminalHandle | null>(null);
  const latchRef = useRef<Latches>({ ctrl: MODIFIER_OFF, alt: MODIFIER_OFF });
  const callbacksRef = useRef({ onData: props.onData, onResize: props.onResize, onReady: props.onReady, onInterrupt: props.onInterrupt });

  const [latches, setLatches] = useState<Latches>({ ctrl: MODIFIER_OFF, alt: MODIFIER_OFF });
  const [coarse, setCoarse] = useState(false);
  const [dark, setDark] = useState(theme === "dark");
  const [copyVisible, setCopyVisible] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onData: props.onData, onResize: props.onResize, onReady: props.onReady, onInterrupt: props.onInterrupt };
  });

  // Pointer class and theme are browser facts: read after mount (SSR renders the neutral frame).
  useEffect(() => {
    setCoarse(coarsePointer());
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null;
    const onChange = () => setCoarse(coarsePointer());
    mq?.addEventListener("change", onChange);
    return () => mq?.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (theme !== "auto") {
      setDark(theme === "dark");
      return undefined;
    }
    setDark(prefersDark());
    if (typeof MutationObserver === "undefined") return undefined;
    const observer = new MutationObserver(() => setDark(prefersDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [theme]);

  const touchOn = touch === "on" || (touch === "auto" && coarse);
  const barOn = accessory === "on" || (accessory === "auto" && coarse);

  function setLatchState(next: Latches): void {
    latchRef.current = next;
    setLatches(next);
  }

  /** Keyboard input → accessory modifiers → host. */
  function emit(data: string): void {
    const current = latchRef.current;
    const mods = { ctrl: isActive(current.ctrl), alt: isActive(current.alt) };
    const { data: out, consumed } = applyModifiers(data, mods);
    if (consumed) setLatchState({ ctrl: afterKey(current.ctrl), alt: afterKey(current.alt) });
    callbacksRef.current.onData?.(out);
  }

  // ── boot xterm once ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let disposeAll: (() => void) | null = null;
    void (async () => {
      const [{ Terminal: XTermCtor }, { FitAddon: FitCtor }, linksModule] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
      ]);
      const host = hostRef.current;
      if (cancelled || !host) return;
      const options: ITerminalOptions = {
        fontFamily: TERMINAL_FONT_FAMILY,
        fontSize,
        lineHeight,
        scrollback,
        convertEol,
        cursorBlink,
        cursorStyle: "bar",
        disableStdin,
        allowProposedApi: false,
        theme: terminalTheme(theme === "auto" ? prefersDark() : theme === "dark"),
      };
      const term = new XTermCtor(options);
      const fitAddon = new FitCtor();
      term.loadAddon(fitAddon);
      if (links) term.loadAddon(new linksModule.WebLinksAddon());
      term.open(host);
      const textarea = term.textarea;
      if (textarea) {
        // iOS: no autocorrect/capitalisation in a shell; 16px stops the focus zoom (styles.css).
        textarea.setAttribute("autocorrect", "off");
        textarea.setAttribute("autocapitalize", "off");
        textarea.setAttribute("autocomplete", "off");
        textarea.setAttribute("spellcheck", "false");
        textarea.setAttribute("aria-label", props["aria-label"] ?? "Terminal input");
      }
      termRef.current = term;
      fitRef.current = fitAddon;

      const dataSub = term.onData((data) => emit(data));
      const resizeSub = term.onResize(({ cols, rows }) => callbacksRef.current.onResize?.({ cols, rows }));
      term.attachCustomKeyEventHandler((event) => {
        if (
          event.type === "keydown" &&
          event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          !event.metaKey &&
          event.key.toLowerCase() === "c" &&
          !term.hasSelection()
        ) {
          const consumed = callbacksRef.current.onInterrupt?.() ?? false;
          if (consumed) return false;
        }
        return true;
      });
      const selectionSub = term.onSelectionChange(() => setCopyVisible(term.hasSelection()));

      const handle: TerminalHandle = {
        write: (data) => new Promise<void>((resolve) => term.write(data, resolve)),
        reset: () => term.reset(),
        clear: () => term.clear(),
        focus: () => term.focus(),
        blur: () => term.blur(),
        getText: () => {
          const buffer = term.buffer.active;
          const lines: string[] = [];
          for (let y = 0; y < buffer.length; y++) lines.push(buffer.getLine(y)?.translateToString(true) ?? "");
          while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
          return lines.join("\n");
        },
        get cols() {
          return term.cols;
        },
        get rows() {
          return term.rows;
        },
        xterm: term,
      };
      handleRef.current = handle;
      try {
        fitAddon.fit();
      } catch {
        // The box may not be laid out yet; the resize observer fits it when it is.
      }
      setBooted(true);
      callbacksRef.current.onResize?.({ cols: term.cols, rows: term.rows });
      callbacksRef.current.onReady?.(handle);
      if (autoFocus) term.focus();

      disposeAll = () => {
        dataSub.dispose();
        resizeSub.dispose();
        selectionSub.dispose();
        term.dispose();
      };
    })();
    return () => {
      cancelled = true;
      disposeAll?.();
      termRef.current = null;
      fitRef.current = null;
      handleRef.current = null;
    };
    // Boot exactly once per mount; later option changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── live options ──────────────────────────────────────────────────────────
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = terminalTheme(dark);
  }, [dark, booted]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.disableStdin = disableStdin;
    term.options.fontSize = fontSize;
    term.options.lineHeight = lineHeight;
    try {
      fitRef.current?.fit();
    } catch {
      // between frames
    }
  }, [disableStdin, fontSize, lineHeight, booted]);

  // ── fit to the box ────────────────────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const refit = () => {
      const term = termRef.current;
      if (!term || host.clientWidth <= 0 || host.clientHeight <= 0) return;
      try {
        fitRef.current?.fit();
        // A DOM renderer mounted while hidden measured zero-width glyphs; refresh re-measures.
        term.refresh(0, term.rows - 1);
      } catch {
        // xterm is mid-paint
      }
    };
    refit();
    if (typeof ResizeObserver === "undefined") return undefined; // non-browser hosts (jsdom)
    const ro = new ResizeObserver(refit);
    ro.observe(host);
    return () => ro.disconnect();
  }, [booted]);

  // ── fit to the visual viewport (phones: stop exactly at the keyboard) ─────
  useEffect(() => {
    if (fit !== "viewport") {
      setViewportHeight(null);
      return undefined;
    }
    const root = rootRef.current;
    if (!root) return undefined;
    const vv = window.visualViewport;
    const measure = () => {
      // The console owns the screen: a page scrolled by iOS to "reveal" the input only hides the top.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      const top = root.getBoundingClientRect().top + window.scrollY;
      setViewportHeight(visibleHeightBelow(top, vv ? { height: vv.height, offsetTop: vv.offsetTop } : null, window.innerHeight));
    };
    measure();
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [fit]);

  // ── touch: tap focuses, drag scrolls with momentum, hold selects ──────────
  useEffect(() => {
    const host = hostRef.current;
    const term = termRef.current;
    if (!touchOn || !host || !term) return undefined;
    const rowPx = fontSize * lineHeight;
    const recognizer = createGestureRecognizer({ lineHeight: rowPx });
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let flingFrame: number | null = null;
    let flingCarry = 0;
    let anchor: Cell | null = null;

    const screen = () => (term.element?.querySelector(".xterm-screen") as HTMLElement | null) ?? host;
    const cellFor = (x: number, y: number): Cell => {
      const r = screen().getBoundingClientRect();
      return cellAt({ x, y }, { left: r.left, top: r.top, width: r.width, height: r.height }, { cols: term.cols, rows: term.rows, viewportY: term.buffer.active.viewportY });
    };
    const scrollLines = (lines: number) => {
      if (lines === 0) return;
      if (term.buffer.active.type === "alternate") {
        // Full-screen programs (less, vim, htop) own their screen: a drag pages them with arrows.
        const key = lines > 0 ? "down" : "up";
        const seq = keySequence(key, { ctrl: false, alt: false }, { applicationCursor: term.modes.applicationCursorKeysMode });
        if (seq) callbacksRef.current.onData?.(seq.repeat(Math.min(Math.abs(lines), 50)));
        return;
      }
      term.scrollLines(lines);
    };
    const stopFling = () => {
      if (flingFrame !== null) cancelAnimationFrame(flingFrame);
      flingFrame = null;
      flingCarry = 0;
    };
    const startFling = (velocity: number) => {
      stopFling();
      let v = velocity;
      let last = performance.now();
      const step = (now: number) => {
        const res = flingStep(v, now - last);
        last = now;
        v = res.velocity;
        flingCarry += res.lines;
        const whole = flingCarry > 0 ? Math.floor(flingCarry) : Math.ceil(flingCarry);
        if (whole !== 0) {
          flingCarry -= whole;
          scrollLines(whole);
        }
        flingFrame = v === 0 ? null : requestAnimationFrame(step);
      };
      flingFrame = requestAnimationFrame(step);
    };
    const act = (actions: GestureAction[]) => {
      for (const a of actions) {
        switch (a.kind) {
          case "tap":
            term.clearSelection();
            term.focus();
            break;
          case "scroll":
            scrollLines(a.lines);
            break;
          case "fling":
            startFling(a.velocity);
            break;
          case "select-start": {
            const cell = cellFor(a.x, a.y);
            const line = term.buffer.active.getLine(cell.row)?.translateToString(false) ?? "";
            const word = wordBounds(line, cell.col);
            anchor = { col: word.start, row: cell.row };
            term.select(word.start, cell.row, Math.max(1, word.end - word.start));
            navigator.vibrate?.(10);
            break;
          }
          case "select-extend": {
            if (!anchor) break;
            const span = spanBetween(anchor, cellFor(a.x, a.y), term.cols);
            term.select(span.col, span.row, span.length);
            break;
          }
          case "select-end":
            anchor = null;
            setCopyVisible(term.hasSelection());
            break;
        }
      }
    };
    const clearHold = () => {
      if (holdTimer !== null) clearTimeout(holdTimer);
      holdTimer = null;
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        clearHold();
        act(recognizer.cancel());
        return; // two fingers: leave pinch-zoom to the browser
      }
      const t = e.touches[0]!;
      e.preventDefault();
      stopFling();
      act(recognizer.down({ x: t.clientX, y: t.clientY, t: e.timeStamp }));
      clearHold();
      holdTimer = setTimeout(() => act(recognizer.longPress()), LONG_PRESS_MS);
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || recognizer.phase === "idle") return;
      const t = e.touches[0]!;
      e.preventDefault();
      act(recognizer.move({ x: t.clientX, y: t.clientY, t: e.timeStamp }));
      if (recognizer.phase !== "pressed") clearHold();
    };
    const onEnd = (e: TouchEvent) => {
      clearHold();
      if (recognizer.phase === "idle") return;
      const t = e.changedTouches[0];
      e.preventDefault();
      act(recognizer.up({ x: t?.clientX ?? 0, y: t?.clientY ?? 0, t: e.timeStamp }));
    };
    const onCancel = () => {
      clearHold();
      act(recognizer.cancel());
    };
    host.addEventListener("touchstart", onStart, { passive: false });
    host.addEventListener("touchmove", onMove, { passive: false });
    host.addEventListener("touchend", onEnd, { passive: false });
    host.addEventListener("touchcancel", onCancel);
    return () => {
      clearHold();
      stopFling();
      host.removeEventListener("touchstart", onStart);
      host.removeEventListener("touchmove", onMove);
      host.removeEventListener("touchend", onEnd);
      host.removeEventListener("touchcancel", onCancel);
    };
  }, [touchOn, booted, fontSize, lineHeight]);

  // ── accessory bar ─────────────────────────────────────────────────────────
  function onAccessoryKey(id: AccessoryKeyId): void {
    const term = termRef.current;
    if (!term) return;
    const def = ACCESSORY_KEYS.find((k) => k.id === id);
    if (!def) return;
    if (def.kind === "modifier") {
      const now = performance.now();
      const current = latchRef.current;
      setLatchState(id === "ctrl" ? { ...current, ctrl: tapModifier(current.ctrl, now) } : { ...current, alt: tapModifier(current.alt, now) });
      return;
    }
    if (id === "hide") {
      term.blur();
      term.textarea?.blur();
      return;
    }
    if (id === "paste") {
      if (!navigator.clipboard?.readText) return;
      navigator.clipboard.readText().then(
        (text) => {
          if (text) term.paste(text);
        },
        () => undefined, // permission refused: the system paste menu still works on the input
      );
      return;
    }
    const current = latchRef.current;
    const mods = { ctrl: isActive(current.ctrl), alt: isActive(current.alt) };
    const seq = keySequence(id, mods, { applicationCursor: term.modes.applicationCursorKeysMode });
    if (seq === null) return;
    if (mods.ctrl || mods.alt) setLatchState({ ctrl: afterKey(current.ctrl), alt: afterKey(current.alt) });
    callbacksRef.current.onData?.(seq);
  }

  function copySelection(): void {
    const term = termRef.current;
    if (!term) return;
    const text = term.getSelection();
    if (text && navigator.clipboard?.writeText) void navigator.clipboard.writeText(text);
    term.clearSelection();
    setCopyVisible(false);
  }

  const rootStyle: CSSProperties = { ...props.style };
  if (viewportHeight !== null) rootStyle.height = viewportHeight;

  return (
    <div
      ref={rootRef}
      className={["mxt-root", props.className].filter(Boolean).join(" ")}
      style={rootStyle}
      data-touch={touchOn ? "on" : "off"}
      data-theme={dark ? "dark" : "light"}
    >
      <div className="mxt-frame" style={{ background: terminalTheme(dark).background }}>
        <div ref={hostRef} className="mxt-host" style={{ paddingLeft: padding, paddingRight: padding }} />
        {copyVisible ? (
          <button type="button" className="mxt-copy" onPointerDown={(e) => e.preventDefault()} onClick={copySelection}>
            Copy
          </button>
        ) : null}
        {props.children}
      </div>
      {barOn ? <AccessoryBar ctrl={latches.ctrl.state} alt={latches.alt.state} onKey={onAccessoryKey} /> : null}
    </div>
  );
}
