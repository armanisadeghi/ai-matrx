## Deepgram vs. Cartesia

**Keep Deepgram for STT / transcription / diarization / audio intelligence.**
**Keep Cartesia for TTS / voice quality / voice cloning / ultra-low-latency spoken output.**

If you want to reduce vendors, I would **drop Deepgram TTS first**, not Deepgram overall. Cartesia is much stronger as the “voice output” layer. I would **not drop Deepgram STT** unless your own tests show Cartesia Ink-2 handles your real audio, accents, noise, diarization, and structured text better.

---

## Raw comparison

| Area                              | Deepgram                                                                                                                              | Cartesia                                                                                                                           | Practical read                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Core identity                     | Full voice AI infra: STT, TTS, voice agents, audio/text intelligence                                                                  | Voice AI models/platform: Sonic TTS, Ink STT, Line voice agents                                                                    | Deepgram is broader/more transcription-heavy; Cartesia is more voice-quality/agent-output focused.                       |
| Best-known strength               | STT/transcription, Flux/Nova-3, diarization, redaction, formatting, audio intelligence                                                | Natural/fast TTS, voice cloning, localization, expressive voice, low latency                                                       | Use Deepgram for “understanding audio”; Cartesia for “speaking beautifully.”                                             |
| STT                               | Nova-3 and Flux. Nova-3 is Deepgram’s highest-performing general ASR; Flux is built for voice-agent turn-taking. ([Deepgram Docs][1]) | Ink-2 is positioned as fastest/accurate STT for voice agents, with semantic endpointing and native turn detection. ([Cartesia][2]) | Cartesia STT looks serious now, but Deepgram still has the deeper STT feature surface.                                   |
| TTS                               | Aura-1 / Aura-2. Aura-2 is $0.030 / 1k chars; Aura-1 is $0.015 / 1k chars on PAYG. ([Deepgram][3])                                    | Sonic-3.5. Standard TTS is ~1 credit per character; Pro voice clone TTS is ~1.5 credits/character. ([Cartesia Docs][4])            | Deepgram is cheaper/simple per-char; Cartesia is likely better for premium voice output.                                 |
| TTS languages                     | Aura supports English, Spanish, German, French, Dutch, Italian, Japanese. ([Deepgram Docs][5])                                        | Sonic claims 40+ / 42 languages and sub-90ms latency. ([Cartesia][6])                                                              | Cartesia clearly wins multilingual TTS breadth.                                                                          |
| Voice cloning                     | Not the main selling point in the current docs I found                                                                                | Instant voice cloning, professional voice cloning, localization, pronunciation dictionaries. ([Cartesia][6])                       | Cartesia wins voice cloning / branded voice work.                                                                        |
| Diarization                       | Explicit STT add-on; $0.0020/min PAYG, $0.0017/min Growth; batch diarization v2 improved speaker labeling. ([Deepgram][3])            | Not the major public positioning from the pages I checked                                                                          | Deepgram wins meeting/call transcription workflows.                                                                      |
| Redaction / formatting / keyterms | Redaction, keyterm prompting, smart formatting, speaker diarization are listed STT features/add-ons. ([Deepgram][3])                  | More focused on model output quality, turn detection, TTS controls                                                                 | Deepgram wins compliance-oriented transcripts and post-call processing.                                                  |
| Voice agents                      | Voice Agent API: standard $0.075/min PAYG; BYO TTS $0.065/min; BYO LLM+TTS $0.050/min. ([Deepgram][3])                                | Line agents: $0.06/min call duration; telephony add-on $0.014/min using Cartesia number. ([Cartesia][7])                           | Cartesia base agent call looks cheaper, but Deepgram has more mature “all voice infrastructure” feel.                    |
| Concurrency                       | PAYG: STT up to 50 REST / 150 WSS; TTS up to 45; Voice Agent up to 45. Growth raises WSS/TTS/agent limits. ([Deepgram][3])            | Free/Pro/Startup/Scale: TTS concurrent 2/3/5/15; STT concurrent 8/12/20/60; agent calls 8/12/20/60. ([Cartesia][7])                | Deepgram has stronger default STT/TTS API concurrency; Cartesia has stronger self-serve agent-call concurrency at Scale. |
| Self-host / private deploy        | Enterprise option for large volumes/data/deployment requirements; docs include self-hosted deployments. ([Deepgram][3])               | Self-hosting supports Sonic 2, Sonic 3, Sonic 3.5, Ink Whisper, Ink 2; not voice agents or cloning. ([Cartesia Docs][8])           | Both can support serious enterprise deployment; exact terms are sales-driven.                                            |
| Compliance                        | SOC 2 Type 1/2; GDPR; AU residency endpoints; HIPAA BAA available on request; PCI compliant. ([Deepgram Docs][9])                     | Public API claims GDPR, SOC 2 Type II, PCI Level 1, HIPAA compliance, SLA/BAA enterprise options. ([Cartesia Docs][8])             | Both can work for enterprise/compliance, but verify BAA/DPA terms before healthcare/legal workloads.                     |

---

## Pricing facts that matter

### Deepgram

Deepgram has **$200 free credit**, then PAYG, with a Growth plan starting at **$4K+/year**. PAYG has no minimums and no credit card required. ([Deepgram][3])

For STT, current public pricing shows:

| Deepgram STT item          |                                      Public PAYG price shown |
| -------------------------- | -----------------------------------------------------------: |
| Flux English               | $0.0065/min, with $0.0077/min also shown on the pricing page |
| Flux Multilingual          |                                                  $0.0078/min |
| Nova-3 Monolingual         |                     $0.0048/min, with $0.0077/min also shown |
| Nova-3 Multilingual        |                     $0.0058/min, with $0.0092/min also shown |
| Redaction add-on           |                                                  $0.0020/min |
| Keyterm Prompting add-on   |                                                  $0.0013/min |
| Smart Formatting           |                                                     Included |
| Speaker Diarization add-on |                                                  $0.0020/min |

The parsed pricing page shows two STT numbers in several rows and labels “limited-time promotional rates on streaming,” so I would treat the lower number as the visible current promo rate and confirm in-console before committing volume. ([Deepgram][3])

For TTS:

| Deepgram TTS |                   PAYG |
| ------------ | ---------------------: |
| Aura-1       | $0.015 / 1k characters |
| Aura-2       | $0.030 / 1k characters |

([Deepgram][3])

### Cartesia

Cartesia pricing is credit-based for TTS/STT and dollar-per-minute for agents. Plans are:

| Cartesia plan | Monthly price | Credits/month | Agent prepaid/month |
| ------------- | ------------: | ------------: | ------------------: |
| Free          |            $0 |           20K |                  $1 |
| Pro           |            $5 |          100K |                  $5 |
| Startup       |           $49 |         1.25M |                 $49 |
| Scale         |          $299 |            8M |                $299 |
| Enterprise    |        Custom |        Custom |              Custom |

([Cartesia][7])

Cartesia usage math:

| Cartesia usage                                  |                          Cost |
| ----------------------------------------------- | ----------------------------: |
| Standard TTS                                    |         ~1 credit / character |
| Pro Voice Clone TTS                             |      ~1.5 credits / character |
| Pro Voice Clone fine-tune                       |             1,000,000 credits |
| Ink-2 realtime STT                              |   3 credits / second of audio |
| Ink-Whisper realtime STT                        |    1 credit / second of audio |
| Ink-Whisper batch STT                           | 1 credit / 2 seconds of audio |
| Line voice agent call                           |                     $0.06/min |
| Cartesia-provided phone number telephony add-on |                   +$0.014/min |

([Cartesia Docs][4])

Cartesia also publishes included monthly usage estimates:

| Cartesia plan | Sonic-3.5 TTS minutes included | Ink-2 STT hours included |
| ------------- | -----------------------------: | -----------------------: |
| Free          |                        ~27 min |                  ~1h 51m |
| Pro           |                       ~133 min |                  ~9h 16m |
| Startup       |                     ~1,667 min |                ~115h 44m |
| Scale         |                    ~10,667 min |                ~740h 44m |

([Cartesia][7])

---

## My recommendation for your stack

**Use Deepgram for:**

1. **Real transcription / recordings / meetings / call transcripts.**
2. **Speaker diarization.**
3. **Redaction, smart formatting, keyterm prompting.**
4. **Audio intelligence: summaries, topics, sentiment, intent.**
5. **High-volume STT where you want a mature transcription API.**

**Use Cartesia for:**

1. **User-facing spoken output.**
2. **Voice agents where voice quality and latency matter.**
3. **Multilingual TTS.**
4. **Voice cloning / branded voices / localization.**
5. **More expressive speech: emotion, laughter, pronunciation dictionaries, accent/localization control.**

**What I would drop first:** Deepgram TTS, assuming Cartesia voices sound better in your product.
**What I would not drop yet:** Deepgram STT. Cartesia Ink-2 may be good, but Deepgram is still the safer STT/transcription default.

A clean architecture would be:

**Deepgram = ears + transcript intelligence**
**Cartesia = mouth + branded/natural voice**

[1]: https://developers.deepgram.com/docs/models-languages-overview "Models & Languages Overview | Deepgram's Docs"
[2]: https://www.cartesia.ai/ink "Cartesia \ Ink"
[3]: https://deepgram.com/pricing "Deepgram Pricing | Scalable Speech-to-Text, Text-to-Speech & Voice Agent APIs"
[4]: https://docs.cartesia.ai/pricing "Pricing - Cartesia Docs"
[5]: https://developers.deepgram.com/docs/tts-models "Voices and Languages | Deepgram's Docs"
[6]: https://www.cartesia.ai/sonic "Cartesia \ Real-time TTS API with AI laughter and emotion"
[7]: https://cartesia.ai/pricing "Cartesia \ Pricing"
[8]: https://docs.cartesia.ai/self-hosted/introduction "Introduction - Cartesia Docs"
[9]: https://developers.deepgram.com/trust-security/data-privacy-compliance "Data Privacy Compliance | Deepgram's Docs"
