<script lang="ts">
	import { fixed } from '$lib/format';
	import type { DescriptiveStats } from '$lib/types';

	interface Props {
		caption: string;
		stats: DescriptiveStats;
		digits?: number;
	}

	let { caption, stats, digits = 4 }: Props = $props();

	const rows = $derived([
		['count', String(stats.count)],
		['mean', fixed(stats.mean, digits)],
		['median', fixed(stats.median, digits)],
		['std dev', fixed(stats.stdDev, digits)],
		['min', fixed(stats.min, digits)],
		['max', fixed(stats.max, digits)]
	]);
</script>

<div class="rounded border border-ink-800 bg-ink-850 p-3">
	<h4 class="mb-2 text-xs font-semibold tracking-wide text-ink-300 uppercase">{caption}</h4>
	{#if stats.count === 0}
		<p class="text-sm text-ink-400">No comparisons yet.</p>
	{:else}
		<dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
			{#each rows as [label, value] (label)}
				<dt class="text-ink-400">{label}</dt>
				<dd class="numeric text-right text-ink-100">{value}</dd>
			{/each}
		</dl>
	{/if}
</div>
