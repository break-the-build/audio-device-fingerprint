import { defineConfig } from 'vitest/config';

/**
 * Tests cover the pure mathematics only: feature extraction, normalization,
 * similarity, statistics, serialization and the experiment calculations.
 * They run in plain Node with deterministic fixtures, so nothing here depends
 * on a real browser or audio device.
 */
export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node'
	}
});
