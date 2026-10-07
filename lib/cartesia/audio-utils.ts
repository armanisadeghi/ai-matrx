export function bufferToWav<T extends Float32Array | Int16Array>(
	sampleRate: number,
	channelBuffers: T[],
) {
	const convertFloats = channelBuffers[0] instanceof Float32Array;

	const totalSamples = channelBuffers[0].length * channelBuffers.length;

	const bytesPerSample = 2;
	const buffer = new ArrayBuffer(44 + totalSamples * bytesPerSample);
	const view = new DataView(buffer);

	const writeString = (view: DataView, offset: number, string: string) => {
		for (let i = 0; i < string.length; i++) {
			view.setUint8(offset + i, string.charCodeAt(i));
		}
	};

	const blockAlign = channelBuffers.length * bytesPerSample;
	/* RIFF identifier */
	writeString(view, 0, "RIFF");
	/* RIFF chunk length */
	view.setUint32(4, 36 + totalSamples * bytesPerSample, true);
	/* RIFF type */
	writeString(view, 8, "WAVE");
	/* format chunk identifier */
	writeString(view, 12, "fmt ");
	/* format chunk length */
	view.setUint32(16, 16, true);
	/* sample format (raw) */
	view.setUint16(20, 1, true);
	/* channel count */
	view.setUint16(22, channelBuffers.length, true);
	/* sample rate */
	view.setUint32(24, sampleRate, true);
	/* byte rate (sample rate * block align) */
	view.setUint32(28, sampleRate * blockAlign, true);
	/* block align (channel count * bytes per sample) */
	view.setUint16(32, blockAlign, true);
	/* bits per sample */
	view.setUint16(34, bytesPerSample * 8, true);
	/* data chunk identifier */
	writeString(view, 36, "data");
	/* data chunk length */
	view.setUint32(40, totalSamples * bytesPerSample, true);

	let offset = 44;
	for (let i = 0; i < channelBuffers[0].length; i++) {
		for (let channel = 0; channel < channelBuffers.length; channel++) {
			if (convertFloats) {
				const s = Math.max(-1, Math.min(1, channelBuffers[channel][i]));
				view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
			} else {
				view.setInt16(offset, channelBuffers[channel][i], true);
			}
			offset += bytesPerSample;
		}
	}

	return buffer;
}

export function downloadWavForBuffer<T extends Float32Array | Int16Array>(
	sampleRate: number,
	channelBuffers: T[],
) {
	const buffer = bufferToWav(sampleRate, channelBuffers);
	const blob = new Blob([buffer], { type: "audio/wav" });
	downloadFile(`cartesia_audio.wav`, blob, blob.type);
}

import { downloadFile } from "@/components/agent-copy/export";