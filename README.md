# saasdesign-cli

A CLI tool that browses [saaspo.com](https://saaspo.com) for SaaS design inspiration, reconstructs a design system based on selected designs, and implements a product page as Vanilla HTML/CSS.

## Prerequisites

- Node.js 18+
- `ANTHROPIC_API_KEY` environment variable set

## Installation

```bash
npm install
npm run build
npm link  # makes `saasdesign` available globally
```

## Usage

```bash
saasdesign [target-dir]
```

### Interactive Flow

1. **Filter selection** — Choose pagetype, style, industry, assets, and stack filters
2. **Design listing** — Playwright scrapes saaspo.com and lists matching designs
3. **Design selection** — Select 1–10 designs to use as inspiration
4. **Project context** — Enter product name, description, and page type
5. **Screenshot capture** — Playwright takes full-page screenshots of selected designs
6. **Design system reconstruction** — Claude (claude-opus-4-6) generates `design-system.md`
7. **Product implementation** — Claude generates `index.html` (Vanilla HTML/CSS)

### Output

```
{target-dir}/
├── design-system.md   # Reconstructed design system
└── index.html         # Implemented product page
```

Intermediate screenshots are saved to `/tmp/saasdesign/{timestamp}/`.

## Development

```bash
npm run dev -- ./my-project    # Run without building (tsx)
npm run build                   # Compile TypeScript
npm run lint                    # Type check only
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key for Claude |
| `SAASDESIGN_REFERENCE_DS` | — | Path to an existing `design-system.md` to use as structural reference |
