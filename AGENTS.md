# Stock Manager

Inventory control app: products, stock in/out movements, low-stock alerts, inventory report, login and a dashboard.
Personal portfolio project, written from scratch. Public repository.

## Layout

| Folder | What | Rules |
|---|---|---|
| `services/auth/` | Users, login, issues RS256 tokens. Own database | [services/AGENTS.md](services/AGENTS.md) |
| `services/stock/` | Products and movements, the only writer of stock. Own database | [services/AGENTS.md](services/AGENTS.md) |
| `services/reports/` | Dashboard, inventory report, AI analysis. No database: reads stock over HTTP | [services/AGENTS.md](services/AGENTS.md) |
| `packages/shared/` | Code every service uses: error catalog, auth guard, service bootstrap | [services/AGENTS.md](services/AGENTS.md) |
| `web/` | Next.js app (App Router) | [web/AGENTS.md](web/AGENTS.md) |
| `docker/` | Gateway (nginx) and database init | |
| `.agents/skills/` | Step-by-step skills for agents | read the one that matches the task |

The closest `AGENTS.md` to the file you edit adds to this one. This root file always applies.

## Rules for every change

- Smallest change that fully solves the task. No options, layers or helpers nobody asked for.
- Code that a second place needs moves to one shared place (`packages/shared`, a web component, a CSS utility). Never copy it.
- Business rules live in the backend domain of the service that owns the data, never only in the UI.
- New logic ships with a test. A bug fix starts with a test that reproduces it.
- TypeScript strict everywhere. No `any`, no `as` to silence the compiler, no `!` without a guard.
- Code, identifiers, commits and docs in English. UI text goes through translations.
- Never commit secrets or keys. Config comes from environment variables; document new ones in `.env.example`.
- Never copy code, names or rules from an employer or client codebase into this repo.

## Commands

```bash
npm start                    # whole stack in Docker: web 3030, gateway 3031, auth 3032, stock 3033, reports 3034 (npm run stop)
npm test                     # tests of packages/shared and every service
npm run typecheck            # builds shared, then type-checks every service
cd web && npm run lint && npm run build
cd web && npm run test:e2e              # browser tests; needs npm start running
```

Before saying a task is done: run the checks for every folder you touched and report what passed and what you could not run.

## Git

- Conventional Commits, scoped by folder: `feat(stock): ...`, `fix(web): ...`, `test(reports): ...`, `docs: ...`.
- One commit changes structure **or** behaviour, not both.
- Do not commit or push unless asked.

## Skills

| Task | Skill |
|---|---|
| New endpoint, use case or entity | `.agents/skills/backend-feature/SKILL.md` |
| New page, form or chart | `.agents/skills/frontend-feature/SKILL.md` |
| Finishing a change, self-review | `.agents/skills/review-checklist/SKILL.md` |
