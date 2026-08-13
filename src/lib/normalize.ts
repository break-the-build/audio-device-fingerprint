/**
 * Feature normalization.
 *
 * The goal is to put every feature on a comparable scale so that no single
 * dimension dominates the Euclidean distance, WITHOUT letting the transform
 * depend on the data being normalized.
 *
 * This matters more than it looks. A tempting approach is to z-score the
 * vector using its own mean and standard deviation -- but then each device
 * gets a different transform, and genuine between-device differences are
 * partially normalized away. Instead every feature kind has a fixed,
 * device-independent mapping, chosen from the physical range that kind of
 * measurement can occupy.
 */

import type { Feature } from './types';

/** Amplitudes below this are treated as silence when converting to dB. */
const MIN_AMPLITUDE = 1e-10;

/** Extract the feature kind from a key such as "sine.spectralCentroid". */
export function featureKind(key: string): string {
	const tail = key.slice(key.lastIndexOf('.') + 1);
	// Strip trailing digits so "fftBin07" and "sample12" collapse to their kind.
	return tail.replace(/\d+$/, '');
}

/**
 * Map an amplitude-like magnitude onto roughly [-2, 0] via decibels.
 * Log scaling is used because bin magnitudes span many orders of magnitude
 * and small absolute differences at low level are still informative.
 */
export function amplitudeToNormalizedDb(value: number): number {
	const db = 20 * Math.log10(Math.max(Math.abs(value), MIN_AMPLITUDE));
	return db / 100;
}

/**
 * Normalize one feature. `sampleRate` is needed to express frequency-domain
 * features as a fraction of Nyquist, which keeps them comparable between
 * contexts rendered at different rates (e.g. iOS defaults to 48 kHz).
 */
export function normalizeFeature(key: string, value: number, sampleRate: number): number {
	if (!Number.isFinite(value)) return 0;
	const nyquist = sampleRate / 2;

	switch (featureKind(key)) {
		// Already in a bounded amplitude range of roughly [-1, 1].
		case 'mean':
		case 'min':
		case 'max':
		case 'stdDev':
		case 'rms':
		case 'meanAbs':
		case 'peak':
		case 'sample':
		case 'zeroCrossingRate':
		case 'gainRatio':
		case 'kneeSlope':
			return value;

		// Unbounded above; compress so an outlier cannot dominate the distance.
		case 'crestFactor':
			return Math.log1p(Math.abs(value)) / 4;

		// Frequencies, expressed as a fraction of Nyquist.
		case 'spectralCentroid':
		case 'spectralSpread':
			return nyquist > 0 ? value / nyquist : 0;

		// Magnitudes spanning many orders of magnitude.
		case 'spectralEnergy':
		case 'fftBin':
			return amplitudeToNormalizedDb(value);

		// Decibel-valued features are already logarithmic.
		case 'gainReductionDb':
			return value / 100;

		default:
			// Unknown kinds are compressed conservatively rather than trusted raw.
			return Math.sign(value) * Math.log1p(Math.abs(value));
	}
}

/** Normalize a list of features, preserving order. */
export function normalizeFeatures(
	features: readonly Feature[],
	sampleRate: number
): number[] {
	return features.map((f) => normalizeFeature(f.key, f.value, sampleRate));
}
