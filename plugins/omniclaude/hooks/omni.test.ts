import { test, expect, mock } from 'claude-code/testing'
import { parseOmni } from './omni'

const ASTRA_DENY = 'astra-expert needs your agreement: run /omni astra allow'

// The test's `$` has no `state` noun: state is set through /omni commands and read back through their text.
async function omni($: any, args: string): Promise<string> {
  const ran = await $.command.run({ command: 'omni', args })
  // /omni never adds model context: its answer is text only.
  expect(ran.context).toBeUndefined()
  return ran.text
}

// Bottom hooks for everything the plugin raises on session.start and /omni, then start the session.
async function ready($: any, on: any, store: Record<string, unknown> = {}): Promise<string[]> {
  const statuses: string[] = []
  mock.store(on, store)
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', async (_$: any, e: any) => ({ value: { command: e.name } }))
  on('session.version', async () => ({ value: { version: '2.1.295' } }))
  on('ui.status', async (_$: any, e: any) => { statuses.push(String(e.text)); return { value: undefined } })
  await $.session.start({ cwd: 'C:/CC/omniclaude', surface: null, isInteractive: false })
  return statuses
}

test('parseOmni understands every form', async () => {
  expect(parseOmni('')).toEqual({ kind: 'status' })
  expect(parseOmni('status')).toEqual({ kind: 'status' })
  expect(parseOmni('balanced')).toEqual({ kind: 'set', profile: 'balanced' })
  expect(parseOmni('  Quality ')).toEqual({ kind: 'set', profile: 'quality' })
  expect(parseOmni('save max')).toEqual({ kind: 'save', profile: 'max' })
  expect(parseOmni('reset')).toEqual({ kind: 'reset' })
  expect(parseOmni('astra allow')).toEqual({ kind: 'astra', allow: true })
  expect(parseOmni('astra deny')).toEqual({ kind: 'astra', allow: false })
  expect(parseOmni('doctor')).toEqual({ kind: 'doctor' })
  expect(parseOmni('bogus')).toEqual({ kind: 'help' })
  expect(parseOmni('save bogus')).toEqual({ kind: 'help' })
  expect(parseOmni('economy extra')).toEqual({ kind: 'help' })
  expect(parseOmni('astra')).toEqual({ kind: 'help' })
})

test('/omni status reports saved, override, parent, applied, verified and consent', async ($, on) => {
  await ready($, on, { profile: 'quality' })
  const text = await omni($, 'status')
  expect(text).toContain('OmniClaude quality')
  expect(text).toContain('saved profile: quality')
  expect(text).toContain('session override: none')
  expect(text).toContain('requested parent: opus/high')
  expect(text).toContain('applied (last step): none yet')
  expect(text).toContain('verified (last turn, API-reported): none yet')
  expect(text).toContain('astra consent: no')
})

test('/omni with no arguments is /omni status', async ($, on) => {
  await ready($, on, {})
  const text = await omni($, '')
  expect(text).toContain('OmniClaude auto')
  expect(text).toContain('saved profile: none')
})

test('/omni <profile> sets a session override and /omni reset clears it', async ($, on) => {
  const statuses = await ready($, on, { profile: 'balanced' })
  const set = await omni($, 'economy')
  expect(set).toContain('OmniClaude economy')
  expect(set).toContain('session override: economy')
  expect(set).toContain('requested parent: sonnet/medium')
  // the override wins over the saved profile, which is left alone
  expect(set).toContain('saved profile: balanced')
  expect(statuses[statuses.length - 1]).toBe('omni:economy')
  const reset = await omni($, 'reset')
  expect(reset).toContain('OmniClaude balanced')
  expect(reset).toContain('session override: none')
  expect(statuses[statuses.length - 1]).toBe('omni:balanced')
})

test('a session override steers agent.spawn routing, and reset returns to the saved profile', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: `a${spawned.length}` } })
  await ready($, on, { profile: 'balanced' })
  const spawn = { prompt: 'do the thing', description: 'test', subagentType: 'Explore' }
  await omni($, 'economy')
  await $.agent.spawn(spawn)
  await omni($, 'reset')
  await $.agent.spawn(spawn)
  expect(spawned[0].model).toBe('haiku')
  expect(spawned[1].model).toBe('sonnet')
})

test('/omni save persists the profile without touching the session override', async ($, on) => {
  await ready($, on, {})
  expect(await omni($, 'status')).toContain('saved profile: none')
  const saved = await omni($, 'save quality')
  expect(saved).toContain('saved profile: quality')
  expect(saved).toContain('session override: none')
  expect(saved).toContain('saved quality for future sessions')
  // read back from a later, separate command: the store holds it
  const later = await omni($, 'status')
  expect(later).toContain('saved profile: quality')
  expect(later).toContain('OmniClaude quality')
})

test('/omni astra allow and deny set the consent', async ($, on) => {
  await ready($, on, {})
  expect(await omni($, 'astra allow')).toContain('astra consent: yes')
  expect(await omni($, 'astra deny')).toContain('astra consent: no')
})

test('/omni max sets consent and warns that Fable may bill usage credits', async ($, on) => {
  await ready($, on, {})
  const max = await omni($, 'max')
  expect(max).toContain('Fable')
  expect(max).toContain('usage credits')
  expect(max).toContain('requested parent: fable/high')
  expect(max).toContain('astra consent: yes')
  expect(await omni($, 'status')).toContain('astra consent: yes')
})

test('only /omni max carries the warning', async ($, on) => {
  await ready($, on, {})
  expect(await omni($, 'quality')).not.toContain('usage credits')
})

test('the status line warns when the session starts on max', async ($, on) => {
  const statuses = await ready($, on, { profile: 'max' })
  expect(statuses[statuses.length - 1]).toContain('may bill usage credits')
})

test('the status line stays short for the other profiles', async ($, on) => {
  const statuses = await ready($, on, { profile: 'quality' })
  expect(statuses[statuses.length - 1]).toBe('omni:quality')
})

test('astra-expert as a teammate is not denied under the max profile', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  await ready($, on, { profile: 'max' })
  const result: any = await $.agent.spawn({
    prompt: 'do the thing', description: 'test', subagentType: 'omniclaude:astra-expert', isTeammate: true,
  } as any)
  expect(result.deny).toBeUndefined()
  expect(spawned.length).toBe(1)
  expect(spawned[0].subagentType).toBe('omniclaude:astra-expert')
})

test('/omni astra allow lets a plain astra-expert spawn through under quality', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  await ready($, on, { profile: 'quality' })
  const spawn = { prompt: 'do the thing', description: 'test', subagentType: 'omniclaude:astra-expert' }
  const before: any = await $.agent.spawn(spawn)
  expect(before.deny).toBe(ASTRA_DENY)
  expect(spawned.length).toBe(0)
  await omni($, 'astra allow')
  const after: any = await $.agent.spawn(spawn)
  expect(after.deny).toBeUndefined()
  expect(spawned.length).toBe(1)
  // and deny takes it away again
  await omni($, 'astra deny')
  const again: any = await $.agent.spawn(spawn)
  expect(again.deny).toBe(ASTRA_DENY)
  expect(spawned.length).toBe(1)
})

test('/omni doctor names the hooks, the engine and the kill switches', async ($, on) => {
  await ready($, on, {})
  const text = await omni($, 'doctor')
  expect(text).toContain('turn.step')
  expect(text).toContain('agent.spawn')
  expect(text).toContain('engine')
  expect(text).toContain('2.1.295')
  expect(text).toContain('if /omni is missing in a session, the mod is off (--bare, --safe-mode, disableAllHooks, allowManagedModsOnly, remote switch, engine < 2.1.287)')
})

test('an unknown /omni argument prints help and changes nothing', async ($, on) => {
  await ready($, on, { profile: 'quality' })
  const help = await omni($, 'bogus')
  expect(help).toContain('/omni status | economy | balanced | quality | max | auto')
  expect(help).toContain('/omni save <profile> | reset | astra allow|deny | doctor')
  const text = await omni($, 'status')
  expect(text).toContain('session override: none')
  expect(text).toContain('astra consent: no')
})
