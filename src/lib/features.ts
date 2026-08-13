/**
 * Numerical feature extraction from a rendered audio signal.
 *
 * Everything here is a pure function of a Float32Array, so it can be tested
 * with synthetic fixtures and no browser audio device.
 *
 * Why features and not a hash: a SHA-256 of the buffer changes completely if
 * one sample differs in its last bit, which makes "how similar are these two
 * renders?" unanswerable. Scalar features degrade gracefully -- a tiny
 * numerical difference moves each feature a tiny amount.
 */

import { magnitudeSpectrum } from './fft';
import type { Feature } from './types';

/** How many log-spaced FFT bin magnitudes to include. */
const FFT_BIN_COUNT = 16;
/** How many evenly spaced raw waveform samples to include. */
const WAVEFORM_SAMPLE_COUNT = 16;
/** Length of the analysis window used for spectral features. */
const SPECTRAL_WINDOW = 4096;

export interface TimeDomainStats {
	readonly mean: number;
	readonly stdDev: number;
	readonly rms: number;
	readonly min: number;
	readonly max: number;
	readonly meanAbs: number;
	readonly zeroCrossingRate: number;
	readonly peak: number;
	readonly crestFactor: number;
}

export function timeDomainStats(signal: Float32Array): TimeDomainStats {
	const n = signal.length;
	if (n === 0) {
		return {
			mean: 0,
			stdDev: 0,
			rms: 0,
			min: 0,
			max: 0,
			meanAbs: 0,
			zeroCrossingRate: 0,
			peak: 0,
			crestFactor: 0
		};
	}

	let sum = 0;
	let sumSquares = 0;
	let sumAbs = 0;
	let min = Infinity;
	let max = -Infinity;
	let crossings = 0;

	for (let i = 0; i < n; i++) {
		const v = signal[i];
		sum += v;
		sumSquares += v * v;
		sumAbs += Math.abs(v);
		if (v < min) min = v;
		if (v > max) max = v;
		if (i > 0 && signal[i - 1] < 0 !== v < 0) crossings++;
	}

	const mean = sum / n;
	const rms = Math.sqrt(sumSquares / n);
	// Population variance via E[x^2] - E[x]^2, floored at 0 for FP safety.
	const variance = Math.max(0, sumSquares / n - mean * mean);
	const peak = Math.max(Math.abs(min), Math.abs(max));

	return {
		mean,
		stdDev: Math.sqrt(variance),
		rms,
		min,
		max,
		meanAbs: sumAbs / n,
		zeroCrossingRate: n > 1 ? crossings / (n - 1) : 0,
		peak,
		crestFactor: rms > 0 ? peak / rms : 0
	};
}

export interface SpectralStats {
	/** Amplitude-weighted mean frequency, in Hz. */
	readonly centroid: number;
	/** Amplitude-weighted standard deviation around the centroid, in Hz. */
	readonly spread: number;
	/** Sum of squared bin magnitudes. */
	readonly energy: number;
	/** Log-spaced sample of the magnitude spectrum. */
	readonly bins: readonly number[];
}

/**
 * Spectral features from a window taken at the centre of the signal, where
 * onset transients have settled.
 */
export function spectralStats(signal: Float32Array, sampleRate: number): SpectralStats {
	const windowSize = Math.min(SPECTRAL_WINDOW, signal.length);
	if (windowSize < 2) {
		return { centroid: 0, spread: 0, energy: 0, bins: new Array(FFT_BIN_COUNT).fill(0) };
	}
	const start = Math.max(0, Math.floor((signal.length - windowSize) / 2));
	const frame = signal.subarray(start, start + windowSize);
	const mags = magnitudeSpectrum(frame);

	const binHz = sampleRate / (mags.length * 2);
	let magSum = 0;
	let weighted = 0;
	let energy = 0;
	for (let i = 0; i < mags.length; i++) {
		const m = mags[i];
		magSum += m;
		weighted += m * (i * binHz);
		energy += m * m;
	}
	const centroid = magSum > 0 ? weighted / magSum : 0;

	let varianceSum = 0;
	if (magSum > 0) {
		for (let i = 0; i < mags.length; i++) {
			const d = i * binHz - centroid;
			varianceSum += mags[i] * d * d;
		}
	}
	const spread = magSum > 0 ? Math.sqrt(varianceSum / magSum) : 0;

	return { centroid, spread, energy, bins: logSpacedBins(mags, FFT_BIN_COUNT) };
}

/**
 * Sample `count` magnitudes at logarithmically spaced bin indices, which
 * matches how audible spectral detail is distributed better than linear
 * spacing does.
 */
export function logSpacedBins(mags: Float64Array, count: number): number[] {
	const out: number[] = [];
	const maxIndex = mags.length - 1;
	if (maxIndex < 1) return new Array(count).fill(0);
	for (let i = 0; i < count; i++) {
		const t = i / (count - 1);
		const index = Math.round(Math.exp(t * Math.log(maxIndex)));
		out.push(mags[Math.min(maxIndex, index)]);
	}
	return out;
}

/** Evenly spaced raw sample values, which capture per-sample rounding behaviour. */
export function waveformSamples(signal: Float32Array, count: number): number[] {
	const out: number[] = [];
	if (signal.length === 0) return new Array(count).fill(0);
	for (let i = 0; i < count; i++) {
		const index = Math.floor((i / count) * signal.length);
		out.push(signal[index]);
	}
	return out;
}

/**
 * Full feature set for one rendered signal, prefixed with the test id so keys
 * are globally unique within a fingerprint (e.g. "sine.rms").
 */
export function extractFeatures(
	prefix: string,
	signal: Float32Array,
	sampleRate: number
): Feature[] {
	const time = timeDomainStats(signal);
	const spectral = spectralStats(signal, sampleRate);

	const features: Feature[] = [
		{ key: `${prefix}.mean`, value: time.mean },
		{ key: `${prefix}.stdDev`, value: time.stdDev },
		{ key: `${prefix}.rms`, value: time.rms },
		{ key: `${prefix}.min`, value: time.min },
		{ key: `${prefix}.max`, value: time.max },
		{ key: `${prefix}.meanAbs`, value: time.meanAbs },
		{ key: `${prefix}.zeroCrossingRate`, value: time.zeroCrossingRate },
		{ key: `${prefix}.peak`, value: time.peak },
		{ key: `${prefix}.crestFactor`, value: time.crestFactor },
		{ key: `${prefix}.spectralCentroid`, value: spectral.centroid },
		{ key: `${prefix}.spectralSpread`, value: spectral.spread },
		{ key: `${prefix}.spectralEnergy`, value: spectral.energy }
	];

	spectral.bins.forEach((value, i) => {
		features.push({ key: `${prefix}.fftBin${String(i).padStart(2, '0')}`, value });
	});

	waveformSamples(signal, WAVEFORM_SAMPLE_COUNT).forEach((value, i) => {
		features.push({ key: `${prefix}.sample${String(i).padStart(2, '0')}`, value });
	});

	return features;
}
