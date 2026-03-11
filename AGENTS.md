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

## Guidance for agents
- Treat filesystem contract and import/export formats as stable unless explicitly in scope.
- Keep compatibility with Foundry v13 assumptions in this codebase.
- Do not change generated artifacts in `dist/` manually.
- Avoid broad refactors; prefer minimal, traceable fixes.

## Validation
- Run `npm run typecheck` for TypeScript changes.
- Run `npm run build` for packaging or runtime-facing changes.
