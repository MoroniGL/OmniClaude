export type Profile = 'auto' | 'economy' | 'balanced' | 'quality' | 'max'
export type Effort = 'low' | 'medium' | 'high'

export type LastStep = { model: string; effort?: string | number; agentId?: string }

declare module 'claude-code' {
  interface PluginState {
    omniclaude: {
      lastStep: LastStep | null
    }
  }
}
