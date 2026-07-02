export interface StreamProfilerExtraStats {
  tokens?: { output?: number; total?: number };
  timing?: { total_duration?: number; api_duration?: number };
}

export interface StreamProfilerReport {
  Test: string;
  RequestId: string;
  ClientDurationSec: string;
  TotalChunksProcessed: number;
  ChunksPerSecond: string;
  JankFrames_Dropped: number;
  JankRatio: string;
  MemoryGrowthMB: string;
  TokensOut?: number | null;
  TokensTotal?: number | null;
  ClientSpeed_TokensPerSec?: string | null;
  ServerTotalTimeSec?: string | null;
  ServerApiTimeSec?: string | null;
}

/** Chrome-only non-standard `performance.memory` API. Absent elsewhere. */
interface PerformanceWithMemory extends Performance {
  memory?: { usedJSHeapSize: number };
}

declare global {
  interface Window {
    __STREAM_REPORTS__?: StreamProfilerReport[];
  }
}

export class StreamProfiler {
  private startTime: number = 0;
  private chunkCount: number = 0;
  private frameCount: number = 0;
  private jankFrames: number = 0; // Frames taking > 16.6ms
  private rafId: number = 0;
  private startMemory: number = 0;
  private lastFrameTime: number = 0;
  
  public isActive: boolean = false;
  private requestId: string = "";

  private static instance: StreamProfiler;

  private constructor() {}

  public static getInstance(): StreamProfiler {
    if (!StreamProfiler.instance) {
      StreamProfiler.instance = new StreamProfiler();
    }
    return StreamProfiler.instance;
  }

  public start(requestId: string) {
    if (this.isActive) {
      this.cancelRunning();
    }

    this.requestId = requestId;
    this.isActive = true;
    this.startTime = performance.now();
    this.chunkCount = 0;
    this.frameCount = 0;
    this.jankFrames = 0;
    this.lastFrameTime = performance.now();
    
    this.startMemory = (performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? 0;

    const tick = (now: number) => {
      const delta = now - this.lastFrameTime;
      if (delta > 16.6) this.jankFrames++; // Dropped 60FPS
      
      this.frameCount++;
      this.lastFrameTime = now;
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public trackChunk() {
    if (this.isActive) {
      this.chunkCount++;
    }
  }

  private cancelRunning() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.isActive = false;
  }

  public stopAndReport(testName: string, extraStats?: StreamProfilerExtraStats) {
    if (!this.isActive) return null;
    this.cancelRunning();

    const durationSec = (performance.now() - this.startTime) / 1000;

    const endMemory = (performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? 0;
    const memoryGrowthMB = (endMemory - this.startMemory) / (1024 * 1024);

    const report: StreamProfilerReport = {
        Test: testName,
        RequestId: this.requestId,
        ClientDurationSec: durationSec.toFixed(2),
        TotalChunksProcessed: this.chunkCount,
        ChunksPerSecond: (this.chunkCount / durationSec).toFixed(0),
        JankFrames_Dropped: this.jankFrames,
        JankRatio: `${((this.jankFrames / (this.frameCount || 1)) * 100).toFixed(1)}%`,
        MemoryGrowthMB: memoryGrowthMB.toFixed(2)
    };

    if (extraStats) {
      if (extraStats.tokens) {
         report.TokensOut = extraStats.tokens.output;
         report.TokensTotal = extraStats.tokens.total;
         report.ClientSpeed_TokensPerSec = extraStats.tokens.output ? (extraStats.tokens.output / durationSec).toFixed(1) : null;
      }
      if (extraStats.timing) {
         report.ServerTotalTimeSec = extraStats.timing.total_duration ? extraStats.timing.total_duration.toFixed(2) : null;
         report.ServerApiTimeSec = extraStats.timing.api_duration ? extraStats.timing.api_duration.toFixed(2) : null;
      }
    }

    console.table(report);
    
    // Attach to window so a UI widget can read it
    if (typeof window !== 'undefined') {
      if (!window.__STREAM_REPORTS__) window.__STREAM_REPORTS__ = [];
      window.__STREAM_REPORTS__.push(report);
      // Fire a custom event so the UI can update automatically
      window.dispatchEvent(new CustomEvent('stream-profiler-update'));
    }

    return report;
  }
}
