export type Profile = 'auto' | 'economy' | 'balanced' | 'quality' | 'max'
export type FixedProfile = Exclude<Profile, 'auto'>
export type Effort = 'low' | 'medium' | 'high'
export type Tier = 'haiku' | 'sonnet' | 'opus' | 'fable'
export type AutoClass = 'trivial' | 'routine' | 'complex' | 'critical'

export const TIER_RANK: Record<Tier, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }

export const PROFILES: Record<FixedProfile, { parent: { model: Tier; effort: Effort }; explore: Tier; general: Tier }> = {
  economy: { parent: { model: 'sonnet', effort: 'medium' }, explore: 'haiku', general: 'sonnet' },
  balanced: { parent: { model: 'opus', effort: 'medium' }, explore: 'sonnet', general: 'sonnet' },
  quality: { parent: { model: 'opus', effort: 'high' }, explore: 'sonnet', general: 'opus' },
  max: { parent: { model: 'fable', effort: 'high' }, explore: 'opus', general: 'opus' },
}

export const WORKER_TIERS: Record<string, Tier> = {
  'omniclaude:luna-researcher': 'haiku',
  'omniclaude:terra-explorer': 'sonnet',
  'omniclaude:terra-implementer': 'sonnet',
  'omniclaude:sol-planner': 'opus',
  'omniclaude:sol-reviewer': 'opus',
  'omniclaude:sol-debugger': 'opus',
  'omniclaude:astra-expert': 'fable',
}

const BUILT_IN_EXPLORERS = new Set(['Explore', 'Plan'])

export const AUTO_UPGRADE_CONTEXT_LIMIT = 40_000

export function tierOf(model: string): Tier | undefined {
  const m = model.toLowerCase()
  for (const tier of ['haiku', 'sonnet', 'opus', 'fable'] as const) {
    if (m === tier || m.includes(`-${tier}-`) || m.startsWith(`${tier}-`) || m.endsWith(`-${tier}`)) return tier
  }
  return undefined
}

export function clampWorkerModel(workerTier: Tier, requested: string | undefined, profile: Profile): string | undefined {
  if (requested === undefined) return undefined
  if (profile === 'max') return requested
  const requestedTier = tierOf(requested)
  if (requestedTier === undefined) return workerTier
  return TIER_RANK[requestedTier] > TIER_RANK[workerTier] ? workerTier : requested
}

export function spawnModel(
  profile: FixedProfile,
  subagentType: string,
  agentModel: string | undefined,
  requested: string | undefined,
): string | undefined {
  const workerTier = WORKER_TIERS[subagentType]
  if (workerTier !== undefined) return clampWorkerModel(workerTier, requested, profile)
  if (agentModel !== undefined) return undefined
  if (requested !== undefined) return undefined
  return BUILT_IN_EXPLORERS.has(subagentType) ? PROFILES[profile].explore : PROFILES[profile].general
}

export function planForClass(c: AutoClass): { model: Tier; effort: Effort } {
  switch (c) {
    case 'trivial': return { model: 'sonnet', effort: 'low' }
    case 'routine': return { model: 'sonnet', effort: 'medium' }
    case 'complex': return { model: 'opus', effort: 'medium' }
    case 'critical': return { model: 'opus', effort: 'high' }
  }
}

export function decideAutoModel(current: Tier | null, wish: Tier, contextTokens: number): { model: Tier; reason: string } {
  if (current === null) return { model: wish, reason: 'first prompt' }
  if (wish === current) return { model: current, reason: 'unchanged' }
  if (TIER_RANK[wish] < TIER_RANK[current]) return { model: current, reason: 'never downgraded mid-session' }
  if (contextTokens < AUTO_UPGRADE_CONTEXT_LIMIT) return { model: wish, reason: `upgraded (context ${contextTokens} < ${AUTO_UPGRADE_CONTEXT_LIMIT})` }
  return { model: current, reason: `kept ${current} to preserve the cache` }
}
