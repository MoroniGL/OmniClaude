import type { Applied, LastClass, LastSpawn, LastStep, Plan, Profile, Verified } from '../types'
import { PROFILES } from './policy'

// Pure helpers only. The engine's `$` is followed only into functions declared in the same file as the call
// (never across an import), and a state ref must be a literal const of the file that reads it, so every
// `$` and `$.state` use lives in register.ts; this file parses commands and formats text.

/** The mod's release version; a Python test keeps it equal to the repository's VERSION file. */
export const MOD_VERSION = '0.2.0-alpha.1'

export type OmniCommand =
  | { kind: 'status' }
  | { kind: 'set'; profile: Profile }
  | { kind: 'save'; profile: Profile }
  | { kind: 'reset' }
  | { kind: 'astra'; allow: boolean }
  | { kind: 'doctor' }
  | { kind: 'help' }

const PROFILE_NAMES: readonly Profile[] = ['auto', 'economy', 'balanced', 'quality', 'max']

export function isProfile(x: unknown): x is Profile {
  return typeof x === 'string' && (PROFILE_NAMES as readonly string[]).includes(x)
}

export function parseOmni(args: string): OmniCommand {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0 || words[0] === 'status') return { kind: 'status' }
  if (words.length === 1 && isProfile(words[0])) return { kind: 'set', profile: words[0] }
  if (words[0] === 'save' && words.length === 2 && isProfile(words[1])) return { kind: 'save', profile: words[1] }
  if (words[0] === 'reset' && words.length === 1) return { kind: 'reset' }
  if (words[0] === 'astra' && words.length === 2 && (words[1] === 'allow' || words[1] === 'deny')) return { kind: 'astra', allow: words[1] === 'allow' }
  if (words[0] === 'doctor' && words.length === 1) return { kind: 'doctor' }
  return { kind: 'help' }
}

export const HELP = [
  'OmniClaude: /omni status | economy | balanced | quality | max | auto',
  '            /omni save <profile> | reset | astra allow|deny | doctor',
].join('\n')

const MAX_WARNING_HEAD = '\n  warning: max runs the parent on Fable and allows astra-expert;'
export const MAX_WARNING = `${MAX_WARNING_HEAD} Fable may bill usage credits on some plans. This consent is cleared when you leave max.`
/** Entering max when an explicit `/omni astra allow` is already on: max did not grant it, so leaving max will not clear it. */
export const MAX_WARNING_KEPT = `${MAX_WARNING_HEAD} Fable may bill usage credits on some plans; your earlier /omni astra allow stays in force.`

export const MAX_STATUS = 'omni:max · Fable parent; astra-expert allowed — may bill usage credits'
const MAX_STATUS_NO_ASTRA = 'omni:max · Fable parent — may bill usage credits; astra-expert needs /omni astra allow'

/** The short badge `/omni` and session.start draw; max says whether astra-expert is allowed right now. */
export function badge(profile: Profile, consent: boolean): string {
  if (profile !== 'max') return `omni:${profile}`
  return consent ? MAX_STATUS : MAX_STATUS_NO_ASTRA
}

/** The `/omni save` suffix: the saved profile applies now only when no session override stands in front of it. */
export function saveNote(profile: Profile, override: unknown): string {
  return isProfile(override)
    ? `\n  saved ${profile} for future sessions (the session override ${override} stays until /omni reset).`
    : `\n  saved ${profile}: applies now (no session override) and in future sessions.`
}

/** The session-scoped system-prompt section: what the hooks route, what they do not, and when to delegate. */
export function policySection(profile: Profile): string {
  return [
    `OmniClaude (omni:${profile}) is active: a plugin hook sets this conversation's model and effort from the profile and routes Explore, Plan, general-purpose and other non-OmniClaude subagents to its tiers;`,
    'OmniClaude workers (omniclaude:luna-researcher, omniclaude:terra-explorer, omniclaude:terra-implementer, omniclaude:sol-*) keep their own tiers; forks, teammates and workflow agents are not routed.',
    'Prefer omniclaude:terra-explorer for codebase mapping and omniclaude:luna-researcher for docs/search instead of reading many files yourself; use omniclaude:terra-implementer for bounded implementation; keep tiny single-file work here.',
    'omniclaude:astra-expert is refused until the user agrees (/omni astra allow, or the max profile). Details: the omniclaude:routing skill.',
  ].join(' ')
}

/** A profile named by an environment variable (OMNICLAUDE_PROFILE, or EVAL_OMNICLAUDE_PROFILE in a `plugin eval` child). */
export type EnvProfile = { name: string; profile: Profile }

/** What `/omni status` shows, read from the store and the plugin state by the caller. */
export type StatusView = {
  effective: Profile
  saved: unknown
  optionProfile: unknown
  override: unknown
  env: EnvProfile | undefined
  plan: Plan | null | undefined
  last: LastStep | null | undefined
  applied: Applied | null | undefined
  verified: Verified | null | undefined
  lastClass: LastClass | null | undefined
  lastSpawn: LastSpawn | null | undefined
  consent: boolean
  consentFromMax: boolean
}

export function formatStatus(v: StatusView): string {
  const parent = v.effective === 'auto'
    ? (v.plan ? `${v.plan.model}/${v.plan.effort} (auto: ${v.plan.reason})` : 'opus/medium (auto, not classified yet)')
    : `${PROFILES[v.effective].parent.model}/${PROFILES[v.effective].parent.effort}`
  // The environment applies only when neither a session override nor a saved profile stands in front of it.
  const fromEnv = v.env && !isProfile(v.override) && !isProfile(v.saved) ? ` (env ${v.env.name}: ${v.env.profile})` : ''
  return [
    `OmniClaude ${v.effective}${fromEnv}`,
    `  saved profile: ${isProfile(v.saved) ? v.saved : 'none'}${isProfile(v.optionProfile) ? ` (config option: ${v.optionProfile})` : ''}`,
    `  session override: ${isProfile(v.override) ? v.override : 'none'}`,
    `  requested parent: ${parent}`,
    `  auto classifier (last prompt): ${v.lastClass ? `${v.lastClass.label} — ${v.lastClass.reason}` : 'none yet'}`,
    `  engine requested (last step): ${v.last ? `${v.last.model}/${String(v.last.effort ?? 'default')}` : 'none yet'}`,
    `  applied (last step): ${v.applied ? `${v.applied.model}/${String(v.applied.effort ?? 'default')}` : 'none yet'}`,
    `  verified (last turn, API-reported): ${v.verified ? v.verified.model : 'none yet'}`,
    `  last spawn: ${v.lastSpawn ? `${v.lastSpawn.subagentType} → ${v.lastSpawn.model ?? 'unchanged'}` : 'none yet'}`,
    `  astra consent: ${v.consent ? (v.consentFromMax ? 'yes (set by max)' : 'yes') : 'no'}`,
    `  mod version: ${MOD_VERSION}`,
  ].join('\n')
}

export function doctorText(version: string): string {
  return [
    'OmniClaude doctor',
    `  engine: ${version}`,
    '  hooks: session.start, command.run, prompt.submit (auto classifier), turn.step (main loop model/effort), agent.spawn (tiers, astra consent), prompt.compose (policy section), turn.complete (verified)',
    '  if /omni is missing in a session, the mod is off (--bare, --safe-mode, disableAllHooks, allowManagedModsOnly, remote switch, engine < 2.1.287); Stage 1 skill and agents still work.',
  ].join('\n')
}
