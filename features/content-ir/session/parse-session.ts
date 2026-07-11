/**
 * ParseSession — one live region parse per stream identity.
 *
 * Owns the parser + IrTree OUTSIDE React and Redux. Writers push chunks;
 * N readers subscribe per path (useIrNode / selectors) and are notified on
 * the host's flush cadence — never per token.
 *
 * Notification contract: `write()`/`end()` never notify. The host (demo rAF
 * loop, process-stream's dispatchBatch tick) calls `flushNotify()` to publish
 * dirty paths. Late schema arrivals (registry cold fetch) notify themselves —
 * they happen outside any streaming tick.
 */

import { IrTree, type IrTreeNode } from "../core/ir-tree";
import { createFingerprinter, type Fingerprinter } from "../core/fingerprint";
import type { CanonicalBlockIR } from "../core/ir-types";
import type { KindSchema } from "../core/kind-schema.types";
import {
  createKindStreamParser,
  type KindStreamEvent,
  type KindStreamParser,
  type SchemaResolver,
} from "../core/kind-parser";

export interface ParseSessionOptions {
  identity: string;
  schemas: Record<string, KindSchema> | SchemaResolver;
  expectedRootKind?: string;
  /**
   * Registry hook: subscribe to cold-fetch answers, return an unsubscribe.
   * The session forwards arrivals into the parser (upgrade-in-place) and
   * notifies affected readers immediately.
   */
  onSchemaArrived?: (
    deliver: (kind: string, schema: KindSchema | null) => void,
  ) => () => void;
  /** Observe every parser event (demo inspector, telemetry). */
  onEvent?: (event: KindStreamEvent) => void;
}

type Listener = () => void;

export class ParseSession {
  readonly identity: string;

  private readonly parser: KindStreamParser;
  private readonly tree = new IrTree();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly anyListeners = new Set<Listener>();
  private readonly unsubscribeSchemaArrivals: (() => void) | null;

  private readonly fingerprinter: Fingerprinter = createFingerprinter();
  private ended = false;

  constructor(options: ParseSessionOptions) {
    this.identity = options.identity;

    this.parser = createKindStreamParser({
      schemas: options.schemas,
      ...(options.expectedRootKind !== undefined && {
        expectedRootKind: options.expectedRootKind,
      }),
      onEvent: (event) => {
        this.tree.applyEvent(event);
        options.onEvent?.(event);
      },
    });

    this.unsubscribeSchemaArrivals =
      options.onSchemaArrived?.((kind, schema) => {
        this.parser.notifySchemaArrived(kind, schema);
        // Upgrades happen outside the streaming tick — publish right away.
        this.flushNotify();
      }) ?? null;
  }

  /** The single writer's input. Does NOT notify — host flushes on its cadence. */
  write(chunk: string): void {
    this.fingerprinter.push(chunk);
    this.parser.push(chunk);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.parser.end();
  }

  get isEnded(): boolean {
    return this.ended;
  }

  get status(): "streaming" | "complete" | "error" {
    return this.tree.status;
  }

  getNode(pathKey: string): IrTreeNode | null {
    return this.tree.getNode(pathKey);
  }

  listNodes(): IrTreeNode[] {
    return this.tree.listNodes();
  }

  isRawPath(pathKey: string): boolean {
    return this.tree.isRawPath(pathKey);
  }

  subscribe(pathKey: string, listener: Listener): () => void {
    const set = this.listeners.get(pathKey) ?? new Set();
    set.add(listener);
    this.listeners.set(pathKey, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(pathKey);
    };
  }

  /** Structural subscription: fires when ANY node changes (mount lists). */
  subscribeAny(listener: Listener): () => void {
    this.anyListeners.add(listener);
    return () => {
      this.anyListeners.delete(listener);
    };
  }

  /** Publish dirty paths to their readers. Host-cadence, coalesced. */
  flushNotify(): void {
    if (!this.tree.hasDirty()) return;
    const dirty = this.tree.drainDirty();

    for (const pathKey of dirty) {
      const set = this.listeners.get(pathKey);
      if (!set) continue;
      for (const listener of set) listener();
    }

    if (this.anyListeners.size > 0) {
      for (const listener of this.anyListeners) listener();
    }
  }

  buildEnvelope(): CanonicalBlockIR {
    return this.tree.buildEnvelope(this.fingerprinter.current());
  }

  dispose(): void {
    this.unsubscribeSchemaArrivals?.();
    this.listeners.clear();
    this.anyListeners.clear();
  }
}
