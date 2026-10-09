/**
 * NET GATE — one local HTTP CONNECT proxy per participant, so the harness can
 * cut, restore and throttle THAT person's network, media included.
 *
 * Why a proxy and not only `context.setOffline(true)`: Chromium's offline
 * emulation stops HTTP and WebSocket, but WebRTC media rides UDP and never sees
 * it — a "network cut" that leaves audio and video flowing tests nothing. The
 * browser is launched with `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`,
 * which forces LiveKit's media onto TCP/TLS (TURN over 443) THROUGH this proxy.
 * Cutting the proxy therefore cuts signalling AND media, the way pulling a
 * cable does. `Actor.cutNetwork` pairs it with `setOffline` so `navigator.onLine`
 * and loopback traffic to the dev server drop too.
 */
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { Transform, type TransformCallback } from "node:stream";

export interface Throttle {
  /** Added one-way latency per chunk. */
  latencyMs: number;
  /** Cap in kilobits per second per direction; 0 = uncapped. */
  kbps: number;
}

/** `<session>.localhost` resolves in the browser, not always in Node: dial loopback. */
const dialHost = (host: string): string => (/(^|\.)localhost$/i.test(host) ? "127.0.0.1" : host);

export class NetGate {
  private server: http.Server | null = null;
  private readonly sockets = new Set<net.Socket>();
  private cut = false;
  private throttle: Throttle = { latencyMs: 0, kbps: 0 };
  /** Every gate event, for the scenario's evidence. */
  readonly log: string[] = [];

  constructor(readonly label: string) {}

  async start(): Promise<number> {
    const server = http.createServer((req, res) => this.forwardPlain(req, res));
    server.on("connect", (req, client: net.Socket, head: Buffer) => this.tunnel(req, client, head));
    server.on("connection", (s: net.Socket) => {
      this.sockets.add(s);
      s.on("close", () => this.sockets.delete(s));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    this.server = server;
    return (server.address() as AddressInfo).port;
  }

  get port(): number {
    if (this.server === null) throw new Error("gate not started");
    return (this.server.address() as AddressInfo).port;
  }

  /** Drop every live connection and refuse new ones until `restore()`. */
  cutAll(): void {
    this.cut = true;
    this.log.push(`${new Date().toISOString()} cut (${this.sockets.size} sockets dropped)`);
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
  }

  restore(): void {
    this.cut = false;
    this.log.push(`${new Date().toISOString()} restored`);
  }

  setThrottle(t: Throttle): void {
    this.throttle = t;
    this.log.push(`${new Date().toISOString()} throttle ${t.latencyMs}ms ${t.kbps}kbps`);
  }

  async stop(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
    this.server = null;
  }

  /**
   * A bottleneck link, per direction: bytes leave at `kbps` and arrive `latencyMs` later, PIPELINED —
   * many chunks are in flight at once, as on a real path. (Until 2026-10-09 every chunk waited its
   * full latency before the next was accepted, so 1.2 KB TLS records crawled at ~24 kbps and a
   * "400 ms / 300 kbps café" became a minute-deep queue.) A queue deeper than `QUEUE_MS` of the link
   * pushes back on the sender (TCP backpressure), never drops bytes inside a TLS stream.
   */
  private shaper(): Transform {
    const gate = this;
    const QUEUE_MS = 500;
    let nextFree = Date.now();
    let queued = 0;
    let waiting: TransformCallback | null = null;
    return new Transform({
      transform(chunk: Buffer, _enc: BufferEncoding, done: TransformCallback) {
        const { latencyMs, kbps } = gate.throttle;
        if (latencyMs <= 0 && kbps <= 0) {
          done(null, chunk);
          return;
        }
        const now = Date.now();
        const bytesPerMs = kbps > 0 ? (kbps * 1000) / 8 / 1000 : Infinity;
        const sendAt = Math.max(now, nextFree) + (bytesPerMs === Infinity ? 0 : chunk.length / bytesPerMs);
        nextFree = sendAt;
        queued += chunk.length;
        setTimeout(() => {
          queued -= chunk.length;
          this.push(chunk);
          if (waiting !== null && (bytesPerMs === Infinity || queued / bytesPerMs < QUEUE_MS)) {
            const resume = waiting;
            waiting = null;
            resume();
          }
        }, Math.max(0, sendAt + latencyMs - now));
        if (bytesPerMs !== Infinity && queued / bytesPerMs >= QUEUE_MS) waiting = done;
        else done();
      },
    });
  }

  private tunnel(req: http.IncomingMessage, client: net.Socket, head: Buffer): void {
    if (this.cut) {
      client.end("HTTP/1.1 503 Network cut by harness\r\n\r\n");
      return;
    }
    const [host, portText] = (req.url ?? "").split(":");
    const upstream = net.connect(Number(portText) || 443, dialHost(host), () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) upstream.write(head);
      client.pipe(this.shaper()).pipe(upstream);
      upstream.pipe(this.shaper()).pipe(client);
    });
    this.sockets.add(upstream);
    upstream.on("close", () => this.sockets.delete(upstream));
    const kill = () => {
      client.destroy();
      upstream.destroy();
    };
    upstream.on("error", kill);
    client.on("error", kill);
  }

  private forwardPlain(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (this.cut) {
      res.writeHead(503).end("Network cut by harness");
      return;
    }
    let target: URL;
    try {
      target = new URL(req.url ?? "");
    } catch {
      res.writeHead(400).end();
      return;
    }
    const upstream = http.request(
      { host: dialHost(target.hostname), port: target.port || 80, path: target.pathname + target.search, method: req.method, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
  }
}
