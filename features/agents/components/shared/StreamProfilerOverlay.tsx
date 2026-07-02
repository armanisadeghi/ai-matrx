"use client";

import { useEffect, useState } from "react";
import { Activity, X, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shape written by `utils/stream-profiler.ts` (`StreamProfiler.stopAndReport`)
 * onto `window.__STREAM_REPORTS__`. Debug-only dev overlay, no DB/Python
 * contract — this interface documents the producer's actual fields.
 */
interface StreamProfilerReport {
  Test: string;
  RequestId: string;
  ClientDurationSec: string;
  TotalChunksProcessed: number;
  ChunksPerSecond: string;
  JankFrames_Dropped: number;
  JankRatio: string;
  MemoryGrowthMB: string;
  TokensOut?: number;
  TokensTotal?: number;
  ClientSpeed_TokensPerSec?: string | null;
  ServerTotalTimeSec?: number | null;
  ServerApiTimeSec?: number | null;
}

type WindowWithStreamReports = typeof window & {
  __STREAM_REPORTS__?: StreamProfilerReport[];
};

export function StreamProfilerOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [reports, setReports] = useState<StreamProfilerReport[]>([]);

  useEffect(() => {
    const handleUpdate = () => {
      if (typeof window !== "undefined") {
        setReports((window as WindowWithStreamReports).__STREAM_REPORTS__ ?? []);
      }
    };
    
    // Initial fetch
    handleUpdate();

    window.addEventListener("stream-profiler-update", handleUpdate);
    return () => window.removeEventListener("stream-profiler-update", handleUpdate);
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 z-50 flex items-center justify-center p-2 rounded-full bg-slate-900/80 text-green-400 shadow-xl hover:bg-slate-900 transition-colors border border-green-500/30 backdrop-blur-md"
        title="View Stream Performance Metrics"
      >
        <Activity className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed top-4 right-4 w-[400px] max-h-[80dvh] bg-slate-950 border border-slate-800 shadow-2xl rounded-xl z-50 flex flex-col overflow-hidden text-sm font-mono text-slate-300">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2 text-green-400 font-semibold">
          <Activity className="w-4 h-4" />
          Stream Performance Profiler
        </div>
        <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {reports.length === 0 ? (
          <div className="text-center text-slate-500 italic py-8">
            No stream data collected yet. Trigger a prompt.
          </div>
        ) : (
          reports.map((r, i) => (
             <div key={r.RequestId || i} className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2 relative group">
                <button 
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(r, null, 2))}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-white"
                  title="Copy JSON"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <div className="text-blue-400 font-bold mb-2">{r.Test}</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="text-slate-500">Client Duration:</div>
                  <div className="text-right">{r.ClientDurationSec}s</div>

                  {r.TokensOut != null && (
                    <>
                      <div className="text-slate-500">Tokens Out:</div>
                      <div className="text-right text-emerald-400 font-semibold">{r.TokensOut}</div>
                      
                      <div className="text-slate-500">Client Tok/Sec:</div>
                      <div className="text-right text-emerald-400">{r.ClientSpeed_TokensPerSec}</div>
                    </>
                  )}
                  
                  <div className="text-slate-500">Total Chunks:</div>
                  <div className="text-right">{r.TotalChunksProcessed}</div>
                  
                  <div className="text-slate-500">Chunks / Sec:</div>
                  <div className="text-right">{r.ChunksPerSecond}</div>
                  
                  <div className="text-slate-500 mb-1 border-b border-slate-800 col-span-2"></div>

                  {r.ServerTotalTimeSec != null && (
                    <>
                      <div className="text-slate-500">Server Total Time:</div>
                      <div className="text-right text-blue-400">{r.ServerTotalTimeSec}s</div>
                      
                      <div className="text-slate-500">Server API Time:</div>
                      <div className="text-right text-blue-400">{r.ServerApiTimeSec}s</div>
                    </>
                  )}

                  <div className="text-slate-500">Dropped Frames:</div>
                  <div className="text-right">{r.JankFrames_Dropped}</div>
                  
                  <div className="text-slate-500">Jank Ratio:</div>
                  <div className={cn("text-right font-medium", parseFloat(r.JankRatio) > 10 ? "text-red-400" : "text-green-400")}>
                    {r.JankRatio}
                  </div>
                  
                  <div className="text-slate-500">Mem Growth:</div>
                  <div className="text-right text-purple-400">{r.MemoryGrowthMB} MB</div>
                </div>
             </div>
          ))
        )}
      </div>
      {reports.length > 0 && (
         <div className="p-3 border-t border-slate-800 bg-slate-900 border-b flex justify-between items-center text-xs">
           <span className="text-slate-500">Records: {reports.length}</span>
           <button
             onClick={() => { (window as WindowWithStreamReports).__STREAM_REPORTS__ = []; setReports([]); }}
             className="text-red-400 hover:text-red-300"
           >
             Clear History
           </button>
         </div>
      )}
    </div>
  );
}
