/**
 * Compressor-response characteristics.
 *
 * The compressor test drives a sine tone through a staircase of known input
 * amplitudes. Because the input level of each step is known exactly, the
 * measured output level tells us how much gain the compressor applied. That
 * curve depends on the implementation's envelope detector, knee shape and
 * internal smoothing -- all of which are places where engines differ.
 */

import { timeDomainStats } from './features';
import type { Feature } from './types';

/** Fraction of each segment skipped so the attack transient is excluded. */
const SETTLE_FRACTION = 0.5;

export interface Segment {
	readonly start: number;
	readonly amplitude: number;
}

/**
 * For each amplitude step, measure the settled output RMS and express it
 * relative to the input RMS of an ideal sine at that amplitude (A / sqrt(2)).
 */
export function compressorFeatures(
	prefix: string,
	signal: Float32Array,
	sampleRate: number,
	segments: readonly Segment[],
	totalDuration: number
): Feature[] {
	const features: Feature[] = [];
	const ratios: number[] = [];

	segments.forEach((segment, i) => {
		const end = i + 1 < segments.length ? segments[i + 1].start : totalDuration;
		const settleStart = segment.start + (end - segment.start) * SETTLE_FRACTION;
		const from = Math.min(signal.length, Math.floor(settleStart * sampleRate));
		const to = Math.min(signal.length, Math.floor(end * sampleRate));
		const label = String(i).padStart(2, '0');

		if (to - from < 2) {
			features.push({ key: `${prefix}.gainRatio${label}`, value: 0 });
			features.push({ key: `${prefix}.gainReductionDb${label}`, value: 0 });
			ratios.push(0);
			return;
		}

		const outputRms = timeDomainStats(signal.subarray(from, to)).rms;
		const inputRms = segment.amplitude / Math.SQRT2;
		const ratio = inputRms > 0 ? outputRms / inputRms : 0;
		ratios.push(ratio);

		features.push({ key: `${prefix}.gainRatio${label}`, value: ratio });
		features.push({
			key: `${prefix}.gainReductionDb${label}`,
			value: 20 * Math.log10(Math.max(ratio, 1e-10))
		});
	});

	// Slope of the reduction curve between the quietest and loudest steps:
	// a compact summary of how aggressively this implementation compresses.
	const first = ratios[0] ?? 0;
	const last = ratios[ratios.length - 1] ?? 0;
	features.push({
		key: `${prefix}.kneeSlope`,
		value: first > 0 ? (last - first) / first : 0
	});

	return features;
}
