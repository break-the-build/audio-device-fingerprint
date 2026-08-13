<script lang="ts">
	/**
	 * Repeatability: does this browser produce the same fingerprint twice?
	 *
	 * Runs are held in memory and are NOT saved as samples -- they answer a
	 * different question from the cross-device comparison and would distort
	 * the within-device distribution if mixed in.
	 */
	import { repeatabilityReport } from '$lib/analysis';
	import { generateFingerprint } from '$lib/audioFingerprint';
	import { fixed } from '$lib/format';
	import { experiment } from '$lib/state.svelte';
	import type { RepeatabilityReport, Sample } from '$lib/types';
	import StatsTable from './StatsTable.svelte';

	interface Props {
		audioSupported: boolean;
	}

	let { audioSupported }: Props = $props();

	const RUN_COUNT = 10;

	let busy = $state(false);
	let completed = $state(0);
	let error = $state<string | null>(null);
	let report = $state<RepeatabilityReport | null>(null);

	async function runTest(): Promise<void> {
		if (busy || !audioSupported) return;
		busy = true;
		error = null;
		report = null;
		completed = 0;

		try {
			const runs: Sample[] = [];
			for (let i = 0; i < RUN_COUNT; i++) {
				const fingerprint = await generateFingerprint();
				runs.push({
					id: `repeat-${i}`,
					label: `run ${i + 1}`,
					// One group: every run is by definition the same device.
					deviceGroup: 'repeatability',
					browser: 'self',
					createdAt: new Date().toISOString(),
					fingerprint,
					// Environment is irrelevant here and repeatability is measured
					// on the audio vector alone.
					environment: {
						userAgent: '',
						platform: '',
						language: '',
						screenWidth: 0,
						screenHeight: 0,
						devicePixelRatio: 0,
						hardwareConcurrency: null,
						deviceMemory: null,
						timezone: '',
						webglVendor: null,
						webglRenderer: null,
						webglVersion: null,
						browser: 'self'
					}
				});
				completed = i + 1;
			}
			report = repeatabilityReport(runs, 'audio');
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			busy = false;
		}
	}

	/** Compare measured repeatability against the current threshold. */
	const readsAsStable = $derived(
		report !== null &&
			Number.isFinite(report.normalized.min) &&
			report.normalized.min >= experiment.threshold
	);
</script>

<p class="mb-4 text-sm text-ink-400">
	Before any cross-device claim is worth making, the measurement has to repeat on one device.
	This runs fingerprint generation {RUN_COUNT} times here and compares all
	{(RUN_COUNT * (RUN_COUNT - 1)) / 2} pairs.
</p>

<button
	type="button"
	onclick={runTest}
	disabled={busy || !audioSupported}
	class="rounded bg-accent px-4 py-2 text-sm font-semibold text-ink-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
>
	{busy ? `Running… ${completed}/${RUN_COUNT}` : 'Run Repeatability Test'}
</button>

{#if error}
	<p class="mt-4 rounded border border-alert/50 bg-alert/10 p-3 text-sm text-alert">{error}</p>
{/if}

{#if report}
	<div class="mt-4 grid gap-3 sm:grid-cols-3">
		<StatsTable caption="Normalized score" stats={report.normalized} digits={6} />
		<StatsTable caption="Cosine similarity" stats={report.cosine} digits={6} />
		<StatsTable caption="Euclidean distance" stats={report.euclidean} digits={6} />
	</div>

	<p class="mt-3 text-sm text-ink-300">
		Across {report.runs} runs the lowest pairwise normalized score was
		<span class="numeric text-ink-100">{fixed(report.normalized.min, 6)}</span>.
		{#if readsAsStable}
			That is at or above your current threshold of {experiment.threshold.toFixed(3)}, so
			repeated measurements on this browser are not distinguishable at that setting.
		{:else}
			That is below your current threshold of {experiment.threshold.toFixed(3)}. Repeated
			measurements on this same browser already differ by more than the threshold allows, so any
			cross-device conclusion drawn at that threshold would be unsound.
		{/if}
	</p>
{/if}
