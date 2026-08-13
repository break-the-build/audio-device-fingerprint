# Audio Device Fingerprint Experiment

A local, self-contained proof-of-concept for testing one specific claim:

> **The same-device hypothesis:** a single physical machine produces similar Web Audio
> feature vectors across different browsers, while a different physical machine produces
> dissimilar ones.

This application is an instrument for **measuring** that hypothesis, not a demonstration
that it is true. Every number it displays comes from a measurement taken on your machine.
There is no seeded data, no simulated sample set, and no placeholder chart anywhere in the
UI — when there is no data, the app says so.

> Audio fingerprints are probabilistic measurements of browser audio-processing behavior.
> They are not guaranteed unique hardware identifiers.

---

## Quick start

```bash
pnpm install
pnpm dev
```

Then open the URL printed in the terminal (usually <http://localhost:5173>).

Other commands:

```bash
pnpm test      # unit tests (112+ tests, no browser required)
pnpm check     # TypeScript / Svelte type checking
pnpm build     # production build (adapter-node)
pnpm start     # run the production build
```

No external services, accounts, API keys, or network calls are required at any point.

---

## 1. What Web Audio fingerprinting is

Every browser ships its own implementation of the Web Audio API. The specification defines
what a `BiquadFilterNode` or a `DynamicsCompressorNode` should do in mathematical terms,
but it does not pin down every implementation detail: the exact filter coefficient
formulation, the internal precision, the envelope detector in the compressor, whether SIMD
or scalar code paths are taken, how denormals are handled, or how the audio thread's block
size interacts with parameter automation.

The result is that identical audio graphs, given identical inputs, produce outputs that
differ *slightly* between implementations — and those differences are systematic rather
than random. Audio fingerprinting measures those differences.

The interesting and untested question is whether the differences track the **physical
device** (CPU architecture, floating-point behaviour, OS audio stack) rather than just the
**browser build**. If they track the device, the same laptop should look similar in Chrome,
Firefox and Edge. If they track the browser, it will not. This app measures which.

## 2. What OfflineAudioContext does

An `AudioContext` renders audio in real time to your speakers. An `OfflineAudioContext`
renders the same graph **into a buffer**, as fast as the CPU can manage, and produces no
sound at all. You give it a channel count, a length in samples and a sample rate; you build
a graph; you call `startRendering()`; you get back an `AudioBuffer` of raw float samples.

That makes it ideal here:

- It is **silent** — nothing is played.
- It is **fast** — the six tests in this app render in roughly 100 ms in total.
- It is **deterministic in principle** — there is no wall clock, no audio device jitter and
  no buffer underrun to introduce noise. Any variation that survives is variation in the
  implementation itself, which is exactly what we want to measure.

## 3. Why the microphone is not required

Nothing is recorded. The signals are **synthesised inside the browser** by oscillator nodes
and a hand-built impulse buffer, processed by the graph, and read back from the rendered
buffer. No `getUserMedia` call is made, so no permission prompt appears and no audio input
device is ever opened.

This is worth stating plainly because "audio fingerprinting" sounds like it should involve
listening. It does not. The measurement is of the browser's audio *maths*, not of any
sound in the room.

## 4. Why hashing the whole AudioBuffer is inappropriate

The obvious approach — `SHA-256(audioBuffer)` — is the wrong tool for this question.

A cryptographic hash is designed for the avalanche property: change one bit of input and
roughly half the output bits change. That is exactly what you want for integrity checking
and exactly what you do **not** want for similarity. Two renders of the same graph on the
same machine that differ in the last bit of one sample out of 22,050 produce two completely
unrelated hashes. Given two hashes you can answer "are these byte-identical?" and nothing
else.

But the whole hypothesis is about *degrees* of similarity: the laptop in Chrome and the
laptop in Firefox will never be byte-identical, and the question is whether they are
*closer to each other* than either is to a phone. A hash cannot express "closer".

So this project extracts a **numerical feature vector** instead. Small numerical
differences move each feature a small amount, distances degrade gracefully, and "how
similar?" becomes a question you can actually answer.

## 5. Why feature vectors are used

Each rendered buffer is reduced to a set of scalar measurements, each of which summarises
thousands of samples. That reduction does three useful things:

1. **Stability.** Averaging over many samples suppresses per-sample noise while preserving
   systematic implementation differences.
2. **Comparability.** A fixed-length vector of real numbers supports distance metrics.
3. **Interpretability.** When two devices differ, you can look at *which* features differ.
   A hash tells you nothing.

### Features extracted per test

**Time domain:** mean, standard deviation, RMS, minimum, maximum, mean absolute amplitude,
zero-crossing rate, peak amplitude, crest factor.

**Frequency domain:** spectral centroid, spectral spread, spectral energy, and 16
log-spaced FFT bin magnitudes.

**Raw:** 16 evenly spaced waveform sample values, which capture per-sample rounding
behaviour directly.

**Compressor response** (compressor test only): for each of four known input amplitudes,
the settled output level as a gain ratio and in dB, plus a knee-slope summary.

### The six audio tests

| Test | Graph |
|---|---|
| `sine` | Sine oscillator (440 Hz) → gain → `DynamicsCompressor` |
| `triangle` | Triangle oscillator (220 Hz) → low-pass biquad (1200 Hz, Q 1.2) → gain |
| `square` | Square oscillator (110 Hz) → high-pass biquad (800 Hz) → `DynamicsCompressor` |
| `multi-frequency` | Sine 440 + sawtooth 1000 + sine 6500 → peaking biquad → `AnalyserNode` (pass-through) |
| `impulse` | Single-sample unit impulse → resonant low-pass biquad (3000 Hz, Q 8) |
| `compressor-response` | Sine 500 Hz stepped through four amplitudes → `DynamicsCompressor` |

Every node parameter is set explicitly, including ones that have specification defaults, so
that a browser shipping a different default value cannot be mistaken for a different
device.

The `AnalyserNode` is included in the graph as a pass-through, but its frequency data is
**not** read. Inside an offline render there is no meaningful instant at which to sample an
analyser — rendering is not driven by a clock. Spectral features are computed instead by a
plain-JavaScript FFT in `src/lib/fft.ts`, which keeps them deterministic and inspectable.

### Normalization

Features are put on a comparable scale so that no single dimension dominates the Euclidean
distance. The transform is **fixed and device-independent** — each feature *kind* has a
mapping chosen from the physical range that kind of measurement can occupy:

- Bounded amplitudes (RMS, peak, waveform samples) pass through unchanged.
- Frequencies are divided by Nyquist, so a context running at 48 kHz stays comparable.
- Magnitudes spanning orders of magnitude (FFT bins, spectral energy) are converted to
  decibels and scaled.
- Unbounded ratios (crest factor) are log-compressed.

A tempting alternative is to z-score each vector using its own mean and standard deviation.
This project deliberately does **not** do that: it would give every device a different
transform and would normalize away exactly the between-device differences under
investigation. There is a unit test asserting that the transform is not self-referential.

### Fingerprint structure

```json
{
  "version": "audio-fingerprint-v1",
  "sampleRate": 44100,
  "keys": ["sine.mean", "sine.stdDev", "..."],
  "features": [0.0001, 0.7071, "..."],
  "raw": [{ "testId": "sine", "features": [{ "key": "sine.mean", "value": 0.0001 }] }]
}
```

The fingerprint contains **no timestamps, no random values and no counters**. Timestamps
live on the enclosing sample record, never inside the vector being compared.

## 6. How similarity is calculated

`compareFingerprints(a, b)` returns three numbers:

```ts
{ cosineSimilarity, euclideanDistance, normalizedScore }
```

- **Cosine similarity** — the cosine of the angle between the two vectors, in `[-1, 1]`.
  It measures *shape*: two vectors pointing the same direction score 1 even if one is
  uniformly larger. Returns 0 for a zero vector, where the angle is undefined.
- **Euclidean distance** — the straight-line L2 distance. 0 means identical. It measures
  *magnitude* of difference, which cosine similarity ignores.
- **normalizedScore** — a convenience number in `[0, 1]` combining both:
  the mean of `(cosine + 1) / 2` and `1 / (1 + distance/√dimension)`.

The two metrics answer different questions, which is why both are shown everywhere raw. The
normalized score is a **presentation aid for ranking and heat-mapping**, not a verdict.

**No threshold is hard-coded.** The app never claims that 0.95 (or any other value) means
"same device". The threshold is a slider you set, its effect is purely visual, and the
Experiment Analysis section evaluates whatever threshold best fits your data while telling
you plainly that a fitted threshold is optimistic by construction.

Before comparison, vectors are **aligned by feature key name**, not by position. A sample
recorded with a different feature ordering, or from a browser where one test failed, is
still compared on the dimensions the two have in common. Fingerprints of different
`version` values are refused outright rather than silently misaligned.

## 7. Sources of variation between browsers

- **Filter coefficient computation.** Chromium, Gecko and WebKit each derive biquad
  coefficients slightly differently, and small differences compound through a resonant
  filter's feedback path.
- **Compressor implementation.** `DynamicsCompressor` is the least tightly specified node
  in the API. Envelope detection, knee interpolation, lookahead and internal makeup gain
  differ substantially between engines. In practice this is the single most discriminating
  test in the set.
- **Oscillator synthesis.** Band-limited waveform generation (for square, sawtooth and
  triangle) uses wavetables whose size and interpolation strategy are implementation
  choices.
- **Internal precision.** Single vs. double precision in intermediate stages, and whether
  denormal numbers are flushed to zero.
- **SIMD and vectorization.** Different code paths produce different (still valid) rounding.
- **Default sample rate.** iOS commonly prefers 48 kHz; this app requests 44.1 kHz and
  records the rate actually used.
- **Browser version.** An engine update can change any of the above.

## 8. Sources of variation between devices

- **CPU architecture and instruction set.** ARM vs. x86-64, and which SIMD extensions are
  available, change which vectorized path executes and therefore the rounding.
- **FMA (fused multiply-add) availability**, which changes intermediate rounding in filter
  loops.
- **Compiler and build target** for that platform's browser binary.
- **Operating system audio stack**, insofar as it influences the chosen sample rate.
- **CPU features gated at runtime**, which can differ even between two machines running the
  same browser build.

Note the overlap between sections 7 and 8. That overlap **is the experimental problem**.
Both the browser and the device contribute variation, and the hypothesis only holds if the
device contribution dominates. That is not obvious, and this app is built to find out
rather than to assume.

## 9. Why fingerprints may change over time

- A browser update changes an implementation detail.
- An OS update changes the audio stack or the preferred sample rate.
- The browser applies deliberate anti-fingerprinting noise (Brave does this by default;
  Firefox does under `privacy.resistFingerprinting`; Safari applies some protections).
- CPU throttling or power-saving modes change which code path runs.
- The device is connected to different audio hardware, changing the default rate.

A fingerprint is therefore a measurement with a shelf life, not a durable identifier. This
is one of several reasons the language throughout this project is "experimental
fingerprint" and "similarity score" rather than "device ID".

## 10. How to conduct the experiment

**Step 1 — Establish repeatability first.** On one browser, open section 5 and run the
Repeatability Test. It generates 10 fingerprints and compares all 45 pairs. Read the
minimum pairwise score.

This step is not optional. If the fingerprint does not reproduce on a single unchanged
browser, no cross-device comparison it produces can mean anything. Repeat this on each
browser you intend to use. (For reference: repeated runs in Chrome on one machine during
development produced a minimum pairwise normalized score of 0.99976 — but measure your own;
do not adopt that number.)

**Step 2 — Collect samples.** On each browser, open the app and save a fingerprint:

| Device / Environment Name | Device Group |
|---|---|
| MacBook Chrome | Laptop A |
| MacBook Firefox | Laptop A |
| MacBook Edge | Laptop A |
| iPhone Safari | Phone B |
| iPhone Chrome | Phone B |

The **Device Group** is the claim you are testing: samples sharing a group are asserted to
be the same physical machine.

**Choose browsers with different engines.** Arc, Chrome, Edge, Brave and Opera are all
Chromium, and share one Web Audio implementation. Two Chromium browsers on the same machine
will score very close to each other — but that result is confounded: it is equally well
explained by "same engine" as by "same device", so on its own it is close to no evidence for
the hypothesis. The informative comparisons cross engine boundaries: Chromium vs. Firefox
(Gecko) vs. Safari (WebKit). On a Mac, Chrome + Firefox + Safari is a much stronger test set
than Chrome + Arc + Edge. Adding a same-engine pair is still worth doing, as it gives you an
upper bound on what "same device" can look like.

**Step 3 — Get the samples into one place.** Samples are stored in `localStorage`, which is
scoped to each browser profile — Chrome cannot see Arc's samples, and neither can see
Safari's. This is expected, and it is why the Saved Samples list looks empty when you switch
browsers. To assemble the experiment:

1. In each browser, use **Export JSON** (section 7).
2. In whichever browser you want to analyse in, use **Import JSON** (also section 7) and
   select each exported file in turn.

Importing merges by sample id, so re-importing a file you already loaded adds nothing rather
than duplicating measurements. Nothing is uploaded; the files are read in the browser.

If you would rather script it, POST the merged array to `/api/fingerprint` as
`{ "samples": [...], "mode": "audio" }` and read the analysis back as JSON. That endpoint is
stateless and stores nothing.

For the phone to reach the dev server, run `pnpm dev --host` and use your machine's LAN
address.

**Step 4 — Read the analysis.** Sections 4 and 6 recompute automatically. Toggle between
**Audio only** and **Audio + environment** to see how much of the separation comes from
audio behaviour rather than from ordinary browser attributes like the user-agent string.

## 11. How to interpret the results

The analysis reports four numbers about the two score distributions:

- **Mean gap** = mean(within-device) − mean(between-device). The hypothesis predicts a
  positive value.
- **Effect size** = mean gap ÷ pooled standard deviation. Roughly, how many standard
  deviations apart the distributions are. Below ~1 the separation is small relative to the
  noise.
- **Overlap margin** = min(within) − max(between). Positive means the distributions do not
  overlap at all: every same-device pair scored above every different-device pair.
- **Best threshold** — the cut-off that best classifies the data *you collected*. Because
  it is fitted to that data, its accuracy is optimistic and it is not a value to deploy.

### What would support the hypothesis

- Repeatability holds first: minimum pairwise score on one browser is very close to 1.
- Within-device scores cluster high; between-device scores cluster clearly lower.
- **Positive overlap margin** — the distributions are cleanly separated.
- Effect size well above 1.
- Crucially: the separation **persists in Audio-only mode**. If it only appears once
  environment metadata is added, you have measured user-agent strings, not audio.

### What would falsify it

- **Repeatability fails.** If one browser cannot reproduce its own fingerprint to better
  than the between-device spread, the measurement is too noisy to support any conclusion,
  and nothing downstream matters.
- **Mean gap ≤ 0.** Same-device pairs are no more similar than different-device pairs.
- **Scores cluster by browser rather than by device** — e.g. Chrome-on-laptop scores closer
  to Chrome-on-phone than to Firefox-on-laptop. This is the most likely realistic outcome
  and would show that the signal tracks the *engine*, not the *hardware*.
- **Heavy overlap** with a small effect size: no threshold separates the groups.

A negative result here is a real result. This tool is written so a negative result is just
as visible as a positive one, and the verdict logic reports `not-supported` and
`insufficient-data` as readily as `supported`.

## 12. Limitations

- **Small samples.** With a handful of devices you have a handful of comparisons.
  Distributions built on 3–10 points are not robust; the app refuses to state a verdict
  below 3 comparisons per group, which is a low bar, not a sufficient one.
- **Confounded factors.** Browser engine, browser version, OS, CPU architecture and sample
  rate all vary together across your test set. With five samples you cannot separate their
  contributions.
- **Fitted thresholds are optimistic.** A threshold chosen on the same data it is evaluated
  on will always look better than it would on new data.
- **Not a uniqueness claim.** Even a perfect separation between *your* laptop and *your*
  phone says nothing about whether your laptop is distinguishable from ten thousand other
  laptops of the same model. Same-model devices running the same browser build are the hard
  case, and this experiment does not address it.
- **Anti-fingerprinting defences.** Browsers that inject noise will show poor repeatability
  by design. That is the defence working, not a bug in the measurement.
- **The app's own FFT.** Spectral features are computed with `Math.cos`/`Math.sin`, which
  engines may implement to within an ulp of each other. This adds a small amount of
  browser-attributable variance to the analysis layer itself. It is far below the variance
  from the audio graph, but it is not zero.
- **Time-varying.** See section 9. A fingerprint collected today may not match the same
  device next month.

---

## Privacy

The application:

- **never** accesses the microphone (audio is synthesised, never recorded)
- **never** accesses the camera, contacts or geolocation
- **never** transmits fingerprints to third parties — there are no analytics, no external
  scripts and no outbound requests
- stores all data locally in `localStorage`, by default and by design
- provides a **Delete All Samples** button

The one server route, `POST /api/fingerprint`, is provided so the analysis can be run from
a script. It is **stateless**: it computes a response and discards the input. It is not used
by the UI, which does all of its work in the browser.

## Project structure

```
src/
  routes/
    +layout.svelte              Global styles and document head
    +page.svelte                The seven UI sections
    api/fingerprint/+server.ts  Stateless analysis endpoint (stores nothing)
  lib/
    types.ts                    Shared types and the fingerprint version
    audioTests.ts               The six deterministic audio graphs
    audioFingerprint.ts         OfflineAudioContext rendering and orchestration
    features.ts                 Time and frequency domain feature extraction
    compressorFeatures.ts       Compressor gain-reduction characteristics
    fft.ts                      Radix-2 FFT and Hann window
    normalize.ts                Fixed, device-independent feature scaling
    similarity.ts               Cosine, Euclidean, compareFingerprints
    stats.ts                    Descriptive statistics
    analysis.ts                 Pairwise comparison, matrix, separation, verdict
    environment.ts              Browser metadata, kept separate from audio
    storage.ts                  localStorage persistence and validation
    export.ts                   JSON and CSV export
    state.svelte.ts             Shared reactive state
    format.ts                   Display formatting
    components/                 UI panels and visualizations
tests/
  fixtures.ts                   Deterministic test fixtures
  similarity.test.ts            Metric properties and fingerprint comparison
  fingerprint.test.ts           Feature extraction, FFT, normalization, compressor
  analysis.test.ts              Statistics, environment vectors, verdict logic
  storage.test.ts               Validation, round trips, export formats
```

## Testing

`pnpm test` runs the suite in plain Node with deterministic fixtures — pure sine waves and
a seeded PRNG — so every mathematical component is testable without a browser or an audio
device. Coverage includes feature extraction against known analytical values (the RMS of a
sine is 1/√2, its crest factor is √2), FFT bin placement, normalization behaviour, metric
properties (symmetry, the triangle inequality, zero-vector handling), serialization round
trips, CSV escaping, and each branch of the hypothesis-verdict logic.

The one thing unit tests **cannot** cover is whether a given browser's audio graph is
stable. That is what the in-app Repeatability Test is for, and why it exists as a first-class
feature rather than an afterthought.

## License

[MIT](LICENSE) © 2026 Daniel Luedke
