# Web (Next.js)

Root rules in [../AGENTS.md](../AGENTS.md) also apply.

## Stack

Next.js (App Router) · TypeScript strict · Tailwind CSS · react-hook-form + zod · Recharts for charts · next-intl for EN/PT.

## Where things go

| What | Where |
|---|---|
| Page | `app/<route>/page.tsx` (server component by default) |
| Interactive piece | `components/<Name>.tsx` with `'use client'` only when it needs state or events |
| API calls | `lib/api.ts` only. Components never call `fetch` directly |
| Form schema | next to the form, as a zod schema |
| Translations | `messages/en.json`, `messages/pt.json` |

## Rules

- Server components fetch data; client components handle interaction. Do not mark a whole page `'use client'` for one button.
- The backend owns business rules. The UI may pre-validate for speed. When the API refuses, show `errors.<code>` from the translations (`FormMessage` does it); never show the API's raw English `message`.
- Every request shows loading, error and empty states. An empty list tells the user what to do next.
- Derived values are computed during render, not stored in state via `useEffect`.
- Lists use the record `id` as `key`, never the index.
- Accessibility: every input has a label, buttons say what they do, focus is visible, color is never the only signal (low stock gets text, not just red).
- No new UI library without a reason written in the PR.

## Design

Follow [docs/design/DESIGN.md](../docs/design/DESIGN.md). In short:

- Use the building blocks in `app/globals.css` (`card`, `input`, `btn-primary`, `th`, `badge`...) instead of long class lists.
- Colors only through semantic tokens (`text-ink`, `bg-panel`, `border-line`, `text-danger`...). Never a raw hex value in a component. A new color is added to both themes.
- Filled buttons use `brand-solid`; text links use `brand`.

## Checks

`npm run lint` and `npm run build` must pass.
