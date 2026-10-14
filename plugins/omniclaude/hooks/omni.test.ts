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
async function ready($: any, on: any, store: Record<string, unknown> = {}, env?: Record<string, string>): Promise<string[]> {
  const statuses: string[] = []
  mock.store(on, store)
  if (env) mock.env(on, env)
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
  expect(text).toContain('mod version: 0.2.0-alpha.1')
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
  expect(spawned[0].model).toBe('claude-haiku-5-5')
  expect(spawned[1].model).toBe('claude-sonnet-5-5')
})

test('/omni save persists the profile without touching the session override', async ($, on) => {
  await ready($, on, {})
  expect(await omni($, 'status')).toContain('saved profile: none')
  const saved = await omni($, 'save quality')
  expect(saved).toContain('saved profile: quality')
  expect(saved).toContain('session override: none')
  expect(saved).toContain('saved quality: applies now (no session override) and in future sessions.')
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

test('consent set by /omni max is cleared when you leave max', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  await ready($, on, {})
  expect(await omni($, 'max')).toContain('This consent is cleared when you leave max.')
  expect(await omni($, 'economy')).toContain('astra consent: no')
  expect(await omni($, 'status')).toContain('astra consent: no')
  // the spawn gate follows: a plain astra-expert spawn is denied again outside max
  const denied: any = await $.agent.spawn({ prompt: 'p', description: 'd', subagentType: 'omniclaude:astra-expert' })
  expect(denied.deny).toBe(ASTRA_DENY)
  expect(spawned.length).toBe(0)
})

test('/omni reset also clears consent that /omni max set', async ($, on) => {
  await ready($, on, {})
  expect(await omni($, 'max')).toContain('astra consent: yes')
  expect(await omni($, 'reset')).toContain('astra consent: no')
})

test('explicit /omni astra allow survives leaving max', async ($, on) => {
  await ready($, on, {})
  await omni($, 'astra allow')
  await omni($, 'max')
  expect(await omni($, 'economy')).toContain('astra consent: yes')
  // /omni max did not take over the explicit allow, so reset keeps it too
  await omni($, 'max')
  expect(await omni($, 'reset')).toContain('astra consent: yes')
})

test('an /omni astra allow given while on max makes the consent explicit', async ($, on) => {
  await ready($, on, {})
  await omni($, 'max')
  await omni($, 'astra allow')
  expect(await omni($, 'quality')).toContain('astra consent: yes')
})

test('under max the status says the consent was set by max, and /omni astra deny takes it away', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  const statuses = await ready($, on, {})
  expect(await omni($, 'max')).toContain('astra consent: yes (set by max)')
  expect(await omni($, 'astra deny')).toContain('astra consent: no')
  // the badge no longer says astra-expert is allowed
  expect(statuses[statuses.length - 1]).not.toContain('astra-expert allowed')
  expect(await omni($, 'status')).toContain('astra consent: no')
  // the gate reads only the flag: denied even under max
  const denied: any = await $.agent.spawn({ prompt: 'p', description: 'd', subagentType: 'omniclaude:astra-expert' })
  expect(denied.deny).toBe(ASTRA_DENY)
  expect(spawned.length).toBe(0)
  expect(await omni($, 'astra allow')).toContain('astra consent: yes')
})

test('a session that starts on max has the consent set by max', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  await ready($, on, { profile: 'max' })
  expect(await omni($, 'status')).toContain('astra consent: yes (set by max)')
  const allowed: any = await $.agent.spawn({ prompt: 'p', description: 'd', subagentType: 'omniclaude:astra-expert' })
  expect(allowed.deny).toBeUndefined()
  expect(spawned.length).toBe(1)
})

test('/omni save <p> with no session override applies now', async ($, on) => {
  const statuses = await ready($, on, {})
  const saved = await omni($, 'save max')
  expect(saved).toContain('OmniClaude max')
  expect(saved).toContain('saved max: applies now (no session override) and in future sessions.')
  expect(saved).toContain('This consent is cleared when you leave max.')
  expect(saved).toContain('astra consent: yes (set by max)')
  expect(statuses[statuses.length - 1]).toBe('omni:max · Fable parent; astra-expert allowed — may bill usage credits')
  // leaving max by saving another profile takes the consent max set back
  expect(await omni($, 'save quality')).toContain('astra consent: no')
})

test('/omni save <p> under a session override keeps the override', async ($, on) => {
  await ready($, on, {})
  await omni($, 'economy')
  const saved = await omni($, 'save quality')
  expect(saved).toContain('OmniClaude economy')
  expect(saved).toContain('saved quality for future sessions (the session override economy stays until /omni reset).')
  expect(saved).not.toContain('applies now')
})

test('/omni max after an explicit allow says the allow stays in force', async ($, on) => {
  await ready($, on, {})
  await omni($, 'astra allow')
  const max = await omni($, 'max')
  expect(max).toContain(' Fable may bill usage credits on some plans; your earlier /omni astra allow stays in force.')
  expect(max).not.toContain('This consent is cleared when you leave max.')
  expect(max).toContain('astra consent: yes')
  expect(max).not.toContain('set by max')
})

test('a config option is used when nothing is saved', { options: { profile: 'quality' } }, async ($, on) => {
  await ready($, on, {})
  const text = await omni($, 'status')
  expect(text).toContain('OmniClaude quality')
  expect(text).toContain('(config option: quality)')
})

test('the saved profile wins over the config option', { options: { profile: 'quality' } }, async ($, on) => {
  await ready($, on, { profile: 'economy' })
  expect(await omni($, 'status')).toContain('OmniClaude economy')
})

test('OMNICLAUDE_PROFILE picks the profile over the config option, and the store wins over it', { options: { profile: 'quality' } }, async ($, on) => {
  await ready($, on, {}, { OMNICLAUDE_PROFILE: 'economy' })
  const text = await omni($, 'status')
  expect(text).toContain('OmniClaude economy (env OMNICLAUDE_PROFILE: economy)')
  await omni($, 'save balanced')
  const saved = await omni($, 'status')
  expect(saved).toContain('OmniClaude balanced')
  expect(saved).not.toContain('(env ')
})

test('EVAL_OMNICLAUDE_PROFILE works the same way for plugin eval runs', { options: { profile: 'quality' } }, async ($, on) => {
  await ready($, on, {}, { EVAL_OMNICLAUDE_PROFILE: 'balanced' })
  expect(await omni($, 'status')).toContain('OmniClaude balanced (env EVAL_OMNICLAUDE_PROFILE: balanced)')
})

test('an environment value that is not a profile is ignored', async ($, on) => {
  await ready($, on, {}, { OMNICLAUDE_PROFILE: 'turbo' })
  const text = await omni($, 'status')
  expect(text).toContain('OmniClaude auto')
  expect(text).not.toContain('(env ')
})

test('the store wins over the environment', async ($, on) => {
  await ready($, on, { profile: 'quality' }, { OMNICLAUDE_PROFILE: 'economy', EVAL_OMNICLAUDE_PROFILE: 'economy' })
  const text = await omni($, 'status')
  expect(text).toContain('OmniClaude quality')
  expect(text).not.toContain('(env ')
})

test('session.start registers the /omni command', async ($, on) => {
  const names: string[] = []
  mock.store(on, {})
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', async (_$: any, e: any) => { names.push(String(e.name)); return { value: { command: e.name } } })
  on('ui.status', async () => ({ value: undefined }))
  await $.session.start({ cwd: 'C:/CC/omniclaude', surface: null, isInteractive: false })
  expect(names).toContain('omni')
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
  expect(text).toContain('prompt.submit (auto classifier)')
  expect(text).toContain('prompt.compose (policy section)')
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

test('a failed read of OMNICLAUDE_PROFILE does not hide EVAL_OMNICLAUDE_PROFILE', async ($, on) => {
  // Our own env bottom (not mock.env): it refuses the first name and answers the second.
  on('env.get', async (_$: any, e: any) => {
    if (e.name === 'OMNICLAUDE_PROFILE') return { deny: 'x' }
    return { value: e.name === 'EVAL_OMNICLAUDE_PROFILE' ? 'economy' : undefined }
  })
  await ready($, on, {})
  expect(await omni($, 'status')).toContain('OmniClaude economy (env EVAL_OMNICLAUDE_PROFILE: economy)')
})
