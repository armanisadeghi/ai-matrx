/**
 * unlock.ts — THE iOS/WebKit audio-output unlock primitive.
 *
 * WHY THIS EXISTS (mobile-silence class, 2026-08-30)
 * --------------------------------------------------
 * On iOS every browser is WebKit (Chrome and Firefox on iPhone included), and
 * WebKit enforces two rules desktop browsers don't:
 *
 *   1. An `AudioContext` created (or resumed) OUTSIDE a user gesture starts
 *      `suspended` and stays silent. Our TTS starts audio from websocket
 *      callbacks seconds after the tap, so every utterance scheduled into a
 *      fresh per-utterance context played into a suspended context — total
 *      silence on iPhone while desktop worked fine.
 *   2. Web Audio output is muted by the ringer/silent switch unless the page
 *      declares a playback audio session (`navigator.audioSession.type =
 *      "playback"`, iOS 16.4+).
 *
 * THE FIX: capture a real user gesture ONCE, and inside it (synchronously)
 *   - declare the playback audio session,
 *   - create ONE shared `AudioContext`, resume it, and play a one-frame
 *     silent buffer through it (the classic unlock), and
 *   - prime ONE shared `HTMLAudioElement` with a muted play() so element
 *     playback (the catalog engine) is also user-activated.
 *
 * Consumers then REUSE the shared unlocked context/element instead of minting
 * fresh ones outside a gesture:
 *   - `SinkAwarePlayer` schedules through `getUnlockedAudioContext()` when it
 *     exists (per-utterance GainNode; the context is never closed).
 *   - `catalogAdapter` plays through `getPrimedMediaElement()` when it exists.
 *
 * Two entry points, both idempotent and framework-free:
 *   - `installAudioUnlockListeners()` — capture-phase pointerdown/keydown
 *     listeners that unlock on the user's FIRST interaction anywhere. Mounted
 *     once at app root (AudioPlaybackHost), so by the time any audio plays,
 *     the page is almost always already unlocked.
 *   - `primeAudioOutput()` — explicit call at the top of every audio-starting
 *     gesture handler (speak(), the Listen actions, transport buttons) as the
 *     belt-and-suspenders for taps the global listener could miss.
 *
 * Everything feature-detects: on desktop this is a no-op-cost shared context
 * that behaves identically to before.
 */

let sharedContext: AudioContext | null = null;
let sharedElement: HTMLAudioElement | null = null;
let listenersInstalled = false;
let audioSessionDeclared = false;

/** One-frame silent WAV — enough to user-activate an HTMLAudioElement. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

function declarePlaybackAudioSession(): void {
  if (audioSessionDeclared) return;
  // iOS 16.4+ — makes Web Audio respect "media" volume instead of being
  // muted by the ringer/silent switch. Absent elsewhere; feature-detected.
  const session = (
    navigator as Navigator & { audioSession?: { type: string } }
  ).audioSession;
  if (session) {
    try {
      session.type = "playback";
      audioSessionDeclared = true;
    } catch {
      /* older WebKit throws on unknown types — playback then follows ringer */
    }
  } else {
    audioSessionDeclared = true; // nothing to declare on this platform
  }
}

/**
 * The ONE shared output context, unlocked by a user gesture. Null until the
 * first `primeAudioOutput()` (or global-listener) gesture ran.
 */
export function getUnlockedAudioContext(): AudioContext | null {
  return sharedContext && sharedContext.state !== "closed"
    ? sharedContext
    : null;
}

/**
 * The ONE shared media element, user-activated by a muted play(). Null until
 * primed. Reused by element-based playback so `.play()` outside a gesture is
 * allowed on WebKit (activation is per-element).
 */
export function getPrimedMediaElement(): HTMLAudioElement | null {
  return sharedElement;
}

/**
 * Unlock audio output. MUST be called synchronously inside a user-gesture
 * call stack to have its full effect; safe (and cheap) to call any time.
 */
export function primeAudioOutput(): void {
  if (typeof window === "undefined") return;
  declarePlaybackAudioSession();

  // ── Web Audio ────────────────────────────────────────────────────────────
  try {
    if (!sharedContext || sharedContext.state === "closed") {
      sharedContext = new AudioContext();
    }
    if (sharedContext.state === "suspended") {
      void sharedContext.resume().catch(() => {
        /* outside a gesture this may reject — the next gesture retries */
      });
    }
    // The classic unlock: one silent frame through the graph. Repeat-safe.
    const buffer = sharedContext.createBuffer(1, 1, sharedContext.sampleRate);
    const node = sharedContext.createBufferSource();
    node.buffer = buffer;
    node.connect(sharedContext.destination);
    node.start(0);
  } catch {
    // No Web Audio (ancient browser) — element playback may still work.
  }

  // ── Media element ────────────────────────────────────────────────────────
  try {
    if (!sharedElement) {
      const el = new Audio();
      el.setAttribute("playsinline", "true");
      sharedElement = el;
    }
    const el = sharedElement;
    // Only prime while idle — never disturb real playback on the element.
    if (el.paused && !el.src.startsWith("blob:") && !el.currentSrc.startsWith("http")) {
      el.muted = true;
      el.src = SILENT_WAV;
      void el
        .play()
        .then(() => {
          el.pause();
          el.muted = false;
        })
        .catch(() => {
          el.muted = false;
        });
    }
  } catch {
    /* priming is best-effort */
  }
}

/**
 * Install capture-phase first-interaction listeners that unlock audio on ANY
 * tap/keypress. Idempotent; the listeners stay installed (re-priming after
 * the OS suspends the page costs nothing and heals `interrupted` contexts).
 */
export function installAudioUnlockListeners(): void {
  if (listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = true;
  const onGesture = () => primeAudioOutput();
  window.addEventListener("pointerdown", onGesture, {
    capture: true,
    passive: true,
  });
  window.addEventListener("keydown", onGesture, {
    capture: true,
    passive: true,
  });
  // iOS fires touchend-based activation more reliably than pointerdown for
  // some gestures (fast taps during scroll deceleration).
  window.addEventListener("touchend", onGesture, {
    capture: true,
    passive: true,
  });
}
