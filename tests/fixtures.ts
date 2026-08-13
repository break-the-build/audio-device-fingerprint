/**
 * Deterministic fixtures. No randomness, no browser APIs -- every value here
 * is reproducible from the code alone.
 */

import { extractFeatures } from '../src/lib/features';
import { normalizeFeature } from '../src/lib/normalize';
import { FINGERPRINT_VERSION } from '../src/lib/types';
import type { AudioFingerprint, EnvironmentInfo, Sample } from '../src/lib/types';

export const SAMPLE_RATE = 44100;

/** A pure sine wave of the given frequency and amplitude. */
export function sine(
	frequency: number,
	amplitude = 1,
	length = 8192,
	sampleRate = SAMPLE_RATE
): Float32Array {
	const out = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
	}
	return out;
}

/** A deterministic pseudo-random signal (mulberry32), for stable "noise". */
export function pseudoNoise(seed: number, length = 8192): Float32Array {
	let state = seed >>> 0;
	const out = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		out[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
	}
	return out;
}

/** Build a fingerprint from a signal, mirroring what the browser path does. */
export function fingerprintFromSignal(
	signal: Float32Array,
	sampleRate = SAMPLE_RATE
): AudioFingerprint {
	const raw = extractFeatures('sine', signal, sampleRate);
	return {
		version: FINGERPRINT_VERSION,
		sampleRate,
		keys: raw.map((f) => f.key),
		features: raw.map((f) => normalizeFeature(f.key, f.value, sampleRate)),
		raw: [{ testId: 'sine', features: raw }]
	};
}

export const TEST_ENVIRONMENT: EnvironmentInfo = {
	userAgent: 'FixtureBrowser/1.0',
	platform: 'FixturePlatform',
	language: 'en-US',
	screenWidth: 1440,
	screenHeight: 900,
	devicePixelRatio: 2,
	hardwareConcurrency: 8,
	deviceMemory: 8,
	timezone: 'UTC',
	webglVendor: 'Fixture Vendor',
	webglRenderer: 'Fixture Renderer',
	webglVersion: 'WebGL 1.0',
	browser: 'Fixture'
};

export function makeSample(
	id: string,
	deviceGroup: string,
	fingerprint: AudioFingerprint,
	environment: Partial<EnvironmentInfo> = {}
): Sample {
	return {
		id,
		label: id,
		deviceGroup,
		browser: environment.browser ?? TEST_ENVIRONMENT.browser,
		createdAt: '2024-01-01T00:00:00.000Z',
		fingerprint,
		environment: { ...TEST_ENVIRONMENT, ...environment }
	};
}
