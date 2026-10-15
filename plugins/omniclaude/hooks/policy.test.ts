import { test, expect } from 'claude-code/testing'
import {
  PROFILES, TIER_IDS, WORKER_TIERS, tierOf, clampWorkerModel, spawnModel, modelIdFor,
  planForClass, decideAutoModel, mainLoopModel, routesSpawn, isAstraType, spawnProfile,
} from './policy'

test('profile table matches the spec', async () => {
  expect(PROFILES.economy).toEqual({ parent: { model: 'sonnet', effort: 'medium' }, explore: 'haiku', general: 'sonnet' })
  expect(PROFILES.balanced).toEqual({ parent: { model: 'opus', effort: 'medium' }, explore: 'sonnet', general: 'sonnet' })
  expect(PROFILES.quality).toEqual({ parent: { model: 'opus', effort: 'high' }, explore: 'sonnet', general: 'opus' })
  expect(PROFILES.max).toEqual({ parent: { model: 'fable', effort: 'high' }, explore: 'opus', general: 'opus' })
})

test('tierOf understands aliases, full ids and [1m] suffixes', async () => {
  expect(tierOf('haiku')).toBe('haiku')
  expect(tierOf('claude-haiku-5-5')).toBe('haiku')
  expect(tierOf('claude-opus-5-5')).toBe('opus')
  expect(tierOf('claude-fable-5-1')).toBe('fable')
  expect(tierOf('claude-sonnet-5-5-20261001')).toBe('sonnet')
  expect(tierOf('gpt-6')).toBeUndefined()
  expect(tierOf('opus[1m]')).toBe('opus')
  expect(tierOf('sonnet[1m]')).toBe('sonnet')
  expect(tierOf('claude-opus-5-5[1m]')).toBe('opus')
  expect(tierOf('opus [1m]')).toBe('opus')
  expect(tierOf(' claude-sonnet-5-5 [1m] ')).toBe('sonnet')
  expect(tierOf('opusplan')).toBeUndefined()
  expect(tierOf('inherit')).toBeUndefined()
})

test('TIER_IDS holds the four full ids and modelIdFor adds [1m] only on opus and sonnet', async () => {
  expect(TIER_IDS).toEqual({ haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', fable: 'claude-fable-5-1' })
  expect(modelIdFor('haiku', false)).toBe('claude-haiku-5-5')
  expect(modelIdFor('sonnet', false)).toBe('claude-sonnet-5-5')
  expect(modelIdFor('opus', false)).toBe('claude-opus-5-5')
  expect(modelIdFor('fable', false)).toBe('claude-fable-5-1')
  expect(modelIdFor('haiku', true)).toBe('claude-haiku-5-5')
  expect(modelIdFor('sonnet', true)).toBe('claude-sonnet-5-5[1m]')
  expect(modelIdFor('opus', true)).toBe('claude-opus-5-5[1m]')
  expect(modelIdFor('fable', true)).toBe('claude-fable-5-1')
  // every id reads back as its own tier
  for (const tier of ['haiku', 'sonnet', 'opus', 'fable'] as const) expect(tierOf(TIER_IDS[tier])).toBe(tier)
})

test('worker tiers are the shipped frontmatter tiers', async () => {
  expect(WORKER_TIERS['omniclaude:haiku-researcher']).toBe('haiku')
  expect(WORKER_TIERS['omniclaude:sonnet-explorer']).toBe('sonnet')
  expect(WORKER_TIERS['omniclaude:opus-debugger']).toBe('opus')
  expect(WORKER_TIERS['omniclaude:fable-expert']).toBe('fable')
})

test('clampWorkerModel clamps a higher request to the tier id and passes an acceptable one through as given, except under max', async () => {
  expect(clampWorkerModel('haiku', 'opus', 'balanced')).toBe('claude-haiku-5-5')
  expect(clampWorkerModel('haiku', 'claude-opus-5-5', 'economy')).toBe('claude-haiku-5-5')
  expect(clampWorkerModel('sonnet', 'haiku', 'balanced')).toBe('haiku')
  expect(clampWorkerModel('sonnet', undefined, 'balanced')).toBeUndefined()
  expect(clampWorkerModel('haiku', 'opus', 'max')).toBe('opus')
  expect(clampWorkerModel('fable', 'opus[1m]', 'balanced')).toBe('opus[1m]')
  expect(clampWorkerModel('fable', 'sonnet', 'balanced')).toBe('sonnet')
  expect(clampWorkerModel('fable', 'fable', 'balanced')).toBe('fable')
  expect(clampWorkerModel('haiku', 'inherit', 'balanced')).toBe('claude-haiku-5-5')
  expect(clampWorkerModel('haiku', undefined, 'max')).toBeUndefined()
})

test('spawnModel routes built-ins and model-less agents by profile, always naming a full id when it chooses the model', async () => {
  expect(spawnModel('economy', 'Explore', undefined, undefined)).toBe('claude-haiku-5-5')
  expect(spawnModel('balanced', 'Explore', undefined, undefined)).toBe('claude-sonnet-5-5')
  expect(spawnModel('quality', 'general-purpose', undefined, undefined)).toBe('claude-opus-5-5')
  expect(spawnModel('balanced', 'Plan', undefined, undefined)).toBe('claude-sonnet-5-5')
  expect(spawnModel('economy', 'Plan', undefined, undefined)).toBe('claude-sonnet-5-5')
  expect(spawnModel('quality', 'Plan', undefined, undefined)).toBe('claude-opus-5-5')
  expect(spawnModel('max', 'Explore', undefined, undefined)).toBe('claude-opus-5-5')
  expect(spawnModel('economy', 'Explore', undefined, 'opus')).toBe('claude-haiku-5-5')
  expect(spawnModel('economy', 'general-purpose', undefined, 'haiku')).toBe('haiku')
  expect(spawnModel('max', 'Explore', undefined, 'fable')).toBe('fable')
  expect(spawnModel('balanced', 'omniclaude:haiku-researcher', 'haiku', 'opus')).toBe('claude-haiku-5-5')
  expect(spawnModel('balanced', 'omniclaude:sonnet-explorer', 'sonnet', undefined)).toBeUndefined()
  expect(spawnModel('balanced', 'some-plugin:writer', 'opus', undefined)).toBe('claude-sonnet-5-5')
  expect(spawnModel('balanced', 'some-plugin:writer', undefined, undefined)).toBe('claude-sonnet-5-5')
})

test('mainLoopModel rewrites only across tiers, to a full id, and keeps a 1M window on opus and sonnet', async () => {
  expect(mainLoopModel('claude-opus-5-5', 'opus')).toBe('claude-opus-5-5')
  expect(mainLoopModel('claude-opus-5-5[1m]', 'opus')).toBe('claude-opus-5-5[1m]')
  expect(mainLoopModel('claude-opus-5-5', 'sonnet')).toBe('claude-sonnet-5-5')
  expect(mainLoopModel('claude-sonnet-5-5[1m]', 'opus')).toBe('claude-opus-5-5[1m]')
  expect(mainLoopModel('claude-opus-5-5[1m]', 'fable')).toBe('claude-fable-5-1')
  expect(mainLoopModel('claude-opus-5-5[1m]', 'haiku')).toBe('claude-haiku-5-5')
  expect(mainLoopModel('some-proxy-model', 'opus')).toBe('claude-opus-5-5')
})

test('only Explore, Plan and general-purpose among engine agents are routed; fable is matched under any plugin name', async () => {
  expect(routesSpawn('Explore', 'engine')).toBe(true)
  expect(routesSpawn('Plan', 'engine')).toBe(true)
  expect(routesSpawn('general-purpose', 'engine')).toBe(true)
  expect(routesSpawn('claude-code-guide', 'engine')).toBe(false)
  expect(routesSpawn('statusline-setup', 'engine')).toBe(false)
  expect(routesSpawn('some-plugin:writer', 'some-plugin')).toBe(true)
  expect(routesSpawn('omniclaude:sonnet-explorer', 'omniclaude')).toBe(true)
  expect(isAstraType('omniclaude:fable-expert')).toBe(true)
  expect(isAstraType('omniclaude-dev:fable-expert')).toBe(true)
  expect(isAstraType('fable-expert-helper')).toBe(false)
  expect(spawnProfile('auto')).toBe('balanced')
  expect(spawnProfile('economy')).toBe('economy')
})

test('planForClass maps the four classes', async () => {
  expect(planForClass('trivial')).toEqual({ model: 'sonnet', effort: 'low' })
  expect(planForClass('routine')).toEqual({ model: 'sonnet', effort: 'medium' })
  expect(planForClass('complex')).toEqual({ model: 'opus', effort: 'medium' })
  expect(planForClass('critical')).toEqual({ model: 'opus', effort: 'high' })
})

test('decideAutoModel applies the cache rule', async () => {
  expect(decideAutoModel(null, 'sonnet', 0)).toEqual({ model: 'sonnet', reason: 'first prompt' })
  expect(decideAutoModel('sonnet', 'opus', 10_000)).toEqual({ model: 'opus', reason: 'upgraded (context 10000 < 40000)' })
  expect(decideAutoModel('sonnet', 'opus', 40_000)).toEqual({ model: 'sonnet', reason: 'kept sonnet to preserve the cache' })
  expect(decideAutoModel('opus', 'sonnet', 5_000)).toEqual({ model: 'opus', reason: 'never downgraded mid-session' })
  expect(decideAutoModel('opus', 'opus', 90_000)).toEqual({ model: 'opus', reason: 'unchanged' })
})
