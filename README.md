# Cartographer 🗺️⚔️

> **Free and Open-Source Web Tool for Creating D&D & Tabletop RPG Maps**  
> An open-source, client-side alternative to Dungeon Scrawl with unlocked advanced features: water ripples, procedural foliage, hatching styles, cave generation, and Universal VTT export.

[![Deploy Cartographer to GitHub Pages](https://github.com/Pannbiffen/cartographer/actions/workflows/deploy.yml/badge.svg)](https://github.com/Pannbiffen/cartographer/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-blue?style=flat&logo=github)](https://pannbiffen.github.io/cartographer/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## ✨ Features

- **Cozy Pen & Parchment Aesthetic**: Classic Dyson Logos-style pen work, diagonal crosshatching, and warm textured parchment background.
- **Water & Shorelines (100% Free)**: Draw lakes, rivers, moats, and subterranean pools with automatic concentric ripple wave lines and depth gradients.
- **Procedural Foliage & Nature**: Paint trees, cloud-scallop canopies, bushes, and boulders without paying for subscriptions.
- **Room Carving & Corridor Brushes**: Seamless polygon boolean merging, tunnels, wall outlines, and automatic perimeter hatching.
- **Doors, Stairs & Props**: Snap-to-wall single and double doors, secret doors, straight/spiral stairs, pillars, chests, and altars.
- **Procedural Generators**:
  - BSP Dungeon Generator (rooms + corridors)
  - Cellular Automata Cave Generator (winding organic caverns)
- **Export Capabilities**:
  - 🖼️ **High-Res Images**: PNG / WebP up to 300 DPI with grid toggle.
  - 🎲 **Universal VTT (`.dd2vtt`)**: Pre-baked line-of-sight walls, portals, and light occluders for Foundry VTT, Roll20, and Fantasy Grounds.
  - 🖨️ **Printable Multi-Page PDF**: Tiled 1-inch physical battlegrid for home printers.
  - 💾 **Project Save/Load**: Save `.dndmap` JSON files locally and resume anytime.
- **100% Client-Side & Static**: Hosted on GitHub Pages with zero tracking, zero accounts, and full offline capability.

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

### Building for Production
```bash
npm run build
npm run preview
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Space` + Drag / `Middle Click` | Pan Viewport |
| `Scroll Wheel` | Zoom in / out |
| `B` | Room Brush tool |
| `W` | Water tool |
| `F` | Foliage / Nature tool |
| `D` | Door / Portal tool |
| `S` | Stairs tool |
| `E` | Eraser tool |
| `Ctrl + Z` / `Cmd + Z` | Undo |
| `Ctrl + Y` / `Cmd + Shift + Z` | Redo |
| `Ctrl + S` | Save Project JSON |
| `G` | Toggle Grid visibility |

---

## 📜 License
Distributed under the MIT License. Built with passion for tabletop RPG Game Masters and players worldwide.
