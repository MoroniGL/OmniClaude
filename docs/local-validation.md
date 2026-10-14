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
- The user chose to log the engine in (`claude.exe auth login`). On 2026-10-14 the user logged the standalone engine in (`claude.exe auth status` → `loggedIn: true`, `authMethod: claude.ai`); the eval below ran with that login.

## Acceptance status (spec §8.3)

| Criterion | Status | Evidence |
|---|---|---|
| Install from the local marketplace | met | Install section above |
| omniclaude:luna-researcher and omniclaude:terra-implementer callable in a new desktop session | partial | both listed by the Agent tool; luna-researcher and terra-explorer were invoked (table above); terra-implementer was listed but not invoked |
| /tasks and transcript show requested model and effort | partial | model verified from both worker transcripts; effort not observed; /tasks row not obtained |
| omitClaudeMd honored | met | the project CLAUDE.md at C:\CC contains the marker "RuFlo"; the parent transcript contains it 7 times; all 16 non-OmniClaude subagent transcripts in the same session contain it; the two OmniClaude worker transcripts (agent-a319e24c65d163482.jsonl, agent-a20e3c990b13c2ef8.jsonl) contain it 0 times and contain "Behavioral Rules (Always Enforced)" 0 times (checked with grep -c on 2026-10-13) |
| Routing skill triggers on a substantial task | not met in the traced runs | 0 Skill-tool calls in the 2 traced diagnostic runs (scout-call-sites, docs-lookup); Skill use was not counted in the 12 suite runs (see Measured results) |

## Measured results

On 2026-10-14 the with/without-plugin eval ran from `plugins/omniclaude` (engine 2.1.295, logged in via claude.ai) with:

```text
claude plugin eval . --scaffold --allow-tools Edit Write --model claude-opus-5-5 --runs 3 -j 2 --max-cost-usd 15 --no-publish --trust-plugin --json omni-eval.json
```

The parent model was pinned to `claude-opus-5-5` in both arms; the judge model was the default (Haiku). The suite was 4 cases × 3 runs × 2 arms = 24 agent runs plus Haiku judge calls. Exit code 0, `partial: false`, suite wall time 192 s, total list-price cost US$ 2.11. The full JSON is `.superpowers/sdd/2026-10-13-omniclaude-stage1-core/task-9-eval-result.json` and the HTML report is `plugins/omniclaude/evals/results/2026-10-14T10-13-32-943Z/report.html`. Both paths are git-ignored, so they exist only on the machine that ran the eval. No savings claim is made.

Scores are the mean per case (1.00 means every grader passed in every run). Costs are the mean list-price estimate per run in US$, cache reads and writes included, judge cost excluded.

| Case | WITH score | W/OUT score | Δ | WITH cost | W/OUT cost | Delegated (with-arm) | Models served (with-arm) |
|---|---|---|---|---|---|---|---|
| docs-lookup | 1.00 | 1.00 | 0.00 | 0.1058 | 0.0638 | not counted (only `no-astra`: 0 `astra-expert` dispatches in 3 runs) | claude-opus-5-5 (parent); worker dispatch not counted |
| implement-discount | 1.00 | 1.00 | 0.00 | 0.1058 | 0.1024 | not counted (only `no-astra`: 0 `astra-expert` dispatches in 3 runs) | claude-opus-5-5 (parent); worker dispatch not counted |
| scout-call-sites | 1.00 | 1.00 | 0.00 | 0.1043 | 0.1007 | 0 of 3 runs | claude-opus-5-5 only (parent); no worker dispatched |
| tiny-edit | 1.00 | 1.00 | 0.00 | 0.0652 | 0.0569 | 0 of 3 runs | claude-opus-5-5 only (parent); no worker dispatched |

How delegation was counted:
- scout-call-sites: the `delegated` grader (Agent calls whose input matches `omniclaude:`, WITH arm only) failed in all 3 WITH runs with "Agent called 0x (expected 1..∞)". The parent never dispatched an OmniClaude worker.
- tiny-edit: the `no-delegation` grader (any Agent call, both arms) passed in all 6 runs, so there was no over-delegation on the tiny task.
- every case: the `no-astra` grader (Agent calls matching `astra-expert`, both arms) passed in all 24 runs.
- docs-lookup and implement-discount have no grader that counts Agent calls other than `astra-expert`, and the per-run traces of the full suite were temporary files that are no longer on disk. For those two cases general Agent use in the suite runs is unobserved; the only direct Agent-call count for docs-lookup is the single diagnostic run below.

### Diagnostic: did the routing skill fire?

Two extra single-arm (WITH only), single-run diagnostics were run on 2026-10-14 with `--keep-temp` (parent `claude-opus-5-5`) and their traces were inspected. Cost: US$ 0.15 for scout-call-sites and US$ 0.08 for docs-lookup.

- scout-call-sites: 10 turns; tools used: Grep ×3, Glob ×1, Read ×5; `Skill` tool calls: 0; `Agent` tool calls: 0; models in the trace: claude-opus-5-5 only; usage 45,740 cache-write + 122,065 cache-read + 908 output tokens. The only mention of "omniclaude" in the trace is the system prompt's agent/skill listing.
- docs-lookup: 4 turns; tools used: Grep ×1, Read ×2; `Skill` calls: 0; `Agent` calls: 0; claude-opus-5-5 only; usage 8,436 cache-write + 41,470 cache-read + 309 output tokens.

The `routing` skill never fired on these prompts and the parent never delegated. `Skill`-tool calls were counted only in these two diagnostic runs, not in the 12 suite runs.

### Conclusion

- Cost did not go down on any task shape. Mean cost per run with the plugin was higher on all four cases: docs-lookup +66%, tiny-edit +15%, scout-call-sites +4%, implement-discount +3%. The +66% case is noisy: its three WITH runs cost 0.1273 / 0.1218 / 0.0683 against 0.0658 / 0.0662 / 0.0592 W/OUT. These are per-case results of this one suite, not a general cost figure.
- Quality held. Every case scored 1.00 in both arms, every grader passed in all 24 runs, and Δ = 0.00 everywhere. The plugin neither helped nor hurt correctness on these tasks.
- Delegation: 0 Agent-tool calls in the 8 with-plugin runs where it was counted (scout-call-sites ×3 via `delegated`, tiny-edit ×3 via `no-delegation`, plus the 2 traced diagnostic runs); the 6 docs-lookup and implement-discount suite runs had only the `no-astra` counter, so general Agent use there is unobserved.
- The plugin's only runtime effect in this suite was its always-on context (~636 tokens per session, from `plugin details`), a fixed overhead. Because no delegation was observed in the counted runs, no cheaper-tier execution was seen to offset it.

Caveats:
- Costs are list-price estimates, not billed amounts.
- 3 runs per arm.
- The repositories are small and synthetic (the scout case is 47 files of about 8 lines, and a single Grep finds every call site).
- Eval sessions load no user `CLAUDE.md` and no other plugins.
- The tasks are small enough that Opus 5.5 handles them in 2–10 turns without needing help.

### Hypotheses and next steps (not measured)

Possible causes of the missing delegation. None of these was tested:
- The routing skill's description triggers on "substantial multi-step work"; Opus 5.5 may classify these 2–10-turn tasks as small enough to do directly (the skill itself says tiny work stays in the parent).
- Claude Code 2.1.295 ships prompt text that discourages delegation unless a `CLAUDE.md` or skill asks for it; a skill that is not invoked cannot ask.
- Eval sessions load no user `CLAUDE.md`, so nothing else encourages delegation.

Next steps (Stage 2 candidates, not done): make the skill description more trigger-rich for exploration and research phrasing; test larger repositories where exploration genuinely exceeds the parent's context; measure delegation rate as a first-class metric (`tool_used` Skill and Agent graders) before any cost claim.

## Caveats

- The effort level applied to each worker was not observable in transcripts. `/tasks` would show it in the UI, but it was not observed.
- The two dispatches were explicit, so they do not measure whether Claude delegates on its own.
- The installed copy recorded in installed_plugins.json is pinned to commit a9a048b; whether a session loads that copy or the working tree was not tested.
