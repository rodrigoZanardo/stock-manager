---
name: frontend-feature
description: Add a page, form, table or chart to the Stock Manager web app (Next.js). Use for any UI work in web/.
---

# Add a frontend feature

Read `web/AGENTS.md` first. Reuse an existing component before writing a new one.

1. **Contract.** Check the endpoint in the API's `/docs`. Add a typed function for it in `lib/api.ts`.
2. **Page.** Server component in `app/<route>/page.tsx` that loads the data.
3. **Interaction.** Client component only for the interactive part. Forms use react-hook-form + a zod schema next to the form.
4. **States.** Loading, error (show the API message), empty (say what to do next), success.
5. **Text.** Every visible string in `messages/en.json` and `messages/pt.json`.
6. **Accessibility.** Labels on inputs, visible focus, meaning not carried by color alone.
7. **Check.** `npm run lint` and `npm run build`, then open the page and use it once. Follow `review-checklist`.
