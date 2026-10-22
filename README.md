# Cartographer 🗺️⚔️

> **Free and Open-Source Web Tool for Creating D&D & Tabletop RPG Maps**  
> A free, open-source, client-side battlemap maker inspired by Dungeon Scrawl: rooms, water, foliage, doors and props, procedural generators, and print/VTT export.

[![Deploy Cartographer to GitHub Pages](https://github.com/Pannbiffen/cartographer/actions/workflows/deploy.yml/badge.svg)](https://github.com/Pannbiffen/cartographer/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-blue?style=flat&logo=github)](https://pannbiffen.github.io/cartographer/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

---

## ✨ Features

- **Plain Desktop Interface**: Menu bar, toolbar, docked toolbox and properties panel, and a status bar, with your system font.
- **Preferences** (Edit > Preferences): dark (default), light or system UI theme, accent colour, interface size, autosave on/off, and a reset that wipes everything stored in this browser.
- **Pen & Parchment Aesthetic**: Four themes (Parchment, Blueprint, Slate, Monochrome), bold, fine or rough pen walls, and pen-stroke, crosshatch, stipple or soft-shadow hatching outside them.
- **Style Presets**: Save a map's look (style, walls, hatching, grid) under a name in the Style presets panel, apply it to any map in one click, and export or import presets as a `.json` file to share them with friends.
- **Select & Edit**: Select doors, stairs, props and labels to move (drag or arrow keys), rotate, retype, duplicate, copy and paste, or delete them.
- **Text Labels**: Name rooms and add notes anywhere on the map in three sizes.
- **Room Numbers**: Keyed-dungeon markers in a circle or box that count up (1, 2, 3...) as you place them.
- **Layers**: Split a map into layers (dungeon, water, terrain, objects...) that can be shown or hidden, locked, reordered, renamed and faded. Tools draw on the active layer; hidden layers are left out of exports.
- **Room Tools**: Freehand room brush, click-drag rectangle rooms, and click-drag L-shaped corridors.
- **Free-form Shapes**: Polygon rooms with diagonal walls, circular rooms and winding paths of any width, snapped to the grid (hold `Shift` to place freely). Each one adds floor or cuts it away, and merges with everything else: walls, hatching, light shadows and VTT walls follow the new outline.
- **Hex Grid**: Show a pointy- or flat-top hex grid instead of squares. The room brush and eraser then work in whole hexes, and shapes snap to hex centres and corners.
- **Floor Textures**: Procedurally drawn flagstones, wooden planks, cobbles, tiles or dirt, chosen per room as you draw it.
- **Water**: Paint lakes, rivers, moats and indoor pools with shoreline ripple lines.
- **Foliage & Terrain**: Paint trees, bushes and boulders.
- **Lighting**: Place lights with their own colour, radius and intensity; the rest of the map goes dark and walls cast shadows. Torches give off light too.
- **Doors, Stairs & Props**: Doors snap to the nearest wall edge (standard, double, secret, portcullis, archway), stairs, pillars, chests, tables, altars, torches, barrels and sarcophagi.
- **Procedural Generators**:
  - BSP Dungeon Generator (rooms + corridors)
  - Cellular Automata Cave Generator (winding organic caverns)
  - Meandering river
- **Export Capabilities**:
  - 🖼️ **Images**: PNG or WebP at 1x–4x resolution, with or without grid.
  - 🎲 **Universal VTT (`.dd2vtt`)**: Line-of-sight walls, door portals and lights (placed lights and torches) for Foundry VTT (via the Universal Battlemap Importer module), Fantasy Grounds Unity and other UVTT-compatible tools.
  - 🖨️ **Printable PDF**: Fit the whole map on one page, or print at true scale (1 square = 1 inch) tiled across A4 or US Letter pages.
  - 💾 **Project Save/Load**: Save `.dndmap` JSON files locally and resume anytime.
  - 🔗 **Share Links**: File > Share Link puts a compressed copy of the map in a link. Friends who open it get their own copy to view, edit or save; nothing is uploaded anywhere.
- **Navigation**: Maps open framed in the window and `Ctrl + 0` brings the whole map back into view. Pan with the arrow keys or by dragging, and zoom with the wheel or a trackpad at the speed you set in Preferences.
- **New Maps**: File > New starts a blank map with the style, hatching and grid you pick in Preferences (or copied from the open map), and asks before discarding changes you haven't saved to a file (tick "Remember my choice", or set it in Preferences, to always rely on the in-browser copy or always download a file first).
- **Autosave and My Maps**: Your maps are kept in this browser, and the one you had open comes back when you reopen the page. Starting a new map or opening a file or share link keeps the previous one: get it back from File > Open Recent, or rename, duplicate and delete maps in File > My Maps. Save a `.dndmap` file to back a map up or move it to another device. With autosave off, the browser asks before you close a tab with unsaved work.
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
| Arrow keys (hold `Shift` for faster) | Pan viewport |
| `Scroll Wheel` / `+` / `-` | Zoom in / out |
| `Ctrl + 0` | Zoom to fit the whole map |
| `Ctrl + 1` | Actual size (100%) |
| `V` | Select / move |
| `R` (with a selection) | Rotate selection |
| `Delete` / `Backspace` | Delete selection |
| Arrow keys (with a selection) | Nudge selection: labels half a cell (`Shift`: a whole cell), other objects a cell |
| `Esc` | Clear selection |
| `B` | Room brush |
| `R` | Rectangle room |
| `T` | Corridor / tunnel |
| `N` | Polygon room |
| `C` | Circle room |
| `H` | Free path |
| `Enter` / `Backspace` / `Esc` (while drawing a polygon or path) | Finish / remove last point / cancel |
| `W` | Water |
| `F` | Foliage & terrain |
| `D` | Door |
| `S` | Stairs |
| `P` | Props |
| `L` | Text label |
| `I` | Light |
| `E` | Eraser |
| `G` | Toggle grid |
| `Ctrl + Z` / `Cmd + Z` | Undo |
| `Ctrl + Y` / `Cmd + Shift + Z` | Redo |
| `Ctrl + C` / `Cmd + C` | Copy the selected object |
| `Ctrl + V` / `Cmd + V` | Paste it one cell along, on the active layer |
| `Ctrl + D` / `Cmd + D` | Duplicate the selected object |
| `Ctrl + Alt + N` / `Cmd + Option + N` | New map |
| `Ctrl + O` / `Cmd + O` | Open project |
| `Ctrl + S` / `Cmd + S` | Save project (`.dndmap`) |
| `Ctrl + E` / `Cmd + E` | Export |
| `Ctrl + ,` / `Cmd + ,` | Preferences |
| `?` | Keyboard shortcuts (also under Help) |

---

## 📜 License
Distributed under the GNU Affero General Public License, version 3 or later (AGPL-3.0-or-later); see [LICENSE](LICENSE). You may use, change and share Cartographer freely, but if you distribute it or run a modified version for others over a network, you must offer them its source code under the same license. Built with passion for tabletop RPG Game Masters and players worldwide.
