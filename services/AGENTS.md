# Services (NestJS + Prisma)

Root rules in [../AGENTS.md](../AGENTS.md) also apply. Same rules for `packages/shared`.

## Who owns what

| Service | Owns | Talks to |
|---|---|---|
| `auth` | users, passwords, token signing (private key) | nobody |
| `stock` | products, movements, every stock rule | nobody |
| `reports` | nothing stored; computes dashboard and inventory | `stock` over HTTP, Claude API |

- A service never reads another service's database. Data crosses services only through HTTP endpoints.
- Every service verifies tokens with the public key through `CoreModule` from `@stock/shared`. Only `auth` has the private key.
- `reports` forwards the caller's own token to `stock`, so roles are checked where the data lives.

## Layers inside a service (dependencies point inward)

| Folder | Holds | Must not import |
|---|---|---|
| `src/domain/` | Entities with their rules (`Product`, `User`) | NestJS, Prisma, anything outside `domain` (except `AppError` from shared) |
| `src/application/` | Use cases and ports (abstract classes used as DI tokens) | Prisma, HTTP types |
| `src/infra/` | Prisma repositories, HTTP clients, external APIs | business rules |
| `src/http/` | Controllers, DTOs with `class-validator` + `@nestjs/swagger` | business rules, Prisma |

Wire it in `src/app.module.ts`: `{ provide: SomePort, useClass: SomeImplementation }`. Every module imports `CoreModule`.

## Patterns to follow

- Entity: private constructor, `create()` validates and applies rules, `restore()` rebuilds from the database without re-validating. See `services/stock/src/domain/product.ts`.
- Use case: one `execute()`, depends only on ports. See `services/stock/src/application/product.use-cases.ts`.
- Errors: throw `new AppError('CODE', params)`. Every code lives in the catalog in `packages/shared/src/errors.ts` **and** in `errors` in `web/messages/*.json` (`packages/shared/test/error-catalog.spec.ts` fails otherwise). The global filter maps the kind to the status (`rule` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404, `unavailable` 503). Never throw a raw `Error` for a user-facing case.
- Auth: every route needs a token. Mark open routes with `@Public()` and restricted ones with `@Roles('ADMIN')`.
- Repositories inject the service's `PrismaService`; never create a `PrismaClient` yourself.
- Validation twice on purpose: the DTO checks shape at the HTTP boundary, the entity checks business rules.
- Anything that must stay consistent (stock + movement) is written in one `prisma.$transaction`. Guard races in the database (conditional `updateMany`), not only in memory.
- Every endpoint has DTOs with `@ApiProperty` so `/docs` stays accurate.

## Database (auth and stock)

- Each service has its own `prisma/schema.prisma`, generating its client into `generated/prisma` (not committed).
- Change the schema, then `npx prisma migrate dev --name <what-changed>` inside that service. Commit the migration.
- Never edit an applied migration. Never use `prisma db push` for shared changes.

## Tests

- `test/*.spec.ts` with Jest in each package. Use cases are tested with in-memory fakes of their ports (`services/stock/test/in-memory-product.repository.ts`, `services/reports/test/fake-stock-reader.ts`).
- Cover the happy path, every rule that can reject, and the edge (zero, exact limit, duplicate).
- `npm test` and `npm run typecheck` from the repo root must pass.
