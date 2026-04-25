---
spec: GitHub Repo Grounding — let Fathom answer questions grounded in a cloned GitHub repository
owning_team_primary: Implementer teammate (dispatched 2026-04-25; user said "It's a very straightforward task that you can do; just give that to a teammate to implement.")
owning_team_secondary: PM Interpreter (this synthesis)
status: READY FOR IMPLEMENTATION — user confirmed no research needed; implementer dispatched
created: 2026-04-25
related_specs:
  - `.claude/specs/whiteboard-diagrams.md` (the GitHub repo also feeds the Whiteboard's grounding pool — same `additionalDirectories` mechanism)
  - `.claude/specs/active-learning.md` (the Purpose Anchor can reference "I'm reading this paper to compare to the cited repo X" — same input slot)
---

# Status

User confirmed 2026-04-25: *"You can start to research on the GitHub repo grounding, and you don't need to do research. It's a very straightforward task that you can do; just give that to a teammate to implement."* Plus: *"yes, you have to make sure that you are using the best of agent capabilities for the github repo grounding so that I can get explanations for the github repo as well."*

**No research pass needed.** The implementation builds on the existing `additionalDirectories` infrastructure (Settings panel already supports "Extra grounding directories"). The new path: clone a git URL into a managed userData directory, then add the local clone path to the same `additionalDirectories` list. Claude Code's `Read` / `Grep` / `Glob` / `Bash` tools then operate over the repo at explain time exactly like they operate over the paper's own index — meaning the user gets full lens-quality explanations of the repo's code, not just keyword search.

Implementer dispatched. v1 scope is the bullet list below.

# Why this spec exists — quoted user instruction (verbatim)

> "I should be able to specify a git repo that gets stored in the temporary directory when it is cloned. Maybe we can delete it later, or it's just there for some time, and then we are able to answer questions over that as well. That we are also able to ground it on a GitHub repo. Then ideally I would also want to be able to use SSH so that I can configure this to work with my desktop. It can run grep and all those commands simply by SSH, so whatever code, etc., it needs, it can connect there and maybe even run experiments while I'm inside the paper. It can answer my questions, run experiments, and everything. This is another new line of features that it can do and that I'm thinking about."
>
> "But for now, I feel like running experiments is just secondary; I can put that in a future plan somewhere in any document, low priority for me. The mean party is in the current temp directory; we should be able to clone and then answer. I should be able to provide the GitHub URL in the preferences."

# Scope split

## v1 (primary, this spec)
- User pastes a GitHub URL into Preferences ("Extra grounding repos").
- Fathom clones to a managed temp directory.
- The cloned path is added to the existing `additionalDirectories` array passed to every Claude lens / Whiteboard call — so Read / Grep / Glob can search the repo at explain time exactly like they search the paper's index.
- Cleanup policy: deletable from Preferences with one click; auto-evict after a configurable TTL (default 30 days of unused) to bound disk.
- Visible in the Preferences list with: repo URL, clone size, last accessed, "Update" / "Remove" buttons.

## Deferred (low priority, future spec — not implemented in v1)
- SSH-based remote grounding ("connect Fathom to my desktop, let it grep + run experiments over SSH").
- Running experiments / executing arbitrary commands in the cloned repo (vs. just Reading / Grepping it).
- Cross-paper repo sharing (one repo serving as ground truth for multiple papers in a series).

A pointer to these deferred items is added to `todo.md` so a later session picks them up.

# Hard requirements (v1)

1. **Preferences UI: an "Extra grounding GitHub repos" section.** Sits beneath the existing "Extra grounding directories" section in the Settings panel. Add-by-URL field; validates that the URL is a GitHub repo (or any git remote — gitlab/bitbucket/SSH all work, the input field is just "git URL").
2. **Clone-on-add, not lazy.** User pastes URL, presses Enter, Fathom clones immediately. Spinner + progress indicator during clone. Failure (404, auth, network) surfaces an inline error with a retry button. On success, the repo appears in the list with size + path.
3. **Storage location: managed temp directory** under `~/Library/Application Support/Fathom/repos/<sha-of-url>/`. (Per CLAUDE.md §9, we keep app data in userData rather than `/tmp`, so cleanup survives macOS temp-purges. The user said "temporary directory" but the *intent* is "ephemeral, deletable, not the user's home dir" — userData satisfies that.)
4. **Wired into existing grounding machinery.** The `additionalDirectories` array in `src/main/index.ts` (passed to every `query()` call) already accepts a list of paths. Adding a repo path is one entry in that array. No new IPC, no new prompt structure — the existing AI client picks it up.
5. **Authentication.** v1: read-only public repos only. SSH auth, personal access tokens, GitHub OAuth all DEFERRED. If the clone fails because the repo is private, surface "private repos require authentication — coming soon" and link to the deferred features list.
6. **Update flow.** "Update" button on a repo runs `git pull` (or re-clones if shallow). Manual only — no auto-pull on app open (would be slow + unexpected).
7. **Eviction.** Auto-evict repos unused for >30 days (configurable). Eviction = `rm -rf` of the local clone + remove from Preferences list. Re-adding the URL re-clones.
8. **Disk-size guardrail.** Before cloning, do a `git ls-remote` size estimate (or fall back to `git clone --depth 1` + measure). Repos >500 MB prompt confirmation: *"This repo is ~X GB; clone anyway?"*

# Open architectural questions (for research / PM design pass)

1. **Shallow vs. full clone**: shallow (`--depth 1`) is faster but loses git history / blame. Full clone is more useful for grep but heavier. Default to shallow + offer "deep clone" toggle per repo? Default to full and rely on size guardrail?
2. **Per-paper vs. global repos**: should a repo be associated with a specific paper (only feeds that paper's grounding) or always available for every paper? Current `additionalDirectories` is global. Per-paper would need a new join (paper_hash → repo_id). Recommend global for v1 simplicity — most user cases are "I'm reading several papers from the same lab, here's their repo."
3. **Branch / tag / commit pinning**: research papers reference specific repo versions. Should we let the user pin a repo to a specific commit (matches the paper's experiment) vs. always pulling latest? Recommend: clone the default branch in v1, let the user enter a `?ref=<sha>` URL fragment if they want pinning.
4. **Submodule handling**: `git clone --recurse-submodules` on by default? Many ML papers have submodules. Recommend yes, with a per-repo toggle to disable.
5. **`.gitignore` filtering for grounding**: should the index pass over the cloned repo *exclude* `node_modules`, build artifacts, etc.? They blow up grep token costs and rarely contain useful information. Default exclusions should match the existing Fathom search-skip list.
6. **Repo content as Whiteboard grounding**: when the Whiteboard pipeline (S1 Extract) runs, should it ALSO grep the cloned repo for symbols mentioned in the paper? That could be the most valuable single integration — the Whiteboard could cite "this is what `class TransformerBlock` looks like in the official repo." Defer the integration until both specs ship; flag here.
7. **Privacy**: cloned repos may contain user data, secrets, etc. The grounding directories are passed to Claude Code. Should we surface a one-time warning when a repo is added that says "Claude Code will Read/Grep this repo to answer your questions"? Or trust the user since they explicitly added it? Recommend the warning on first add only.

# Cognitive design notes (for cog reviewer)

- **Doherty (cog rule §3):** clone is a long async — show progress within 1 frame of pressing Enter. Don't block the Settings UI.
- **Hick's Law (§7):** the Preferences "Extra grounding" sections (directories + repos) total to ~6 controls per repo entry (URL field, Update, Remove, status). Keep flat — don't nest into expansion panels.
- **Default-setting ethics (§8):** auto-eviction at 30 days is a default that DELETES user data. Should be opt-out, not opt-in, with a setting. Recommend: default ON with a Preferences toggle "Auto-evict unused repos after [N] days."

# Implementation effort estimate (PM, not the AI Scientist's lane)

Roughly 3-4 days for a senior implementer, assuming the existing `additionalDirectories` infra is sound:

- **Day 1**: Settings panel UI (new section, list view, add-by-URL field, validation)
- **Day 2**: Main-process clone manager (clone, store, list, evict). Shells out to `git`. SQLite table `grounding_repos(id, url, local_path, cloned_at, last_used_at, size_bytes)`.
- **Day 3**: Wire into `additionalDirectories` in IPC handlers. Test grounding works end-to-end (open a paper, ask a question that requires repo content, verify Claude greps the repo).
- **Day 4**: Polish — size warning, error handling, Update / Remove flows, eviction job.

# Sequencing

1. AI Scientist agent (to be spawned with this spec) — researches: clone strategy (shallow vs full vs partial), .gitignore filtering for grounding, Whiteboard integration design, security/privacy considerations.
2. PM (this file) — synthesises into final design.
3. Cog Reviewer — gates the Preferences UI changes.
4. User picks slice + implementation begins.
5. Quality Analyst — end-to-end test on a real paper + repo (e.g. "Attention Is All You Need" + the official Transformer repo).

# Definition of "research done"

- ⏳ AI Scientist agent returns: clone strategy decision, ignore-list defaults, security/privacy recommendations, integration design with `additionalDirectories` and the Whiteboard pipeline
- ⏳ PM synthesises into concrete design
- ⏳ Cog Reviewer signs off on the Preferences UI
- ⏳ User picks slice
- ⏳ Implementation begins
