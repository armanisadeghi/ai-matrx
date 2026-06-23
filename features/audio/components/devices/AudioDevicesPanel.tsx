"use client";

// features/audio/components/devices/AudioDevicesPanel.tsx
//
// The audio-devices control surface, shared by the desktop window and the
// mobile drawer (WindowPanel renders one or the other from the registry's
// mobilePresentation). It hosts:
//   • mic picker (live device list — populated after permission),
//   • speaker picker (gated on `outputSelectionSupported`; Safari shows a note),
//   • permission status + a "Grant access" button when not granted,
//   • a LIVE input-level meter ("test mic") — acquires the shared mic stream +
//     an AnalyserNode, releases on close (never stops the singleton's tracks),
//   • a "Test speaker" button that plays a short tone through the selected
//     output device.
//
// Reuses the canonical primitives: `useAudioDevices`, the mic singleton
// (`acquireMicStream` / `releaseMicStream`), the shared AudioContext, and the
// output-sink feature detection. No forked audio plumbing.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Mic,
  MicOff,
  Play,
  RefreshCw,
  Speaker,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAudioDevices } from "@/features/audio/useAudioDevices";
import {
  acquireMicStream,
  releaseMicStream,
} from "@/features/audio/micStream";
import {
  getSharedAudioContext,
  resumeSharedAudioContext,
} from "@/features/audio/audioContext";
import {
  audioContextSinkSupported,
  getPreferredOutputDeviceId,
} from "@/features/audio/audioOutputSink";
import type { AudioDeviceInfo } from "@/features/audio/audioDevices";

const SYSTEM_DEFAULT = "__system_default__";

/** Friendly fallback label for a device whose label is blank (pre-grant). */
function deviceLabel(d: AudioDeviceInfo, kind: "input" | "output"): string {
  if (d.label) return d.label;
  const short = d.deviceId ? d.deviceId.slice(0, 6) : "unknown";
  return kind === "input" ? `Microphone (${short})` : `Speaker (${short})`;
}

export function AudioDevicesPanel() {
  const {
    permissionState,
    inputs,
    outputs,
    selectedInputId,
    selectedOutputId,
    setInput,
    setOutput,
    requestPermission,
    refresh,
    outputSelectionSupported,
  } = useAudioDevices();

  const [granting, setGranting] = useState(false);
  const isGranted = permissionState === "granted";
  const isDenied = permissionState === "denied";

  // On mount, make sure we have an up-to-date list. If already granted, labels
  // are present; otherwise the list shows device counts without labels.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleGrant = useCallback(async () => {
    setGranting(true);
    try {
      const result = await requestPermission();
      if (result === "denied") {
        toast.error("Microphone access denied", {
          description:
            "Enable microphone access for this site in your browser settings, then try again.",
        });
      }
    } finally {
      setGranting(false);
    }
  }, [requestPermission]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <PermissionRow
        state={permissionState}
        granting={granting}
        onGrant={handleGrant}
      />

      {/* Microphone */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Mic className="h-4 w-4 text-muted-foreground" />
          Microphone
        </div>
        <Select
          value={selectedInputId || SYSTEM_DEFAULT}
          onValueChange={(v) => {
            if (v === SYSTEM_DEFAULT) {
              setInput("", "");
              return;
            }
            const dev = inputs.find((d) => d.deviceId === v);
            setInput(v, dev?.label ?? "");
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="System default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SYSTEM_DEFAULT}>System default</SelectItem>
            {inputs.map((d) => (
              <SelectItem key={d.deviceId || "default-in"} value={d.deviceId}>
                {deviceLabel(d, "input")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isGranted && !isDenied && (
          <p className="text-xs text-muted-foreground">
            Grant microphone access to see your device names.
          </p>
        )}
        <MicLevelMeter disabled={isDenied} />
      </section>

      {/* Speaker */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Speaker className="h-4 w-4 text-muted-foreground" />
          Speaker
        </div>
        {outputSelectionSupported ? (
          <>
            <Select
              value={selectedOutputId || SYSTEM_DEFAULT}
              onValueChange={(v) => {
                if (v === SYSTEM_DEFAULT) {
                  setOutput("", "");
                  return;
                }
                const dev = outputs.find((d) => d.deviceId === v);
                setOutput(v, dev?.label ?? "");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="System default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SYSTEM_DEFAULT}>System default</SelectItem>
                {outputs.map((d) => (
                  <SelectItem
                    key={d.deviceId || "default-out"}
                    value={d.deviceId}
                  >
                    {deviceLabel(d, "output")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TestSpeakerButton />
          </>
        ) : (
          <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>
              This browser can&apos;t switch the audio output device. Choose your
              speaker or headphones in your macOS / iOS sound settings instead.
            </span>
          </p>
        )}
      </section>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refresh()}
          className="gap-1.5 text-muted-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh devices
        </Button>
      </div>
    </div>
  );
}

function PermissionRow({
  state,
  granting,
  onGrant,
}: {
  state: ReturnType<typeof useAudioDevices>["permissionState"];
  granting: boolean;
  onGrant: () => void;
}) {
  const granted = state === "granted";
  const denied = state === "denied";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
        granted
          ? "border-border bg-card"
          : denied
            ? "border-destructive/40 bg-destructive/5"
            : "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div className="flex items-center gap-2 text-sm">
        {granted ? (
          <Mic className="h-4 w-4 text-primary" />
        ) : (
          <MicOff
            className={cn(
              "h-4 w-4",
              denied ? "text-destructive" : "text-amber-500",
            )}
          />
        )}
        <span className="text-foreground">
          {granted
            ? "Microphone access granted"
            : denied
              ? "Microphone access blocked"
              : "Microphone access not granted"}
        </span>
      </div>
      {!granted && (
        <Button size="sm" onClick={onGrant} disabled={granting || denied}>
          {granting ? "Requesting…" : denied ? "Blocked" : "Grant access"}
        </Button>
      )}
    </div>
  );
}

/**
 * Live input-level meter. Acquires the shared mic stream (NOT a new
 * getUserMedia) + an AnalyserNode on the shared AudioContext; releases the hold
 * and disconnects on stop / unmount. Never stops the singleton's tracks.
 */
function MicLevelMeter({ disabled }: { disabled: boolean }) {
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const heldRef = useRef(false);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        /* ignore */
      }
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        /* ignore */
      }
      analyserRef.current = null;
    }
    if (heldRef.current) {
      releaseMicStream();
      heldRef.current = false;
    }
    setLevel(0);
    setTesting(false);
  }, []);

  const start = useCallback(async () => {
    try {
      await resumeSharedAudioContext();
      const ctx = getSharedAudioContext();
      if (!ctx) {
        toast.error("Audio not available in this browser");
        return;
      }
      const stream = await acquireMicStream();
      heldRef.current = true;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      sourceRef.current = source;
      analyserRef.current = analyser;
      setTesting(true);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        const a = analyserRef.current;
        if (!a) return;
        a.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length; // 0..255
        setLevel(Math.min(100, Math.round((avg / 255) * 140)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      // Acquisition failed — release any partial hold so we never leak the mic.
      if (heldRef.current) {
        releaseMicStream();
        heldRef.current = false;
      }
       
      console.error("[AudioDevicesPanel] mic test failed:", err);
      toast.error("Couldn't start the mic test", {
        description:
          err instanceof Error ? err.message : "Microphone unavailable.",
      });
      setTesting(false);
    }
  }, []);

  // Always release on unmount — the whole-session mic-indicator-leak guard.
  useEffect(() => stop, [stop]);

  return (
    <div className="flex items-center gap-3">
      <Button
        variant={testing ? "secondary" : "outline"}
        size="sm"
        disabled={disabled}
        onClick={() => (testing ? stop() : void start())}
        className="gap-1.5"
      >
        {testing ? (
          <MicOff className="h-3.5 w-3.5" />
        ) : (
          <Mic className="h-3.5 w-3.5" />
        )}
        {testing ? "Stop test" : "Test mic"}
      </Button>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-75",
            level > 80
              ? "bg-destructive"
              : level > 40
                ? "bg-primary"
                : "bg-primary/60",
          )}
          style={{ width: `${level}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Plays a short, gentle tone through the currently-selected output device. Uses
 * a dedicated AudioContext so we can route it with `setSinkId` (Chromium) when a
 * non-default speaker is chosen; falls back to the default output otherwise.
 */
function TestSpeakerButton() {
  const [playing, setPlaying] = useState(false);

  const play = useCallback(async () => {
    if (playing) return;
    const Ctor =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (
            window as unknown as {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext
        : undefined;
    if (!Ctor) {
      toast.error("Audio not available in this browser");
      return;
    }
    setPlaying(true);
    const ctx = new Ctor();
    try {
      // Route to the chosen speaker when supported (the global AudioContext
      // patch also catches this, but call it explicitly so the test is honest).
      const target = getPreferredOutputDeviceId();
      if (target && audioContextSinkSupported()) {
        const ctxWithSink = ctx as AudioContext & {
          setSinkId?: (id: string) => Promise<void>;
        };
        await ctxWithSink.setSinkId?.(target).catch(() => {
          /* fall back to default device */
        });
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 440;
      // Short envelope so it doesn't click.
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
      gain.gain.linearRampToValueAtTime(0, now + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.55);
      await new Promise<void>((resolve) => {
        osc.onended = () => resolve();
      });
    } catch (err) {
       
      console.error("[AudioDevicesPanel] speaker test failed:", err);
      toast.error("Couldn't play the test tone");
    } finally {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
      setPlaying(false);
    }
  }, [playing]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void play()}
      disabled={playing}
      className="gap-1.5 self-start"
    >
      {playing ? (
        <Volume2 className="h-3.5 w-3.5 animate-pulse" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
      {playing ? "Playing…" : "Test speaker"}
    </Button>
  );
}
