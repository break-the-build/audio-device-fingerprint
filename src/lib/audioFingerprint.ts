/**
 * Fingerprint generation. Browser-only: this is the one module that needs a
 * real Web Audio implementation.
 *
 * No microphone, no camera, no permission prompt. Every signal is synthesised
 * inside an OfflineAudioContext, which renders to a buffer without ever
 * reaching an output device.
 */

import { AUDIO_TESTS, TEST_DURATION_SECONDS, type AudioTest } from './audioTests';
import { compressorFeatures } from './compressorFeatures';
import { extractFeatures } from './features';
import { normalizeFeature } from './normalize';
import { FINGERPRINT_VERSION, type AudioFingerprint, type Feature, type TestResult } from './types';

/** Sample rate requested from the OfflineAudioContext. */
export const PREFERRED_SAMPLE_RATE = 44100;

export type FingerprintPhase =
	| 'rendering'
	| 'extracting'
	| 'normalizing'
	| 'complete'
	| 'error';

export interface FingerprintProgress {
	readonly phase: FingerprintPhase;
	readonly message: string;
	/** 0..1, for a progress bar. */
	readonly fraction: number;
}

export type ProgressCallback = (progress: FingerprintProgress) => void;

export class AudioUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AudioUnavailableError';
	}
}

type OfflineCtor = new (
	channels: number,
	length: number,
	sampleRate: number
) => OfflineAudioContext;

/** Resolve the OfflineAudioContext constructor, including the webkit prefix. */
export function getOfflineAudioContext(): OfflineCtor {
	if (typeof window === 'undefined') {
		throw new AudioUnavailableError('Web Audio is only available in a browser.');
	}
	const ctor =
		(window as unknown as { OfflineAudioContext?: OfflineCtor }).OfflineAudioContext ??
		(window as unknown as { webkitOfflineAudioContext?: OfflineCtor })
			.webkitOfflineAudioContext;
	if (!ctor) {
		throw new AudioUnavailableError(
			'This browser does not expose OfflineAudioContext, so audio fingerprints cannot be measured here.'
		);
	}
	return ctor;
}

/** True when a fingerprint can be generated in the current environment. */
export function isAudioFingerprintingSupported(): boolean {
	try {
		getOfflineAudioContext();
		return true;
	} catch {
		return false;
	}
}

/** Render one test and return its mono output. */
async function renderTest(test: AudioTest): Promise<{ signal: Float32Array; sampleRate: number }> {
	const Ctor = getOfflineAudioContext();
	const length = Math.round(PREFERRED_SAMPLE_RATE * TEST_DURATION_SECONDS);

	let ctx: OfflineAudioContext;
	try {
		ctx = new Ctor(1, length, PREFERRED_SAMPLE_RATE);
	} catch (error) {
		throw new AudioUnavailableError(
			`Could not create an OfflineAudioContext at ${PREFERRED_SAMPLE_RATE} Hz: ${String(error)}`
		);
	}

	test.build(ctx);
	const buffer = await ctx.startRendering();
	return { signal: buffer.getChannelData(0), sampleRate: buffer.sampleRate };
}

/**
 * Generate a fingerprint by rendering every test, extracting features and
 * normalizing them into a single vector.
 *
 * The returned object contains no timestamp, no random value and no counter.
 * Given an unchanged browser and machine it should reproduce exactly -- which
 * is a claim the Repeatability Test in the UI exists to check rather than
 * assume.
 */
export async function generateFingerprint(
	onProgress?: ProgressCallback
): Promise<AudioFingerprint> {
	const report = (phase: FingerprintPhase, message: string, fraction: number): void =>
		onProgress?.({ phase, message, fraction });

	const raw: TestResult[] = [];
	let sampleRate = PREFERRED_SAMPLE_RATE;

	try {
		for (let i = 0; i < AUDIO_TESTS.length; i++) {
			const test = AUDIO_TESTS[i];
			report(
				'rendering',
				`Rendering audio... (${i + 1}/${AUDIO_TESTS.length}: ${test.id})`,
				(i / AUDIO_TESTS.length) * 0.7
			);
			const { signal, sampleRate: rate } = await renderTest(test);
			sampleRate = rate;

			const features: Feature[] = extractFeatures(test.id, signal, rate);
			if (test.segments) {
				features.push(
					...compressorFeatures(
						test.id,
						signal,
						rate,
						test.segments,
						TEST_DURATION_SECONDS
					)
				);
			}
			raw.push({ testId: test.id, features });
		}

		report('extracting', 'Extracting features...', 0.8);
		const flat = raw.flatMap((result) => result.features);

		report('normalizing', 'Normalizing...', 0.9);
		const keys = flat.map((f) => f.key);
		const features = flat.map((f) => normalizeFeature(f.key, f.value, sampleRate));

		report('complete', 'Complete.', 1);
		return { version: FINGERPRINT_VERSION, sampleRate, keys, features, raw };
	} catch (error) {
		report('error', error instanceof Error ? error.message : String(error), 1);
		throw error;
	}
}
