/**
 * THE single way to open a Cartesia TTS websocket from the browser.
 *
 * Cartesia v4 exposes a snake_case, event based websocket. The rest of the
 * app intentionally keeps one small, stable streaming contract, so SDK
 * upgrades stay contained here instead of leaking through every TTS hook.
 */

import { Cartesia } from "@cartesia/cartesia-js/client";
import type {
  GenerationConfig,
  VoiceSpecifier,
} from "@cartesia/cartesia-js/resources/tts";
import type { SupportedLanguage } from "@cartesia/cartesia-js/resources/voices";
import { CARTESIA_API_VERSION } from "./config";
import {
  getCartesiaAccessToken,
  invalidateCartesiaAccessToken,
  isCartesiaAuthError,
} from "./accessToken";

export interface CartesiaTtsSocketOptions {
  container?: string;
  encoding?: string;
  sampleRate?: number;
}

export type CartesiaTtsVoice = { mode: "id"; id: string };

export interface CartesiaTtsRequest {
  modelId: string;
  transcript: string;
  voice: CartesiaTtsVoice;
  language?: SupportedLanguage;
  contextId?: string;
  continue?: boolean;
  addTimestamps?: boolean;
  addPhonemeTimestamps?: boolean;
  maxBufferDelayMs?: number;
  generationConfig?: GenerationConfig;
}

type NativeSocket = Awaited<ReturnType<Cartesia["tts"]["websocket"]>>;
type MessageListener = (message: string) => void;

/** The structural source consumed by SinkAwarePlayer. */
export class CartesiaAudioSource {
  readonly sampleRate: number;
  #chunks: Float32Array[] = [];
  #done = false;
  #waiter: (() => void) | null = null;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  durationToSampleCount(durationSecs: number): number {
    return Math.ceil(durationSecs * this.sampleRate);
  }

  push(bytes: Uint8Array): void {
    const sampleCount = Math.floor(bytes.byteLength / Float32Array.BYTES_PER_ELEMENT);
    const samples = new Float32Array(sampleCount);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
    }
    this.#chunks.push(samples);
    this.#wake();
  }

  finish(): void {
    this.#done = true;
    this.#wake();
  }

  async read(destination: Float32Array): Promise<number> {
    let written = 0;
    while (written < destination.length) {
      while (this.#chunks.length === 0 && !this.#done) {
        await new Promise<void>((resolve) => {
          this.#waiter = resolve;
        });
      }
      if (this.#chunks.length === 0) break;
      const chunk = this.#chunks[0];
      const count = Math.min(chunk.length, destination.length - written);
      destination.set(chunk.subarray(0, count), written);
      written += count;
      if (count === chunk.length) {
        this.#chunks.shift();
      } else {
        this.#chunks[0] = chunk.subarray(count);
      }
    }
    return written;
  }

  #wake(): void {
    this.#waiter?.();
    this.#waiter = null;
  }
}

export interface CartesiaTtsResponse {
  source: CartesiaAudioSource;
  on(event: "message", listener: MessageListener): void;
}

export interface CartesiaConnectionCtx {
  on(event: "close", listener: () => void): void;
}

export interface CartesiaTtsSocket {
  send(request: CartesiaTtsRequest): Promise<CartesiaTtsResponse>;
  continue(request: CartesiaTtsRequest): Promise<CartesiaTtsResponse>;
  disconnect(): void;
}

const DEFAULTS: Required<CartesiaTtsSocketOptions> = {
  container: "raw",
  encoding: "pcm_f32le",
  sampleRate: 44100,
};

type ResolvedSocketOptions = {
  container: "raw";
  encoding: "pcm_f32le";
  sampleRate: 8000 | 16000 | 22050 | 24000 | 44100 | 48000;
};

class CartesiaV4Socket implements CartesiaTtsSocket {
  #native: NativeSocket;
  #options: ResolvedSocketOptions;
  #sources = new Map<string, CartesiaAudioSource>();
  #listeners = new Map<string, Set<MessageListener>>();

  constructor(native: NativeSocket, options: ResolvedSocketOptions) {
    this.#native = native;
    this.#options = options;
    // The SDK also emits its typed `error` channel after the global event.
    // Bind it so a provider error does not become an unhandled rejection;
    // the event handler below finishes the affected source and notifies callers.
    native.on("error", () => {});
    native.on("event", (event) => {
      const contextId = "context_id" in event ? event.context_id : undefined;
      if (!contextId) {
        if (event.type === "error") {
          for (const source of this.#sources.values()) source.finish();
          this.#sources.clear();
          this.#listeners.clear();
        }
        return;
      }
      const source = this.#sources.get(contextId);
      if (event.type === "chunk" && source) {
        source.push(event.audio ?? decodeBase64(event.data));
      } else if (event.type === "done" || event.type === "error") {
        source?.finish();
      }
      const serialized = JSON.stringify(event);
      for (const listener of this.#listeners.get(contextId) ?? []) {
        listener(serialized);
      }
      if (event.type === "done" || event.type === "error") {
        this.#sources.delete(contextId);
        this.#listeners.delete(contextId);
      }
    });
  }

  async send(request: CartesiaTtsRequest): Promise<CartesiaTtsResponse> {
    const contextId = request.contextId ?? crypto.randomUUID();
    let source = this.#sources.get(contextId);
    if (!source) {
      source = new CartesiaAudioSource(this.#options.sampleRate);
      this.#sources.set(contextId, source);
    }

    await this.#native.send({
      context_id: contextId,
      model_id: request.modelId,
      transcript: request.transcript,
      voice: toNativeVoice(request.voice),
      output_format: {
        container: this.#options.container,
        encoding: this.#options.encoding,
        sample_rate: this.#options.sampleRate,
      },
      language: request.language,
      continue: request.continue,
      add_timestamps: request.addTimestamps,
      add_phoneme_timestamps: request.addPhonemeTimestamps,
      max_buffer_delay_ms: request.maxBufferDelayMs,
      generation_config: request.generationConfig,
    });

    return {
      source,
      on: (_event, listener) => {
        const listeners = this.#listeners.get(contextId) ?? new Set<MessageListener>();
        listeners.add(listener);
        this.#listeners.set(contextId, listeners);
      },
    };
  }

  continue(request: CartesiaTtsRequest): Promise<CartesiaTtsResponse> {
    return this.send(request);
  }

  disconnect(): void {
    for (const source of this.#sources.values()) source.finish();
    this.#sources.clear();
    this.#listeners.clear();
    this.#native.close();
  }
}

function decodeBase64(value: string): Uint8Array {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function toNativeVoice(voice: CartesiaTtsVoice): VoiceSpecifier {
  return { id: voice.id };
}

async function buildConnectedSocket(
  token: string,
  options: ResolvedSocketOptions,
): Promise<{ ws: CartesiaV4Socket; ctx: CartesiaConnectionCtx }> {
  const client = new Cartesia({ token });
  const native = await client.tts.websocket({
    headers: { "Cartesia-Version": CARTESIA_API_VERSION },
  });
  await native.connect();
  const closeListeners = new Set<() => void>();
  native.socket.addEventListener("close", () => {
    for (const listener of closeListeners) listener();
  });
  return {
    ws: new CartesiaV4Socket(native, options),
    ctx: {
      on: (_event, listener) => {
        closeListeners.add(listener);
      },
    },
  };
}

/** Open a connected socket, refreshing a rejected broker token once. */
export async function connectCartesiaTts(
  options?: CartesiaTtsSocketOptions,
): Promise<{ ws: CartesiaTtsSocket; ctx: CartesiaConnectionCtx }> {
  const requested = { ...DEFAULTS, ...options };
  if (requested.container !== "raw") {
    throw new Error("Cartesia WebSocket playback requires the raw audio container.");
  }
  if (requested.encoding !== "pcm_f32le") {
    throw new Error("Cartesia browser playback requires pcm_f32le audio.");
  }
  const sampleRates: readonly number[] = [8000, 16000, 22050, 24000, 44100, 48000];
  if (!sampleRates.includes(requested.sampleRate)) {
    throw new Error(`Unsupported Cartesia sample rate: ${requested.sampleRate}`);
  }
  const resolved = requested as ResolvedSocketOptions;
  const token = await getCartesiaAccessToken();
  try {
    return await buildConnectedSocket(token, resolved);
  } catch (error) {
    if (!isCartesiaAuthError(error)) throw error;
    invalidateCartesiaAccessToken(token);
    return buildConnectedSocket(
      await getCartesiaAccessToken({ forceRefresh: true }),
      resolved,
    );
  }
}
