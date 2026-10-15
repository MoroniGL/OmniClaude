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

test('prompt.compose adds one session-scoped omniclaude:policy section, last', async ($, on) => {
  on('prompt.compose', () => ({
    sections: [
      { id: 'engine:base', text: 'base', scope: 'shared' },
      { id: 'engine:env', text: 'env', scope: 'session' },
    ],
  }))
  await ready($, on, { profile: 'economy' })
  const composed = await $.prompt.compose(COMPOSE)
  const ours = composed.sections.filter((s: any) => s.id === 'omniclaude:policy')
  expect(ours.length).toBe(1)
  expect(ours[0].scope).toBe('session')
  // the engine's own sections keep their order and text; ours comes last
  expect(composed.sections.map((s: any) => s.id)).toEqual(['engine:base', 'engine:env', 'omniclaude:policy'])
  expect(composed.sections[0].text).toBe('base')
  expect(composed.sections[1].text).toBe('env')
})

test('the policy section says what is routed and what is not', async ($, on) => {
  on('prompt.compose', () => ({ sections: [] }))
  await ready($, on, { profile: 'economy' })
  const composed = await $.prompt.compose(COMPOSE)
  const text: string = composed.sections.find((s: any) => s.id === 'omniclaude:policy').text
  expect(text).toContain('OmniClaude (omni:economy) is active')
  expect(text).toContain('keep their own tiers')
  expect(text).toContain('left alone')
  expect(text).toContain('clamped back')
  expect(text).toContain('forks, teammates and workflow agents are not routed')
  expect(text).toContain('omniclaude:sonnet-explorer')
  expect(text).toContain('omniclaude:haiku-researcher')
  expect(text).toContain('omniclaude:sonnet-implementer')
  expect(text).toContain('omniclaude:fable-expert is refused until the user agrees')
  expect(text).toContain('the omniclaude:routing skill')
  expect(text).not.toContain('enforced')
  expect(text).toBe(POLICY.replace('<profile>', 'economy'))
})

// The wording the final re-review fixed, verbatim.
const POLICY = "OmniClaude (omni:<profile>) is active: a plugin hook sets this conversation's model and effort from the profile and routes Explore, Plan, general-purpose and other plugins' subagents to its tiers (other engine built-ins are left alone); OmniClaude workers (omniclaude:haiku-researcher, omniclaude:sonnet-explorer, omniclaude:sonnet-implementer, omniclaude:opus-*) keep their own tiers (a higher request is clamped back except under max); forks, teammates and workflow agents are not routed. Prefer omniclaude:sonnet-explorer for codebase mapping and omniclaude:haiku-researcher for docs/search instead of reading many files yourself; use omniclaude:sonnet-implementer for bounded implementation; keep tiny single-file work here. omniclaude:fable-expert is refused until the user agrees (/omni fable allow, or the max profile). Details: the omniclaude:routing skill."

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
