<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		index: number;
		title: string;
		subtitle?: string;
		children: Snippet;
	}

	let { id, index, title, subtitle, children }: Props = $props();
</script>

<section {id} class="scroll-mt-20 rounded-lg border border-ink-800 bg-ink-900 p-5 sm:p-6">
	<header class="mb-4 border-b border-ink-800 pb-3">
		<h2 class="flex items-baseline gap-3 text-lg font-semibold text-ink-100">
			<span class="numeric text-sm text-ink-400">{index}</span>
			{title}
		</h2>
		{#if subtitle}
			<p class="mt-1 text-sm text-ink-400">{subtitle}</p>
		{/if}
	</header>
	{@render children()}
</section>
