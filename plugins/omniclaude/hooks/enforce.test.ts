import { test, expect, mock } from 'claude-code/testing'

const STEP = (model: string, effort: 'low' | 'medium' | 'high' = 'medium', agentId?: string) =>
  ({ turnId: 't1', index: 0, model, effort, messageCount: 1, ...(agentId ? { agentId } : {}) })

const STEP_RESULT = (e: { turnId: string; index: number }) =>
  ({ turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null })

const SPAWN = (subagentType: string, model?: string) => ({
  prompt: 'do the thing', description: 'test', subagentType, ...(model ? { model } : {}),
})

// The test's `$` has no `state` noun: state is read back through the /omni status text.
async function status($: any): Promise<string> {
  const ran = await $.command.run({ command: 'omni', args: 'status' })
  expect(ran.context).toBeUndefined()
  return ran.text
}

// A step's hooks run only while its stream is read; the return value is the done value of next().
async function drain(stream: any): Promise<any> {
  let r = await stream.next()
  while (!r.done) r = await stream.next()
  return r.value
}

// Bottom hooks for everything the plugin raises on session.start, then start the session.
async function ready($: any, on: any, profile: string): Promise<string[]> {
  const statuses: string[] = []
  mock.store(on, { profile })
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', async (_$: any, e: any) => ({ value: { command: e.name } }))
  on('ui.status', async (_$: any, e: any) => { statuses.push(String(e.text)); return { value: undefined } })
  await $.session.start({ cwd: 'C:/CC/omniclaude', surface: null, isInteractive: false })
  return statuses
}

test('balanced pins the main loop to opus/medium', async ($, on) => {
  let sent: any = null
  on('turn.step', async function* (_$, e) { sent = e; return STEP_RESULT(e) })
  await ready($, on, 'balanced')
  await drain($.turn.step(STEP('claude-sonnet-5-5', 'high')))
  expect(sent.model).toBe('opus')
  expect(sent.effort).toBe('medium')
  const text = await status($)
  expect(text).toContain('Profile: balanced')
  expect(text).toContain('Last main-loop step: claude-sonnet-5-5/high')
  expect(text).toContain('applied: opus/medium')
  expect(text).toContain('verified: none')
})

test('economy pins the main loop to sonnet/medium and leaves subagent steps alone', async ($, on) => {
  const seen: any[] = []
  on('turn.step', async function* (_$, e) { seen.push(e); return STEP_RESULT(e) })
  await ready($, on, 'economy')
  await drain($.turn.step(STEP('claude-opus-5-5', 'high')))
  await drain($.turn.step(STEP('claude-haiku-5-5', 'low', 'agent-1')))
  expect(seen[0].model).toBe('sonnet')
  expect(seen[0].effort).toBe('medium')
  expect(seen[1].model).toBe('claude-haiku-5-5')
  expect(seen[1].effort).toBe('low')
  // the subagent step neither overwrote the main-loop record nor the applied target
  const text = await status($)
  expect(text).toContain('Last main-loop step: claude-opus-5-5/high')
  expect(text).toContain('applied: sonnet/medium')
})

test('agent.spawn routes Explore and general-purpose by profile', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: `a${spawned.length}` } })
  await ready($, on, 'economy')
  await $.agent.spawn(SPAWN('Explore'))
  await $.agent.spawn(SPAWN('general-purpose'))
  expect(spawned[0].model).toBe('haiku')
  expect(spawned[1].model).toBe('sonnet')
})

test('agent.spawn clamps a worker request above its tier', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  await ready($, on, 'balanced')
  await $.agent.spawn(SPAWN('omniclaude:luna-researcher', 'opus'))
  expect(spawned[0].model).toBe('haiku')
})

test('astra-expert is denied without consent', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  await ready($, on, 'quality')
  const denied: any = await $.agent.spawn(SPAWN('omniclaude:astra-expert'))
  expect(denied.deny).toBe('astra-expert needs your agreement: run /omni astra allow')
  expect(spawned.length).toBe(0)
})

test('astra-expert is allowed under the max profile (the explicit allow flag is Task 4)', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  await ready($, on, 'max')
  const allowed: any = await $.agent.spawn(SPAWN('omniclaude:astra-expert'))
  expect(allowed.deny).toBeUndefined()
  expect(spawned.length).toBe(1)
  expect(spawned[0].subagentType).toBe('omniclaude:astra-expert')
})

test('turn.complete records the verified model and flags a match in the status line', async ($, on) => {
  on('turn.step', async function* (_$, e) { return STEP_RESULT(e) })
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  const statuses = await ready($, on, 'balanced')
  expect(await status($)).toContain('verified: none')
  await drain($.turn.step(STEP('claude-sonnet-5-5', 'high')))
  await $.turn.complete({
    turnId: 't1', reason: 'answer', answer: 'ok', durationMs: 10, isAborted: false,
    usage: { model: 'claude-opus-5-5' } as any,
  })
  expect(await status($)).toContain('verified: claude-opus-5-5')
  expect(statuses[statuses.length - 1]).toContain('✓')
})

test('turn.complete flags a mismatch and ignores subagent turns', async ($, on) => {
  on('turn.step', async function* (_$, e) { return STEP_RESULT(e) })
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  const statuses = await ready($, on, 'balanced')
  await drain($.turn.step(STEP('claude-sonnet-5-5', 'high')))
  await $.turn.complete({
    turnId: 't1', agentId: 'agent-1', reason: 'answer', answer: 'sub', durationMs: 10, isAborted: false,
    usage: { model: 'claude-haiku-5-5' } as any,
  })
  expect(await status($)).toContain('verified: none')
  await $.turn.complete({
    turnId: 't1', reason: 'answer', answer: 'ok', durationMs: 10, isAborted: false,
    usage: { model: 'claude-sonnet-5-5' } as any,
  })
  expect(await status($)).toContain('verified: claude-sonnet-5-5')
  expect(statuses[statuses.length - 1]).toContain('≠ claude-sonnet-5-5')
})

const ASTRA_DENY = 'astra-expert needs your agreement: run /omni astra allow'

test('astra-expert spawned as a teammate is still denied without consent', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  await ready($, on, 'quality')
  const denied: any = await $.agent.spawn({ ...SPAWN('omniclaude:astra-expert'), isTeammate: true } as any)
  expect(denied.deny).toBe(ASTRA_DENY)
  expect(spawned.length).toBe(0)
})

test('astra-expert started by a workflow script is still denied without consent', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  await ready($, on, 'quality')
  const denied: any = await $.agent.spawn({ ...SPAWN('omniclaude:astra-expert'), workflow: { runId: 'wf_1', agentIndex: 1 } } as any)
  expect(denied.deny).toBe(ASTRA_DENY)
  expect(spawned.length).toBe(0)
})

test('a fork is passed through untouched', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  await ready($, on, 'economy')
  await $.agent.spawn({ ...SPAWN('fork'), fork: true } as any)
  expect(spawned.length).toBe(1)
  expect(spawned[0].model).toBeUndefined()
})

test('a teammate is passed through untouched', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  await ready($, on, 'economy')
  await $.agent.spawn({ ...SPAWN('general-purpose'), isTeammate: true } as any)
  expect(spawned.length).toBe(1)
  expect(spawned[0].model).toBeUndefined()
})

test('the spawn guard denies when the hook itself fails', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  // No mock.store and no session: $.store.get has no implementation, so resolveProfile throws inside the hook.
  const denied: any = await $.agent.spawn(SPAWN('general-purpose'))
  expect(denied.deny).toBe('omniclaude: its spawn guard failed; refusing to be safe')
  expect(spawned.length).toBe(0)
})

test('auto with no plan pins the main loop to opus/medium', async ($, on) => {
  let sent: any = null
  on('turn.step', async function* (_$, e) { sent = e; return STEP_RESULT(e) })
  await ready($, on, 'auto')
  await drain($.turn.step(STEP('claude-sonnet-5-5', 'low')))
  expect(sent.model).toBe('opus')
  expect(sent.effort).toBe('medium')
  expect(await status($)).toContain('Profile: auto')
})

test('a main-loop completion without usage clears the verified model', async ($, on) => {
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  await ready($, on, 'balanced')
  await $.turn.complete({
    turnId: 't1', reason: 'answer', answer: 'ok', durationMs: 10, isAborted: false,
    usage: { model: 'claude-opus-5-5' } as any,
  })
  expect(await status($)).toContain('verified: claude-opus-5-5')
  await $.turn.complete({ turnId: 't2', reason: 'error', answer: '', durationMs: 10, isAborted: false })
  expect(await status($)).toContain('verified: none')
})

test('a 1M-context main loop keeps its [1m] window on opus and sonnet', async ($, on) => {
  const seen: any[] = []
  on('turn.step', async function* (_$, e) { seen.push(e); return STEP_RESULT(e) })
  await ready($, on, 'balanced')
  await drain($.turn.step(STEP('claude-opus-5-5[1m]', 'high')))
  expect(seen[0].model).toBe('opus[1m]')
  expect(seen[0].effort).toBe('medium')
  expect(await status($)).toContain('applied: opus[1m]/medium')
})

test('a 1M-context main loop under economy gets sonnet[1m]', async ($, on) => {
  const seen: any[] = []
  on('turn.step', async function* (_$, e) { seen.push(e); return STEP_RESULT(e) })
  await ready($, on, 'economy')
  await drain($.turn.step(STEP('claude-opus-5-5[1m]', 'high')))
  expect(seen[0].model).toBe('sonnet[1m]')
})

test('fable has no [1m] alias: max sends the bare alias even from a 1M session', async ($, on) => {
  const seen: any[] = []
  on('turn.step', async function* (_$, e) { seen.push(e); return STEP_RESULT(e) })
  await ready($, on, 'max')
  await drain($.turn.step(STEP('claude-opus-5-5[1m]', 'high')))
  expect(seen[0].model).toBe('fable')
  expect(seen[0].effort).toBe('high')
})
