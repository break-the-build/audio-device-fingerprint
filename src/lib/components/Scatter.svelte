<script lang="ts">
	/**
	 * Cosine similarity against Euclidean distance, one point per comparison.
	 * Same-device and different-device pairs are drawn in different colours so
	 * clustering (or the absence of it) is visible directly.
	 */
	import type { PairComparison } from '$lib/types';

	interface Props {
		pairs: readonly PairComparison[];
	}

	let { pairs }: Props = $props();

	const WIDTH = 480;
	const HEIGHT = 260;
	const PAD = 34;

	const maxDistance = $derived(
		Math.max(1e-9, ...pairs.map((p) => p.result.euclideanDistance))
	);
	const minCosine = $derived(Math.min(0, ...pairs.map((p) => p.result.cosineSimilarity)));

	const points = $derived(
		pairs.map((pair) => ({
			pair,
			x: PAD + (pair.result.euclideanDistance / maxDistance) * (WIDTH - PAD * 2),
			y:
				HEIGHT -
				PAD -
				((pair.result.cosineSimilarity - minCosine) / (1 - minCosine || 1)) *
					(HEIGHT - PAD * 2)
		}))
	);
</script>

<figure class="rounded border border-ink-800 bg-ink-850 p-3">
	<figcaption class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
		<span class="text-xs font-semibold tracking-wide text-ink-300 uppercase">
			Cosine similarity vs Euclidean distance
		</span>
		<span class="flex items-center gap-3 text-xs text-ink-400">
			<span class="flex items-center gap-1">
				<span class="inline-block size-2 rounded-full bg-signal"></span> same device group
			</span>
			<span class="flex items-center gap-1">
				<span class="inline-block size-2 rounded-full bg-alert"></span> different device group
			</span>
		</span>
	</figcaption>

	{#if pairs.length === 0}
		<p class="py-8 text-center text-sm text-ink-400">No comparisons to plot.</p>
	{:else}
		<svg
			viewBox="0 0 {WIDTH} {HEIGHT}"
			class="h-auto w-full"
			role="img"
			aria-label="Scatter plot of cosine similarity against Euclidean distance"
		>
			<line
				x1={PAD}
				y1={HEIGHT - PAD}
				x2={WIDTH - PAD}
				y2={HEIGHT - PAD}
				stroke="currentColor"
				class="text-ink-700"
			/>
			<line
				x1={PAD}
				y1={PAD}
				x2={PAD}
				y2={HEIGHT - PAD}
				stroke="currentColor"
				class="text-ink-700"
			/>
			<text x={WIDTH / 2} y={HEIGHT - 6} class="fill-ink-400 text-[10px]" text-anchor="middle">
				Euclidean distance (0 – {maxDistance.toFixed(2)})
			</text>
			<text
				x={12}
				y={HEIGHT / 2}
				class="fill-ink-400 text-[10px]"
				text-anchor="middle"
				transform="rotate(-90 12 {HEIGHT / 2})"
			>
				Cosine ({minCosine.toFixed(2)} – 1.00)
			</text>

			{#each points as point (point.pair.aId + point.pair.bId)}
				<circle
					cx={point.x}
					cy={point.y}
					r="4"
					class={point.pair.sameGroup ? 'fill-signal' : 'fill-alert'}
					fill-opacity="0.75"
				>
					<title>
						{point.pair.aLabel} ↔ {point.pair.bLabel}: cosine {point.pair.result.cosineSimilarity.toFixed(
							4
						)}, distance {point.pair.result.euclideanDistance.toFixed(4)}
					</title>
				</circle>
			{/each}
		</svg>
	{/if}
</figure>
