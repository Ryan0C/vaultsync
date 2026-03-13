# AGENTS.md

## Repo
- Name: `VaultSync`
- Purpose: Foundry VTT module for deterministic export and controlled import flows.
- Main code: `src/`
- Foundry helper scripts: `scripts/`

## Core commands
- Install: `npm install`
- Dev watch build: `npm run dev`
- Build: `npm run build`
- Typecheck: `npm run typecheck`
- Foundry local boot helper: `npm run foundry`

## Work Prioritization
Before starting work, review repo memory together with the local mirror in `.agent-mirror`.

Use these sources to decide what to work on:
- `.agent-mirror/changelog.md` for the latest recent activity and likely active workstreams
- `.agent-mirror/git-summary.json` for structured recent commit and issue/PR linkage
- `.agent-mirror/issues` for current issue details
- `.agent-mirror/prs` for active and recent PR context
- repo memory files for longer-term plans, priorities, and constraints

Prioritize work by combining:
- items explicitly called out in memory
- recently active issues or PRs
- commits linked to open issues or PRs
- work that appears in both memory and the mirror

If memory and mirror disagree, treat memory as strategy and the mirror as current execution context.
Use GitHub/Linear primarily to post updates after work is complete; do not pull issue state from them when `.agent-mirror` already provides it.

## Guidance for agents
- Treat filesystem contract and import/export formats as stable unless explicitly in scope.
- Keep compatibility with Foundry v13 assumptions in this codebase.
- Do not change generated artifacts in `dist/` manually.
- Avoid broad refactors; prefer minimal, traceable fixes.

## Validation
- Run `npm run typecheck` for TypeScript changes.
- Run `npm run build` for packaging or runtime-facing changes.
