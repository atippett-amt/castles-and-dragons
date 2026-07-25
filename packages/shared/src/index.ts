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
export * from './players';
export * from './regions';
export * from './defense';
export * from './units';
export * from './dragons';
export * from './combat';
export * from './orders';
export * from './holds';
export * from './turn';
export * from './ai';
export * from './state';
