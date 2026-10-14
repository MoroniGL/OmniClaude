import { test, expect, mock } from 'claude-code/testing'

// What the test's bottom hooks answer, changed between prompts: the classifier's reply and the context fill.
type Rig = {
  label: string | 'FAIL'
  tokens: number | 'FAIL'
  statuses: string[]
  classified: number
  classifyInputs: string[]
  submitted: string[]
}

const STEP = { turnId: 't1', index: 0, model: 'claude-sonnet-5-5', effort: 'medium' as const, messageCount: 1 }

// The plugin's $.model.classify raises the op event model.classify; the bottom answers { value: label } (or { deny } for a failed
// request, which rejects). A bottom on model.complete is not reached: the harness stands in for the engine at the classify op.
// The test's `$` has no state noun, so the plan is read back through /omni status.
async function ready($: any, on: any, store: Record<string, unknown> = { profile: 'auto' }): Promise<Rig> {
  const rig: Rig = { label: 'routine', tokens: 0, statuses: [], classified: 0, classifyInputs: [], submitted: [] }
  mock.store(on, store)
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', async (_$: any, e: any) => ({ value: { command: e.name } }))
  on('session.version', async () => ({ value: { version: '2.1.295' } }))
  on('ui.status', async (_$: any, e: any) => { rig.statuses.push(String(e.text)); return { value: undefined } })
  on('model.classify', async (_$: any, e: any) => {
    rig.classified += 1
    rig.classifyInputs.push(String(e.text))
    return rig.label === 'FAIL' ? { deny: 'classifier unavailable' } : { value: rig.label }
  })
  on('session.usage', async () => {
    if (rig.tokens === 'FAIL') return { deny: 'usage unavailable' }
    return { value: { startedAt: 0, context: { tokens: rig.tokens, window: 200_000 }, rateLimits: [] } }
  })
  on('prompt.submit', async (_$: any, e: any) => { rig.submitted.push(String(e.text)); return { text: e.text } })
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
  })
  await $.session.start({ cwd: 'C:/CC/omniclaude', surface: null, isInteractive: false })
  return rig
}

const SUBMIT = (text: string) => ({ text, origin: { kind: 'composer' } as const, wait: false })

// A main-loop step: the plugin applies the plan to it and redraws the badge.
async function step($: any): Promise<void> {
  const stream = $.turn.step(STEP)
  let r = await stream.next()
  while (!r.done) r = await stream.next()
}

async function status($: any): Promise<string> {
  const ran = await $.command.run({ command: 'omni', args: 'status' })
  return ran.text
}

async function parent($: any): Promise<string> {
  const ran = await $.command.run({ command: 'omni', args: 'status' })
  return ran.text.split('\n').find((l: string) => l.includes('requested parent:')) ?? ''
}

test('auto classifies a composer prompt and plans model/effort', async ($, on) => {
  const rig = await ready($, on)
  rig.label = 'critical'
  await $.prompt.submit(SUBMIT('redesign the auth token rotation across services'))
  // the badge is read before /omni, which redraws it
  expect(rig.statuses[rig.statuses.length - 1]).toBe('omni:auto · critical → opus/high')
  expect(await parent($)).toContain('requested parent: opus/high (auto: critical: first prompt)')
})

test('auto never downgrades the model mid-session but lowers effort', async ($, on) => {
  const rig = await ready($, on)
  rig.label = 'critical'
  await $.prompt.submit(SUBMIT('redesign the auth token rotation across services'))
  rig.label = 'trivial'
  await $.prompt.submit(SUBMIT('rename a variable'))
  expect(rig.statuses[rig.statuses.length - 1]).toBe('omni:auto · trivial → opus/low')
  const line = await parent($)
  expect(line).toContain('opus/low')
  expect(line).toContain('never downgraded mid-session')
})

test('auto leaves prompts that are not the composer\'s alone', async ($, on) => {
  const rig = await ready($, on)
  rig.label = 'critical'
  const before = rig.statuses.length
  await $.prompt.submit({ text: 'x', origin: { kind: 'plugin', name: 'other' } as any, wait: false })
  expect(rig.classified).toBe(0)
  expect(rig.statuses.length).toBe(before)
  expect(await parent($)).toContain('(auto, not classified yet)')
})

test('a fixed profile does not classify', async ($, on) => {
  const rig = await ready($, on, { profile: 'quality' })
  rig.label = 'critical'
  await $.prompt.submit(SUBMIT('anything'))
  expect(rig.classified).toBe(0)
  expect(await parent($)).toContain('requested parent: opus/high')
  expect(await parent($)).not.toContain('auto:')
})

test('a classifier that names no label keeps the previous plan and says so', async ($, on) => {
  const rig = await ready($, on)
  rig.label = 'routine'
  await $.prompt.submit(SUBMIT('add a unit test for parseOmni'))
  expect(await parent($)).toContain('requested parent: sonnet/medium (auto: routine: first prompt)')
  rig.label = 'banana'
  await $.prompt.submit(SUBMIT('anything'))
  expect(rig.statuses[rig.statuses.length - 1]).toBe('omni:auto · classifier gave no label; plan kept')
  expect(await parent($)).toContain('requested parent: sonnet/medium (auto: routine: first prompt)')
})

test('a classifier request that fails keeps the previous plan and says so', async ($, on) => {
  const rig = await ready($, on)
  rig.label = 'complex'
  await $.prompt.submit(SUBMIT('plan the migration'))
  rig.label = 'FAIL'
  await $.prompt.submit(SUBMIT('anything'))
  expect(rig.statuses[rig.statuses.length - 1]).toBe('omni:auto · classifier gave no label; plan kept')
  expect(await parent($)).toContain('requested parent: opus/medium (auto: complex: first prompt)')
})

test('a late upgrade to opus waits for a cheap re-cache and keeps the cache once the context is large', async ($, on) => {
  const rig = await ready($, on)
  rig.label = 'routine'
  await $.prompt.submit(SUBMIT('add a unit test for parseOmni'))
  rig.label = 'critical'
  rig.tokens = 100_000
  await $.prompt.submit(SUBMIT('redesign the auth token rotation across services'))
  // the model stays on sonnet to keep the cache; high effort makes up for it
  expect(rig.statuses[rig.statuses.length - 1]).toBe('omni:auto · critical → sonnet/high')
  const line = await parent($)
  expect(line).toContain('sonnet/high')
  expect(line).toContain('kept sonnet to preserve the cache')
})

test('auto upgrades the model while the context is small', async ($, on) => {
  const rig = await ready($, on)
  rig.label = 'routine'
  await $.prompt.submit(SUBMIT('add a unit test for parseOmni'))
  rig.label = 'critical'
  rig.tokens = 12_000
  await $.prompt.submit(SUBMIT('redesign the auth token rotation across services'))
  const line = await parent($)
  expect(line).toContain('opus/high')
  expect(line).toContain('upgraded (context 12000 < 40000)')
})

test('a context reading that fails counts as an empty context, so the upgrade goes ahead', async ($, on) => {
  const rig = await ready($, on)
  rig.label = 'routine'
  await $.prompt.submit(SUBMIT('add a unit test for parseOmni'))
  rig.label = 'critical'
  rig.tokens = 'FAIL'
  await $.prompt.submit(SUBMIT('redesign the auth token rotation across services'))
  const line = await parent($)
  expect(line).toContain('opus/high')
  expect(line).toContain('upgraded (context 0 < 40000)')
})

test('a model kept for the cache gets high effort, whatever the class asked for', async ($, on) => {
  const rig = await ready($, on)
  rig.label = 'routine'
  await $.prompt.submit(SUBMIT('add a unit test for parseOmni'))
  rig.label = 'complex'
  rig.tokens = 100_000
  await $.prompt.submit(SUBMIT('plan the migration across the services'))
  expect(rig.statuses[rig.statuses.length - 1]).toBe('omni:auto · complex → sonnet/high')
  expect(await parent($)).toContain('requested parent: sonnet/high (auto: complex: kept sonnet to preserve the cache)')
})

test('the classifier result outlives the badge: /omni status shows the last class', async ($, on) => {
  const rig = await ready($, on)
  expect(await status($)).toContain('auto classifier (last prompt): none yet')
  rig.label = 'trivial'
  await $.prompt.submit(SUBMIT('rename a variable'))
  expect(await status($)).toContain('auto classifier (last prompt): trivial — first prompt')
})

test('/omni status says when the classifier named no label', async ($, on) => {
  const rig = await ready($, on)
  rig.label = 'banana'
  await $.prompt.submit(SUBMIT('anything'))
  expect(await status($)).toContain('auto classifier (last prompt): none — classifier gave no label; plan kept')
})

test('/omni status says when the classifier request failed', async ($, on) => {
  const rig = await ready($, on)
  rig.label = 'FAIL'
  await $.prompt.submit(SUBMIT('anything'))
  expect(await status($)).toContain('auto classifier (last prompt): error — classifier request failed; plan kept')
})

test('the step badge names the class under auto, and drops it when the last attempt gave none', async ($, on) => {
  const rig = await ready($, on)
  rig.label = 'trivial'
  await $.prompt.submit(SUBMIT('rename a variable'))
  await step($)
  expect(rig.statuses[rig.statuses.length - 1]).toBe('omni:auto · trivial → sonnet/low')
  rig.label = 'banana'
  await $.prompt.submit(SUBMIT('anything'))
  await step($)
  expect(rig.statuses[rig.statuses.length - 1]).toBe('omni:auto · sonnet/low')
})

test('the current model is the one a step applied, even before any classification', async ($, on) => {
  const rig = await ready($, on)
  // no prompt was classified yet: the first step runs the balanced default, opus/medium
  await step($)
  rig.label = 'trivial'
  await $.prompt.submit(SUBMIT('rename a variable'))
  const line = await parent($)
  expect(line).toContain('opus/low')
  expect(line).toContain('never downgraded mid-session')
  expect(line).not.toContain('first prompt')
})

test('a long prompt is classified on its first 4000 characters and submitted whole', async ($, on) => {
  const rig = await ready($, on)
  const long = 'x'.repeat(5000)
  await $.prompt.submit(SUBMIT(long))
  expect(rig.classifyInputs[0].length).toBe(4000)
  expect(rig.submitted[0]).toBe(long)
})
