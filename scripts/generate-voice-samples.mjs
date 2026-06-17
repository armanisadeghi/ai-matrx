// scripts/generate-voice-samples.mjs
//
// Generate a short (~6-8s) audio sample for EVERY podcast voice and save it as a
// durable static asset under public/voice-samples/, then write the generated
// manifest the voice catalog reads (features/podcasts/generator/voiceSamplesManifest.ts).
//
//   node scripts/generate-voice-samples.mjs            # both providers
//   node scripts/generate-voice-samples.mjs --only elevenlabs
//   node scripts/generate-voice-samples.mjs --only google
//
// Env (keys may be quote-wrapped in some environments — we strip quotes):
//   ELEVEN_LABS_API_KEY            — ElevenLabs (3-20 host band)
//   GOOGLE_GENERATIVE_AI_API_KEY   — Gemini 2.5 TTS (1-2 host band)
//
// ElevenLabs returns MP3 directly. Gemini returns raw PCM (L16) which we wrap in
// a minimal WAV header (no ffmpeg dependency). Per-voice failures are logged and
// skipped — one bad voice never aborts the run. The manifest only lists voices
// that actually produced a file, so the UI shows a sample exactly when one exists.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public", "voice-samples");
const MANIFEST = join(ROOT, "features", "podcasts", "generator", "voiceSamplesManifest.ts");

const unquote = (s) => (s ?? "").replace(/^"+|"+$/g, "").trim();
const EL_KEY = unquote(process.env.ELEVEN_LABS_API_KEY);
const GG_KEY = unquote(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg !== -1 ? process.argv[onlyArg + 1] : null;

// ── Voice rosters (mirror features/podcasts/generator/voices.ts) ─────────────
const ELEVENLABS = [
  ["21m00Tcm4TlvDq8ikWAM", "Rachel"], ["pNInz6obpgDQGcFmaJgB", "Adam"],
  ["EXAVITQu4vr4xnSDxMaL", "Sarah"], ["ErXwobaYiN019PkySvjV", "Antoni"],
  ["MF3mGyEYCl7XYWbV9V6O", "Elli"], ["TxGEqnHWrfWFTfGW9XjX", "Josh"],
  ["AZnzlk1XvdvUeBnXmlld", "Domi"], ["VR6AewLTigWG4xSOukaG", "Arnold"],
  ["ThT5KcBeYPX3keUQqHPh", "Dorothy"], ["yoZ06aMxZJJ28mfd3POQ", "Sam"],
  ["jBpfuIE2acCO8z3wKNLl", "Gigi"], ["onwK4e9ZLuTAKqWW03F9", "Daniel"],
  ["pMsXgVXv3BLzUgSXRplE", "Serena"], ["g5CIjZEefAph4nQFvHAz", "Ethan"],
  ["oWAxZDx7w5VEj9dCyTzz", "Grace"], ["bVMeCyTHy58xNoL34h3p", "Jeremy"],
  ["jsCqWAovK2LkecY7zXl4", "Freya"], ["ZQe5CZNOzWyzPSCn5a3c", "James"],
  ["Xb7hH8MSUJpSbSDYk0k2", "Alice"], ["iP95p4xoKVk53GoZ742B", "Chris"],
];
// Gemini prebuilt voice values (lowercase, as stored in the catalog). The API
// voiceName is the capitalized form.
const GEMINI = [
  "zephyr", "puck", "charon", "kore", "fenrir", "leda", "orus", "aoede",
  "callirrhoe", "autonoe", "enceladus", "iapetus", "umbriel", "algieba",
  "despina", "erinome", "algenib", "rasalgethi", "laomedeia", "achernar",
  "alnilam", "schedar", "gacrux", "pulcherrima", "achird", "zubenelgenubi",
  "vindemiatrix", "sadachbia", "sadaltager", "sulafat",
];

const sampleText = (name) =>
  `Hi, I'm ${name}. This is a quick sample of how I sound for your podcast on Matrix.`;

// ── ElevenLabs (MP3) ─────────────────────────────────────────────────────────
async function genElevenLabs(voiceId, name) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`,
    {
      method: "POST",
      headers: { "xi-api-key": EL_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: sampleText(name),
        model_id: "eleven_multilingual_v2",
      }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`suspiciously small (${buf.length} bytes)`);
  const rel = `elevenlabs/${voiceId}.mp3`;
  await writeFile(join(PUBLIC_DIR, rel), buf);
  return { rel, bytes: buf.length };
}

// ── Gemini (PCM → WAV) ─────────────────────────────────────────────────────────
function wavFromPcm(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  const dataLen = pcm.length;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLen, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(1, 22); // channels = mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate (mono, 16-bit)
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(dataLen, 40);
  return Buffer.concat([header, pcm]);
}

async function genGemini(value) {
  const voiceName = value.charAt(0).toUpperCase() + value.slice(1);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GG_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Say warmly: ${sampleText(voiceName)}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = await res.json();
  const part = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("no audio inlineData in response");
  const pcm = Buffer.from(part.inlineData.data, "base64");
  const m = /rate=(\d+)/.exec(part.inlineData.mimeType || "");
  const rate = m ? Number(m[1]) : 24000;
  const wav = wavFromPcm(pcm, rate);
  const rel = `google/${value}.wav`;
  await writeFile(join(PUBLIC_DIR, rel), wav);
  return { rel, bytes: wav.length };
}

async function run() {
  await mkdir(join(PUBLIC_DIR, "elevenlabs"), { recursive: true });
  await mkdir(join(PUBLIC_DIR, "google"), { recursive: true });

  const manifest = {};
  let ok = 0;
  let fail = 0;

  if (ONLY !== "google") {
    if (!EL_KEY) {
      console.warn("[voice-samples] ELEVEN_LABS_API_KEY missing — skipping ElevenLabs");
    } else {
      for (const [voiceId, name] of ELEVENLABS) {
        try {
          const { rel, bytes } = await genElevenLabs(voiceId, name);
          manifest[voiceId] = `/voice-samples/${rel}`;
          ok++;
          console.log(`[voice-samples] EL ✓ ${name} (${voiceId}) ${bytes}b`);
        } catch (e) {
          fail++;
          console.error(`[voice-samples] EL ✗ ${name} (${voiceId}): ${e.message}`);
        }
      }
    }
  }

  if (ONLY !== "elevenlabs") {
    if (!GG_KEY) {
      console.warn("[voice-samples] GOOGLE_GENERATIVE_AI_API_KEY missing — skipping Gemini");
    } else {
      for (const value of GEMINI) {
        try {
          const { rel, bytes } = await genGemini(value);
          manifest[value] = `/voice-samples/${rel}`;
          ok++;
          console.log(`[voice-samples] Gemini ✓ ${value} ${bytes}b`);
        } catch (e) {
          fail++;
          console.error(`[voice-samples] Gemini ✗ ${value}: ${e.message}`);
        }
      }
    }
  }

  // Merge with any already-generated entries so a partial run (e.g. only one
  // provider, or Gemini still blocked by an expired key) never drops the other
  // provider's existing samples.
  let existing = {};
  try {
    const mod = await import(`${MANIFEST}?t=${Date.now()}`);
    existing = mod.GENERATED_VOICE_SAMPLES ?? {};
  } catch {
    /* first run — none yet */
  }
  const merged = { ...existing, ...manifest };
  const sortedKeys = Object.keys(merged).sort();
  const body = sortedKeys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(merged[k])},`).join("\n");
  const out = `// features/podcasts/generator/voiceSamplesManifest.ts
//
// AUTO-GENERATED by scripts/generate-voice-samples.mjs — do not edit by hand.
// Maps a voice value (Gemini name or ElevenLabs voice_id) → a static sample
// asset served from /public. Regenerate with:
//   node scripts/generate-voice-samples.mjs
// (needs ELEVEN_LABS_API_KEY and a valid GOOGLE_GENERATIVE_AI_API_KEY in env).

export const GENERATED_VOICE_SAMPLES: Record<string, string> = {
${body}
};
`;
  await writeFile(MANIFEST, out);
  console.log(`\n[voice-samples] done — ${ok} ok, ${fail} failed, ${sortedKeys.length} in manifest.`);
}

run().catch((e) => {
  console.error("[voice-samples] fatal:", e);
  process.exit(1);
});
