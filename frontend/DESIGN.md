# Skyly Design System — "Orbital Cinema"

The aesthetic is **cinematic, monochrome, and grand**. The UI stays out of the way — the 3D scene and data are the stars. Every element earns its place by being quiet, precise, and intentional.

Three adjectives: **Dark. Restrained. Monumental.**

---

## Color

No accent colors. No gradients. No colored buttons. Hierarchy is **white at varying opacities on black**.

| Token             | Value                 | Usage                              |
|-------------------|-----------------------|------------------------------------|
| `bg`              | `#000000`             | Page background, canvas            |
| `text-primary`    | `white` / `100%`      | Headings, hero text                |
| `text-secondary`  | `white/50`            | De-emphasized heading words        |
| `text-body`       | `white/70`            | Body copy, stat values             |
| `text-muted`      | `white/30`            | Labels, subtitles, meta            |
| `text-ghost`      | `white/20` – `15`     | Captions, footers, smallest labels |
| `text-invisible`  | `white/10`            | Attribution, legal                 |
| `border`          | `white/10` – `30`     | Dividers, button outlines          |
| `hover-text`      | `white/60` – `100%`   | Interactive text on hover          |

**Rule:** If you reach for a color (blue, green, red, cyan), stop. Use an opacity of white instead. The only exceptions are data in the 3D scene itself (planet textures, satellite blinks) — never in the UI layer.

---

## Typography

Two fonts, strict roles:

| Font              | Weight        | Role                                    |
|-------------------|---------------|-----------------------------------------|
| **Inter**         | 300–700       | Never used in UI chrome. Body text only if needed in long-form pages. |
| **JetBrains Mono**| 400, 500      | **Everything visible.** Nav, headings, buttons, labels, stats, captions. |

### Scale

| Element           | Size                        | Weight    | Tracking       | Transform  |
|-------------------|-----------------------------|-----------|----------------|------------|
| Hero heading      | `clamp(2.8rem, 5.5vw, 5rem)` | 900 (black) | `-0.02em`    | `uppercase`|
| Section heading   | `clamp(1.6rem, 3vw, 2.5rem)` | 700 (bold)  | `-0.01em`    | `uppercase`|
| Subtitle/label    | `9–10px`                    | 400–500   | `0.4–0.5em`    | `uppercase`|
| Body              | `12–13px`                   | 400       | `0.02em`        | normal     |
| Stat value        | `16px` (base)               | 700       | `0`             | normal     |
| Stat label        | `7px`                       | 400       | `0.22em`        | `uppercase`|
| Caption/footer    | `7–8px`                     | 400       | `0.12em`        | `uppercase`|
| Button text       | `10–11px`                   | 500       | `0.25–0.4em`    | `uppercase`|

**Rule:** Headings are always `uppercase`. Body text is normal case. Everything in JetBrains Mono. The hierarchy comes from size + opacity, not font switching.

---

## Buttons & Interactive

### Primary CTA — Text Link
```
text-white/50 hover:text-white
text-[10px] tracking-[0.4em] uppercase
JetBrains Mono
+ ArrowRight icon (w-3 h-3)
+ group-hover:translate-x-1 on arrow
+ 1px underline rule (white/10) below
```
No background. No border. No fill. Just text, arrow, underline.

### Secondary — Ghost Button
```
border border-white/20 text-white/50
hover:border-white/50 hover:text-white
px-8 py-3 tracking-[0.25em] uppercase
JetBrains Mono
```
Use for less prominent actions (settings, secondary flows).

### Tertiary — Inline Link
```
text-white/25 hover:text-white/60
text-[10px] tracking-[0.25em] uppercase
```
Use for nav items, sign in, minor actions.

**Rule:** Never use solid-fill buttons. Never use colored buttons. The strongest a button gets is a `border-white/20` outline.

---

## Spacing & Layout

- Page padding: `px-10 md:px-16`
- Nav padding: `py-5`
- Generous whitespace — let the scene breathe
- Position key elements with `absolute` positioning, not flow layout
- Hero text: right-aligned, vertically centered (`top-1/2 -translate-y-1/2 right-[5vw]`)
- Stats: bottom-right corner
- CTA: bottom-center
- Footer: bottom edge, full width, `py-2`

**Rule:** UI hugs the edges and corners. The center belongs to the 3D scene.

---

## Motion & Transitions

| Pattern             | Timing                                    |
|---------------------|-------------------------------------------|
| Fade in (reveal)    | `opacity 900ms ease` + staggered delays   |
| Hover text color    | `transition-colors duration-300`          |
| Hover arrow nudge   | `transition-transform duration-300`       |
| Active press        | `active:scale-[0.97]`                     |

Stagger pattern for page load:
- Nav: `100ms`
- Hero text: `200ms`
- CTA: `800ms`
- Stats: `1200ms`
- Footer: `1400ms`

**Rule:** All transitions are `300ms` or `900ms`. Nothing fast and twitchy (no `150ms`), nothing sluggish (no `2000ms`). Easing is always `ease` or `cubic-bezier(.16,1,.3,1)` for entrances.

---

## Component Patterns

### Nav Bar
```
flex items-center justify-between
px-10 md:px-16 py-5
Logo (w-7 rounded-md opacity-90) + name (11px, white/60, tracking 0.3em)
Right: text link (10px, white/25 → white/60)
```

### Stat Block
```
text-right
Value: text-base font-bold text-white/70 (JetBrains Mono)
Label: text-[7px] tracking-[0.22em] uppercase text-white/20
```

### Section Label (eyebrow)
```
text-[9px] tracking-[0.5em] text-white/30 uppercase mb-5
JetBrains Mono
```

### Card (for app pages)
```
bg-white/[0.03] border border-white/[0.06]
rounded-lg p-6
backdrop-blur-sm (only if over 3D content)
```

### Input Field
```
bg-white/[0.04] border border-white/10
text-white/80 placeholder:text-white/20
focus:border-white/30 focus:outline-none
rounded px-4 py-3 text-[12px]
JetBrains Mono
```

### Divider
```
h-px bg-white/10
```

---

## Do / Don't

### Do
- Use opacity to create hierarchy
- Keep UI at the edges, scene in the center
- Use JetBrains Mono for everything
- Make headings massive, uppercase, black weight
- Let white space do the talking
- Keep interactions subtle (opacity shifts, small nudges)
- Stagger entrance animations

### Don't
- Use color in UI (no blue, cyan, green, red, orange buttons or text)
- Use solid-fill buttons
- Use gradients or shadows on UI elements
- Use glassmorphism as a primary style (subtle backdrop-blur OK on cards)
- Use Inter for visible UI chrome
- Use emojis or icons in headings
- Center everything — use intentional asymmetric placement
- Add more elements when you can add more whitespace instead

---

## Dark Palette Extension (for app pages beyond landing)

For interior pages (dashboard, atlas, settings), extend the black base:

| Surface         | Value         | Usage                    |
|-----------------|---------------|--------------------------|
| `bg-page`       | `#000000`     | Page background          |
| `bg-panel`      | `#080808`     | Side panels, drawers     |
| `bg-card`       | `white/[0.03]`| Cards, containers        |
| `bg-elevated`   | `white/[0.06]`| Hover states, selected   |
| `bg-input`      | `white/[0.04]`| Form inputs              |

---

## Reference Implementation

`frontend/src/pages/Landing8.tsx` is the canonical reference for this design system. Every new page should match its vibe.
