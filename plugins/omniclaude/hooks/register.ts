import type { Register } from 'claude-code'
import type { LastStep } from '../types'

const LAST_STEP = { plugin: 'omniclaude', key: 'lastStep' } as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'omni',
      description: 'OmniClaude: show or change the routing profile',
      argumentHint: 'status | economy | balanced | quality | max | auto',
    })
    $.ui.status('omni: loaded')
    return next(e)
  })

  on('command.run', { command: 'omni' }, async ($, e) => {
    const { value } = await $.state.get(LAST_STEP)
    const last = value ? `${value.model} / ${String(value.effort ?? 'default')}` : 'no step yet'
    return { text: `OmniClaude mod loaded. Last main-loop step: ${last}` }
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const seen: LastStep = { model: e.model, effort: e.effort, agentId: e.agentId }
      await $.state.set(LAST_STEP, seen)
      $.ui.status(`omni: step model=${e.model} effort=${String(e.effort ?? 'default')}`)
    }
    return yield* next(e)
  })
}
