---
name: review-checklist
description: Self-review before calling a Stock Manager change done or proposing a commit. Use at the end of every task.
---

# Review checklist

## 1. Run, don't just read

Run the checks from the root `AGENTS.md` for each folder you touched. Report what passed and what you could not run, and why.

## 2. Blocks the change

- **Security:** secret in code, input reaching the database without DTO validation, route marked `@Public()` without a reason, a private key outside the auth service.
- **Data:** multi-row write outside a transaction, a `catch` that swallows the error, stock that can go negative.
- **Types:** `any`, `as` used to silence the compiler, `!` without a guard.
- **Async:** promise without `await`, `forEach(async ...)`.
- **Tests:** new rule without a test, or a test that cannot fail.
- **Services:** a service reading another service's database, a new error code without a translation in `web/messages`, a new route prefix missing from `docker/gateway/nginx.conf`.

## 3. Should fix

- Duplicated logic (the second copy is the moment to extract).
- Unused code, comments that repeat the code or disagree with it.
- Magic numbers without a named constant.

## 4. Findings need evidence

Each finding states `file:line`, the failure scenario (input → state → wrong result) and why types or validation don't already catch it. No scenario, no finding. Zero findings is a valid result.

## 5. Commit message

Conventional Commits, scoped by folder: `feat(api): register stock movements`.
