# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-05

First tagged release: the app as it runs today.

### Added

- **Products**: SKU (normalized, unique), name, minimum and optional maximum stock, bin location (`R01-B03-A04-P060-N1`), sale price and last purchase cost in cents. Status LOW / OK / OVER. A product with stock movements, or on a purchase order, cannot be deleted.
- **Stock movements**: IN and OUT with a note, written in one transaction with the quantity change and guarded in SQL against concurrent withdrawals. Stock never goes negative.
- **Reserved stock**: orders from Live Orders reserve units (`quantity`, `reserved`, `available`); a manual OUT can only take available units.
- **Live Orders webhook**: `POST /webhooks/live-orders`, signed with HMAC-SHA256 and idempotent per event; creates, releases and delivers reservations, and records shortfalls instead of refusing an accepted order.
- **Suppliers and purchase orders**: CNPJ validation, DRAFT -> ORDERED -> RECEIVED (or CANCELLED), a suggested draft from low stock, and a receive that books every item in and updates the product cost in one transaction.
- **Stock counts**: start a count (snapshot of every product's quantity), enter counted quantities for some or all products, review the differences, then apply once (IN/OUT movements noted "Inventário #N") or cancel. A count below the units reserved for orders is refused.
- **Reports**: dashboard with a 14-day in/out chart, inventory report (average daily out, days of cover, suggested stock and what to buy) and an optional AI restock analysis with Claude.
- **Users and login**: ADMIN, OPERATOR and read-only VIEWER roles, RS256 tokens signed only by the auth service, sign-in lockout after repeated failures, first admin and optional demo and viewer users from environment variables.
- **Audit trail**: every write to products, stock, suppliers, purchases, counts and users, plus sign-ins, recorded in the same transaction as the change; one JSON log line per request.
- **Web app**: Next.js with English and Portuguese, light and dark themes, translated API errors, and pages for the dashboard, products, inventory, stock counts, purchases, suppliers, users and audit.
- **Architecture**: auth, stock and reports services (NestJS 11, Prisma, PostgreSQL) behind an nginx gateway, Swagger at `/docs` on each service, shared error catalog and auth guard in `packages/shared`.
- **Operations**: one-command Docker Compose stack, Render blueprint, demo data script, and GitHub Actions running unit, database and browser (Playwright) tests.

[1.0.0]: https://github.com/rodrigoZanardo/stock-manager/releases/tag/v1.0.0
