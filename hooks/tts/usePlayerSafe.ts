'use client';
import { useRef, useState } from "react";

export function usePlayerSafe() {
	const [isPlaying, setIsPlaying] = useState(false);
	const audioContext = useRef<AudioContext | null>(null);
	const source = useRef<AudioBufferSourceNode | null>(null);
	const [audioContextInitialized, setAudioContextInitialized] = useState(false);

	// Initialize the AudioContext on first volume icon click
	function initializeAudioContext() {
		if (!audioContext.current) {
			try {
				audioContext.current = new AudioContext({ sampleRate: 24000 });
				console.log("AudioContext initialized with sample rate:", audioContext.current.sampleRate);
				setAudioContextInitialized(true);
				return true;
			} catch (error) {
				console.error("Failed to initialize AudioContext:", error);
				return false;
			}
		}
		return true;
	}

	async function play(stream: ReadableStream, callback: () => void) {
		// Use the ref directly (synchronous) instead of the state (may be stale during re-renders)
		if (!audioContext.current) {
			const initialized = initializeAudioContext();
			if (!initialized) {
				console.error("Failed to initialize AudioContext");
				return;
			}
		}

		// Stop any currently playing audio
		stop();

		const ctx = audioContext.current;
		if (!ctx) {
			console.error("AudioContext is not available");
			return;
		}

		let nextStartTime = ctx.currentTime;
		const reader = stream.getReader();
		let leftover = new Uint8Array();
		let result = await reader.read();
		
		setIsPlaying(true);
		console.log("Starting audio playback");

		while (!result.done && audioContext.current) {
			const data = new Uint8Array(leftover.length + result.value.length);
			data.set(leftover);
			data.set(result.value, leftover.length);
			const length = Math.floor(data.length / 4) * 4;
			const remainder = data.length % 4;
			const buffer = new Float32Array(data.buffer, 0, length / 4);
			leftover = new Uint8Array(data.buffer, length, remainder);
			const audioBuffer = audioContext.current.createBuffer(
				1,
				buffer.length,
				audioContext.current.sampleRate
			);
			audioBuffer.copyToChannel(buffer, 0);
			source.current = audioContext.current.createBufferSource();
			source.current.buffer = audioBuffer;
			source.current.connect(audioContext.current.destination);
			source.current.start(nextStartTime);
			nextStartTime += audioBuffer.duration;
			result = await reader.read();
			if (result.done) {
				source.current.onended = () => {
					stop();
					callback();
				};
			}
		}
	}

	function stop() {
		if (source.current) {
			try {
				source.current.stop();
				source.current.disconnect();
			} catch (e) {
				// Source might already be stopped
			}
			source.current = null;
		}
		
		setIsPlaying(false);
	}

	return {
		isPlaying,
		play,
		stop,
		audioContextInitialized,
		initializeAudioContext
	};
}