// lib/cartesia/tts-service.ts

import {useEffect, useRef, useCallback} from 'react';
import { CartesiaClient } from "@cartesia/cartesia-js";

import {v4 as uuidv4} from 'uuid';
import {Buffer} from 'buffer';
import { WebSocket } from 'ws';
import {
    Language,
} from './cartesia.types';

const CARTESIA_WEBSOCKET_URL = 'wss://api.cartesia.ai/tts/websocket';

const cartesia = new CartesiaClient({
    apiKey: process.env.NEXT_PUBLIC_CARTESIA_API_KEY,
});


interface Frame {
}

interface StartFrame extends Frame {
}

interface EndFrame extends Frame {
}

interface CancelFrame extends Frame {
}

interface ErrorFrame extends Frame {
    error: string;
}

interface TTSStartedFrame extends Frame {
}

interface TTSStoppedFrame extends Frame {
}

interface TTSAudioRawFrame extends Frame {
    audio: Uint8Array;
    sample_rate: number;
    num_channels: number;
}

interface LLMFullResponseEndFrame extends Frame {
}

interface CartesiaMessage {
    type: string;
    context_id?: string;
    data?: string;
    error?: string;
    word_timestamps?: {
        words: string[];
        start: number[];
    };
}

interface CartesiaTTSServiceProps {
    apiKey: string;
    voiceId: string;
    modelId?: string;
    url?: string;
    cartesiaVersion?: string;
    params?: {
        encoding?: string;
        sample_rate?: number;
        container?: string;
        language?: Language;
        speed?: string | number;
        emotion?: string[];
    };
}

const CartesiaTTSService =
    ({
         apiKey,
         voiceId,
         modelId = 'sonic-turbo-2025-03-07',
         url = 'wss://api.cartesia.ai/tts/websocket',
         cartesiaVersion = '2024-06-10',
         params = {}
     }: CartesiaTTSServiceProps) => {
        const wsRef = useRef<WebSocket | null>(null);
        const contextIdRef = useRef<string | null>(null);
        const receiveTaskRef = useRef<NodeJS.Timeout | null>(null);

        const defaultParams = {
            encoding: 'pcm_s16le',
            sample_rate: 16000,
            container: 'raw',
            language: Language.EN,
            speed: '',
            emotion: []
        };

        const mergedParams = {...defaultParams, ...params};

        const pushFrame = useCallback((frame: Frame) => {
            // Implement frame pushing logic here
            console.log('Pushing frame:', frame);
        }, []);

        const pushError = useCallback((error: string) => {
            pushFrame({error} as ErrorFrame);
        }, [pushFrame]);

        const startMetrics = useCallback((metricType: string) => {
            // Implement metric tracking start logic here
            console.log(`Starting ${metricType} metrics`);
        }, []);

        const stopMetrics = useCallback((metricType: string) => {
            // Implement metric tracking stop logic here
            console.log(`Stopping ${metricType} metrics`);
        }, []);

        const connect = useCallback(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) return;

            wsRef.current = new WebSocket(`${url}?api_key=${apiKey}&cartesia_version=${cartesiaVersion}`);

            wsRef.current.onopen = () => {
                console.log('WebSocket connected');
            };

            // TODO: removed for type error
            // wsRef.current.onmessage = (event) => {
            //     const msg: CartesiaMessage = JSON.parse(event.data);
            //     handleMessage(msg);
            // };

            wsRef.current.onerror = (error) => {
                console.error('WebSocket error:', error);
                pushError(`WebSocket error: ${error}`);
            };

            wsRef.current.onclose = () => {
                console.log('WebSocket closed');
            };
        }, [url, apiKey, cartesiaVersion, pushError]);

        const disconnect = useCallback(() => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            if (receiveTaskRef.current) {
                clearInterval(receiveTaskRef.current);
                receiveTaskRef.current = null;
            }
            contextIdRef.current = null;
        }, []);

        const handleMessage = useCallback((msg: CartesiaMessage) => {
            if (!msg || msg.context_id !== contextIdRef.current) return;

            switch (msg.type) {
                case 'done':
                    stopMetrics('ttfb');
                    pushFrame({} as TTSStoppedFrame);
                    contextIdRef.current = null;
                    pushFrame({} as LLMFullResponseEndFrame);
                    break;
                case 'timestamps':
                    if (msg.word_timestamps) {
                        // Handle word timestamps
                        console.log('Word timestamps:', msg.word_timestamps);
                    }
                    break;
                case 'chunk':
                    stopMetrics('ttfb');
                    if (msg.data) {
                        const audioData = Buffer.from(msg.data, 'base64');
                        pushFrame({
                            audio: new Uint8Array(audioData),
                            sample_rate: mergedParams.sample_rate,
                            num_channels: 1
                        } as TTSAudioRawFrame);
                    }
                    break;
                case 'error':
                    console.error('Cartesia error:', msg.error);
                    pushFrame({} as TTSStoppedFrame);
                    stopMetrics('all');
                    pushError(`Cartesia error: ${msg.error}`);
                    break;
                default:
                    console.error('Unknown message type:', msg);
            }
        }, [pushFrame, pushError, stopMetrics, mergedParams.sample_rate]);

        const buildMessage = useCallback((text: string, continueTranscript: boolean = true, addTimestamps: boolean = true) => {
            interface VoiceConfig {
                mode: 'id';
                id: string;
                __experimental_controls?: {
                    speed?: string | number;
                    emotion?: string[];
                };
            }
            const voiceConfig: VoiceConfig = {mode: 'id', id: voiceId};

            if (mergedParams.speed || mergedParams.emotion.length > 0) {
                voiceConfig.__experimental_controls = {};
                if (mergedParams.speed) {
                    voiceConfig.__experimental_controls.speed = mergedParams.speed;
                }
                if (mergedParams.emotion.length > 0) {
                    voiceConfig.__experimental_controls.emotion = mergedParams.emotion;
                }
            }

            return JSON.stringify({
                transcript: text,
                continue: continueTranscript,
                context_id: contextIdRef.current,
                model_id: modelId,
                voice: voiceConfig,
                output_format: {
                    container: mergedParams.container,
                    encoding: mergedParams.encoding,
                    sample_rate: mergedParams.sample_rate,
                },
                language: mergedParams.language,
                add_timestamps: addTimestamps,
            });
        }, [voiceId, modelId, mergedParams]);

        const runTTS = useCallback(async (text: string) => {
            console.log('Generating TTS:', text);

            try {
                if (!wsRef.current) {
                    await connect();
                }

                if (!contextIdRef.current) {
                    pushFrame({} as TTSStartedFrame);
                    startMetrics('ttfb');
                    contextIdRef.current = uuidv4();
                }

                const msg = buildMessage(text);

                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(msg);
                    // Start TTS usage metrics
                    console.log('Starting TTS usage metrics');
                } else {
                    console.error('WebSocket is not open');
                    pushFrame({} as TTSStoppedFrame);
                    await disconnect();
                    await connect();
                }
            } catch (e) {
                console.error('TTS generation error:', e);
                pushError(`TTS generation error: ${e}`);
            }
        }, [connect, disconnect, pushFrame, pushError, startMetrics, buildMessage]);

        const flushAudio = useCallback(async () => {
            if (!contextIdRef.current || !wsRef.current) return;
            console.log('Flushing audio');
            const msg = buildMessage('', false);
            wsRef.current.send(msg);
        }, [buildMessage]);

        useEffect(() => {
            connect();
            return () => {
                disconnect();
            };
        }, [connect, disconnect]);

        return {
            runTTS,
            flushAudio,
            setModel: (model: string) => {
                console.log('Switching TTS model to:', model);
                // Implement model switching logic here
            },
            setVoice: (voice: string) => {
                console.log('Switching TTS aiAudio to:', voice);
                // Implement aiAudio switching logic here
            },
            setSpeed: (speed: string | number) => {
                console.log('Switching TTS speed to:', speed);
                // Implement speed switching logic here
            },
            setEmotion: (emotion: string[]) => {
                console.log('Switching TTS emotion to:', emotion);
                // Implement emotion switching logic here
            },
            setLanguage: (language: Language) => {
                console.log('Switching TTS language to:', language);
                // Implement language switching logic here
            },
        };
    };

export default CartesiaTTSService;
