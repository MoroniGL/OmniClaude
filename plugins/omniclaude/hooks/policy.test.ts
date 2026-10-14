import { test, expect } from 'claude-code/testing'
import {
  PROFILES, WORKER_TIERS, tierOf, clampWorkerModel, spawnModel,
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
  expect(tierOf('opusplan')).toBeUndefined()
  expect(tierOf('inherit')).toBeUndefined()
})

test('worker tiers are the shipped frontmatter tiers', async () => {
  expect(WORKER_TIERS['omniclaude:luna-researcher']).toBe('haiku')
  expect(WORKER_TIERS['omniclaude:terra-explorer']).toBe('sonnet')
  expect(WORKER_TIERS['omniclaude:sol-debugger']).toBe('opus')
  expect(WORKER_TIERS['omniclaude:astra-expert']).toBe('fable')
})

test('clampWorkerModel clamps a higher request back to the tier, except under max', async () => {
  expect(clampWorkerModel('haiku', 'opus', 'balanced')).toBe('haiku')
  expect(clampWorkerModel('haiku', 'claude-opus-5-5', 'economy')).toBe('haiku')
  expect(clampWorkerModel('sonnet', 'haiku', 'balanced')).toBe('haiku')
  expect(clampWorkerModel('sonnet', undefined, 'balanced')).toBeUndefined()
  expect(clampWorkerModel('haiku', 'opus', 'max')).toBe('opus')
  expect(clampWorkerModel('fable', 'opus[1m]', 'balanced')).toBe('opus[1m]')
  expect(clampWorkerModel('fable', 'sonnet', 'balanced')).toBe('sonnet')
  expect(clampWorkerModel('fable', 'fable', 'balanced')).toBe('fable')
  expect(clampWorkerModel('haiku', 'inherit', 'balanced')).toBe('haiku')
  expect(clampWorkerModel('haiku', undefined, 'max')).toBeUndefined()
})

test('spawnModel routes built-ins and model-less agents by profile', async () => {
  expect(spawnModel('economy', 'Explore', undefined, undefined)).toBe('haiku')
  expect(spawnModel('balanced', 'Explore', undefined, undefined)).toBe('sonnet')
  expect(spawnModel('quality', 'general-purpose', undefined, undefined)).toBe('opus')
  expect(spawnModel('balanced', 'Plan', undefined, undefined)).toBe('sonnet')
  expect(spawnModel('economy', 'Plan', undefined, undefined)).toBe('sonnet')
  expect(spawnModel('quality', 'Plan', undefined, undefined)).toBe('opus')
  expect(spawnModel('economy', 'Explore', undefined, 'opus')).toBe('haiku')
  expect(spawnModel('economy', 'general-purpose', undefined, 'haiku')).toBe('haiku')
  expect(spawnModel('max', 'Explore', undefined, 'fable')).toBe('fable')
  expect(spawnModel('balanced', 'omniclaude:luna-researcher', 'haiku', 'opus')).toBe('haiku')
  expect(spawnModel('balanced', 'omniclaude:terra-explorer', 'sonnet', undefined)).toBeUndefined()
  expect(spawnModel('balanced', 'some-plugin:writer', 'opus', undefined)).toBe('sonnet')
  expect(spawnModel('balanced', 'some-plugin:writer', undefined, undefined)).toBe('sonnet')
})

test('mainLoopModel rewrites only across tiers and keeps a 1M window on opus and sonnet', async () => {
  expect(mainLoopModel('claude-opus-5-5', 'opus')).toBe('claude-opus-5-5')
  expect(mainLoopModel('claude-opus-5-5[1m]', 'opus')).toBe('claude-opus-5-5[1m]')
  expect(mainLoopModel('claude-opus-5-5', 'sonnet')).toBe('sonnet')
  expect(mainLoopModel('claude-sonnet-5-5[1m]', 'opus')).toBe('opus[1m]')
  expect(mainLoopModel('claude-opus-5-5[1m]', 'fable')).toBe('fable')
  expect(mainLoopModel('claude-opus-5-5[1m]', 'haiku')).toBe('haiku')
  expect(mainLoopModel('some-proxy-model', 'opus')).toBe('opus')
})

test('only Explore, Plan and general-purpose among engine agents are routed; astra is matched under any plugin name', async () => {
  expect(routesSpawn('Explore', 'engine')).toBe(true)
  expect(routesSpawn('Plan', 'engine')).toBe(true)
  expect(routesSpawn('general-purpose', 'engine')).toBe(true)
  expect(routesSpawn('claude-code-guide', 'engine')).toBe(false)
  expect(routesSpawn('statusline-setup', 'engine')).toBe(false)
  expect(routesSpawn('some-plugin:writer', 'some-plugin')).toBe(true)
  expect(routesSpawn('omniclaude:terra-explorer', 'omniclaude')).toBe(true)
  expect(isAstraType('omniclaude:astra-expert')).toBe(true)
  expect(isAstraType('omniclaude-dev:astra-expert')).toBe(true)
  expect(isAstraType('astra-expert-helper')).toBe(false)
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
