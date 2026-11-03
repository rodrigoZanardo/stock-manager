# Design system

The interface borrows from the place stock actually lives: a warehouse. Concrete floor, forklift green for actions, safety yellow for the line you should not cross, and shelf labels for stock levels.

Tokens: [design-tokens.json](design-tokens.json) · Implementation: [web/app/globals.css](../../web/app/globals.css) · Preview: [design-preview.html](design-preview.html)

## The one memorable element: the stock level gauge

`components/StockLevel.tsx` draws each product like a shelf label: the fill is the quantity, a yellow and black hazard stripe marks the minimum, and a dark tick marks the maximum. It appears in the product list, on the product page and in the inventory. Everything around it stays quiet.

It is a `role="meter"` with a text value, and the status badge next to it repeats the meaning in words. Color is never the only signal.

## Principles

1. **Data first.** Numbers use `tabular-nums` and the condensed display face, so columns line up and metrics read like signage.
2. **One action color.** Forklift green marks what you can act on: links, the primary button. Safety yellow is a signal (minimum, logo, current page), never a button.
3. **Color means status.** Hazard orange is low stock, amber is above the maximum, green is OK. A status always has text too (WCAG 1.4.1).
4. **One token, two themes.** Each color is declared once with `light-dark()`. The theme follows the OS, and the theme button can force light or dark (saved in a cookie, so there is no flash on load).
5. **Mobile first.** Base styles are for phones. From `md` up, the top bar becomes a fixed side rail and the content uses the full width.

## Decisions

| Token | Choice | Why |
|---|---|---|
| `bg` | `#eceeeb` concrete gray (dark `#121816`) | Cooler and greener than paper cream; it reads as a floor, not a page. |
| `rail` | Near-black green, dark in both themes | Warehouse signage is dark with light letters. A dark rail also frames the content without a heavy border. |
| `brand` | `#1f6f5c` forklift green (dark `#5fc2a4`) | 6.1:1 on white. Distinct from the default SaaS blue. |
| `brand-solid` | `#1f6f5c` in both themes | Filled buttons keep white text above 4.5:1 in either theme. |
| `signal` | `#f2c230` safety yellow | Used only as fill or stripe next to dark ink, never as text on white (it would fail contrast). |
| `danger` | `#c2410c` hazard orange | Closer to warehouse hazard signs than a pure red, and 5.2:1 on white. |
| Fonts | Barlow Condensed for titles and metrics, Barlow for text | Barlow is drawn from road and industrial signage. One family, two widths, clearly distinct roles. |
| Radius | 4px controls, 6px panels, 2px badges | Badges look like printed tags; nothing is bubbly. |
| Elevation | Borders only, no shadows | Flat like signage. Hierarchy comes from the rail, type size and the yellow signal. |
| Touch targets | 40px controls on phones, 36px from `sm` | Comfortable for thumbs on the warehouse floor (WCAG 2.5.8 asks for 24px). Inputs use 16px text on phones so iOS does not zoom. |

## Building blocks

Defined once as `@utility` in `globals.css`:

`card` · `label` · `input` · `btn-primary` · `btn-secondary` · `btn-danger` · `link` · `nav-link` · `th` · `td` · `badge` · `page-title` · `metric`

## Rules

- No raw hex values in components. A missing color becomes a token, declared with `light-dark()` in `globals.css` and added to `design-tokens.json`.
- Charts read `var(--chart-in)` and `var(--chart-out)`, so they follow the theme.
- Focus is always visible: `focus-visible:ring-3`, brand color on content and yellow on the dark rail.
- Every list has a loading, error and empty state. The empty state says what to do next.
