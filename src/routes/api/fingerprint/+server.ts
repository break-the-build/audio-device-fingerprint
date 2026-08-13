/**
 * Stateless analysis endpoint.
 *
 * The app does not need a server: fingerprints are generated, stored and
 * compared entirely in the browser. This route exists so the same analysis
 * can be run from a script or a notebook against exported data.
 *
 * It deliberately stores NOTHING. There is no database, no log of submitted
 * vectors and no forwarding to any third party. Whatever is posted is used to
 * compute a response and then discarded.
 */

import { json, type RequestHandler } from '@sveltejs/kit';

import { analyzeExperiment } from '$lib/analysis';
import { AUDIO_TESTS } from '$lib/audioTests';
import { compareFingerprints } from '$lib/similarity';
import { isValidSample } from '$lib/storage';
import { FINGERPRINT_VERSION, type AudioFingerprint, type ComparisonMode, type Sample } from '$lib/types';
import { DISCLAIMER } from '$lib/export';

/** Reject oversized bodies rather than parsing whatever arrives. */
const MAX_BODY_BYTES = 5_000_000;

function isFingerprint(value: unknown): value is AudioFingerprint {
	if (typeof value !== 'object' || value === null) return false;
	const fp = value as Partial<AudioFingerprint>;
	return (
		fp.version === FINGERPRINT_VERSION &&
		typeof fp.sampleRate === 'number' &&
		Array.isArray(fp.keys) &&
		Array.isArray(fp.features) &&
		fp.keys.length === fp.features.length &&
		fp.features.every((v) => typeof v === 'number' && Number.isFinite(v))
	);
}

function isMode(value: unknown): value is ComparisonMode {
	return value === 'audio' || value === 'audio+environment';
}

/** Describe the fingerprint format this server understands. */
export const GET: RequestHandler = () =>
	json({
		fingerprintVersion: FINGERPRINT_VERSION,
		tests: AUDIO_TESTS.map((test) => ({ id: test.id, description: test.description })),
		modes: ['audio', 'audio+environment'],
		storesData: false,
		disclaimer: DISCLAIMER
	});

/**
 * Two accepted shapes:
 *   { a: AudioFingerprint, b: AudioFingerprint }  -> a single comparison
 *   { samples: Sample[], mode?: ComparisonMode }  -> a full experiment analysis
 */
export const POST: RequestHandler = async ({ request }) => {
	const declaredLength = Number(request.headers.get('content-length') ?? '0');
	if (declaredLength > MAX_BODY_BYTES) {
		return json({ error: 'Request body too large.' }, { status: 413 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Request body must be valid JSON.' }, { status: 400 });
	}

	if (typeof body !== 'object' || body === null) {
		return json({ error: 'Request body must be a JSON object.' }, { status: 400 });
	}
	const payload = body as { a?: unknown; b?: unknown; samples?: unknown; mode?: unknown };

	if (payload.a !== undefined || payload.b !== undefined) {
		if (!isFingerprint(payload.a) || !isFingerprint(payload.b)) {
			return json(
				{ error: `Both "a" and "b" must be ${FINGERPRINT_VERSION} fingerprints.` },
				{ status: 400 }
			);
		}
		try {
			return json({ comparison: compareFingerprints(payload.a, payload.b) });
		} catch (cause) {
			return json(
				{ error: cause instanceof Error ? cause.message : 'Comparison failed.' },
				{ status: 400 }
			);
		}
	}

	if (Array.isArray(payload.samples)) {
		const samples = payload.samples.filter(isValidSample) as Sample[];
		if (samples.length !== payload.samples.length) {
			return json(
				{
					error: `${payload.samples.length - samples.length} entries were not valid samples.`
				},
				{ status: 400 }
			);
		}
		if (samples.length < 2) {
			return json({ error: 'At least two samples are required.' }, { status: 400 });
		}
		const mode: ComparisonMode = isMode(payload.mode) ? payload.mode : 'audio';
		return json({ analysis: analyzeExperiment(samples, mode), disclaimer: DISCLAIMER });
	}

	return json(
		{ error: 'Provide either {a, b} fingerprints or {samples: Sample[]}.' },
		{ status: 400 }
	);
};
