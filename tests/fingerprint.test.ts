import { describe, expect, it } from 'vitest';

import { compressorFeatures } from '../src/lib/compressorFeatures';
import {
	extractFeatures,
	logSpacedBins,
	spectralStats,
	timeDomainStats,
	waveformSamples
} from '../src/lib/features';
import { magnitudeSpectrum, nextPowerOfTwo, transform } from '../src/lib/fft';
import {
	amplitudeToNormalizedDb,
	featureKind,
	normalizeFeature,
	normalizeFeatures
} from '../src/lib/normalize';
import { SAMPLE_RATE, pseudoNoise, sine } from './fixtures';

describe('timeDomainStats', () => {
	it('describes a full-scale sine wave', () => {
		// 441 Hz at 44100 Hz is 100 samples per cycle; 4400 samples is exactly
		// 44 whole cycles, so the mean is 0 up to float32 rounding.
		const signal = sine(441, 1, 4400);
		const stats = timeDomainStats(signal);

		expect(stats.mean).toBeCloseTo(0, 6);
		expect(stats.rms).toBeCloseTo(Math.SQRT1_2, 3);
		expect(stats.peak).toBeCloseTo(1, 3);
		expect(stats.max).toBeLessThanOrEqual(1);
		expect(stats.min).toBeGreaterThanOrEqual(-1);
		// Crest factor of a sine is sqrt(2).
		expect(stats.crestFactor).toBeCloseTo(Math.SQRT2, 2);
		// 441 Hz at 44100 Hz crosses zero 882 times per second.
		expect(stats.zeroCrossingRate).toBeCloseTo(882 / SAMPLE_RATE, 3);
		expect(stats.meanAbs).toBeCloseTo(2 / Math.PI, 2);
	});

	it('scales linearly with amplitude', () => {
		const quiet = timeDomainStats(sine(440, 0.25));
		const loud = timeDomainStats(sine(440, 0.5));
		expect(loud.rms / quiet.rms).toBeCloseTo(2, 6);
		expect(loud.peak / quiet.peak).toBeCloseTo(2, 6);
	});

	it('handles a constant signal without dividing by zero', () => {
		const dc = new Float32Array(128).fill(0.5);
		const stats = timeDomainStats(dc);
		expect(stats.mean).toBeCloseTo(0.5, 6);
		expect(stats.stdDev).toBeCloseTo(0, 5);
		expect(stats.zeroCrossingRate).toBe(0);
		expect(stats.crestFactor).toBeCloseTo(1, 5);
	});

	it('returns zeros rather than NaN for an empty signal', () => {
		const stats = timeDomainStats(new Float32Array(0));
		expect(Object.values(stats).every((v) => v === 0)).toBe(true);
	});

	it('is deterministic', () => {
		const signal = pseudoNoise(1234);
		expect(timeDomainStats(signal)).toEqual(timeDomainStats(pseudoNoise(1234)));
	});
});

describe('fft', () => {
	it('rounds up to a power of two', () => {
		expect(nextPowerOfTwo(1)).toBe(1);
		expect(nextPowerOfTwo(5)).toBe(8);
		expect(nextPowerOfTwo(1024)).toBe(1024);
	});

	it('rejects non-power-of-two lengths', () => {
		expect(() => transform(new Float64Array(3), new Float64Array(3))).toThrow(
			/power of two/
		);
	});

	it('puts a pure tone in the expected bin', () => {
		const size = 4096;
		// Bin 100 of a 4096-point transform at 44100 Hz.
		const frequency = (100 * SAMPLE_RATE) / size;
		const mags = magnitudeSpectrum(sine(frequency, 1, size));

		let peakIndex = 0;
		for (let i = 1; i < mags.length; i++) {
			if (mags[i] > mags[peakIndex]) peakIndex = i;
		}
		expect(peakIndex).toBe(100);
	});
});

describe('spectralStats', () => {
	it('places the centroid near the tone frequency', () => {
		const stats = spectralStats(sine(1000, 1, 8192), SAMPLE_RATE);
		expect(stats.centroid).toBeGreaterThan(900);
		expect(stats.centroid).toBeLessThan(1100);
		expect(stats.spread).toBeGreaterThanOrEqual(0);
		expect(stats.energy).toBeGreaterThan(0);
	});

	it('reports a higher centroid for a higher tone', () => {
		const low = spectralStats(sine(500, 1, 8192), SAMPLE_RATE);
		const high = spectralStats(sine(5000, 1, 8192), SAMPLE_RATE);
		expect(high.centroid).toBeGreaterThan(low.centroid);
	});

	it('returns zeros for silence instead of NaN', () => {
		const stats = spectralStats(new Float32Array(4096), SAMPLE_RATE);
		expect(stats.centroid).toBe(0);
		expect(stats.spread).toBe(0);
		expect(stats.energy).toBe(0);
	});
});

describe('logSpacedBins', () => {
	it('returns the requested number of bins, ascending in index', () => {
		const mags = new Float64Array(512).map((_, i) => i);
		const bins = logSpacedBins(mags, 16);
		expect(bins).toHaveLength(16);
		for (let i = 1; i < bins.length; i++) {
			expect(bins[i]).toBeGreaterThanOrEqual(bins[i - 1]);
		}
	});
});

describe('waveformSamples', () => {
	it('samples evenly across the signal', () => {
		const signal = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
		expect(waveformSamples(signal, 4)).toEqual([0, 2, 4, 6]);
	});
});

describe('extractFeatures', () => {
	const features = extractFeatures('sine', sine(440), SAMPLE_RATE);

	it('prefixes every key with the test id', () => {
		expect(features.every((f) => f.key.startsWith('sine.'))).toBe(true);
	});

	it('produces unique keys', () => {
		expect(new Set(features.map((f) => f.key)).size).toBe(features.length);
	});

	it('produces only finite values', () => {
		expect(features.every((f) => Number.isFinite(f.value))).toBe(true);
	});

	it('produces a stable key order for the same input shape', () => {
		const other = extractFeatures('sine', sine(880), SAMPLE_RATE);
		expect(other.map((f) => f.key)).toEqual(features.map((f) => f.key));
	});

	it('is fully deterministic', () => {
		expect(extractFeatures('sine', sine(440), SAMPLE_RATE)).toEqual(features);
	});
});

describe('normalization', () => {
	it('derives the feature kind, stripping trailing indices', () => {
		expect(featureKind('sine.rms')).toBe('rms');
		expect(featureKind('sine.fftBin07')).toBe('fftBin');
		expect(featureKind('compressor-response.gainRatio02')).toBe('gainRatio');
	});

	it('leaves bounded amplitude features unchanged', () => {
		expect(normalizeFeature('sine.rms', 0.707, SAMPLE_RATE)).toBeCloseTo(0.707, 12);
		expect(normalizeFeature('sine.min', -0.5, SAMPLE_RATE)).toBeCloseTo(-0.5, 12);
	});

	it('expresses frequencies as a fraction of Nyquist', () => {
		expect(normalizeFeature('sine.spectralCentroid', 11025, SAMPLE_RATE)).toBeCloseTo(0.5, 12);
		// Same physical frequency at a different rate maps to a different
		// fraction -- which is the point: it is relative to that context.
		expect(normalizeFeature('sine.spectralCentroid', 11025, 48000)).toBeCloseTo(
			11025 / 24000,
			12
		);
	});

	it('compresses magnitudes logarithmically', () => {
		expect(amplitudeToNormalizedDb(1)).toBeCloseTo(0, 12);
		expect(amplitudeToNormalizedDb(0.1)).toBeCloseTo(-0.2, 12);
		expect(amplitudeToNormalizedDb(0)).toBeCloseTo(-2, 12);
	});

	it('is monotonic for fft bin magnitudes', () => {
		const small = normalizeFeature('sine.fftBin00', 1e-4, SAMPLE_RATE);
		const large = normalizeFeature('sine.fftBin00', 1e-1, SAMPLE_RATE);
		expect(large).toBeGreaterThan(small);
	});

	it('maps non-finite values to 0 rather than propagating NaN', () => {
		expect(normalizeFeature('sine.rms', NaN, SAMPLE_RATE)).toBe(0);
		expect(normalizeFeature('sine.rms', Infinity, SAMPLE_RATE)).toBe(0);
	});

	it('uses a device-independent transform: the same input always maps the same way', () => {
		const a = normalizeFeatures(extractFeatures('sine', sine(440), SAMPLE_RATE), SAMPLE_RATE);
		const b = normalizeFeatures(extractFeatures('sine', sine(440), SAMPLE_RATE), SAMPLE_RATE);
		expect(a).toEqual(b);
	});

	it('does not rescale using the vector own statistics', () => {
		// Doubling every raw value must not leave the normalized vector
		// unchanged; if it did, real between-device differences in overall
		// level would be normalized away.
		const quiet = normalizeFeatures(
			extractFeatures('sine', sine(440, 0.25), SAMPLE_RATE),
			SAMPLE_RATE
		);
		const loud = normalizeFeatures(
			extractFeatures('sine', sine(440, 0.5), SAMPLE_RATE),
			SAMPLE_RATE
		);
		expect(loud).not.toEqual(quiet);
	});

	it('keeps every normalized value finite and in a modest range', () => {
		const values = normalizeFeatures(
			extractFeatures('sine', sine(440), SAMPLE_RATE),
			SAMPLE_RATE
		);
		expect(values.every((v) => Number.isFinite(v))).toBe(true);
		expect(values.every((v) => Math.abs(v) <= 10)).toBe(true);
	});
});

describe('compressorFeatures', () => {
	const segments = [
		{ start: 0, amplitude: 0.5 },
		{ start: 0.25, amplitude: 1 }
	];

	/** A signal whose amplitude steps exactly as the segments describe. */
	function staircase(): Float32Array {
		const total = 0.5;
		const length = Math.round(SAMPLE_RATE * total);
		const out = new Float32Array(length);
		for (let i = 0; i < length; i++) {
			const t = i / SAMPLE_RATE;
			const amplitude = t < 0.25 ? 0.5 : 1;
			out[i] = amplitude * Math.sin(2 * Math.PI * 500 * t);
		}
		return out;
	}

	it('reports a gain ratio near 1 when nothing is compressed', () => {
		const features = compressorFeatures('c', staircase(), SAMPLE_RATE, segments, 0.5);
		const ratios = features.filter((f) => f.key.includes('gainRatio'));
		expect(ratios).toHaveLength(2);
		for (const ratio of ratios) expect(ratio.value).toBeCloseTo(1, 2);
	});

	it('reports ~0 dB reduction when nothing is compressed', () => {
		const features = compressorFeatures('c', staircase(), SAMPLE_RATE, segments, 0.5);
		for (const f of features.filter((x) => x.key.includes('gainReductionDb'))) {
			expect(Math.abs(f.value)).toBeLessThan(0.5);
		}
	});

	it('detects attenuation of the loud step', () => {
		const signal = staircase();
		// Halve the loud segment, as a compressor would.
		for (let i = Math.round(0.25 * SAMPLE_RATE); i < signal.length; i++) signal[i] *= 0.5;

		const features = compressorFeatures('c', signal, SAMPLE_RATE, segments, 0.5);
		const loud = features.find((f) => f.key === 'c.gainReductionDb01');
		expect(loud?.value).toBeCloseTo(-6.02, 1);
	});

	it('emits one knee slope summary and finite values throughout', () => {
		const features = compressorFeatures('c', staircase(), SAMPLE_RATE, segments, 0.5);
		expect(features.filter((f) => f.key.endsWith('kneeSlope'))).toHaveLength(1);
		expect(features.every((f) => Number.isFinite(f.value))).toBe(true);
	});

	it('does not produce NaN for a silent signal', () => {
		const features = compressorFeatures(
			'c',
			new Float32Array(Math.round(SAMPLE_RATE * 0.5)),
			SAMPLE_RATE,
			segments,
			0.5
		);
		expect(features.every((f) => Number.isFinite(f.value))).toBe(true);
	});
});
