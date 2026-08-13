<script lang="ts">
	import { MIN_PAIRS_FOR_VERDICT, analyzeExperiment } from '$lib/analysis';
	import { fixed, percent } from '$lib/format';
	import { experiment } from '$lib/state.svelte';
	import type { HypothesisVerdict } from '$lib/types';
	import Histogram from './Histogram.svelte';
	import Scatter from './Scatter.svelte';
	import StatsTable from './StatsTable.svelte';

	const analysis = $derived(analyzeExperiment(experiment.samples, experiment.mode));
	const within = $derived(
		analysis.pairs.filter((p) => p.sameGroup).map((p) => p.result.normalizedScore)
	);
	const between = $derived(
		analysis.pairs.filter((p) => !p.sameGroup).map((p) => p.result.normalizedScore)
	);

	const VERDICT_TEXT: Record<HypothesisVerdict, { label: string; className: string }> = {
		'insufficient-data': {
			label: 'Insufficient data — no conclusion',
			className: 'border-ink-700 bg-ink-850 text-ink-300'
		},
		supported: {
			label: 'This data supports the same-device hypothesis',
			className: 'border-signal/50 bg-signal/10 text-signal'
		},
		'weakly-supported': {
			label: 'This data weakly supports the same-device hypothesis',
			className: 'border-caution/50 bg-caution/10 text-caution'
		},
		'not-supported': {
			label: 'This data does not support the same-device hypothesis',
			className: 'border-alert/50 bg-alert/10 text-alert'
		}
	};

	const verdict = $derived(VERDICT_TEXT[analysis.separation.verdict]);
</script>

{#if experiment.samples.length < 2}
	<p class="text-sm text-ink-400">
		Save fingerprints from at least two browsers, and assign them to device groups, before any
		analysis is possible.
	</p>
{:else}
	<div class="rounded border p-3 text-sm font-semibold {verdict.className}">
		{verdict.label}
	</div>

	<ul class="mt-3 space-y-1 text-sm text-ink-300">
		{#each analysis.separation.notes as note (note)}
			<li>• {note}</li>
		{/each}
	</ul>

	<div class="mt-4 grid gap-3 sm:grid-cols-2">
		<StatsTable caption="Within-device similarity (same group)" stats={analysis.separation.within} />
		<StatsTable
			caption="Between-device similarity (different groups)"
			stats={analysis.separation.between}
		/>
	</div>

	<dl class="mt-3 grid gap-3 text-sm sm:grid-cols-4">
		<div class="rounded border border-ink-800 bg-ink-850 p-3">
			<dt class="text-xs text-ink-400">Mean gap</dt>
			<dd class="numeric text-lg text-ink-100">{fixed(analysis.separation.meanGap)}</dd>
			<p class="mt-1 text-[11px] text-ink-400">mean(within) − mean(between)</p>
		</div>
		<div class="rounded border border-ink-800 bg-ink-850 p-3">
			<dt class="text-xs text-ink-400">Effect size</dt>
			<dd class="numeric text-lg text-ink-100">{fixed(analysis.separation.effectSize, 2)}</dd>
			<p class="mt-1 text-[11px] text-ink-400">gap ÷ pooled std dev</p>
		</div>
		<div class="rounded border border-ink-800 bg-ink-850 p-3">
			<dt class="text-xs text-ink-400">Overlap margin</dt>
			<dd class="numeric text-lg text-ink-100">{fixed(analysis.separation.overlapMargin)}</dd>
			<p class="mt-1 text-[11px] text-ink-400">min(within) − max(between)</p>
		</div>
		<div class="rounded border border-ink-800 bg-ink-850 p-3">
			<dt class="text-xs text-ink-400">Best threshold in this data</dt>
			<dd class="numeric text-lg text-ink-100">{fixed(analysis.separation.bestThreshold, 3)}</dd>
			<p class="mt-1 text-[11px] text-ink-400">
				{percent(analysis.separation.bestAccuracy)} of pairs classified correctly
			</p>
		</div>
	</dl>

	<p class="mt-2 text-xs text-ink-400">
		The "best threshold" is fitted to the data shown, so its accuracy is optimistic by
		construction. Treat it as a description of this sample set, not as a cut-off to deploy. A
		verdict is only offered once there are at least {MIN_PAIRS_FOR_VERDICT} comparisons in each group.
	</p>

	<div class="mt-4 grid gap-3 sm:grid-cols-2">
		<Histogram title="Same-device distribution" values={within} color="var(--color-signal)" />
		<Histogram title="Different-device distribution" values={between} color="var(--color-alert)" />
	</div>

	<div class="mt-3">
		<Scatter pairs={analysis.pairs} />
	</div>

	<details class="mt-4">
		<summary class="cursor-pointer text-sm text-ink-400">
			All {analysis.pairs.length} pairwise comparisons
		</summary>
		<div class="mt-2 overflow-x-auto">
			<table class="min-w-full text-xs">
				<thead>
					<tr class="border-b border-ink-800 text-left text-ink-400">
						<th class="p-2">Pair</th>
						<th class="p-2">Same group</th>
						<th class="numeric p-2">Cosine</th>
						<th class="numeric p-2">Euclidean</th>
						<th class="numeric p-2">Normalized</th>
					</tr>
				</thead>
				<tbody>
					{#each analysis.pairs as pair (pair.aId + pair.bId)}
						<tr class="border-b border-ink-850">
							<td class="p-2 text-ink-100">{pair.aLabel} ↔ {pair.bLabel}</td>
							<td class="p-2" class:text-signal={pair.sameGroup} class:text-alert={!pair.sameGroup}>
								{pair.sameGroup ? 'yes' : 'no'}
							</td>
							<td class="numeric p-2 text-ink-300">{fixed(pair.result.cosineSimilarity, 6)}</td>
							<td class="numeric p-2 text-ink-300">{fixed(pair.result.euclideanDistance, 6)}</td>
							<td class="numeric p-2 text-ink-100">{fixed(pair.result.normalizedScore, 6)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
{/if}
