import { test, expect, mock } from 'claude-code/testing'

// prompt.compose needs the engine's full input: next() refuses an argument missing any of these fields.
const COMPOSE = { promptModel: 'claude-opus-5-5', outputStyle: null, tools: [], traits: [], surfaces: [] }

// Bottom hooks for what the plugin raises on session.start, then start the session.
async function ready($: any, on: any, store: Record<string, unknown>): Promise<void> {
  mock.store(on, store)
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', async (_$: any, e: any) => ({ value: { command: e.name } }))
  on('session.version', async () => ({ value: { version: '2.1.295' } }))
  on('ui.status', async () => ({ value: undefined }))
  await $.session.start({ cwd: 'C:/CC/omniclaude', surface: null, isInteractive: false })
}

test('prompt.compose adds one session-scoped omniclaude:policy section', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'engine:base', text: 'base', scope: 'shared' }] }))
  await ready($, on, { profile: 'economy' })
  const composed = await $.prompt.compose(COMPOSE)
  const ours = composed.sections.filter((s: any) => s.id === 'omniclaude:policy')
  expect(ours.length).toBe(1)
  expect(ours[0].scope).toBe('session')
  expect(ours[0].text).toContain('omni:economy')
  expect(ours[0].text).toContain('omniclaude:terra-explorer')
  expect(ours[0].text).toContain('astra-expert')
  // the engine's own sections stay first and untouched
  expect(composed.sections[0].id).toBe('engine:base')
  expect(composed.sections[0].text).toBe('base')
})

test('the policy section follows the session override and stays short', async ($, on) => {
  on('prompt.compose', () => ({ sections: [] }))
  await ready($, on, { profile: 'economy' })
  await $.command.run({ command: 'omni', args: 'quality' })
  const composed = await $.prompt.compose(COMPOSE)
  const text: string = composed.sections.find((s: any) => s.id === 'omniclaude:policy').text
  expect(text).toContain('omni:quality')
  expect(text).not.toContain('omni:economy')
  expect(text.split(/\s+/).length).toBeLessThanOrEqual(180)
})
