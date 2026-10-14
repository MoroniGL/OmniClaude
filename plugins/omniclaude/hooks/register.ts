import type { Register, EngineInterface } from 'claude-code'
import type { LastClass, LastSpawn, LastStep, Plan, Profile, Applied, Verified } from '../types'
import {
  AUTO_LABELS, CLASSIFIER_TIMEOUT_MS, PROFILES, TIER_RANK, decideAutoModel, isAstraType, isAutoClass, mainLoopModel, missedClass,
  planForClass, routesSpawn, spawnModel, spawnProfile, tierOf,
} from './policy'
import type { AutoClass, ClassifierMiss, Effort, Tier } from './policy'
import { HELP, MAX_WARNING, MAX_WARNING_KEPT, badge, doctorText, formatStatus, isProfile, parseOmni, policySection, saveNote } from './omni'
import type { EnvProfile, OmniCommand } from './omni'

// Each state ref is its own const: the validator reads literal { plugin, key } refs from the file that uses them, not object members or imports.
const LAST_STEP = { plugin: 'omniclaude', key: 'lastStep' } as const
const PROFILE_OVERRIDE = { plugin: 'omniclaude', key: 'profileOverride' } as const
const PLAN = { plugin: 'omniclaude', key: 'plan' } as const
const ASTRA_CONSENT = { plugin: 'omniclaude', key: 'astraConsent' } as const
const ASTRA_CONSENT_FROM_MAX = { plugin: 'omniclaude', key: 'astraConsentFromMax' } as const
const APPLIED = { plugin: 'omniclaude', key: 'applied' } as const
const VERIFIED = { plugin: 'omniclaude', key: 'verified' } as const
const LAST_CLASS = { plugin: 'omniclaude', key: 'lastClass' } as const
const LAST_SPAWN = { plugin: 'omniclaude', key: 'lastSpawn' } as const

const ASTRA_DENY = 'astra-expert needs your agreement: run /omni astra allow'

/** OMNICLAUDE_PROFILE, else EVAL_OMNICLAUDE_PROFILE (what a `plugin eval` child inherits); a value that is no profile, or a read that fails, counts as unset. */
async function envProfile($: EngineInterface): Promise<EnvProfile | undefined> {
  try {
    const plain = await $.env.get('OMNICLAUDE_PROFILE')
    if (isProfile(plain)) return { name: 'OMNICLAUDE_PROFILE', profile: plain }
    const evalled = await $.env.get('EVAL_OMNICLAUDE_PROFILE')
    if (isProfile(evalled)) return { name: 'EVAL_OMNICLAUDE_PROFILE', profile: evalled }
  } catch {
    // no environment reading: fall through to the config option
  }
  return undefined
}

/**
 * The session override, else the saved profile, else the environment, else the config option, else auto.
 * The environment wins over the option because the engine always fills the option's manifest default (`auto`).
 */
export async function resolveProfile($: EngineInterface, optionProfile: unknown): Promise<Profile> {
  const { value: override } = await $.state.get(PROFILE_OVERRIDE)
  if (isProfile(override)) return override
  const saved = await $.store.get('profile')
  if (isProfile(saved)) return saved
  const env = await envProfile($)
  if (env) return env.profile
  return isProfile(optionProfile) ? optionProfile : 'auto'
}

/** What the main loop should run on: the profile's parent, or auto's plan (balanced until classified). */
export async function parentTarget($: EngineInterface, profile: Profile): Promise<{ model: Tier; effort: Effort }> {
  if (profile !== 'auto') return PROFILES[profile].parent
  const { value: plan } = await $.state.get(PLAN)
  return plan ? { model: plan.model, effort: plan.effort } : PROFILES.balanced.parent
}

const TIMED_OUT = Symbol('classifier timed out')

/** The class the small model names for a prompt: `none` for none of the four labels, `error` for a failed request, `timeout` after 2.5 s. */
export async function classifyPrompt($: EngineInterface, text: string): Promise<AutoClass | ClassifierMiss> {
  const stop = new AbortController()
  // An aborted wait (or a clock that fails) never settles, so only a real timeout can win the race.
  const late = $.clock.sleep(CLASSIFIER_TIMEOUT_MS, { signal: stop.signal }).then(() => TIMED_OUT, () => new Promise<never>(() => {}))
  try {
    const label = await Promise.race([$.model.classify(text.slice(0, 4000), AUTO_LABELS), late])
    if (label === TIMED_OUT) return 'timeout'
    return isAutoClass(label) ? label : 'none'
  } catch {
    return 'error'
  } finally {
    stop.abort()
  }
}

/** Tokens in the live context window: none reported counts as 0; a reading that fails counts as full, so the model is kept (with high effort). */
async function contextTokens($: EngineInterface): Promise<number> {
  try {
    return (await $.session.usage()).context.tokens ?? 0
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

/** A plan (and its class) made under another profile must not steer auto: both go when the effective profile changed. */
async function forgetPlanIfSwitched($: EngineInterface, before: Profile, optionProfile: unknown): Promise<void> {
  if ((await resolveProfile($, optionProfile)) === before) return
  await $.state.set(PLAN, null)
  await $.state.set(LAST_CLASS, null)
}

/** Consent that max gave goes away when the effective profile leaves max; an explicit `/omni astra allow` stays. */
async function dropMaxConsent($: EngineInterface): Promise<void> {
  const { value: fromMax } = await $.state.get(ASTRA_CONSENT_FROM_MAX)
  if (fromMax !== true) return
  await $.state.set(ASTRA_CONSENT, false)
  await $.state.set(ASTRA_CONSENT_FROM_MAX, false)
}

/** Max grants the astra consent, tagged as max's; an explicit allow already on stays explicit. Returns the warning to show. */
async function grantMaxConsent($: EngineInterface): Promise<string> {
  const { value: consent } = await $.state.get(ASTRA_CONSENT)
  const { value: fromMax } = await $.state.get(ASTRA_CONSENT_FROM_MAX)
  if (consent === true && fromMax !== true) return MAX_WARNING_KEPT
  await $.state.set(ASTRA_CONSENT, true)
  await $.state.set(ASTRA_CONSENT_FROM_MAX, true)
  return MAX_WARNING
}

/** After set/save/reset: entering max (or asking for it) grants its consent with a warning; any other profile takes max's consent back. */
async function afterSwitch($: EngineInterface, ctx: OmniContext, askedMax: boolean, note: string): Promise<string> {
  await forgetPlanIfSwitched($, ctx.before, ctx.optionProfile)
  const after = await resolveProfile($, ctx.optionProfile)
  let warning = ''
  if (after !== 'max') await dropMaxConsent($)
  else if (askedMax || ctx.before !== 'max') warning = await grantMaxConsent($)
  return (await statusText($, ctx.optionProfile)) + note + warning
}

async function statusText($: EngineInterface, optionProfile: unknown): Promise<string> {
  const saved = await $.store.get('profile')
  const { value: override } = await $.state.get(PROFILE_OVERRIDE)
  const { value: plan } = await $.state.get(PLAN)
  const { value: last } = await $.state.get(LAST_STEP)
  const { value: applied } = await $.state.get(APPLIED)
  const { value: verified } = await $.state.get(VERIFIED)
  const { value: lastClass } = await $.state.get(LAST_CLASS)
  const { value: lastSpawn } = await $.state.get(LAST_SPAWN)
  const { value: consent } = await $.state.get(ASTRA_CONSENT)
  const { value: fromMax } = await $.state.get(ASTRA_CONSENT_FROM_MAX)
  const effective = await resolveProfile($, optionProfile)
  const env = await envProfile($)
  return formatStatus({
    effective, saved, optionProfile, override, env, plan, last, applied, verified, lastClass, lastSpawn,
    consent: consent === true, consentFromMax: fromMax === true,
  })
}

type OmniContext = { optionProfile: unknown; version: string; before: Profile }

export async function runOmni($: EngineInterface, cmd: OmniCommand, ctx: OmniContext): Promise<string> {
  switch (cmd.kind) {
    case 'status':
      return statusText($, ctx.optionProfile)
    case 'set':
      await $.state.set(PROFILE_OVERRIDE, cmd.profile)
      return afterSwitch($, ctx, cmd.profile === 'max', '')
    case 'save': {
      const { value: override } = await $.state.get(PROFILE_OVERRIDE)
      await $.store.set('profile', cmd.profile)
      return afterSwitch($, ctx, false, saveNote(cmd.profile, override))
    }
    case 'reset':
      await $.state.set(PROFILE_OVERRIDE, null)
      return afterSwitch($, ctx, false, '')
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
    // A session that starts on max has max's consent, as /omni max gives it; the badge of any other profile ignores consent.
    if (profile === 'max') await grantMaxConsent($)
    $.ui.status(badge(profile, true))
    return next(e)
  })

  on('command.run', { command: 'omni' }, async ($, e) => {
    const version = (await $.session.version()).version
    const before = await resolveProfile($, optionProfile)
    const text = await runOmni($, parseOmni(e.args), { optionProfile, version, before })
    const { value: consent } = await $.state.get(ASTRA_CONSENT)
    $.ui.status(badge(await resolveProfile($, optionProfile), consent === true))
    return { text }
  })

  on('prompt.submit', async ($, e, next) => {
    // Only the person's own prompt is classified; a notification, a peer or another plugin's prompt leaves the plan alone.
    if (e.origin.kind !== 'composer') return next(e)
    if ((await resolveProfile($, optionProfile)) !== 'auto') return next(e)
    const klass = await classifyPrompt($, e.text)
    if (!isAutoClass(klass)) {
      const missed: LastClass = missedClass(klass)
      await $.state.set(LAST_CLASS, missed)
      $.ui.status(`omni:auto · ${missed.reason}`)
      return next(e)
    }
    const wish = planForClass(klass)
    const { value: previous } = await $.state.get(PLAN)
    const { value: applied } = await $.state.get(APPLIED)
    // The model auto last ran on is the one whose cache is warm; a fixed profile's step does not count, and the plan's model stands in before any auto step ran.
    const autoApplied = applied?.profile === 'auto' ? tierOf(applied.model) : undefined
    const current = autoApplied ?? previous?.model ?? null
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
    let profile = '?'
    let out = e
    try {
      const resolved = await resolveProfile($, optionProfile)
      profile = resolved
      const target = await parentTarget($, resolved)
      const model = mainLoopModel(e.model, target.model)
      const seen: LastStep = e.effort === undefined ? { model: e.model } : { model: e.model, effort: e.effort }
      const applied: Applied = { model, effort: target.effort, profile: resolved }
      await $.state.set(LAST_STEP, seen)
      await $.state.set(APPLIED, applied)
      const { value: lastClass } = await $.state.get(LAST_CLASS)
      const classed = resolved === 'auto' && isAutoClass(lastClass?.label) ? `${lastClass?.label} → ` : ''
      $.ui.status(`omni:${resolved} · ${classed}${model}/${target.effort}`)
      // Already on the tier and effort: send the step as it is; on the tier only: keep the engine's model id, set the effort.
      out = model === e.model && e.effort === target.effort ? e : { ...e, model, effort: target.effort }
    } catch {
      // The step must still run: unchanged, and the badge says the profile was not applied to it.
      $.ui.status(`omni:${profile} · not applied (hook error)`)
    }
    return yield* next(out)
  })

  on('agent.spawn', async ($, e, next) => {
    // The consent gate comes first and reads only the flag (max sets it): a teammate or workflow agent of this type must not slip past it (a fork's type is `fork`).
    if (isAstraType(e.subagentType)) {
      const { value: consent } = await $.state.get(ASTRA_CONSENT)
      if (consent !== true) return { deny: ASTRA_DENY }
    }
    let model: string | undefined
    if (!e.fork && !e.isTeammate && !e.workflow && routesSpawn(e.subagentType, e.provider?.plugin)) {
      // `agentModel` is undefined: the engine does not expose an agent's own frontmatter model.
      model = spawnModel(spawnProfile(await resolveProfile($, optionProfile)), e.subagentType, undefined, e.model)
    }
    const spawn: LastSpawn = { subagentType: e.subagentType, model: model ?? null }
    await $.state.set(LAST_SPAWN, spawn)
    return model === undefined ? next(e) : next({ ...e, model })
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'omniclaude: its spawn guard failed; refusing to be safe' }))

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const text = policySection(await resolveProfile($, optionProfile))
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
        // A check mark needs both tiers known and equal: two unknown models are no match.
        const appliedTier = applied ? tierOf(applied.model) : undefined
        const ok = appliedTier !== undefined && appliedTier === tierOf(usedModel)
        const profile = await resolveProfile($, optionProfile)
        $.ui.status(`omni:${profile} · ${applied?.model ?? '?'}/${String(applied?.effort ?? '?')} ${ok ? '✓' : '≠ ' + usedModel}`)
      }
    }
    return next(e)
  })
}
