export type Profile = 'auto' | 'economy' | 'balanced' | 'quality' | 'max'
export type FixedProfile = Exclude<Profile, 'auto'>
export type Effort = 'low' | 'medium' | 'high'
export type Tier = 'haiku' | 'sonnet' | 'opus' | 'fable'
export type AutoClass = 'trivial' | 'routine' | 'complex' | 'critical'

export const TIER_RANK: Record<Tier, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }

// turn.step rejects aliases (live: unrecognized_model {model:'opus'}); send full ids.
export const TIER_IDS: Record<Tier, string> = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', fable: 'claude-fable-5-1' }

/** The full model id the engine accepts for a tier; opus and sonnet keep a 1M window as `[1m]` (haiku and fable have none). */
export function modelIdFor(tier: Tier, keep1m: boolean): string {
  return keep1m && (tier === 'opus' || tier === 'sonnet') ? `${TIER_IDS[tier]}[1m]` : TIER_IDS[tier]
}

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

export const AUTO_UPGRADE_CONTEXT_LIMIT = 40_000

export const AUTO_LABELS = ['trivial', 'routine', 'complex', 'critical'] as const

export function isAutoClass(x: unknown): x is AutoClass {
  return typeof x === 'string' && (AUTO_LABELS as readonly string[]).includes(x)
}

/** How long a prompt waits for the classifier before auto keeps its plan. */
export const CLASSIFIER_TIMEOUT_MS = 2500

/** Why the classifier gave no class: no label, a failed request, or no answer in time. */
export type ClassifierMiss = 'none' | 'error' | 'timeout'

/** What `/omni status` keeps for a prompt the classifier gave no class: the plan stays either way. */
export function missedClass(miss: ClassifierMiss): { label: 'none' | 'error'; reason: string } {
  if (miss === 'none') return { label: 'none', reason: 'classifier gave no label; plan kept' }
  return { label: 'error', reason: miss === 'timeout' ? 'classifier timed out; plan kept' : 'classifier request failed; plan kept' }
}

export function tierOf(model: string): Tier | undefined {
  // Trim again after the suffix goes: `opus [1m]` is opus.
  const m = model.trim().toLowerCase().replace(/\[[^\]]*\]$/, '').trim()
  for (const tier of ['haiku', 'sonnet', 'opus', 'fable'] as const) {
    if (m === tier || m.includes(`-${tier}-`) || m.startsWith(`${tier}-`) || m.endsWith(`-${tier}`)) return tier
  }
  return undefined
}

/** The fixed profile whose spawn table applies; auto borrows balanced's table. */
export function spawnProfile(profile: Profile): FixedProfile {
  return profile === 'auto' ? 'balanced' : profile
}

/**
 * The model a main-loop step is sent: the engine's own id when its tier already matches (no rewrite),
 * else the target tier's full id, keeping a 1M window on opus/sonnet (haiku and fable have no `[1m]` form).
 */
export function mainLoopModel(engineModel: string, target: Tier): string {
  if (tierOf(engineModel) === target) return engineModel
  return modelIdFor(target, engineModel.trim().toLowerCase().endsWith('[1m]'))
}

export const ASTRA = 'omniclaude:astra-expert'

/** astra-expert under OmniClaude's name or any other plugin name a marketplace gave it. */
export function isAstraType(subagentType: string): boolean {
  return subagentType === ASTRA || subagentType.endsWith(':astra-expert')
}

/** Engine built-ins the profile routes; any other engine agent (claude-code-guide, statusline-setup, ...) keeps its own model. */
const ROUTED_ENGINE_AGENTS: readonly string[] = ['Explore', 'Plan', 'general-purpose']

/** Whether the profile sets a spawn's model: every plugin's agent, and among the engine's own only Explore, Plan and general-purpose. */
export function routesSpawn(subagentType: string, providerPlugin: string | undefined): boolean {
  return providerPlugin !== 'engine' || ROUTED_ENGINE_AGENTS.includes(subagentType)
}

/** A request within the tier is passed through as given; one above it (or one the policy cannot place) becomes the tier's full id. */
export function clampWorkerModel(workerTier: Tier, requested: string | undefined, profile: Profile): string | undefined {
  if (requested === undefined) return undefined
  if (profile === 'max') return requested
  const requestedTier = tierOf(requested)
  if (requestedTier === undefined) return TIER_IDS[workerTier]
  return TIER_RANK[requestedTier] > TIER_RANK[workerTier] ? TIER_IDS[workerTier] : requested
}

// `agentModel` is unused: the engine does not expose a third-party agent's own frontmatter model, so every non-OmniClaude spawn is routed by profile.
export function spawnModel(
  profile: FixedProfile,
  subagentType: string,
  agentModel: string | undefined,
  requested: string | undefined,
): string | undefined {
  if (Object.hasOwn(WORKER_TIERS, subagentType)) {
    return clampWorkerModel(WORKER_TIERS[subagentType], requested, profile)
  }
  const tier = subagentType === 'Explore' ? PROFILES[profile].explore : PROFILES[profile].general
  if (requested === undefined) return TIER_IDS[tier]
  return profile === 'max' ? requested : (clampWorkerModel(tier, requested, profile) ?? TIER_IDS[tier])
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
