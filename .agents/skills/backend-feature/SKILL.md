---
name: backend-feature
description: Add an endpoint, use case or entity to a Stock Manager service (auth, stock or reports; NestJS + Prisma). Use for any new backend behaviour or business rule.
---

# Add a backend feature

Read `services/AGENTS.md` first. Mirror the closest existing example (`Product` in `services/stock`).

0. **Pick the owner.** The rule goes in the service that owns the data (users → `auth`, stock → `stock`, numbers derived from stock → `reports`). Never reach into another service's database; add an HTTP endpoint instead.
1. **Test first.** Add cases to that service's `test/` with its in-memory fake: happy path, each rejection, edges. Run `npm test -w @stock/<service>` and watch them fail for the right reason.
2. **Domain.** Put the rule on the entity (`src/domain/`). Throw `AppError` with a code from `packages/shared/src/errors.ts`. A new code also needs a translation in `web/messages/en.json` and `pt.json`.
3. **Port.** If storage needs a new query, add an abstract method to the port in `src/application/`.
4. **Use case.** One class, one `execute()`, in `src/application/`. Only depends on ports.
5. **Infra.** Implement the port in `src/infra/`. Multi-row writes go in `$transaction`.
6. **Schema.** If the model changed: edit `prisma/schema.prisma` of that service, run `npx prisma migrate dev --name <change>` inside it.
7. **HTTP.** DTO with `class-validator` + `@ApiProperty`, controller method calling the use case (errors are handled by the global filter), provider registered in `app.module.ts`. A new path prefix also needs a `location` in `docker/gateway/nginx.conf`.
8. **Check.** `npm test` and `npm run typecheck` from the repo root. Then follow `review-checklist`.
