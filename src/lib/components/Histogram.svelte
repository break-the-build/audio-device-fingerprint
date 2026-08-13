<script lang="ts">
	/**
	 * Bar chart of a score distribution. Draws only the values it is given --
	 * when there is no data it says so rather than drawing an example shape.
	 */
	import { histogram } from '$lib/analysis';

	interface Props {
		title: string;
		values: readonly number[];
		color: string;
		bins?: number;
	}

	let { title, values, color, bins = 20 }: Props = $props();

	const counts = $derived(histogram(values, bins));
	const peak = $derived(Math.max(1, ...counts));
</script>

<figure class="rounded border border-ink-800 bg-ink-850 p-3">
	<figcaption class="mb-2 flex items-baseline justify-between">
		<span class="text-xs font-semibold tracking-wide text-ink-300 uppercase">{title}</span>
		<span class="numeric text-xs text-ink-400">n = {values.length}</span>
	</figcaption>

	{#if values.length === 0}
		<p class="py-6 text-center text-sm text-ink-400">No measurements collected.</p>
	{:else}
		<div class="flex h-28 items-end gap-px" role="img" aria-label="{title} histogram">
			{#each counts as count, i (i)}
				<div
					class="flex-1 rounded-t-sm"
					style="height: {(count / peak) * 100}%; background-color: {color}; min-height: {count >
					0
						? '2px'
						: '0'}"
					title="{(i / bins).toFixed(2)}–{((i + 1) / bins).toFixed(2)}: {count}"
				></div>
			{/each}
		</div>
		<div class="numeric mt-1 flex justify-between text-[10px] text-ink-400">
			<span>0.00</span><span>0.50</span><span>1.00</span>
		</div>
	{/if}
</figure>
