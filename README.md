# Learning Hub — Hermes Dashboard Plugin + Theme

A dashboard plugin and companion theme that turns Hermes into a **training-content operations center**. Extract SCORM e-learning modules, catalog the results, and query across your content library — all from the dashboard.

Built for the Nous Research Hermes hackathon.

---

## What's Included

| Piece | Description |
|-------|-------------|
| **Plugin** (`dashboard/`) | Extractor · Library · Query tabs + sidebar stats + footer tagline |
| **Theme** (`theme/`) | Deep Learn — dark academia HUD with teal/gold accents and engineering-grid texture |
| **Backend** (`dashboard/plugin_api.py`) | FastAPI router with async extraction jobs, library storage, and full-text search |

---

## Install

### 1. Plugin

```bash
# Clone into your Hermes plugins directory
git clone https://github.com/minutechreview/hermes-learning-hub.git \
  ~/.hermes/plugins/learning-hub
```

### 2. Theme

```bash
cp ~/.hermes/plugins/learning-hub/theme/deep-learn.yaml \
   ~/.hermes/dashboard-themes/
```

### 3. Rescan

Restart the dashboard UI or hit:

```bash
curl http://localhost:8080/api/dashboard/plugins/rescan
```

> The default dashboard port is `8080` — adjust if yours differs.

---

## Usage

1. Select the **Deep Learn** theme from the dashboard theme picker.
2. Open the **Learning Hub** tab.
3. Paste a public SCORM or e-learning URL and click **Start Extraction**.
4. Watch live progress → results appear in **Library** → search everything in **Query**.

### Supported Engines

| Engine | When to use |
|--------|-------------|
| `Auto` | Tries CDP first, falls back to generic HTML parsing |
| `CDP`  | Use when you have `hermes-scorm-extractor` installed and the target requires a real browser |
| `Generic` | Static HTML/SCORM demos that don't need JavaScript rendering |

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│  Hermes Dashboard (React + Plugin SDK)                         │
│  ────────────────────────────────────────────────────────────────  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│  │ Extractor   │  │ Library     │  │ Query       │         │
│  │  - queue job │  │  - cards    │  │  - search   │         │
│  │  - poll prog │  │  - metadata │  │  - snippets │         │
│  └───┬───┘  └────────────┘  └────────────┘         │
│     │                                                           │
│     ▼  POST /api/plugins/learning-hub/extract                  │
└───────┬────────────────────────────────────────────────────────────┘
     │
┌────┬────┐
│ CDP │ Generic HTML Parser                (requests + BeautifulSoup)
│     │
│  →  │  →  extracts slides, text, builds markdown
└─────────┘
```

---

## Development

### File Layout

```
hermes-learning-hub/
├── dashboard/
│   ├── manifest.json      # Plugin metadata, tab route, slots, API pointer
│   ├── dist/index.js      # React bundle (IIFE, no build step needed)
│   └── plugin_api.py      # FastAPI router mounted at /api/plugins/learning-hub/
└── theme/
    └── deep-learn.yaml    # Palette, typography, layout, customCSS
```

### Local Testing

```bash
# Symlink instead of clone for rapid iteration
ln -s $(pwd) ~/.hermes/plugins/learning-hub
cp theme/deep-learn.yaml ~/.hermes/dashboard-themes/
```

The dashboard auto-discovers `manifest.json` and mounts `plugin_api.py` at runtime.

---

## Requirements

- Hermes Agent ≥ latest (dashboard plugin SDK)
- Python dependencies (auto-resolved by Hermes):
  - `fastapi`
  - `pydantic`
  - `requests` (for generic engine)
  - `beautifulsoup4` (for generic engine)
- Optional:
  - [`hermes-scorm-extractor`](https://github.com/minutechreview/hermes-scorm-extractor) for CDP passthrough mode

---

## License

MIT
