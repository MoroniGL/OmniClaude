import { test, expect, mock } from 'claude-code/testing'

test('/omni reports the mod is loaded', async ($, on) => {
  mock.store(on, {})
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('ui.status', async () => ({ value: undefined }))
  await $.session.start({ cwd: 'C:/CC/omniclaude', surface: null, isInteractive: false })
  const ran = await $.command.run({ command: 'omni', args: 'status' })
  expect(ran.text).toContain('OmniClaude mod loaded')
  expect(ran.text).toContain('Profile: auto')
  expect(ran.context).toBeUndefined()
})

test('turn.step on the main loop records the step it saw', async ($, on) => {
  mock.store(on, {})
  on('ui.status', async () => ({ value: undefined }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
  })
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 1 })
  // A step's hooks run only while the stream is read; drain it before looking at state.
  for await (const _chunk of stream) {
    // no chunks expected from the bottom hook
  }
  // The test's `$` has no `state` noun: read the recorded step back through /omni status.
  const ran = await $.command.run({ command: 'omni', args: 'status' })
  expect(ran.text).toContain('claude-opus-5-5/medium')
})
