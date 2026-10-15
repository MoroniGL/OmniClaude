# Local validation

Machine: Windows 11, Claude desktop app engine 2.1.295 (no `claude` on PATH). Date: 2026-10-13.

Names: on 2026-10-15 the workers were renamed after the Claude model families (`luna` → `haiku`, `terra` → `sonnet`, `sol` → `opus`, `astra` → `fable`; `/omni astra` → `/omni fable`; grader `no-astra` → `no-fable`). The records below keep the names in force when they were taken.

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

## Acceptance status

The first five rows are the Stage 1 criteria (spec §8.3). The last four are the Stage 2 live acceptance items 7 to 9 (Stage 2 spec §9), recorded under Stage 2 live checks below.

| Criterion | Status | Evidence |
|---|---|---|
| Install from the local marketplace | met | Install section above |
| omniclaude:luna-researcher and omniclaude:terra-implementer callable in a new desktop session | partial | both listed by the Agent tool; luna-researcher and terra-explorer were invoked (table above); terra-implementer was listed but not invoked |
| /tasks and transcript show requested model and effort | partial | model verified from both worker transcripts; effort not observed; /tasks row not obtained |
| omitClaudeMd honored | met | the project CLAUDE.md at C:\CC contains the marker "RuFlo"; the parent transcript contains it 7 times; all 16 non-OmniClaude subagent transcripts in the same session contain it; the two OmniClaude worker transcripts (agent-a319e24c65d163482.jsonl, agent-a20e3c990b13c2ef8.jsonl) contain it 0 times and contain "Behavioral Rules (Always Enforced)" 0 times (checked with grep -c on 2026-10-13) |
| Routing skill triggers on a substantial task | not met in the traced runs | 0 Skill-tool calls in the 2 traced diagnostic runs (scout-call-sites, docs-lookup); Skill use was not counted in the 12 suite runs (see Measured results) |
| /omni works in a session (spec §9 item 7) | met for `status` | `/omni status` ran in a new desktop Code-tab session on 2026-10-15 and answered with the status text (profile `auto`, mod version 0.2.0-alpha.1; status line `omni:auto`); the other subcommands are covered by the 95 plugin tests; headless `/omni status` could not run because Git Bash converted `/omni` to a Windows path |
| economy parent runs on Sonnet (verified) (spec §9 item 7) | met | `modelUsage` claude-sonnet-5-5 (headless run with `OMNICLAUDE_PROFILE=economy`, not `/omni economy` in a desktop session) |
| Explore under economy runs on Haiku (spec §9 item 8) | met | subagent meta and transcript claude-haiku-5-5 |
| astra refused without consent, live (spec §9 item 9) | not tested live | covered by plugin tests |

## Measured results

On 2026-10-14 the with/without-plugin eval ran from `plugins/omniclaude` (engine 2.1.295, logged in via claude.ai) with:

```text
claude plugin eval . --scaffold --allow-tools Edit Write --model claude-opus-5-5 --runs 3 -j 2 --max-cost-usd 15 --no-publish --trust-plugin --json omni-eval.json
```

The parent model was pinned to `claude-opus-5-5` in both arms; the judge model was the default (Haiku). The suite was 4 cases × 3 runs × 2 arms = 24 agent runs plus Haiku judge calls. Exit code 0, `partial: false`, suite wall time 192 s, agent-run list-price cost US$ 2.11 (the JSON `costUsd`; judge calls add roughly US$ 0.005 more). The full JSON is `.superpowers/sdd/2026-10-13-omniclaude-stage1-core/task-9-eval-result.json` and the HTML report is `plugins/omniclaude/evals/results/2026-10-14T10-13-32-943Z/report.html`. Both paths are git-ignored, so they exist only on the machine that ran the eval. No savings claim is made.

Scores are the mean per case (1.00 means every scored grader passed in every run). Costs are the mean list-price estimate per run in US$, cache reads and writes included, judge cost excluded.

| Case | WITH score | W/OUT score | Δ | WITH cost | W/OUT cost | Delegated (with-arm) | Models served (with-arm) |
|---|---|---|---|---|---|---|---|
| docs-lookup | 1.00 | 1.00 | 0.00 | 0.1058 | 0.0638 | not counted (only `no-astra`: 0 `astra-expert` dispatches in 3 runs) | parent pinned to claude-opus-5-5 (requested); served model not observed in the suite runs; one diagnostic trace showed only claude-opus-5-5 |
| implement-discount | 1.00 | 1.00 | 0.00 | 0.1058 | 0.1024 | not counted (only `no-astra`: 0 `astra-expert` dispatches in 3 runs) | parent pinned to claude-opus-5-5 (requested); served model not observed in the suite runs |
| scout-call-sites | 1.00 | 1.00 | 0.00 | 0.1043 | 0.1007 | 0 of 3 runs | parent pinned to claude-opus-5-5 (requested); served model not observed in the suite runs; one diagnostic trace showed only claude-opus-5-5 |
| tiny-edit | 1.00 | 1.00 | 0.00 | 0.0652 | 0.0569 | 0 of 3 runs | parent pinned to claude-opus-5-5 (requested); served model not observed in the suite runs |

How delegation was counted:
- scout-call-sites: the `delegated` grader (Agent calls whose input matches `omniclaude:`, WITH arm only) failed in all 3 WITH runs with "Agent called 0x (expected 1..∞)". The parent never dispatched an OmniClaude worker.
- tiny-edit: the `no-delegation` grader (any Agent call, both arms) passed in all 6 runs, so there was no over-delegation on the tiny task.
- every case: the `no-astra` grader (Agent calls matching `astra-expert`, both arms) passed in all 24 runs.
- docs-lookup and implement-discount have no grader that counts Agent calls other than `astra-expert`, and the per-run traces of the full suite were temporary files that are no longer on disk. For those two cases general Agent use in the suite runs is unobserved; the only direct Agent-call count for docs-lookup is the single diagnostic run below.

### Diagnostic: did the routing skill fire?

Two extra single-arm (WITH only), single-run diagnostics were run on 2026-10-14 with `--keep-temp` (parent `claude-opus-5-5`) and their traces were inspected. Cost: US$ 0.15 for scout-call-sites and US$ 0.08 for docs-lookup.

- scout-call-sites: 10 turns; tools used: Grep ×3, Glob ×1, Read ×5; `Skill` tool calls: 0; `Agent` tool calls: 0; models in the trace: claude-opus-5-5 only; usage 45,740 cache-write + 122,065 cache-read + 908 output tokens. The only mention of "omniclaude" in the trace is the system prompt's agent/skill listing.
- docs-lookup: 4 turns; tools used: Grep ×1, Read ×2; `Skill` calls: 0; `Agent` calls: 0; claude-opus-5-5 only; usage 8,436 cache-write + 41,470 cache-read + 309 output tokens.

The `routing` skill did not fire in either run and the parent never delegated. `Skill`-tool calls were counted only in these two diagnostic runs, not in the 12 suite runs.

### Conclusion

- Cost did not go down on any task shape. Mean cost per run with the plugin was higher on all four cases: docs-lookup +66%, tiny-edit +15%, scout-call-sites +4%, implement-discount +3%. The +66% case is noisy: its three WITH runs cost 0.1273 / 0.1218 / 0.0683 against 0.0658 / 0.0662 / 0.0592 W/OUT. These are per-case results of this one suite, not a general cost figure.
- Quality held. Every case scored 1.00 in both arms, every scored grader passed in all 24 runs (the unscored, with-only `delegated` indicator failed in the 3 scout-call-sites WITH runs), and Δ = 0.00 everywhere. The plugin neither helped nor hurt correctness on these tasks.
- Delegation: no OmniClaude-worker dispatch in the 8 counted with-plugin runs (scout-call-sites ×3: 0 Agent calls matching `omniclaude:`; tiny-edit ×3 and the 2 traced diagnostics: 0 Agent calls of any kind). The 6 docs-lookup and implement-discount suite runs had only the `no-astra` counter, so general Agent use there is unobserved.
- In the 2 traced runs the plugin's only visible runtime effect was its always-on context (~636 tokens per `plugin details`); the cause of the per-case cost gap (largest on docs-lookup, +US$ 0.042 per run, versus +US$ 0.008 on tiny-edit with identical turn counts) was not established.

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

## Stage 2 live checks

On 2026-10-14 the Stage 2 mod was exercised with headless `claude -p --output-format json` runs on engine 2.1.295 (logged in via claude.ai). The installed plugin was read from `C:\CC\omniclaude\plugins\omniclaude`. The levels below are API-reported `modelUsage` keys from the `-p` JSON result and the `model` fields of the transcripts, not the mod's own claims.

### Alias rejection (before the fix, HEAD 17b6f32)

`claude -p "/omni status"` returned `is_error: true`, `api_error_status: 404` and the result "There's an issue with the selected model (opus)...", with stderr `[claude-code:unrecognized_model] {"model":"opus","query_source":"sdk"}`; cost US$ 0. Conclusion: `turn.step` requires full model ids and rejects aliases. The mod was fixed in b6ab1b9 (`TIER_IDS`, full ids) and the runs below used that commit.

### After the fix (HEAD b6ab1b9)

| Run | Env | Prompt | modelUsage keys (API-reported) | Cost (list) | Turns |
|---|---|---|---|---|---|
| economy-pong | `OMNICLAUDE_PROFILE=economy` | "Reply with the single word pong." | claude-sonnet-5-5 | US$ 0.248 | 1 |
| balanced-pong | `OMNICLAUDE_PROFILE=balanced` | same | claude-opus-5-5 | US$ 0.231 | 1 |
| economy-explore | `OMNICLAUDE_PROFILE=economy` | "Use the Explore agent to list the Markdown files under docs/ and report only the count." | claude-sonnet-5-5 (parent) + claude-haiku-5-5 (Explore) | US$ 0.147 | 1 |
| status (headless) | none | "/omni status" | claude-opus-5-5 (the model answered; the command never ran) | US$ 0.493 | 4 |

Transcripts (`~/.claude/projects/C--CC-omniclaude/`):

- economy-explore, session 734c748c-afe3-41f0-b57c-c22ca9928142: the parent transcript shows model claude-sonnet-5-5 ×3; the subagent `agent-a666c88c0e4cf796d` has meta `{"agentType":"Explore", ..., "model":"claude-haiku-5-5"}` and its transcript shows claude-haiku-5-5 ×3.
- economy-pong, session 8156d150-c5dd-4ecf-9f5d-e2d2b77ede2d: model claude-sonnet-5-5 ×1.

Notes:

- The headless `/omni status` did not run the command. Git Bash (MSYS) converted the argument `/omni status` into the Windows path `C:/Program Files/Git/omni status`, so the model received a plain prompt. This is a test-harness artifact (use `MSYS_NO_PATHCONV=1`, or type the command in the UI), not a mod defect. The mod, including `/omni`, is covered by 95 plugin tests. On 2026-10-15 the user ran `/omni status` in a new desktop Code-tab session: it answered with the status text (profile `auto`, saved profile none, session override none, requested parent opus/medium "not classified yet", every last-step field "none yet", astra consent no, mod version 0.2.0-alpha.1) and the status line showed `omni:auto`; the session picker showed Opus 5.5. Evidence: the user's screenshot, not stored in the repo. Only `status` was exercised there.
- The headless and eval runs choose their profile with `OMNICLAUDE_PROFILE` / `EVAL_OMNICLAUDE_PROFILE`, added in the final fix wave because eval and SDK prompts reportedly do not come from the composer and are not classified by `auto`.
- The `[1m]` suffix on a full id (for example `claude-opus-5-5[1m]`) has not been live-tested.

## Stage 2 measurement

On 2026-10-14 the with/without-plugin eval ran again from `plugins/omniclaude` (engine 2.1.295, plugin at HEAD f937341), once per profile:

```text
EVAL_OMNICLAUDE_PROFILE=<profile> claude plugin eval . --scaffold --allow-tools Edit Write --model claude-opus-5-5 --runs 3 -j 2 --max-cost-usd 7 --no-publish --trust-plugin --json ...
```

Both passes exited 0 with `partial: false`; the judge was the default (Haiku). The reports are `plugins/omniclaude/evals/results/2026-10-14T21-48-18-077Z` (balanced) and `2026-10-14T21-53-03-676Z` (economy); both are git-ignored, so they exist only on the machine that ran the eval. The suite is the Stage 1 suite with the `agent-used` and `skill-fired` indicators in every case.

`EVAL_OMNICLAUDE_PROFILE` selects the profile for the with-plugin arm, because eval prompts reportedly arrive with a non-composer origin and `auto` never classifies them. The arm without the plugin has no mod, so the variable is inert there.

Cost columns are the mean list-price estimate per run in US$ (as in the Stage 1 table). Δ cost compares WITH to W/OUT.

### Pass 1: balanced

The parent was pinned to claude-opus-5-5 in both arms; the mod routes Explore and general-purpose to Sonnet. Agent-run cost US$ 2.18, 285 s.

| Case | WITH mean | W/OUT mean | Δ cost | WITH / W/OUT score | Agent calls (with) | Skill calls (with) |
|---|---|---|---|---|---|---|
| docs-lookup | 0.1121 | 0.0694 | +61% | 1.00 / 1.00 | 0 | 0 |
| implement-discount | 0.1112 | 0.1007 | +10% | 1.00 / 1.00 | 0 | 0 |
| scout-call-sites | 0.1092 | 0.0981 | +11% | 1.00 / 1.00 | 0 | 0 |
| tiny-edit | 0.0680 | 0.0571 | +19% | 1.00 / 1.00 | 0 | 0 |

Per-run cost, WITH: docs 0.1248 / 0.1291 / 0.0822; implement 0.1078 / 0.1188 / 0.1069; scout 0.1002 / 0.1120 / 0.1153; tiny 0.0680 / 0.0680 / 0.0681. W/OUT: docs 0.0694 / 0.0697 / 0.0691; implement 0.0947 / 0.1056 / 0.1018; scout 0.1067 / 0.0895 / 0.0982; tiny 0.0576 / 0.0577 / 0.0562.

### Pass 2: economy

The mod was configured to rewrite the with-arm parent to claude-sonnet-5-5 (served model not recorded by the eval; see the headless live check) and to route Explore to Haiku; the arm without the plugin was pinned to claude-opus-5-5 with --model (served model not recorded by the eval). Agent-run cost US$ 1.55, 213 s.

| Case | WITH mean | W/OUT mean | Δ cost | WITH / W/OUT score | Agent calls (with) | Skill calls (with) |
|---|---|---|---|---|---|---|
| docs-lookup | 0.0524 | 0.0689 | −24% | 1.00 / 1.00 | 0 | 0 |
| implement-discount | 0.0529 | 0.1003 | −47% | 1.00 / 1.00 | 0 | 0 |
| scout-call-sites | 0.0489 | 0.0929 | −47% | 1.00 / 1.00 | 0 | 0 |
| tiny-edit | 0.0423 | 0.0570 | −26% | 1.00 / 1.00 | 0 | 0 |

Per-run cost, WITH: docs 0.0603 / 0.0597 / 0.0373; implement 0.0531 / 0.0526 / 0.0529; scout 0.0494 / 0.0495 / 0.0476; tiny 0.0428 / 0.0425 / 0.0418. W/OUT: docs 0.0674 / 0.0691 / 0.0704; implement 0.0982 / 0.1055 / 0.0971; scout 0.0881 / 0.0946 / 0.0959; tiny 0.0575 / 0.0562 / 0.0574.

### Counting notes

- `agent-used` and `skill-fired` are with-only indicators (`tool_used`, min 0) present in every case. All 24 WITH runs across both passes show `Agent called 0x` and `Skill called 0x`. `no-astra` passed in all 48 runs.
- Every scored grader passed in all 48 runs (the LLM judge passed 3/3 votes on implement-discount `correct` and scout-call-sites `answer` in both arms of both passes). Scores sit at the 1.00 ceiling, so the graders cannot detect a quality drop finer than pass/fail.

### Conclusions

- Under `balanced` the plugin adds cost (+10% to +61% per run) with identical scores. Both arms were pinned to the same parent model with --model (served model not recorded) and no delegation occurred, so nothing offsets the with-arm's added context (the policy section plus the always-on context; this overhead was not isolated by a separate run).
- Under `economy` the plugin cut cost by 24% to 47% per run with identical scores. The saving is consistent with the enforced Sonnet parent (the eval JSON records no served model; the headless check with `OMNICLAUDE_PROFILE=economy` showed `claude-sonnet-5-5`) and not with delegation, which stayed at zero in all 24 with-plugin Stage 2 eval runs; the mod's effort setting and added context were not isolated.
- The routing policy in the system prompt did not produce any delegation on these tasks. The policy itself tells the model to keep tiny work in the conversation, and these tasks are small (2–10 turns).
- Caveats: list-price estimates; 3 runs per arm; synthetic repositories; eval sessions load no user `CLAUDE.md`; graders at ceiling; the parent pin is a model swap whose quality effect on harder work is not measured here.

### Comparison with Stage 1

Same cases, Opus parent, advisory plugin. Stage 1 WITH means were docs 0.1058, implement 0.1058, scout 0.1043 and tiny 0.0652, all higher than W/OUT (Measured results above). Stage 2 `balanced` reproduces that pattern; Stage 2 `economy` inverts it.

### Manual advisor arm (not comparable)

`plugin eval` cannot set the advisor: there is no environment or flag passthrough, and `advisorModel` is a setting while eval homes are isolated. A manual arm therefore ran the four case prompts once each with `claude -p --model claude-sonnet-5-5 --advisor opus` under `EVAL_OMNICLAUDE_PROFILE=economy`, in scaffolded temp workspaces, from the user's real environment (so with the user's `CLAUDE.md`, plugins and MCP servers loaded, a much larger context than the eval's isolated home). These numbers are not comparable with the tables above.

| Case | Cost | Turns | modelUsage | Answer correct? |
|---|---|---|---|---|
| docs-lookup | 0.0938 | 3 | claude-sonnet-5-5 only (cr 73,054 / cw 18,447) | yes (45 s, ACME_SYNC_TIMEOUT, sync.md) |
| scout-call-sites | 0.1267 | 9 | claude-sonnet-5-5 only (cr 165,770) | yes (3 call sites) |
| implement-discount | 0.1157 | 5 | claude-sonnet-5-5 only | plausible (not graded) |
| tiny-edit | 0.0986 | 3 | claude-sonnet-5-5 only | yes |

No Opus usage appears in `modelUsage` and no advisor server-tool use was recorded, so there is no evidence the advisor was consulted on these small prompts. The higher costs versus the eval's economy arm come from the larger real-environment context, not from the advisor. Conclusion: the advisor's effect on cost and quality is not measured, and the README may only describe it as an option.
