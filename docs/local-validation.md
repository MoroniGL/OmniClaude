# Local validation

Machine: Windows 11, Claude desktop app engine 2.1.295 (no `claude` on PATH). Date: 2026-10-13.

Repo state at install time: branch `stage1-core`, HEAD a9a048b.

## Offline gate
- unittest: 30 tests OK (`python -m unittest discover -s tests -v`, exit 0)
- plugin validate --strict: marketplace passed (`plugin validate . --strict`, exit 0); plugin passed (`plugin validate plugins/omniclaude --strict`, exit 0)

## Install
- `plugin marketplace add C:/CC/omniclaude`: marketplace `moronigl` added (directory source `C:\CC\omniclaude`).
- `plugin install omniclaude@moronigl --scope user`: installed, scope user, enabled, version 0.1.0-alpha.1.
- Disk changes made by the engine's `plugin` commands: `~/.claude/settings.json` gained `enabledPlugins` and `extraKnownMarketplaces` entries for `moronigl`; `~/.claude/plugins/known_marketplaces.json` and `installed_plugins.json` gained entries; a snapshot copy was written to `~/.claude/plugins/cache/moronigl/omniclaude/0.1.0-alpha.1`, pinned to commit a9a048b.
- `claude plugin list` prints `Read from: C:\CC\omniclaude\plugins\omniclaude`, while `installed_plugins.json` records an installPath under `~/.claude/plugins/cache/moronigl/omniclaude/0.1.0-alpha.1` pinned to a9a048b. Which copy a session loads was not tested; if the cache copy is used, working-tree edits reach it only after `claude plugin update omniclaude@moronigl`.
- `plugin details omniclaude@moronigl` (verbatim):

```
omniclaude 0.1.0-alpha.1
  Description: Cost-aware model routing and multi-agent orchestration for Claude Code: tiered workers and a routing skill. The Claude Code edition of OmniCodex. Unofficial; not affiliated with Anthropic.
  Source: omniclaude@moronigl

Component inventory
  Skills (1)  routing
  Agents (7)  astra-expert, luna-researcher, sol-debugger, sol-planner, sol-reviewer, terra-explorer, terra-implementer
  Hooks (0)
  MCP servers (0)
  LSP servers (0)

Projected token cost
  Always-on:   ~636 tok   added to every session

Per-component (rounded)
  component          always-on  on-invoke
  routing                  ~90       ~630
  astra-expert             ~80       ~150
  luna-researcher          ~80       ~240
  sol-debugger             ~80       ~140
  sol-planner              ~70       ~180
  sol-reviewer             ~80       ~140
  terra-explorer           ~80       ~220
  terra-implementer        ~90       ~200

  On-invoke cost is paid each time a skill or agent fires.
  Token counts are estimates and may differ from actual usage.
```

## Live delegation test (desktop session)

- parent model: `claude-fable-5-1`, the model of the Code-tab session that dispatched both workers (set in that session with `/model claude-fable-5-1`; the parent transcript itself was not read)
- prompt to omniclaude:luna-researcher (as run): `Today's date is 2026-10-13. Bounded task: list every Markdown (.md) file under C:\CC\omniclaude\docs\ (recursively) with its path relative to C:\CC\omniclaude, and report the total count. Do not read file contents beyond what Glob returns. Return the handoff format from your instructions.`
- prompt to omniclaude:terra-explorer (as run): `Bounded question: in the repository C:\CC\omniclaude, where does the routing skill (plugins/omniclaude/skills/routing/SKILL.md) name each of the seven workers, and which test file asserts that every worker appears there? Return file paths with line ranges only. Use Grep; do not read whole files. Return the handoff format from your instructions.`
- /tasks row: not obtained. The workers were dispatched programmatically from the same Code-tab session, so the served model was read from each worker's own transcript (`agent-a319e24c65d163482.jsonl` for luna-researcher, `agent-a20e3c990b13c2ef8.jsonl` for terra-explorer) instead of the /tasks UI.

The headless `claude -p` smoke test could not run because the standalone engine is not logged in (see the next section). The delegation test was done inside the logged-in desktop Code-tab session instead.

Right after install, the plugin loaded in the running desktop session. The Agent tool listed `omniclaude:astra-expert`, `luna-researcher`, `sol-debugger`, `sol-planner`, `sol-reviewer`, `terra-explorer` and `terra-implementer` with the expected tool restrictions:
- luna-researcher: Read, Grep, Glob, WebSearch, WebFetch
- terra-explorer: Read, Grep, Glob, Bash
- sol-planner and sol-reviewer: all tools except Agent, Edit, Write, NotebookEdit
- the other workers: all tools except Agent

The skill appeared as `omniclaude:routing`.

Two bounded tasks were dispatched from the parent, a Fable 5.1 session:

| Worker | Requested | Observed (subagent transcript `model` field) | Verified | Turns | Output tok | Cache write | Cache read | Wall time |
|---|---|---|---|---|---|---|---|---|
| omniclaude:luna-researcher | haiku / medium | claude-haiku-5-5 | model: yes; effort: not observed (not in transcript) | 3 | 103 | 10,468 | 13,364 | 4.7 s |
| omniclaude:terra-explorer | sonnet / low | claude-sonnet-5-5 | model: yes; effort: not observed (not in transcript) | 6 | 694 | 23,800 | 31,334 | 11.9 s |

- Transcripts: `~/.claude/projects/C--CC/6b9cb486-67db-42f9-80e2-b67bf109ad86/subagents/agent-a319e24c65d163482.jsonl` (luna) and `agent-a20e3c990b13c2ef8.jsonl` (terra). The `meta.json` of each shows `agentType` `omniclaude:<name>` and `spawnDepth` 1.
- Both workers returned the handoff format from their agent files (Status / Findings or Map / Unknowns or Risks / Next).
- luna-researcher answered correctly: 4 Markdown files under `docs/`.
- terra-explorer located SKILL.md lines 15-23 and `tests/test_skill.py` lines 22-26 correctly.
- verified: the model that served each worker matched the model requested (luna: Haiku, terra-explorer: Sonnet). The requested effort level was not observed.

## Standalone engine authentication

- The `claude plugin eval` smoke run (Task 7) ended with "Not logged in · Please run /login", exit 2, $0.00. The standalone engine has no credentials; the desktop app's session is separate.
- Because of this, the headless `-p` delegation test did not run.
- The user chose to log the engine in (`claude.exe auth login`). That step was pending at the time of writing.

## Acceptance status (spec §8.3)

| Criterion | Status | Evidence |
|---|---|---|
| Install from the local marketplace | met | Install section above |
| omniclaude:luna-researcher and omniclaude:terra-implementer callable in a new desktop session | partial | both listed by the Agent tool; luna-researcher and terra-explorer were invoked (table above); terra-implementer was listed but not invoked |
| /tasks and transcript show requested model and effort | partial | model verified from both worker transcripts; effort not observed; /tasks row not obtained |
| omitClaudeMd honored | met | the project CLAUDE.md at C:\CC contains the marker "RuFlo"; the parent transcript contains it 7 times; all 16 non-OmniClaude subagent transcripts in the same session contain it; the two OmniClaude worker transcripts (agent-a319e24c65d163482.jsonl, agent-a20e3c990b13c2ef8.jsonl) contain it 0 times and contain "Behavioral Rules (Always Enforced)" 0 times (checked with grep -c on 2026-10-13) |
| Routing skill triggers on a substantial task | not tested | the eval suite (Task 9) measures delegation; the two dispatches above were explicit |

## Measured results

Pending: the with/without-plugin eval (Task 9) runs after the standalone engine is authenticated. No savings claim is made.

## Caveats

- The effort level applied to each worker was not observable in transcripts. `/tasks` would show it in the UI, but it was not observed.
- The two dispatches were explicit, so they do not measure whether Claude delegates on its own.
- The installed copy recorded in installed_plugins.json is pinned to commit a9a048b; whether a session loads that copy or the working tree was not tested.
