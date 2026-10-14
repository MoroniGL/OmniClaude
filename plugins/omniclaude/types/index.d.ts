export type Profile = 'auto' | 'economy' | 'balanced' | 'quality' | 'max'
export type Effort = 'low' | 'medium' | 'high'
export type Tier = 'haiku' | 'sonnet' | 'opus' | 'fable'

export type LastStep = { model: string; effort?: string | number }
export type Plan = { model: Tier; effort: Effort; source: 'profile' | 'auto'; reason: string }
export type Applied = { model: string; effort?: string | number }
export type Verified = { model: string }

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
    }
  }
}
