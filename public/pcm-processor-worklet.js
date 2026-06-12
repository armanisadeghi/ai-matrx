// public/pcm-processor-worklet.js
//
// AudioWorklet processor for the xAI Realtime voice agent.
//
// Consumes mono Float32 PCM at the AudioContext's sample rate (we always
// create the capture context at 24000 Hz, matching xAI's required input
// format). Converts to Int16 mono and batches into 20ms frames (480 samples
// = 960 bytes) before posting to the main thread. Also emits an RMS sample
// once per `process()` call so the visualizer can react to mic input level
// without the main thread doing any DSP.
//
// IMPORTANT: this file is plain JS. AudioWorklets cannot import TypeScript
// modules and must be served from a static origin so that
// `audioWorklet.addModule('/pcm-processor-worklet.js')` resolves.
//
// Do NOT use ScriptProcessorNode anywhere — it's deprecated, runs on the
// main thread, and causes audible glitches under load.

const FRAME_SAMPLES = 480; // 20ms @ 24kHz

class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Int16Array(FRAME_SAMPLES);
    this._bufIdx = 0;
    this._rmsAccum = 0;
    this._rmsCount = 0;
    // Diagnostics: count process() invocations and emit a heartbeat even when
    // there is no input channel, so the main thread can distinguish "process()
    // never runs" (worklet not scheduled) from "process() runs but input is
    // empty" (source not feeding the worklet). Throttled to ~every 64 calls.
    this._calls = 0;
  }

  process(inputs) {
    this._calls++;
    const ch = inputs[0] && inputs[0][0];
    if (!ch) {
      // Heartbeat with no input — confirms process() is scheduled but the mic
      // source isn't delivering channel data into this node.
      if (this._calls % 64 === 0) {
        this.port.postMessage({
          type: "diag",
          calls: this._calls,
          hasInput: false,
        });
      }
      return true;
    }

    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this._buf[this._bufIdx++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      this._rmsAccum += s * s;
      this._rmsCount++;

      if (this._bufIdx === FRAME_SAMPLES) {
        // Transfer the underlying buffer to avoid a copy across the postMessage boundary.
        this.port.postMessage(
          { type: "pcm", payload: this._buf.buffer },
          [this._buf.buffer],
        );
        this._buf = new Int16Array(FRAME_SAMPLES);
        this._bufIdx = 0;
      }
    }

    // Emit RMS once per process tick (~2.7ms at 128 samples) so the visualizer
    // sees mic level updates ~370 times per second. The main thread reads via
    // ref + rAF — no React re-renders are triggered.
    if (this._rmsCount > 0) {
      const rms = Math.sqrt(this._rmsAccum / this._rmsCount);
      this.port.postMessage({ type: "rms", value: rms });
      this._rmsAccum = 0;
      this._rmsCount = 0;
    }

    if (this._calls % 64 === 0) {
      this.port.postMessage({
        type: "diag",
        calls: this._calls,
        hasInput: true,
      });
    }

    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
