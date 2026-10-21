# Cartographer 🗺️⚔️

> **Free and Open-Source Web Tool for Creating D&D & Tabletop RPG Maps**  
> A free, open-source, client-side battlemap maker inspired by Dungeon Scrawl: rooms, water, foliage, doors and props, procedural generators, and print/VTT export.

[![Deploy Cartographer to GitHub Pages](https://github.com/Pannbiffen/cartographer/actions/workflows/deploy.yml/badge.svg)](https://github.com/Pannbiffen/cartographer/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-blue?style=flat&logo=github)](https://pannbiffen.github.io/cartographer/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## ✨ Features

- **Plain Desktop Interface**: Menu bar, toolbar, docked toolbox and properties panel, and a status bar, with your system font.
- **Preferences** (Edit > Preferences): dark (default), light or system UI theme, accent colour, interface size, autosave on/off, and a reset that wipes everything stored in this browser.
- **Pen & Parchment Aesthetic**: Four themes (Parchment, Blueprint, Slate, Monochrome), bold, fine or rough pen walls, and pen-stroke, crosshatch, stipple or soft-shadow hatching outside them.
- **Select & Edit**: Select doors, stairs, props and labels to move, rotate, retype or delete them.
- **Text Labels**: Name rooms and add notes anywhere on the map in three sizes.
- **Room Numbers**: Keyed-dungeon markers in a circle or box that count up (1, 2, 3...) as you place them.
- **Layers**: Split a map into layers (dungeon, water, terrain, objects...) that can be shown or hidden, locked, reordered, renamed and faded. Tools draw on the active layer; hidden layers are left out of exports.
- **Room Tools**: Freehand room brush, click-drag rectangle rooms, and click-drag L-shaped corridors.
- **Floor Textures**: Procedurally drawn flagstones, wooden planks, cobbles, tiles or dirt, chosen per room as you draw it.
- **Water**: Paint lakes, rivers, moats and indoor pools with shoreline ripple lines.
- **Foliage & Terrain**: Paint trees, bushes and boulders.
- **Doors, Stairs & Props**: Doors snap to the nearest wall edge (standard, double, secret, portcullis, archway), stairs, pillars, chests, tables, altars, torches, barrels and sarcophagi.
- **Procedural Generators**:
  - BSP Dungeon Generator (rooms + corridors)
  - Cellular Automata Cave Generator (winding organic caverns)
  - Meandering river
- **Export Capabilities**:
  - 🖼️ **Images**: PNG or WebP at 1x–4x resolution, with or without grid.
  - 🎲 **Universal VTT (`.dd2vtt`)**: Line-of-sight walls, door portals and torch lights for Foundry VTT (via the Universal Battlemap Importer module), Fantasy Grounds Unity and other UVTT-compatible tools.
  - 🖨️ **Printable PDF**: Fit the whole map on one page, or print at true scale (1 square = 1 inch) tiled across A4 or US Letter pages.
  - 💾 **Project Save/Load**: Save `.dndmap` JSON files locally and resume anytime.
- **Zoom to Fit**: Maps open framed in the window, and `Ctrl + 0` brings the whole map back into view.
- **Autosave**: Your current map is kept in this browser and restored when you reopen the page. Save a `.dndmap` file to back it up or move it to another device.
- **Undo/Redo**: Up to 100 steps; each brush stroke or slider drag is a single step.
- **100% Client-Side & Static**: Hosted on GitHub Pages with no tracking and no accounts.

---

## 🚀 Quick Start (Development)

```bash
# Clone the repository
git clone https://github.com/Pannbiffen/cartographer.git
cd cartographer

# Install dependencies
npm install

# Start local development server
npm run dev
```

Visit `http://localhost:5173` to start cartographing!

### Running the Tests
```bash
# One-time: download the headless browser
npx playwright install chromium

# Run the end-to-end tests (starts its own dev server)
npm run test:e2e
```

### Building for Production
```bash
npm run build
npm run preview
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Space` + Drag / `Alt` + Drag / `Middle Click` | Pan viewport |
| `Scroll Wheel` / `+` / `-` | Zoom in / out |
| `Ctrl + 0` | Zoom to fit the whole map |
| `Ctrl + 1` | Actual size (100%) |
| `V` | Select / move |
| `R` (with a selection) | Rotate selection |
| `Delete` / `Backspace` | Delete selection |
| `Esc` | Clear selection |
| `B` | Room brush |
| `R` | Rectangle room |
| `T` | Corridor / tunnel |
| `W` | Water |
| `F` | Foliage & terrain |
| `D` | Door |
| `S` | Stairs |
| `P` | Props |
| `L` | Text label |
| `E` | Eraser |
| `G` | Toggle grid |
| `Ctrl + Z` / `Cmd + Z` | Undo |
| `Ctrl + Y` / `Cmd + Shift + Z` | Redo |
| `Ctrl + O` / `Cmd + O` | Open project |
| `Ctrl + S` / `Cmd + S` | Save project (`.dndmap`) |
| `Ctrl + E` / `Cmd + E` | Export |
| `Ctrl + ,` / `Cmd + ,` | Preferences |

---

## 📜 License
Distributed under the MIT License. Built with passion for tabletop RPG Game Masters and players worldwide.
