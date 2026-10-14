import type { Register, EngineInterface } from 'claude-code'
import type { LastClass, LastStep, Plan, Profile, Applied, Verified } from '../types'
import { PROFILES, TIER_RANK, decideAutoModel, planForClass, spawnModel, tierOf } from './policy'
import type { AutoClass, Effort, FixedProfile, Tier } from './policy'
import { HELP, MAX_WARNING, doctorText, formatStatus, isProfile, parseOmni } from './omni'
import type { OmniCommand } from './omni'

// Each state ref is its own const: the validator reads literal { plugin, key } refs from the file that uses them, not object members or imports.
const LAST_STEP = { plugin: 'omniclaude', key: 'lastStep' } as const
const PROFILE_OVERRIDE = { plugin: 'omniclaude', key: 'profileOverride' } as const
const PLAN = { plugin: 'omniclaude', key: 'plan' } as const
const ASTRA_CONSENT = { plugin: 'omniclaude', key: 'astraConsent' } as const
const ASTRA_CONSENT_FROM_MAX = { plugin: 'omniclaude', key: 'astraConsentFromMax' } as const
const APPLIED = { plugin: 'omniclaude', key: 'applied' } as const
const VERIFIED = { plugin: 'omniclaude', key: 'verified' } as const
const LAST_CLASS = { plugin: 'omniclaude', key: 'lastClass' } as const

const ASTRA = 'omniclaude:astra-expert'
const ASTRA_DENY = 'astra-expert needs your agreement: run /omni astra allow'
const MAX_STATUS = 'omni:max · Fable parent; astra-expert allowed — may bill usage credits'

/** The session override, else the saved profile, else the config option, else auto. */
export async function resolveProfile($: EngineInterface, optionProfile: unknown): Promise<Profile> {
  const { value: override } = await $.state.get(PROFILE_OVERRIDE)
  if (isProfile(override)) return override
  const saved = await $.store.get('profile')
  if (isProfile(saved)) return saved
  return isProfile(optionProfile) ? optionProfile : 'auto'
}

/** The fixed profile whose spawn table applies; auto borrows balanced's table. */
export function spawnProfile(profile: Profile): FixedProfile {
  return profile === 'auto' ? 'balanced' : profile
}

/** What the main loop should run on: the profile's parent, or auto's plan (balanced until classified). */
export async function parentTarget($: EngineInterface, profile: Profile): Promise<{ model: Tier; effort: Effort }> {
  if (profile !== 'auto') return PROFILES[profile].parent
  const { value: plan } = await $.state.get(PLAN)
  return plan ? { model: plan.model, effort: plan.effort } : PROFILES.balanced.parent
}

const AUTO_LABELS = ['trivial', 'routine', 'complex', 'critical'] as const

function isAutoClass(x: unknown): x is AutoClass {
  return typeof x === 'string' && (AUTO_LABELS as readonly string[]).includes(x)
}

/** The class the small model names for a prompt; `none` when it names none of the four labels, `error` when the request fails. */
export async function classifyPrompt($: EngineInterface, text: string): Promise<AutoClass | 'none' | 'error'> {
  try {
    const label = await $.model.classify(text.slice(0, 4000), AUTO_LABELS)
    return isAutoClass(label) ? label : 'none'
  } catch {
    return 'error'
  }
}

/** Tokens in the live context window. A reading that fails counts as 0: the cheap re-cache assumption, so auto may still upgrade. */
async function contextTokens($: EngineInterface): Promise<number> {
  try {
    return (await $.session.usage()).context.tokens ?? 0
  } catch {
    return 0
  }
}

/** Consent that `/omni max` gave goes away when the override leaves max; an explicit `/omni astra allow` stays. */
async function dropMaxConsent($: EngineInterface): Promise<void> {
  const { value: fromMax } = await $.state.get(ASTRA_CONSENT_FROM_MAX)
  if (!fromMax) return
  await $.state.set(ASTRA_CONSENT, false)
  await $.state.set(ASTRA_CONSENT_FROM_MAX, false)
}

async function statusText($: EngineInterface, optionProfile: unknown): Promise<string> {
  const saved = await $.store.get('profile')
  const { value: override } = await $.state.get(PROFILE_OVERRIDE)
  const { value: plan } = await $.state.get(PLAN)
  const { value: last } = await $.state.get(LAST_STEP)
  const { value: applied } = await $.state.get(APPLIED)
  const { value: verified } = await $.state.get(VERIFIED)
  const { value: lastClass } = await $.state.get(LAST_CLASS)
  const { value: consent } = await $.state.get(ASTRA_CONSENT)
  const effective = await resolveProfile($, optionProfile)
  return formatStatus({ effective, saved, optionProfile, override, plan, last, applied, verified, lastClass, consent: Boolean(consent) })
}

export async function runOmni($: EngineInterface, cmd: OmniCommand, ctx: { optionProfile: unknown; version: string }): Promise<string> {
  switch (cmd.kind) {
    case 'status':
      return statusText($, ctx.optionProfile)
    case 'set': {
      await $.state.set(PROFILE_OVERRIDE, cmd.profile)
      let note = ''
      if (cmd.profile === 'max') {
        // Only consent that max itself grants is tagged as max's; an earlier explicit allow stays explicit.
        const { value: consented } = await $.state.get(ASTRA_CONSENT)
        if (!consented) {
          await $.state.set(ASTRA_CONSENT, true)
          await $.state.set(ASTRA_CONSENT_FROM_MAX, true)
        }
        note = MAX_WARNING
      } else {
        await dropMaxConsent($)
      }
      return (await statusText($, ctx.optionProfile)) + note
    }
    case 'save':
      await $.store.set('profile', cmd.profile)
      return (await statusText($, ctx.optionProfile)) + `
  saved ${cmd.profile} for future sessions.`
    case 'reset':
      await $.state.set(PROFILE_OVERRIDE, null)
      await dropMaxConsent($)
      return statusText($, ctx.optionProfile)
    case 'astra':
      await $.state.set(ASTRA_CONSENT, cmd.allow)
      await $.state.set(ASTRA_CONSENT_FROM_MAX, false)
      return statusText($, ctx.optionProfile)
    case 'doctor':
      return doctorText(ctx.version)
    case 'help':
      return HELP
  }
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
    $.ui.status(profile === 'max' ? MAX_STATUS : `omni:${profile}`)
    return next(e)
  })

  on('command.run', { command: 'omni' }, async ($, e) => {
    const version = (await $.session.version()).version
    const text = await runOmni($, parseOmni(e.args), { optionProfile, version })
    const profile = await resolveProfile($, optionProfile)
    $.ui.status(`omni:${profile}`)
    return { text }
  })

  on('prompt.submit', async ($, e, next) => {
    // Only the person's own prompt is classified; a notification, a peer or another plugin's prompt leaves the plan alone.
    if (e.origin.kind !== 'composer') return next(e)
    if ((await resolveProfile($, optionProfile)) !== 'auto') return next(e)
    const klass = await classifyPrompt($, e.text)
    if (klass === 'none' || klass === 'error') {
      const missed: LastClass = { label: klass, reason: klass === 'none' ? 'classifier gave no label; plan kept' : 'classifier request failed; plan kept' }
      await $.state.set(LAST_CLASS, missed)
      $.ui.status('omni:auto · classifier gave no label; plan kept')
      return next(e)
    }
    const wish = planForClass(klass)
    const { value: previous } = await $.state.get(PLAN)
    const { value: applied } = await $.state.get(APPLIED)
    // The model the engine last ran on is the one whose cache is warm; the plan's only stands in before any step ran.
    const current = (applied ? tierOf(applied.model) : undefined) ?? previous?.model ?? null
    const decided = decideAutoModel(current, wish.model, await contextTokens($))
    // A model held back to keep the cache makes up for it with high effort.
    const keptForCache = TIER_RANK[wish.model] > TIER_RANK[decided.model]
    const plan: Plan = { model: decided.model, effort: keptForCache ? 'high' : wish.effort, source: 'auto', reason: `${klass}: ${decided.reason}` }
    await $.state.set(PLAN, plan)
    await $.state.set(LAST_CLASS, { label: klass, reason: decided.reason })
    $.ui.status(`omni:auto · ${klass} → ${plan.model}/${plan.effort}`)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // Subagent steps keep the model their spawn chose; only the main loop is pinned.
    if (e.agentId !== undefined) return yield* next(e)
    const profile = await resolveProfile($, optionProfile)
    const target = await parentTarget($, profile)
    // A 1M-context session keeps its window: `opus[1m]` / `sonnet[1m]` exist; haiku and fable have no such alias.
    const keepsWindow = e.model.trim().toLowerCase().endsWith('[1m]') && (target.model === 'opus' || target.model === 'sonnet')
    const sendModel = keepsWindow ? `${target.model}[1m]` : target.model
    const applied: Applied = { model: sendModel, effort: target.effort }
    const seen: LastStep = e.effort === undefined ? { model: e.model } : { model: e.model, effort: e.effort }
    await $.state.set(LAST_STEP, seen)
    await $.state.set(APPLIED, applied)
    const { value: lastClass } = await $.state.get(LAST_CLASS)
    const classed = profile === 'auto' && isAutoClass(lastClass?.label) ? `${lastClass?.label} → ` : ''
    $.ui.status(`omni:${profile} · ${classed}${sendModel}/${target.effort}`)
    return yield* next({ ...e, model: sendModel, effort: target.effort })
  })

  on('agent.spawn', async ($, e, next) => {
    // The consent gate comes first: a teammate or workflow agent of this type must not slip past it (a fork's type is `fork`).
    if (e.subagentType === ASTRA) {
      const profile = await resolveProfile($, optionProfile)
      const { value: consent } = await $.state.get(ASTRA_CONSENT)
      if (!consent && profile !== 'max') return { deny: ASTRA_DENY }
    }
    if (e.fork || e.isTeammate || e.workflow) return next(e)
    const profile = await resolveProfile($, optionProfile)
    // `agentModel` is undefined: the engine does not expose an agent's own frontmatter model.
    const model = spawnModel(spawnProfile(profile), e.subagentType, undefined, e.model)
    return model === undefined ? next(e) : next({ ...e, model })
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'omniclaude: its spawn guard failed; refusing to be safe' }))

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const profile = await resolveProfile($, optionProfile)
    const text = [
      `OmniClaude routing (omni:${profile}) is enforced by a plugin hook: your model and effort are set by the profile; subagents run on the profile's tiers.`,
      `Delegate read-heavy work: use omniclaude:terra-explorer for codebase mapping and omniclaude:luna-researcher for docs/search, instead of reading many files yourself. Use omniclaude:terra-implementer for bounded implementation. Keep tiny single-file work in this conversation.`,
      `omniclaude:astra-expert runs only after the user agrees (/omni astra allow). For details load the omniclaude:routing skill.`,
    ].join(' ')
    return { sections: [...composed.sections, { id: 'omniclaude:policy', text, scope: 'session' }] }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const usedModel = e.usage?.model
      if (!usedModel) {
        // A main-loop turn with no usage (aborted, API error) verified nothing: never leave the previous turn's model standing.
        await $.state.set(VERIFIED, null)
      } else {
        const verified: Verified = { model: usedModel }
        await $.state.set(VERIFIED, verified)
        const { value: applied } = await $.state.get(APPLIED)
        const ok = applied && tierOf(applied.model) === tierOf(usedModel)
        const profile = await resolveProfile($, optionProfile)
        $.ui.status(`omni:${profile} · ${applied?.model ?? '?'}/${String(applied?.effort ?? '?')} ${ok ? '✓' : '≠ ' + usedModel}`)
      }
    }
    return next(e)
  })
}
