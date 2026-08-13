/**
 * Minimal in-place radix-2 Cooley-Tukey FFT.
 *
 * We compute the spectrum ourselves rather than reading AnalyserNode data
 * because an AnalyserNode inside an OfflineAudioContext has no well-defined
 * "moment" at which to sample its frequency data -- offline rendering is not
 * driven by a real-time clock. Doing the transform in plain JS keeps spectral
 * feature extraction deterministic and inspectable.
 *
 * Caveat, documented in the README: Math.cos/Math.sin are permitted to differ
 * by an ulp or so between JS engines, so a small amount of *browser* variance
 * enters here too. Spectral features aggregate thousands of samples, so this
 * is far below the variance introduced by the audio graph itself.
 */

/** Round up to the next power of two. */
export function nextPowerOfTwo(n: number): number {
	if (n < 1) return 1;
	return 2 ** Math.ceil(Math.log2(n));
}

/**
 * Periodic Hann window. Reduces spectral leakage so the centroid/spread
 * features describe the signal rather than the edges of the analysis frame.
 */
export function hannWindow(size: number): Float64Array {
	const w = new Float64Array(size);
	for (let i = 0; i < size; i++) {
		w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / size));
	}
	return w;
}

/**
 * Compute the magnitude spectrum of `input`.
 *
 * The input is Hann-windowed and zero-padded to a power of two. Only the
 * first N/2 bins (up to Nyquist) are returned.
 */
export function magnitudeSpectrum(input: Float32Array | Float64Array): Float64Array {
	const size = nextPowerOfTwo(input.length);
	const re = new Float64Array(size);
	const im = new Float64Array(size);
	const window = hannWindow(input.length);

	for (let i = 0; i < input.length; i++) {
		re[i] = input[i] * window[i];
	}

	transform(re, im);

	const bins = size / 2;
	const mags = new Float64Array(bins);
	for (let i = 0; i < bins; i++) {
		mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / bins;
	}
	return mags;
}

/**
 * In-place complex FFT. `re` and `im` must have equal power-of-two length.
 */
export function transform(re: Float64Array, im: Float64Array): void {
	const n = re.length;
	if (n !== im.length) throw new Error('FFT: re/im length mismatch');
	if (n === 0) return;
	if ((n & (n - 1)) !== 0) throw new Error(`FFT: length ${n} is not a power of two`);

	// Bit-reversal permutation.
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j], re[i]];
			[im[i], im[j]] = [im[j], im[i]];
		}
	}

	// Butterfly stages.
	for (let len = 2; len <= n; len <<= 1) {
		const angle = (-2 * Math.PI) / len;
		const wRe = Math.cos(angle);
		const wIm = Math.sin(angle);
		for (let i = 0; i < n; i += len) {
			let curRe = 1;
			let curIm = 0;
			for (let k = 0; k < len / 2; k++) {
				const aRe = re[i + k];
				const aIm = im[i + k];
				const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
				const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
				re[i + k] = aRe + bRe;
				im[i + k] = aIm + bIm;
				re[i + k + len / 2] = aRe - bRe;
				im[i + k + len / 2] = aIm - bIm;
				const nextRe = curRe * wRe - curIm * wIm;
				curIm = curRe * wIm + curIm * wRe;
				curRe = nextRe;
			}
		}
	}
}
