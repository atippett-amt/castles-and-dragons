/**
 * shared — the pure rules engine.
 *
 * HARD RULE: nothing in this package may import a platform-specific API.
 * No DOM, no `window`, no Workers globals. The same code runs single-player
 * in the browser and authoritatively inside a Durable Object.
 */

export { BALANCE, dragonProgress, dragonStat } from './balance';
export type { Balance } from './balance';

export * from './types';
export * from './rng';
export * from './graph';
export * from './state';
