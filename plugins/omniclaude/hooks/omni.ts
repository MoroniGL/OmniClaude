import type { Applied, LastStep, Plan, Profile, Verified } from '../types'
import { PROFILES } from './policy'

// Pure helpers only. The engine's `$` is followed only into functions declared in the same file as the call
// (never across an import), and a state ref must be a literal const of the file that reads it, so every
// `$` and `$.state` use lives in register.ts; this file parses commands and formats text.

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

export const MAX_WARNING = '\n  warning: max runs the parent on Fable and allows astra-expert; Fable may bill usage credits on some plans.'

/** What `/omni status` shows, read from the store and the plugin state by the caller. */
export type StatusView = {
  effective: Profile
  saved: unknown
  optionProfile: unknown
  override: unknown
  plan: Plan | null | undefined
  last: LastStep | null | undefined
  applied: Applied | null | undefined
  verified: Verified | null | undefined
  consent: boolean
}

export function formatStatus(v: StatusView): string {
  const parent = v.effective === 'auto'
    ? (v.plan ? `${v.plan.model}/${v.plan.effort} (auto: ${v.plan.reason})` : 'opus/medium (auto, not classified yet)')
    : `${PROFILES[v.effective].parent.model}/${PROFILES[v.effective].parent.effort}`
  return [
    `OmniClaude ${v.effective}`,
    `  saved profile: ${isProfile(v.saved) ? v.saved : 'none'}${isProfile(v.optionProfile) ? ` (config option: ${v.optionProfile})` : ''}`,
    `  session override: ${isProfile(v.override) ? v.override : 'none'}`,
    `  requested parent: ${parent}`,
    `  engine requested (last step): ${v.last ? `${v.last.model}/${String(v.last.effort ?? 'default')}` : 'none yet'}`,
    `  applied (last step): ${v.applied ? `${v.applied.model}/${String(v.applied.effort ?? 'default')}` : 'none yet'}`,
    `  verified (last turn, API-reported): ${v.verified ? v.verified.model : 'none yet'}`,
    `  astra consent: ${v.consent ? 'yes' : 'no'}`,
  ].join('\n')
}

export function doctorText(version: string): string {
  return [
    'OmniClaude doctor',
    `  engine: ${version}`,
    '  hooks: session.start, command.run, turn.step (main loop model/effort), agent.spawn (tiers, astra consent), turn.complete (verified)',
    '  if /omni is missing in a session, the mod is off (--bare, --safe-mode, disableAllHooks, allowManagedModsOnly, remote switch, engine < 2.1.287); Stage 1 skill and agents still work.',
  ].join('\n')
}
