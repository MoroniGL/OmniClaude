# OmniClaude Stage 2 (enforcing mod) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hooks module (a "mod") to the existing `omniclaude` plugin that enforces the active profile on every model request and every subagent spawn, provides `/omni` session control with zero model tokens, makes `omni:auto` an adaptive classifier, and records requested/applied/verified models.

**Architecture:** One TypeScript hooks module inside `plugins/omniclaude/hooks/`, split into `policy.ts` (pure decisions, fully unit-tested), `omni.ts` (`/omni` text and state), and `register.ts` (hook wiring). State lives in `$.state` (session) and `$.store` (saved profile). Hooks used: `session.start`, `command.run`, `turn.step` (streaming), `agent.spawn`, `prompt.submit`, `prompt.compose`, `turn.complete`. Tests run with `claude plugin test`; the Python asset tests keep guarding the declarative files.

**Tech Stack:** Claude Code 2.1.295 mod API (`claude-code` types, `claude-code/testing`), TypeScript, Python 3.11+ unittest for asset tests.

**Spec:** `docs/superpowers/specs/2026-10-14-omniclaude-stage2-mod-design.md`

## Global Constraints

- Engine floor: Claude Code 2.1.287 (mods); this machine runs 2.1.295. `claude` is not on PATH: `CLAUDE="$LOCALAPPDATA/Packages/Claude_pzs8sxrjxfjjc/LocalCache/Roaming/Claude/claude-code/2.1.295/d2e29494ec83/claude.exe"` (Git Bash). Run every command from `C:/CC/omniclaude`.
- The mod lives inside `plugins/omniclaude/` (one install). No second plugin, no `settings.json` writes, no `CLAUDE.md` edits, no Python runtime.
- Profiles and enforcement exactly as spec §3; `auto` exactly as spec §4 (classes `trivial|routine|complex|critical`; upgrade only below 40,000 context tokens; never downgrade mid-session).
- astra-expert denied until consent: reason text exactly `astra-expert needs your agreement: run /omni astra allow`.
- `/omni` answers with `{ text }` only — never `context`.
- Honesty: docs use "applied" for what the mod sent and "verified" only for `turn.complete.usage.model`. No savings claim beyond measured rows.
- Streaming hook form for `turn.step`: `on('turn.step', async function* ($, e, next) { return yield* next({ ...e, ... }) })`. Guarding hooks carry `.catch(($, e, next) => next.called ? next(e) : { deny: '...' })`.
- Relative imports between module files are assumed; Task 1 verifies with `claude plugin validate`. If refused, Task 1 collapses the files into `register.ts` under `// ---- policy ----` / `// ---- omni ----` section comments and every later task edits those sections instead of separate files.
- All new tests: `*.test.ts` under `plugins/omniclaude/hooks/`, run with `"$CLAUDE" plugin test plugins/omniclaude`. Python tests: `python -m unittest discover -s tests -v` must stay green (30+).
- Commit messages end with `Co-Authored-By: claude-flow <ruv@ruv.net>`. LF line endings. Branch: `stage2-mod` from `main`.
- Every live check on this machine happens in the desktop Code-tab session after `/reload-plugins` (the installed plugin is read from the repo folder).

---

## File Structure

```
plugins/omniclaude/.claude-plugin/plugin.json   add "types" and "userConfig.profile" (Task 1)
plugins/omniclaude/hooks/hooks.json             { "modules": ["./register.ts"] } (Task 1)
plugins/omniclaude/hooks/register.ts            hook wiring (Tasks 1,3,4,5,6)
plugins/omniclaude/hooks/policy.ts              pure decisions (Task 2)
plugins/omniclaude/hooks/omni.ts                /omni text + state helpers (Task 4)
plugins/omniclaude/hooks/policy.test.ts         (Task 2)
plugins/omniclaude/hooks/enforce.test.ts        (Task 3)
plugins/omniclaude/hooks/omni.test.ts           (Tasks 1,4)
plugins/omniclaude/hooks/compose.test.ts        (Task 5)
plugins/omniclaude/hooks/auto.test.ts           (Task 6)
plugins/omniclaude/types/index.d.ts             PluginState contract (Task 1, extended 4,6)
tests/test_mod.py                               Python asset test for hooks.json/manifest (Task 1)
docs/profiles.md, README.md, CHANGELOG.md, docs/local-validation.md, VERSION (Task 7)
```

---

### Task 1: Mod skeleton that loads, registers `/omni status`, and reveals `turn.step` fields

**Files:**
- Create: `plugins/omniclaude/hooks/hooks.json`, `plugins/omniclaude/hooks/register.ts`, `plugins/omniclaude/types/index.d.ts`, `plugins/omniclaude/hooks/omni.test.ts`
- Modify: `plugins/omniclaude/.claude-plugin/plugin.json`
- Create: `tests/test_mod.py`

**Interfaces:**
- Produces: `PluginState['omniclaude']` keys `lastStep: { model: string; effort?: string; agentId?: string } | null` (later tasks add more keys).
- Produces: the `/omni` command name `omni` and the status text prefix `OmniClaude`.

- [ ] **Step 1: Create the branch and write the failing Python test**

```bash
git checkout -b stage2-mod main
```

`tests/test_mod.py`:

```python
"""Mod packaging invariants: the hooks module is declared and typed."""

from __future__ import annotations

import json
import unittest

from tests.frontmatter import PLUGIN


class ModTests(unittest.TestCase):
    def test_hooks_module_declared(self) -> None:
        hooks = json.loads((PLUGIN / "hooks" / "hooks.json").read_text(encoding="utf-8"))
        self.assertEqual(hooks, {"modules": ["./register.ts"]})
        self.assertTrue((PLUGIN / "hooks" / "register.ts").is_file())

    def test_manifest_declares_types_and_profile_option(self) -> None:
        manifest = json.loads((PLUGIN / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["types"], "./types/index.d.ts")
        self.assertTrue((PLUGIN / "types" / "index.d.ts").is_file())
        profile = manifest["userConfig"]["profile"]
        self.assertEqual(profile["type"], "string")
        self.assertEqual(profile["default"], "auto")
        self.assertEqual(profile["options"], ["auto", "economy", "balanced", "quality", "max"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m unittest tests.test_mod -v`
Expected: ERROR, `FileNotFoundError` for `hooks/hooks.json`.

- [ ] **Step 3: Write the manifest changes, hooks.json, types, and the skeleton module**

Edit `plugins/omniclaude/.claude-plugin/plugin.json` — add two keys after `"license": "MIT",`:

```json
  "types": "./types/index.d.ts",
  "userConfig": {
    "profile": {
      "type": "string",
      "description": "OmniClaude saved profile (/omni save overrides it)",
      "default": "auto",
      "options": ["auto", "economy", "balanced", "quality", "max"]
    }
  },
```

`plugins/omniclaude/hooks/hooks.json`:

```json
{ "modules": ["./register.ts"] }
```

`plugins/omniclaude/types/index.d.ts`:

```ts
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
```

`plugins/omniclaude/hooks/register.ts`:

```ts
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
```

- [ ] **Step 4: Write the first mod test**

`plugins/omniclaude/hooks/omni.test.ts`:

```ts
import { test, expect } from 'claude-code/testing'

test('/omni reports the mod is loaded', async ($, on) => {
  await $.session.start({ cwd: 'C:/CC/omniclaude', surface: null, isInteractive: false })
  const ran = await $.command.run({ command: 'omni', args: 'status' })
  expect(ran.text).toContain('OmniClaude mod loaded')
  expect(ran.context).toBeUndefined()
})

test('turn.step on the main loop records the step it saw', async ($, on) => {
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] }
  })
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 1 })
  await stream.result
  const { value } = await $.state.get({ plugin: 'omniclaude', key: 'lastStep' } as const)
  expect(value?.model).toBe('claude-opus-5-5')
})
```

- [ ] **Step 5: Validate, test, and run the Python suite**

```bash
CLAUDE="$LOCALAPPDATA/Packages/Claude_pzs8sxrjxfjjc/LocalCache/Roaming/Claude/claude-code/2.1.295/d2e29494ec83/claude.exe"
"$CLAUDE" plugin validate plugins/omniclaude --strict
"$CLAUDE" plugin test plugins/omniclaude
python -m unittest discover -s tests -v
```

Expected: validation passes (it lists the module's hooks and `$.state` keys against `types/index.d.ts`); 2 mod tests pass; 32 Python tests OK.

If `validate` refuses the `import ... from '../types'` or any relative import, keep the type import (it is erased) and note in the report; if it refuses relative *value* imports in later tasks, apply the collapse rule from Global Constraints.

If the `$.turn.step(...)` test harness needs a different bottom-hook return shape, read the error, adjust the bottom hook to the shape it names, and record the working shape in the report — later tasks reuse it.

- [ ] **Step 6: Commit**

```bash
git add plugins/omniclaude tests/test_mod.py
git commit -m "feat(mod): skeleton hooks module with /omni status and turn.step probe

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

- [ ] **Step 7: Live check (controller/user, desktop session)**

In the Code-tab session: `/reload-plugins`, then `/omni status` → expect `OmniClaude mod loaded. Last main-loop step: no step yet`; send any short prompt; `/omni status` again → expect a model id and effort. Record the exact `model` string format (alias or full id) in the task report — Task 3 depends on it.

---

### Task 2: Pure policy module

**Files:**
- Create: `plugins/omniclaude/hooks/policy.ts`, `plugins/omniclaude/hooks/policy.test.ts`

**Interfaces:**
- Produces:
  - `type Profile`, `type Effort`, `type Tier = 'haiku' | 'sonnet' | 'opus' | 'fable'`
  - `PROFILES: Record<Exclude<Profile,'auto'>, { parent: { model: Tier; effort: Effort }; explore: Tier; general: Tier }>`
  - `tierOf(model: string): Tier | undefined` — maps an alias or full id (`claude-haiku-5-5`, `haiku`) to its tier
  - `clampWorkerModel(workerTier: Tier, requested: string | undefined, profile: Profile): string | undefined` — returns the model to send
  - `spawnModel(profile: Exclude<Profile,'auto'>, subagentType: string, agentModel: string | undefined, requested: string | undefined): string | undefined`
  - `WORKER_TIERS: Record<string, Tier>` keyed by `omniclaude:<name>`
  - `type AutoClass = 'trivial' | 'routine' | 'complex' | 'critical'`
  - `planForClass(c: AutoClass): { model: Tier; effort: Effort }`
  - `decideAutoModel(current: Tier | null, wish: Tier, contextTokens: number): { model: Tier; reason: string }`
  - `AUTO_UPGRADE_CONTEXT_LIMIT = 40_000`

- [ ] **Step 1: Write the failing tests**

`plugins/omniclaude/hooks/policy.test.ts`:

```ts
import { test, expect } from 'claude-code/testing'
import {
  PROFILES, WORKER_TIERS, tierOf, clampWorkerModel, spawnModel,
  planForClass, decideAutoModel, AUTO_UPGRADE_CONTEXT_LIMIT,
} from './policy'

test('profile table matches the spec', async () => {
  expect(PROFILES.economy).toEqual({ parent: { model: 'sonnet', effort: 'medium' }, explore: 'haiku', general: 'sonnet' })
  expect(PROFILES.balanced).toEqual({ parent: { model: 'opus', effort: 'medium' }, explore: 'sonnet', general: 'sonnet' })
  expect(PROFILES.quality).toEqual({ parent: { model: 'opus', effort: 'high' }, explore: 'sonnet', general: 'opus' })
  expect(PROFILES.max).toEqual({ parent: { model: 'fable', effort: 'high' }, explore: 'opus', general: 'opus' })
})

test('tierOf understands aliases and full ids', async () => {
  expect(tierOf('haiku')).toBe('haiku')
  expect(tierOf('claude-haiku-5-5')).toBe('haiku')
  expect(tierOf('claude-opus-5-5')).toBe('opus')
  expect(tierOf('claude-fable-5-1')).toBe('fable')
  expect(tierOf('claude-sonnet-5-5-20261001')).toBe('sonnet')
  expect(tierOf('gpt-6')).toBeUndefined()
})

test('worker tiers are the shipped frontmatter tiers', async () => {
  expect(WORKER_TIERS['omniclaude:luna-researcher']).toBe('haiku')
  expect(WORKER_TIERS['omniclaude:terra-explorer']).toBe('sonnet')
  expect(WORKER_TIERS['omniclaude:sol-debugger']).toBe('opus')
  expect(WORKER_TIERS['omniclaude:astra-expert']).toBe('fable')
})

test('clampWorkerModel clamps a higher request back to the tier, except under max', async () => {
  expect(clampWorkerModel('haiku', 'opus', 'balanced')).toBe('haiku')
  expect(clampWorkerModel('haiku', 'claude-opus-5-5', 'economy')).toBe('haiku')
  expect(clampWorkerModel('sonnet', 'haiku', 'balanced')).toBe('haiku')
  expect(clampWorkerModel('sonnet', undefined, 'balanced')).toBeUndefined()
  expect(clampWorkerModel('haiku', 'opus', 'max')).toBe('opus')
})

test('spawnModel routes built-ins and model-less agents by profile', async () => {
  expect(spawnModel('economy', 'Explore', undefined, undefined)).toBe('haiku')
  expect(spawnModel('balanced', 'Explore', undefined, undefined)).toBe('sonnet')
  expect(spawnModel('quality', 'general-purpose', undefined, undefined)).toBe('opus')
  expect(spawnModel('balanced', 'Plan', undefined, undefined)).toBe('sonnet')
  expect(spawnModel('balanced', 'omniclaude:luna-researcher', 'haiku', 'opus')).toBe('haiku')
  expect(spawnModel('balanced', 'omniclaude:terra-explorer', 'sonnet', undefined)).toBeUndefined()
  expect(spawnModel('balanced', 'some-plugin:writer', 'opus', undefined)).toBeUndefined()
  expect(spawnModel('balanced', 'some-plugin:writer', undefined, undefined)).toBe('sonnet')
})

test('planForClass maps the four classes', async () => {
  expect(planForClass('trivial')).toEqual({ model: 'sonnet', effort: 'low' })
  expect(planForClass('routine')).toEqual({ model: 'sonnet', effort: 'medium' })
  expect(planForClass('complex')).toEqual({ model: 'opus', effort: 'medium' })
  expect(planForClass('critical')).toEqual({ model: 'opus', effort: 'high' })
})

test('decideAutoModel applies the cache rule', async () => {
  expect(decideAutoModel(null, 'sonnet', 0)).toEqual({ model: 'sonnet', reason: 'first prompt' })
  expect(decideAutoModel('sonnet', 'opus', 10_000)).toEqual({ model: 'opus', reason: 'upgraded (context 10000 < 40000)' })
  expect(decideAutoModel('sonnet', 'opus', AUTO_UPGRADE_CONTEXT_LIMIT)).toEqual({ model: 'sonnet', reason: 'kept sonnet to preserve the cache' })
  expect(decideAutoModel('opus', 'sonnet', 5_000)).toEqual({ model: 'opus', reason: 'never downgraded mid-session' })
  expect(decideAutoModel('opus', 'opus', 90_000)).toEqual({ model: 'opus', reason: 'unchanged' })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `"$CLAUDE" plugin test plugins/omniclaude`
Expected: the policy tests fail to load (`./policy` not found); the Task 1 tests still pass.

- [ ] **Step 3: Write `policy.ts`**

```ts
export type Profile = 'auto' | 'economy' | 'balanced' | 'quality' | 'max'
export type FixedProfile = Exclude<Profile, 'auto'>
export type Effort = 'low' | 'medium' | 'high'
export type Tier = 'haiku' | 'sonnet' | 'opus' | 'fable'
export type AutoClass = 'trivial' | 'routine' | 'complex' | 'critical'

export const TIER_RANK: Record<Tier, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }

export const PROFILES: Record<FixedProfile, { parent: { model: Tier; effort: Effort }; explore: Tier; general: Tier }> = {
  economy: { parent: { model: 'sonnet', effort: 'medium' }, explore: 'haiku', general: 'sonnet' },
  balanced: { parent: { model: 'opus', effort: 'medium' }, explore: 'sonnet', general: 'sonnet' },
  quality: { parent: { model: 'opus', effort: 'high' }, explore: 'sonnet', general: 'opus' },
  max: { parent: { model: 'fable', effort: 'high' }, explore: 'opus', general: 'opus' },
}

export const WORKER_TIERS: Record<string, Tier> = {
  'omniclaude:luna-researcher': 'haiku',
  'omniclaude:terra-explorer': 'sonnet',
  'omniclaude:terra-implementer': 'sonnet',
  'omniclaude:sol-planner': 'opus',
  'omniclaude:sol-reviewer': 'opus',
  'omniclaude:sol-debugger': 'opus',
  'omniclaude:astra-expert': 'fable',
}

const BUILT_IN_EXPLORERS = new Set(['Explore', 'Plan'])

export const AUTO_UPGRADE_CONTEXT_LIMIT = 40_000

export function tierOf(model: string): Tier | undefined {
  const m = model.toLowerCase()
  for (const tier of ['haiku', 'sonnet', 'opus', 'fable'] as const) {
    if (m === tier || m.includes(`-${tier}-`) || m.startsWith(`${tier}-`) || m.endsWith(`-${tier}`)) return tier
  }
  return undefined
}

export function clampWorkerModel(workerTier: Tier, requested: string | undefined, profile: Profile): string | undefined {
  if (requested === undefined) return undefined
  if (profile === 'max') return requested
  const requestedTier = tierOf(requested)
  if (requestedTier === undefined) return workerTier
  return TIER_RANK[requestedTier] > TIER_RANK[workerTier] ? workerTier : requested
}

export function spawnModel(
  profile: FixedProfile,
  subagentType: string,
  agentModel: string | undefined,
  requested: string | undefined,
): string | undefined {
  const workerTier = WORKER_TIERS[subagentType]
  if (workerTier !== undefined) return clampWorkerModel(workerTier, requested, profile)
  if (agentModel !== undefined) return undefined
  if (requested !== undefined) return undefined
  return BUILT_IN_EXPLORERS.has(subagentType) ? PROFILES[profile].explore : PROFILES[profile].general
}

export function planForClass(c: AutoClass): { model: Tier; effort: Effort } {
  switch (c) {
    case 'trivial': return { model: 'sonnet', effort: 'low' }
    case 'routine': return { model: 'sonnet', effort: 'medium' }
    case 'complex': return { model: 'opus', effort: 'medium' }
    case 'critical': return { model: 'opus', effort: 'high' }
  }
}

export function decideAutoModel(current: Tier | null, wish: Tier, contextTokens: number): { model: Tier; reason: string } {
  if (current === null) return { model: wish, reason: 'first prompt' }
  if (wish === current) return { model: current, reason: 'unchanged' }
  if (TIER_RANK[wish] < TIER_RANK[current]) return { model: current, reason: 'never downgraded mid-session' }
  if (contextTokens < AUTO_UPGRADE_CONTEXT_LIMIT) return { model: wish, reason: `upgraded (context ${contextTokens} < ${AUTO_UPGRADE_CONTEXT_LIMIT})` }
  return { model: current, reason: `kept ${current} to preserve the cache` }
}
```

Note on `spawnModel`: a non-OmniClaude agent that carries its own `model` (`agentModel`) or an explicit request is left alone (`undefined` = keep); built-ins and model-less agents get the profile's tier. The test `spawnModel('balanced', 'omniclaude:terra-explorer', 'sonnet', undefined)` returns `undefined` because no clamp is needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `"$CLAUDE" plugin test plugins/omniclaude`
Expected: all policy tests pass (7) plus Task 1's (2).

- [ ] **Step 5: Commit**

```bash
git add plugins/omniclaude/hooks/policy.ts plugins/omniclaude/hooks/policy.test.ts
git commit -m "feat(mod): pure routing policy (profiles, clamp, auto classes, cache rule)

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 3: Enforcement hooks — `turn.step`, `agent.spawn`, astra consent

**Files:**
- Modify: `plugins/omniclaude/hooks/register.ts`, `plugins/omniclaude/types/index.d.ts`
- Create: `plugins/omniclaude/hooks/enforce.test.ts`

**Interfaces:**
- Consumes: Task 2 exports.
- Produces: `PluginState['omniclaude']` keys `profileOverride: Profile | null`, `plan: { model: Tier; effort: Effort; source: 'profile' | 'auto'; reason: string } | null`, `astraConsent: boolean`, `applied: { model: string; effort?: string | number } | null`, `verified: { model: string } | null`.
- Produces: `resolveProfile($, options)` in `register.ts`: `$.store.get('profile')` → `options.profile` → `'auto'`; the session override in `$.state` wins over both.
- Produces: `effectiveFixedProfile(profile, plan)`: `auto` uses the `plan`'s model/effort for the parent and `balanced`'s spawn table.

- [ ] **Step 1: Extend the state contract**

`plugins/omniclaude/types/index.d.ts` (replace the file):

```ts
export type Profile = 'auto' | 'economy' | 'balanced' | 'quality' | 'max'
export type Effort = 'low' | 'medium' | 'high'
export type Tier = 'haiku' | 'sonnet' | 'opus' | 'fable'

export type LastStep = { model: string; effort?: string | number; agentId?: string }
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
      applied: Applied | null
      verified: Verified | null
    }
  }
}
```

- [ ] **Step 2: Write the failing tests**

`plugins/omniclaude/hooks/enforce.test.ts`:

```ts
import { test, expect, mock } from 'claude-code/testing'

const STEP = (model: string, effort: 'low' | 'medium' | 'high' = 'medium', agentId?: string) =>
  ({ turnId: 't1', index: 0, model, effort, messageCount: 1, ...(agentId ? { agentId } : {}) })

const SPAWN = (subagentType: string, model?: string) => ({
  prompt: 'do the thing', description: 'test', subagentType, ...(model ? { model } : {}),
})

async function ready($: any, on: any, profile: string) {
  mock.store(on, { profile })
  await $.session.start({ cwd: 'C:/CC/omniclaude', surface: null, isInteractive: false })
}

test('balanced pins the main loop to opus/medium', async ($, on) => {
  let sent: any = null
  on('turn.step', async function* (_$, e) { sent = e; return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } })
  await ready($, on, 'balanced')
  await $.turn.step(STEP('claude-sonnet-5-5', 'high')).result
  expect(sent.model).toBe('opus')
  expect(sent.effort).toBe('medium')
})

test('economy pins the main loop to sonnet/medium and leaves subagent steps alone', async ($, on) => {
  const seen: any[] = []
  on('turn.step', async function* (_$, e) { seen.push(e); return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } })
  await ready($, on, 'economy')
  await $.turn.step(STEP('claude-opus-5-5', 'high')).result
  await $.turn.step(STEP('claude-haiku-5-5', 'low', 'agent-1')).result
  expect(seen[0].model).toBe('sonnet')
  expect(seen[0].effort).toBe('medium')
  expect(seen[1].model).toBe('claude-haiku-5-5')
  expect(seen[1].effort).toBe('low')
})

test('agent.spawn routes Explore and general-purpose by profile', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: `a${spawned.length}` } })
  await ready($, on, 'economy')
  await $.agent.spawn(SPAWN('Explore'))
  await $.agent.spawn(SPAWN('general-purpose'))
  expect(spawned[0].model).toBe('haiku')
  expect(spawned[1].model).toBe('sonnet')
})

test('agent.spawn clamps a worker request above its tier', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  await ready($, on, 'balanced')
  await $.agent.spawn(SPAWN('omniclaude:luna-researcher', 'opus'))
  expect(spawned[0].model).toBe('haiku')
})

test('astra-expert is denied until consent is given', async ($, on) => {
  const spawned: any[] = []
  on('agent.spawn', (_$, e) => { spawned.push(e); return { model: e.model ?? 'inherit', agentId: 'a1' } })
  await ready($, on, 'quality')
  const denied = await $.agent.spawn(SPAWN('omniclaude:astra-expert'))
  expect(denied.deny).toBe('astra-expert needs your agreement: run /omni astra allow')
  expect(spawned.length).toBe(0)
  await $.state.set({ plugin: 'omniclaude', key: 'astraConsent' } as const, true)
  const allowed = await $.agent.spawn(SPAWN('omniclaude:astra-expert'))
  expect(allowed.deny).toBeUndefined()
  expect(spawned.length).toBe(1)
})

test('turn.complete records the verified model', async ($, on) => {
  on('turn.complete', (_$, e, next) => next(e))
  await ready($, on, 'balanced')
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'ok', durationMs: 10, isAborted: false,
    usage: { model: 'claude-opus-5-5' } as any })
  const { value } = await $.state.get({ plugin: 'omniclaude', key: 'verified' } as const)
  expect(value?.model).toBe('claude-opus-5-5')
})
```

If the harness's bottom `turn.complete` hook needs a different return shape, use what Task 1 recorded for streaming hooks and what the error names for this event; the assertion is on `$.state`, not on the return.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `"$CLAUDE" plugin test plugins/omniclaude`
Expected: the six enforce tests fail (model not rewritten, no deny, verified unset).

- [ ] **Step 4: Rewrite `register.ts` with enforcement**

```ts
import type { Register, EngineInterface } from 'claude-code'
import type { LastStep, Plan, Profile, Applied, Verified } from '../types'
import { PROFILES, WORKER_TIERS, spawnModel, tierOf } from './policy'
import type { FixedProfile } from './policy'

const K = {
  lastStep: { plugin: 'omniclaude', key: 'lastStep' } as const,
  profileOverride: { plugin: 'omniclaude', key: 'profileOverride' } as const,
  plan: { plugin: 'omniclaude', key: 'plan' } as const,
  astraConsent: { plugin: 'omniclaude', key: 'astraConsent' } as const,
  applied: { plugin: 'omniclaude', key: 'applied' } as const,
  verified: { plugin: 'omniclaude', key: 'verified' } as const,
}

const ASTRA = 'omniclaude:astra-expert'
const ASTRA_DENY = 'astra-expert needs your agreement: run /omni astra allow'
const PROFILE_NAMES: readonly Profile[] = ['auto', 'economy', 'balanced', 'quality', 'max']

function isProfile(x: unknown): x is Profile {
  return typeof x === 'string' && (PROFILE_NAMES as readonly string[]).includes(x)
}

export async function resolveProfile($: EngineInterface, optionProfile: unknown): Promise<Profile> {
  const { value: override } = await $.state.get(K.profileOverride)
  if (override) return override
  const saved = await $.store.get('profile')
  if (isProfile(saved)) return saved
  return isProfile(optionProfile) ? optionProfile : 'auto'
}

/** The fixed profile whose spawn table applies; auto borrows balanced's table. */
export function spawnProfile(profile: Profile): FixedProfile {
  return profile === 'auto' ? 'balanced' : profile
}

/** What the main loop should run on: the profile's parent, or auto's plan (balanced until classified). */
export async function parentTarget($: EngineInterface, profile: Profile): Promise<{ model: string; effort: string }> {
  if (profile !== 'auto') return PROFILES[profile].parent
  const { value: plan } = await $.state.get(K.plan)
  return plan ? { model: plan.model, effort: plan.effort } : PROFILES.balanced.parent
}

export const register: Register = (on, options) => {
  const optionProfile = (options as { profile?: unknown } | undefined)?.profile

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'omni',
      description: 'OmniClaude: show or change the routing profile',
      argumentHint: 'status | economy | balanced | quality | max | auto | save <profile> | reset | astra allow|deny | doctor',
    })
    const profile = await resolveProfile($, optionProfile)
    $.ui.status(`omni:${profile}`)
    return next(e)
  })

  on('command.run', { command: 'omni' }, async ($, e) => {
    const profile = await resolveProfile($, optionProfile)
    const { value: last } = await $.state.get(K.lastStep)
    const seen = last ? `${last.model} / ${String(last.effort ?? 'default')}` : 'no step yet'
    return { text: `OmniClaude mod loaded. Profile: ${profile}. Last main-loop step: ${seen}` }
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const profile = await resolveProfile($, optionProfile)
    const target = await parentTarget($, profile)
    const applied: Applied = { model: target.model, effort: target.effort }
    await $.state.set(K.lastStep, { model: e.model, effort: e.effort, agentId: e.agentId } satisfies LastStep)
    await $.state.set(K.applied, applied)
    $.ui.status(`omni:${profile} · ${target.model}/${target.effort}`)
    return yield* next({ ...e, model: target.model, effort: target.effort as 'low' | 'medium' | 'high' })
  })

  on('agent.spawn', async ($, e, next) => {
    if (e.fork || e.isTeammate || e.workflow) return next(e)
    const profile = await resolveProfile($, optionProfile)
    if (e.subagentType === ASTRA) {
      const { value: consent } = await $.state.get(K.astraConsent)
      if (!consent && profile !== 'max') return { deny: ASTRA_DENY }
    }
    const agentModel = WORKER_TIERS[e.subagentType] !== undefined ? WORKER_TIERS[e.subagentType] : undefined
    const model = spawnModel(spawnProfile(profile), e.subagentType, agentModel, e.model)
    return model === undefined ? next(e) : next({ ...e, model })
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'omniclaude: its spawn guard failed; refusing to be safe' }))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.usage?.model) {
      const verified: Verified = { model: e.usage.model }
      await $.state.set(K.verified, verified)
      const { value: applied } = await $.state.get(K.applied)
      const ok = applied && tierOf(applied.model) === tierOf(e.usage.model)
      const profile = await resolveProfile($, optionProfile)
      $.ui.status(`omni:${profile} · ${applied?.model ?? '?'}/${String(applied?.effort ?? '?')} ${ok ? '✓' : '≠ ' + e.usage.model}`)
    }
    return next(e)
  })
}
```

Notes for the implementer:
- `agentModel` for non-OmniClaude agents is not visible on `AgentSpawnInput`; the rule in `spawnModel` treats a missing `e.model` as model-less, which routes every built-in and every agent whose caller passed no `model`. A third-party agent with its own frontmatter model is therefore also routed; document this in Task 7 as "any subagent the caller did not pin".
- `max` sets astra consent implicitly (spec §3); the `/omni max` handler in Task 4 also writes the flag with a warning.
- If `options` is not the second `register` argument on this build, read `$.config` instead and note it in the report.

- [ ] **Step 5: Run the tests to verify they pass, then validate and run the Python suite**

```bash
"$CLAUDE" plugin test plugins/omniclaude
"$CLAUDE" plugin validate plugins/omniclaude --strict
python -m unittest discover -s tests -v
```

Expected: all mod tests pass (15); validation passes; 32 Python tests OK.

- [ ] **Step 6: Commit**

```bash
git add plugins/omniclaude
git commit -m "feat(mod): enforce profile on turn.step and agent.spawn; astra consent; verified model

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

- [ ] **Step 7: Live check (controller/user)**

`/reload-plugins`; `/omni status` shows the profile; send a prompt; status line should read `omni:auto · opus/medium ✓` (auto borrows balanced before classification). Dispatch `Explore` under economy later in Task 4's live check. Record in the report whether `turn.step` accepted the alias `opus` (status line ✓) or needed a full id; if the alias failed, change `PROFILES` parent models to full ids (`claude-sonnet-5-5`, `claude-opus-5-5`, `claude-fable-5-1`) and update `policy.test.ts` accordingly.

---

### Task 4: `/omni` command set and persistence

**Files:**
- Create: `plugins/omniclaude/hooks/omni.ts`
- Modify: `plugins/omniclaude/hooks/register.ts` (replace the `command.run` hook), `plugins/omniclaude/hooks/omni.test.ts` (replace)

**Interfaces:**
- Produces: `parseOmni(args: string): OmniCommand` where `OmniCommand = { kind: 'status' } | { kind: 'set'; profile: Profile } | { kind: 'save'; profile: Profile } | { kind: 'reset' } | { kind: 'astra'; allow: boolean } | { kind: 'doctor' } | { kind: 'help' }`.
- Produces: `runOmni($, cmd, ctx): Promise<string>` where `ctx = { optionProfile: unknown; version: string }`.

- [ ] **Step 1: Write the failing tests**

`plugins/omniclaude/hooks/omni.test.ts` (replace the whole file):

```ts
import { test, expect, mock } from 'claude-code/testing'
import { parseOmni } from './omni'

async function ready($: any, on: any, store: Record<string, unknown> = {}) {
  mock.store(on, store)
  await $.session.start({ cwd: 'C:/CC/omniclaude', surface: null, isInteractive: false })
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
})

test('/omni status reports saved, override, plan, applied, verified, consent', async ($, on) => {
  await ready($, on, { profile: 'quality' })
  const ran = await $.command.run({ command: 'omni', args: 'status' })
  expect(ran.text).toContain('saved profile: quality')
  expect(ran.text).toContain('session override: none')
  expect(ran.text).toContain('astra consent: no')
  expect(ran.context).toBeUndefined()
})

test('/omni <profile> sets a session override and /omni reset clears it', async ($, on) => {
  await ready($, on, { profile: 'balanced' })
  const set = await $.command.run({ command: 'omni', args: 'economy' })
  expect(set.text).toContain('session override: economy')
  const { value } = await $.state.get({ plugin: 'omniclaude', key: 'profileOverride' } as const)
  expect(value).toBe('economy')
  const reset = await $.command.run({ command: 'omni', args: 'reset' })
  expect(reset.text).toContain('session override: none')
})

test('/omni save persists to the store', async ($, on) => {
  await ready($, on, {})
  await $.command.run({ command: 'omni', args: 'save quality' })
  expect(await $.store.get('profile')).toBe('quality')
})

test('/omni astra allow sets consent; /omni max sets it with a warning', async ($, on) => {
  await ready($, on, {})
  const allow = await $.command.run({ command: 'omni', args: 'astra allow' })
  expect(allow.text).toContain('astra consent: yes')
  await $.command.run({ command: 'omni', args: 'astra deny' })
  const max = await $.command.run({ command: 'omni', args: 'max' })
  expect(max.text).toContain('Fable')
  const { value } = await $.state.get({ plugin: 'omniclaude', key: 'astraConsent' } as const)
  expect(value).toBe(true)
})

test('/omni doctor names the hooks and the engine version', async ($, on) => {
  await ready($, on, {})
  const ran = await $.command.run({ command: 'omni', args: 'doctor' })
  expect(ran.text).toContain('turn.step')
  expect(ran.text).toContain('agent.spawn')
  expect(ran.text).toContain('engine')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `"$CLAUDE" plugin test plugins/omniclaude`
Expected: `./omni` not found; the other tests still pass.

- [ ] **Step 3: Write `omni.ts`**

```ts
import type { EngineInterface } from 'claude-code'
import type { Profile } from '../types'
import { PROFILES } from './policy'

export type OmniCommand =
  | { kind: 'status' }
  | { kind: 'set'; profile: Profile }
  | { kind: 'save'; profile: Profile }
  | { kind: 'reset' }
  | { kind: 'astra'; allow: boolean }
  | { kind: 'doctor' }
  | { kind: 'help' }

const PROFILE_NAMES: readonly Profile[] = ['auto', 'economy', 'balanced', 'quality', 'max']

export function isProfile(x: unknown): x is Profile {
  return typeof x === 'string' && (PROFILE_NAMES as readonly string[]).includes(x)
}

export function parseOmni(args: string): OmniCommand {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0 || words[0] === 'status') return { kind: 'status' }
  if (words.length === 1 && isProfile(words[0])) return { kind: 'set', profile: words[0] }
  if (words[0] === 'save' && words.length === 2 && isProfile(words[1])) return { kind: 'save', profile: words[1] }
  if (words[0] === 'reset' && words.length === 1) return { kind: 'reset' }
  if (words[0] === 'astra' && words.length === 2 && (words[1] === 'allow' || words[1] === 'deny')) return { kind: 'astra', allow: words[1] === 'allow' }
  if (words[0] === 'doctor' && words.length === 1) return { kind: 'doctor' }
  return { kind: 'help' }
}

const K = {
  profileOverride: { plugin: 'omniclaude', key: 'profileOverride' } as const,
  plan: { plugin: 'omniclaude', key: 'plan' } as const,
  astraConsent: { plugin: 'omniclaude', key: 'astraConsent' } as const,
  applied: { plugin: 'omniclaude', key: 'applied' } as const,
  verified: { plugin: 'omniclaude', key: 'verified' } as const,
}

export const HELP = [
  'OmniClaude: /omni status | economy | balanced | quality | max | auto',
  '            /omni save <profile> | reset | astra allow|deny | doctor',
].join('\n')

export async function statusText($: EngineInterface, optionProfile: unknown): Promise<string> {
  const saved = await $.store.get('profile')
  const { value: override } = await $.state.get(K.profileOverride)
  const { value: plan } = await $.state.get(K.plan)
  const { value: applied } = await $.state.get(K.applied)
  const { value: verified } = await $.state.get(K.verified)
  const { value: consent } = await $.state.get(K.astraConsent)
  const effective = override ?? (isProfile(saved) ? saved : isProfile(optionProfile) ? optionProfile : 'auto')
  const parent = effective === 'auto'
    ? (plan ? `${plan.model}/${plan.effort} (auto: ${plan.reason})` : 'opus/medium (auto, not classified yet)')
    : `${PROFILES[effective].parent.model}/${PROFILES[effective].parent.effort}`
  return [
    `OmniClaude ${effective}`,
    `  saved profile: ${isProfile(saved) ? saved : 'none'}${isProfile(optionProfile) ? ` (config option: ${optionProfile})` : ''}`,
    `  session override: ${override ?? 'none'}`,
    `  requested parent: ${parent}`,
    `  applied (last step): ${applied ? `${applied.model}/${String(applied.effort ?? 'default')}` : 'none yet'}`,
    `  verified (last turn, API-reported): ${verified ? verified.model : 'none yet'}`,
    `  astra consent: ${consent ? 'yes' : 'no'}`,
  ].join('\n')
}

export async function runOmni($: EngineInterface, cmd: OmniCommand, ctx: { optionProfile: unknown; version: string }): Promise<string> {
  switch (cmd.kind) {
    case 'status':
      return statusText($, ctx.optionProfile)
    case 'set': {
      await $.state.set(K.profileOverride, cmd.profile)
      let note = ''
      if (cmd.profile === 'max') {
        await $.state.set(K.astraConsent, true)
        note = '\n  warning: max runs the parent on Fable and allows astra-expert; Fable may bill usage credits on some plans.'
      }
      return (await statusText($, ctx.optionProfile)) + note
    }
    case 'save':
      await $.store.set('profile', cmd.profile)
      return (await statusText($, ctx.optionProfile)) + `\n  saved ${cmd.profile} for future sessions.`
    case 'reset':
      await $.state.set(K.profileOverride, null)
      return statusText($, ctx.optionProfile)
    case 'astra':
      await $.state.set(K.astraConsent, cmd.allow)
      return statusText($, ctx.optionProfile)
    case 'doctor':
      return [
        `OmniClaude doctor`,
        `  engine: ${ctx.version}`,
        `  hooks: session.start, command.run, turn.step (main loop model/effort), agent.spawn (tiers, astra consent), turn.complete (verified)`,
        `  if /omni is missing in a session, the mod is off (--bare, --safe-mode, disableAllHooks, allowManagedModsOnly, remote switch, engine < 2.1.287); Stage 1 skill and agents still work.`,
      ].join('\n')
    case 'help':
      return HELP
  }
}
```

- [ ] **Step 4: Replace the `command.run` hook in `register.ts`**

Replace the existing `on('command.run', ...)` block with:

```ts
  on('command.run', { command: 'omni' }, async ($, e) => {
    const version = (await $.session.version()).version
    const text = await runOmni($, parseOmni(e.args), { optionProfile, version })
    const profile = await resolveProfile($, optionProfile)
    $.ui.status(`omni:${profile}`)
    return { text }
  })
```

and add `import { parseOmni, runOmni } from './omni'` at the top. Remove the now-unused `K.lastStep` read from the old hook if nothing else uses it (keep the `lastStep` state write in `turn.step`).

- [ ] **Step 5: Run the tests, validate, Python suite**

```bash
"$CLAUDE" plugin test plugins/omniclaude
"$CLAUDE" plugin validate plugins/omniclaude --strict
python -m unittest discover -s tests -v
```

Expected: all mod tests pass (19); validation passes; Python 32 OK.

- [ ] **Step 6: Commit**

```bash
git add plugins/omniclaude
git commit -m "feat(mod): /omni status, profile override, save, reset, astra consent, doctor

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

- [ ] **Step 7: Live check (controller/user)**

`/reload-plugins`; `/omni economy`; send "use the Explore agent to list the files under docs/"; after the turn, read the Explore subagent transcript's `model` field → expect `claude-haiku-5-5`. `/omni status` → verified shows a Sonnet id for the parent. Record both in the task report.

---

### Task 5: Routing policy section in the system prompt

**Files:**
- Modify: `plugins/omniclaude/hooks/register.ts`
- Create: `plugins/omniclaude/hooks/compose.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, mock } from 'claude-code/testing'

test('prompt.compose adds one session-scoped omniclaude:policy section', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'engine:base', text: 'base', scope: 'shared' }] }))
  mock.store(on, { profile: 'economy' })
  await $.session.start({ cwd: 'C:/CC/omniclaude', surface: null, isInteractive: false })
  const composed = await $.prompt.compose()
  const ours = composed.sections.filter(s => s.id === 'omniclaude:policy')
  expect(ours.length).toBe(1)
  expect(ours[0].scope).toBe('session')
  expect(ours[0].text).toContain('omni:economy')
  expect(ours[0].text).toContain('omniclaude:terra-explorer')
  expect(ours[0].text).toContain('astra-expert')
  expect(composed.sections[0].id).toBe('engine:base')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `"$CLAUDE" plugin test plugins/omniclaude`
Expected: `ours.length` is 0.

- [ ] **Step 3: Add the hook to `register.ts`**

```ts
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const profile = await resolveProfile($, optionProfile)
    const text = [
      `OmniClaude routing (omni:${profile}) is enforced by a plugin hook: your model and effort are set by the profile; subagents run on the profile's tiers.`,
      `Delegate read-heavy work: use omniclaude:terra-explorer for codebase mapping and omniclaude:luna-researcher for docs/search, instead of reading many files yourself. Use omniclaude:terra-implementer for bounded implementation. Keep tiny single-file work in this conversation.`,
      `omniclaude:astra-expert runs only after the user agrees (/omni astra allow). For details load the omniclaude:routing skill.`,
    ].join(' ')
    return { sections: [...composed.sections, { id: 'omniclaude:policy', text, scope: 'session' }] }
  })
```

- [ ] **Step 4: Run tests, validate**

Run: `"$CLAUDE" plugin test plugins/omniclaude` and `"$CLAUDE" plugin validate plugins/omniclaude --strict`
Expected: 20 mod tests pass; validation passes.

- [ ] **Step 5: Commit**

```bash
git add plugins/omniclaude
git commit -m "feat(mod): inject the routing policy as a session-scoped system-prompt section

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 6: `omni:auto` classifier with the cache rule

**Files:**
- Modify: `plugins/omniclaude/hooks/register.ts`
- Create: `plugins/omniclaude/hooks/auto.test.ts`

**Interfaces:**
- Consumes: `planForClass`, `decideAutoModel`, `tierOf` from Task 2; `K.plan` state from Task 3.
- Produces: `classifyPrompt($, text): Promise<AutoClass | undefined>` in `register.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
import { test, expect, mock } from 'claude-code/testing'

const PLAN = { plugin: 'omniclaude', key: 'plan' } as const

async function ready($: any, on: any, label: string) {
  on('model.complete', (_$, e) => ({ isAnswered: true, text: label, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }))
  mock.store(on, { profile: 'auto' })
  await $.session.start({ cwd: 'C:/CC/omniclaude', surface: null, isInteractive: false })
}

const SUBMIT = (text: string) => ({ text, origin: { kind: 'composer' } as const, wait: false })

test('auto classifies a composer prompt and plans model/effort', async ($, on) => {
  await ready($, on, 'critical')
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.prompt.submit(SUBMIT('redesign the auth token rotation across services'))
  const { value } = await $.state.get(PLAN)
  expect(value?.model).toBe('opus')
  expect(value?.effort).toBe('high')
  expect(value?.source).toBe('auto')
})

test('auto never downgrades the model mid-session but lowers effort', async ($, on) => {
  await ready($, on, 'trivial')
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.state.set(PLAN, { model: 'opus', effort: 'high', source: 'auto', reason: 'first prompt' })
  await $.prompt.submit(SUBMIT('rename a variable'))
  const { value } = await $.state.get(PLAN)
  expect(value?.model).toBe('opus')
  expect(value?.effort).toBe('low')
  expect(value?.reason).toBe('never downgraded mid-session')
})

test('auto ignores prompts that are not the composer\'s', async ($, on) => {
  await ready($, on, 'critical')
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.prompt.submit({ text: 'x', origin: { kind: 'plugin', name: 'other' } as any, wait: false })
  const { value } = await $.state.get(PLAN)
  expect(value ?? null).toBeNull()
})

test('a classifier that names no label keeps the previous plan', async ($, on) => {
  await ready($, on, 'banana')
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.state.set(PLAN, { model: 'sonnet', effort: 'medium', source: 'auto', reason: 'first prompt' })
  await $.prompt.submit(SUBMIT('anything'))
  const { value } = await $.state.get(PLAN)
  expect(value?.model).toBe('sonnet')
  expect(value?.effort).toBe('medium')
})
```

If the harness exposes no `model.complete` bottom hook for `$.model.classify`, read the error for the event name it raises (the types list the model events) and hook that instead; the assertions stay.

- [ ] **Step 2: Run tests to verify they fail**

Run: `"$CLAUDE" plugin test plugins/omniclaude`
Expected: the four auto tests fail (plan unset or unchanged).

- [ ] **Step 3: Add the classifier to `register.ts`**

Add imports `planForClass, decideAutoModel` and type `AutoClass` from `./policy`, then:

```ts
const AUTO_LABELS = ['trivial', 'routine', 'complex', 'critical'] as const

export async function classifyPrompt($: EngineInterface, text: string): Promise<AutoClass | undefined> {
  try {
    const label = await $.model.classify(text.slice(0, 4000), AUTO_LABELS)
    return (AUTO_LABELS as readonly string[]).includes(label ?? '') ? (label as AutoClass) : undefined
  } catch {
    return undefined
  }
}
```

and inside `register`:

```ts
  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind !== 'composer') return next(e)
    const profile = await resolveProfile($, optionProfile)
    if (profile !== 'auto') return next(e)
    const klass = await classifyPrompt($, e.text)
    if (klass === undefined) {
      $.ui.status('omni:auto · classifier gave no label; plan kept')
      return next(e)
    }
    const wish = planForClass(klass)
    const { value: previous } = await $.state.get(K.plan)
    const current = previous ? previous.model : null
    const contextTokens = (await $.session.usage()).context.tokens ?? 0
    const decided = decideAutoModel(current, wish.model, contextTokens)
    const plan: Plan = { model: decided.model, effort: wish.effort, source: 'auto', reason: `${klass}: ${decided.reason}` }
    await $.state.set(K.plan, plan)
    $.ui.status(`omni:auto · ${klass} → ${plan.model}/${plan.effort}`)
    return next(e)
  })
```

`parentTarget` (Task 3) already reads `K.plan` for `auto`, so `turn.step` applies it.

- [ ] **Step 4: Run tests, validate, Python suite**

Expected: 24 mod tests pass; validation passes; Python 32 OK.

- [ ] **Step 5: Commit**

```bash
git add plugins/omniclaude
git commit -m "feat(mod): omni:auto classifier with cache-preserving model rule

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

- [ ] **Step 6: Live check (controller/user)**

`/reload-plugins`; `/omni auto`; send "rename variable x to total in calc.py" → status line `omni:auto · trivial → sonnet/low`; `/omni status` → verified shows a Sonnet id. Then send "design a safe migration for the orders table with zero downtime" → expect an upgrade to opus only if context < 40k (it will be, early in the session), reason shown. Record both.

---

### Task 7: Docs, local validation, measurement, release

**Files:**
- Modify: `README.md`, `docs/profiles.md`, `docs/architecture.md`, `CHANGELOG.md`, `VERSION`, `plugins/omniclaude/.claude-plugin/plugin.json` (version), `docs/local-validation.md`, `tests/test_docs.py` (version checks keep passing), `plugins/omniclaude/evals/*/graders/` (add a general Agent counter and a Skill indicator to every case)

- [ ] **Step 1: Bump the version**

`VERSION` → `0.2.0-alpha.1`; `plugin.json` `"version": "0.2.0-alpha.1"`; CHANGELOG gets a `## 0.2.0-alpha.1 — Stage 2 (enforcing mod), experimental` section listing: the mod, `/omni`, enforcement of parent and subagent tiers, astra consent, auto classifier, verified model, and "Stage 1 setup.py/persisted-settings plans dropped: `$.store` replaces them". README's version line and `tests/test_docs.py` must agree (the test reads `VERSION`).

- [ ] **Step 2: Add eval graders**

In each of the four cases add `graders/agent-used.md`:

```markdown
---
type: tool_used
tool: Agent
min: 0
arm: with-only
---
```

and `graders/skill-fired.md`:

```markdown
---
type: tool_used
tool: Skill
min: 0
arm: with-only
---
```

(`min: 0` makes them indicators that always pass; their counts in the JSON report are what we read.) Extend `tests/test_evals.py::test_graders` to require both files exist with `type` `tool_used`.

- [ ] **Step 3: README and docs**

README: a new section `## Stage 2: the enforcing mod` before `## Profiles`, stating: what is enforced (parent model/effort on every main-loop request; subagent tiers for built-ins and any subagent the caller did not pin; astra consent), `/omni` commands, `auto` and its cache rule, the three honesty levels (requested/applied/verified), and when the mod is off. Update `## Profiles` to say profiles are now enforced by the mod (the `--settings` files remain for sessions without the mod). Update `## Honest limits`: "Tiers are requested, not enforced" becomes "Tiers are applied by the mod on every spawn it sees; forks, teammates and workflow agents are not rewritten; sessions where the mod is off fall back to advisory routing." `docs/profiles.md`: the enforced table from spec §3 and the auto rules from §4. `docs/architecture.md`: add the mod as the control-plane implementation.

- [ ] **Step 4: Local validation**

Append to `docs/local-validation.md` a `## Stage 2 live checks` section with the Task 1/3/4/6 live results (exact status-line strings, transcript model ids, `/omni status` output), and a `## Stage 2 measurement` section once Step 5 runs.

- [ ] **Step 5: Measurement (requires explicit user approval of the spend; same cap as Stage 1, US$ 15)**

```bash
cd plugins/omniclaude
"$CLAUDE" plugin eval . --scaffold --allow-tools Edit Write --model claude-opus-5-5 --runs 3 -j 2 --max-cost-usd 15 --no-publish --trust-plugin --json "$OUT/omni-eval-stage2.json"
cd ../..
```

Then extract per case and arm: mean cost, score, `agent-used` and `skill-fired` counts, and compare with the Stage 1 rows (same cases, same parent pin). Record the table and a plain conclusion: did cost go down, did delegation happen, did quality hold. Note that the with-arm now runs under the mod with the saved profile `auto` unless `pluginConfigs` sets another; run a second pass with `--case scout-call-sites --case docs-lookup` under `economy` by setting the option (`claude plugin configure omniclaude --values-stdin` with `{"profile":"economy"}`) if the first pass shows delegation, and record both.

- [ ] **Step 6: Final gate, merge, publish (push requires the user's approval)**

```bash
python -m unittest discover -s tests -v
"$CLAUDE" plugin validate . --strict
"$CLAUDE" plugin validate plugins/omniclaude --strict
"$CLAUDE" plugin test plugins/omniclaude
git checkout main && git merge --ff-only stage2-mod && git push origin main
```
