export type Profile = 'auto' | 'economy' | 'balanced' | 'quality' | 'max'
export type Effort = 'low' | 'medium' | 'high'
export type Tier = 'haiku' | 'sonnet' | 'opus' | 'fable'

export type LastStep = { model: string; effort?: string | number }
export type Plan = { model: Tier; effort: Effort; source: 'profile' | 'auto'; reason: string }
// `profile` is the profile the step ran under: auto counts only its own steps as the model whose cache is warm.
export type Applied = { model: string; effort?: string | number; profile: Profile }
export type Verified = { model: string }
// The last subagent spawn the mod decided: `model` is the string it sent, or null when it passed the spawn through unchanged.
export type LastSpawn = { subagentType: string; model: string | null }
export type AutoClass = 'trivial' | 'routine' | 'complex' | 'critical'
// `label` is one of the four auto classes, `none` (the classifier named no label) or `error` (its request failed or timed out).
export type LastClass = { label: AutoClass | 'none' | 'error'; reason: string }

declare module 'claude-code' {
  interface PluginState {
    omniclaude: {
      lastStep: LastStep | null
      profileOverride: Profile | null
      plan: Plan | null
      astraConsent: boolean
      astraConsentFromMax: boolean
      applied: Applied | null
      verified: Verified | null
      lastClass: LastClass | null
      lastSpawn: LastSpawn | null
    }
  }
}
