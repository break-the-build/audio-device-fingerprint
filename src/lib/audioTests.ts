/**
 * The deterministic audio test graphs.
 *
 * Each test builds a signal chain inside an OfflineAudioContext and connects
 * it to the context destination. Nothing here touches the microphone, the
 * speakers, or any other device -- OfflineAudioContext renders into a buffer
 * as fast as the CPU allows and produces no sound.
 *
 * Every node parameter is set explicitly, including ones that have spec
 * defaults, so that a browser shipping a different default cannot be mistaken
 * for a different device.
 */

import type { TestId } from './types';

/** Signal length rendered per test, in seconds. */
export const TEST_DURATION_SECONDS = 0.5;

export interface AudioTest {
	readonly id: TestId;
	readonly description: string;
	/** Builds the graph. Must connect its output to `ctx.destination`. */
	readonly build: (ctx: OfflineAudioContext) => void;
	/**
	 * Optional level staircase used by the compressor-response test:
	 * [startTime, linear amplitude] pairs, needed to compute gain reduction.
	 */
	readonly segments?: readonly { readonly start: number; readonly amplitude: number }[];
}

/** Apply a fully specified compressor configuration. */
function configureCompressor(
	comp: DynamicsCompressorNode,
	config: {
		threshold: number;
		knee: number;
		ratio: number;
		attack: number;
		release: number;
	}
): void {
	comp.threshold.value = config.threshold;
	comp.knee.value = config.knee;
	comp.ratio.value = config.ratio;
	comp.attack.value = config.attack;
	comp.release.value = config.release;
}

function makeOscillator(
	ctx: OfflineAudioContext,
	type: OscillatorType,
	frequency: number
): OscillatorNode {
	const osc = ctx.createOscillator();
	osc.type = type;
	osc.frequency.value = frequency;
	osc.detune.value = 0;
	return osc;
}

function makeBiquad(
	ctx: OfflineAudioContext,
	type: BiquadFilterType,
	frequency: number,
	q: number,
	gain = 0
): BiquadFilterNode {
	const filter = ctx.createBiquadFilter();
	filter.type = type;
	filter.frequency.value = frequency;
	filter.Q.value = q;
	filter.gain.value = gain;
	filter.detune.value = 0;
	return filter;
}

/** Amplitude staircase driving the compressor-response test. */
export const COMPRESSOR_SEGMENTS = [
	{ start: 0.0, amplitude: 0.05 },
	{ start: 0.125, amplitude: 0.5 },
	{ start: 0.25, amplitude: 1.0 },
	{ start: 0.375, amplitude: 0.1 }
] as const;

export const AUDIO_TESTS: readonly AudioTest[] = [
	{
		id: 'sine',
		description: 'Sine oscillator through gain into a dynamics compressor.',
		build(ctx) {
			const osc = makeOscillator(ctx, 'sine', 440);
			const gain = ctx.createGain();
			gain.gain.value = 0.5;
			const comp = ctx.createDynamicsCompressor();
			configureCompressor(comp, {
				threshold: -50,
				knee: 40,
				ratio: 12,
				attack: 0,
				release: 0.25
			});
			osc.connect(gain).connect(comp).connect(ctx.destination);
			osc.start(0);
		}
	},
	{
		id: 'triangle',
		description: 'Triangle oscillator through a low-pass biquad filter.',
		build(ctx) {
			const osc = makeOscillator(ctx, 'triangle', 220);
			const filter = makeBiquad(ctx, 'lowpass', 1200, 1.2);
			const gain = ctx.createGain();
			gain.gain.value = 0.8;
			osc.connect(filter).connect(gain).connect(ctx.destination);
			osc.start(0);
		}
	},
	{
		id: 'square',
		description: 'Square oscillator through a high-pass biquad into a compressor.',
		build(ctx) {
			const osc = makeOscillator(ctx, 'square', 110);
			const filter = makeBiquad(ctx, 'highpass', 800, 0.7071);
			const comp = ctx.createDynamicsCompressor();
			configureCompressor(comp, {
				threshold: -24,
				knee: 6,
				ratio: 8,
				attack: 0.003,
				release: 0.1
			});
			osc.connect(filter).connect(comp).connect(ctx.destination);
			osc.start(0);
		}
	},
	{
		id: 'multi-frequency',
		description:
			'Three summed oscillators through a peaking filter and a pass-through analyser.',
		build(ctx) {
			const mix = ctx.createGain();
			mix.gain.value = 1;

			const parts: readonly [OscillatorType, number, number][] = [
				['sine', 440, 0.3],
				['sawtooth', 1000, 0.3],
				['sine', 6500, 0.3]
			];
			for (const [type, frequency, level] of parts) {
				const osc = makeOscillator(ctx, type, frequency);
				const gain = ctx.createGain();
				gain.gain.value = level;
				osc.connect(gain).connect(mix);
				osc.start(0);
			}

			const peaking = makeBiquad(ctx, 'peaking', 3000, 2, 12);
			// The AnalyserNode passes audio through unchanged. It is included so
			// the graph exercises it, but its frequency data is NOT read: an
			// analyser has no meaningful sampling instant during offline render.
			const analyser = ctx.createAnalyser();
			analyser.fftSize = 2048;
			analyser.smoothingTimeConstant = 0.8;

			mix.connect(peaking).connect(analyser).connect(ctx.destination);
		}
	},
	{
		id: 'impulse',
		description:
			'Single-sample unit impulse through a resonant low-pass filter, capturing its impulse response.',
		build(ctx) {
			const buffer = ctx.createBuffer(1, ctx.sampleRate * TEST_DURATION_SECONDS, ctx.sampleRate);
			const data = buffer.getChannelData(0);
			// A unit impulse a little way in, so the filter's response is fully
			// inside the rendered window.
			data[64] = 1;

			const source = ctx.createBufferSource();
			source.buffer = buffer;

			const filter = makeBiquad(ctx, 'lowpass', 3000, 8);
			const gain = ctx.createGain();
			gain.gain.value = 1;

			source.connect(filter).connect(gain).connect(ctx.destination);
			source.start(0);
		}
	},
	{
		id: 'compressor-response',
		description:
			'Sine tone stepped through four amplitudes to measure compressor gain reduction.',
		segments: COMPRESSOR_SEGMENTS,
		build(ctx) {
			const osc = makeOscillator(ctx, 'sine', 500);
			const gain = ctx.createGain();
			gain.gain.setValueAtTime(COMPRESSOR_SEGMENTS[0].amplitude, 0);
			for (const segment of COMPRESSOR_SEGMENTS) {
				gain.gain.setValueAtTime(segment.amplitude, segment.start);
			}

			const comp = ctx.createDynamicsCompressor();
			configureCompressor(comp, {
				threshold: -30,
				knee: 10,
				ratio: 12,
				attack: 0.003,
				release: 0.25
			});

			osc.connect(gain).connect(comp).connect(ctx.destination);
			osc.start(0);
		}
	}
];
