import type { Register, EngineInterface } from 'claude-code'
import type { LastStep, Profile, Applied, Verified } from '../types'
import { PROFILES, spawnModel, tierOf } from './policy'
import type { FixedProfile } from './policy'

// Each state ref is its own const: the validator reads literal { plugin, key } refs, not object members.
const LAST_STEP = { plugin: 'omniclaude', key: 'lastStep' } as const
const PROFILE_OVERRIDE = { plugin: 'omniclaude', key: 'profileOverride' } as const
const PLAN = { plugin: 'omniclaude', key: 'plan' } as const
const ASTRA_CONSENT = { plugin: 'omniclaude', key: 'astraConsent' } as const
const APPLIED = { plugin: 'omniclaude', key: 'applied' } as const
const VERIFIED = { plugin: 'omniclaude', key: 'verified' } as const

const ASTRA = 'omniclaude:astra-expert'
const ASTRA_DENY = 'astra-expert needs your agreement: run /omni astra allow'
const PROFILE_NAMES: readonly Profile[] = ['auto', 'economy', 'balanced', 'quality', 'max']

function isProfile(x: unknown): x is Profile {
  return typeof x === 'string' && (PROFILE_NAMES as readonly string[]).includes(x)
}

export async function resolveProfile($: EngineInterface, optionProfile: unknown): Promise<Profile> {
  const { value: override } = await $.state.get(PROFILE_OVERRIDE)
  if (override) return override
  const saved = await $.store.get('profile')
  if (isProfile(saved)) return saved
  return isProfile(optionProfile) ? optionProfile : 'auto'
}

/** The fixed profile whose spawn table applies; auto borrows balanced's table. */
export function spawnProfile(profile: Profile): FixedProfile {
  return profile === 'auto' ? 'balanced' : profile
}

/** What the main loop should run on: the profile's parent, or auto's plan (balanced until classified). */
export async function parentTarget($: EngineInterface, profile: Profile): Promise<{ model: string; effort: string }> {
  if (profile !== 'auto') return PROFILES[profile].parent
  const { value: plan } = await $.state.get(PLAN)
  return plan ? { model: plan.model, effort: plan.effort } : PROFILES.balanced.parent
}

export const register: Register = (on, options) => {
  const optionProfile = (options as { profile?: unknown } | undefined)?.profile

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'omni',
      description: 'OmniClaude: show or change the routing profile',
      argumentHint: 'status | economy | balanced | quality | max | auto | save <profile> | reset | astra allow|deny | doctor',
    })
    const profile = await resolveProfile($, optionProfile)
    $.ui.status(`omni:${profile}`)
    return next(e)
  })

  // Temporary status text until Task 4 replaces it with the real /omni handler.
  on('command.run', { command: 'omni' }, async $ => {
    const profile = await resolveProfile($, optionProfile)
    const { value: last } = await $.state.get(LAST_STEP)
    const { value: applied } = await $.state.get(APPLIED)
    const { value: verified } = await $.state.get(VERIFIED)
    const seen = last ? `${last.model}/${String(last.effort ?? 'default')}` : 'none'
    const set = applied ? `${applied.model}/${String(applied.effort ?? 'default')}` : 'none'
    const checked = verified ? verified.model : 'none'
    return { text: `OmniClaude mod loaded. Profile: ${profile}. Last main-loop step: ${seen}. applied: ${set}. verified: ${checked}.` }
  })

  on('turn.step', async function* ($, e, next) {
    // Subagent steps keep the model their spawn chose; only the main loop is pinned.
    if (e.agentId !== undefined) return yield* next(e)
    const profile = await resolveProfile($, optionProfile)
    const target = await parentTarget($, profile)
    const applied: Applied = { model: target.model, effort: target.effort }
    const seen: LastStep = e.effort === undefined ? { model: e.model } : { model: e.model, effort: e.effort }
    await $.state.set(LAST_STEP, seen)
    await $.state.set(APPLIED, applied)
    $.ui.status(`omni:${profile} · ${target.model}/${target.effort}`)
    return yield* next({ ...e, model: target.model, effort: target.effort as 'low' | 'medium' | 'high' })
  })

  on('agent.spawn', async ($, e, next) => {
    if (e.fork || e.isTeammate || e.workflow) return next(e)
    const profile = await resolveProfile($, optionProfile)
    if (e.subagentType === ASTRA) {
      const { value: consent } = await $.state.get(ASTRA_CONSENT)
      if (!consent && profile !== 'max') return { deny: ASTRA_DENY }
    }
    // `agentModel` is undefined: the engine does not expose an agent's own frontmatter model.
    const model = spawnModel(spawnProfile(profile), e.subagentType, undefined, e.model)
    return model === undefined ? next(e) : next({ ...e, model })
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'omniclaude: its spawn guard failed; refusing to be safe' }))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.usage?.model) {
      const verified: Verified = { model: e.usage.model }
      await $.state.set(VERIFIED, verified)
      const { value: applied } = await $.state.get(APPLIED)
      const ok = applied && tierOf(applied.model) === tierOf(e.usage.model)
      const profile = await resolveProfile($, optionProfile)
      $.ui.status(`omni:${profile} · ${applied?.model ?? '?'}/${String(applied?.effort ?? '?')} ${ok ? '✓' : '≠ ' + e.usage.model}`)
    }
    return next(e)
  })
}
