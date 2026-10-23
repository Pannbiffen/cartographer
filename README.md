# Cartographer 🗺️⚔️

> **Free and Open-Source Web Tool for Creating D&D & Tabletop RPG Maps**  
> A free, open-source, client-side battlemap maker inspired by Dungeon Scrawl: rooms, water, foliage, doors and props, procedural generators, and print/VTT export.

[![Deploy Cartographer to GitHub Pages](https://github.com/Pannbiffen/cartographer/actions/workflows/deploy.yml/badge.svg)](https://github.com/Pannbiffen/cartographer/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-blue?style=flat&logo=github)](https://pannbiffen.github.io/cartographer/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

---

## ✨ Features

- **Plain Desktop Interface**: Menu bar, toolbar, docked toolbox, a properties panel for the current tool, selection and layers, a map settings drawer under the map (title, style, presets, walls, lighting, grid; open it with `M`), and a status bar, with your system font.
- **Preferences** (Edit > Preferences): dark (default), light or system UI theme, accent colour, interface size, autosave on/off, and a reset that wipes everything stored in this browser.
- **Pen & Parchment Aesthetic**: Five themes (Parchment, Blueprint, Slate, Monochrome, and Colour, where grass is green, planks brown and stone grey), bold, fine or rough pen walls, and pen-stroke, crosshatch, stipple or soft-shadow hatching outside them.
- **Style Presets**: Save a map's look (style, walls, hatching, grid) under a name in the map settings drawer, apply it to any map in one click, and export or import presets as a `.json` file to share them with friends.
- **Select & Edit**: Select doors, windows, stairs, props, labels and lights to move (drag or arrow keys), rotate, retype, duplicate, copy and paste, or delete them. Shift+click or drag a box to select several and edit them together; copies keep their layout. Right-click (or long-press) an object or an empty spot for a menu of what you can do there.
- **Text Labels**: Name rooms and add notes anywhere on the map in three sizes.
- **Room Numbers**: Keyed-dungeon markers in a circle or box that count up (1, 2, 3...) as you place them.
- **Layers**: Split a map into layers (dungeon, water, terrain, objects...) that can be shown or hidden, locked, reordered, renamed and faded, and given their own hatching (say, none for buildings on an outdoor map, pen strokes for a cave) in place of the map's. Tools draw on the active layer; hidden layers are left out of exports. Layer > Show Layers in Panel hides the section when you don't need it.
- **Levels**: Keep several connected maps in one project (dungeon levels, a building's floors, a town and its interiors), each with its own layers, listed top floor first. Add a new level above or below the one you're on (for a building's upper floors or a cellar under it). Switch with the Levels panel (Level > Show Levels in Panel hides it), the Level menu or `Page Up` / `Page Down`. Link stairs to another level, then double-click them (or press "Take stairs") to go there; stairs on that level leading back are selected and brought into view. Exports draw the level you're on. "Show level below" (in the Levels panel or View > Level Below) draws the level beneath faintly, lights and all, at an opacity you choose, to line up a building's floors (never in exports); "Show multiple levels below" adds the floors under it too, each fainter by a set step.
- **Room Tools**: Freehand room brush, click-drag rectangle rooms, and click-drag L-shaped corridors.
- **Free-form Shapes**: Polygon rooms with diagonal walls, circular rooms and winding paths of any width, snapped to the grid (hold `Shift` to place freely). Each one adds floor or cuts it away, and merges with everything else: walls, hatching, light shadows and VTT walls follow the new outline.
- **Hex Grid**: Show a pointy- or flat-top hex grid instead of squares. The brushes, rectangle, tunnel, water, foliage and fill tools then work in whole hexes, stairs, props and lights sit in the middle of a hex and move from hex to hex, doors fit a hex side, and shapes snap to hex centres and corners.
- **Floor Textures**: Procedurally drawn flagstones, stone slabs, wooden planks, cobbles, tiles, marble, carpet, dirt, sand or grass, chosen per room as you draw it, with any room tool (cells, polygons, circles, paths and hexes). The Fill tool (or right-click > Fill Room With) re-textures a whole room in one click, up to its walls and doors; `Alt`+click (or right-click > Pick Floor Texture) picks up the texture under the pointer.
- **Outdoor Maps**: Set Ground in Map settings (or for new maps in Preferences) to grass, dirt, sand, cobbles or any other floor texture, and the whole map becomes ground instead of blank paper. Rooms drawn on it get walls as usual, so buildings sit in a field or a town square; draw walls in the open with the Wall tool. Exports include the ground.
- **Water and lava**: Paint lakes, moats and indoor pools with shoreline ripple lines. Water is solid, hiding the ground beneath, or see-through, so a fountain shows the floor under it; lava is a third liquid, molten rock with a crust along its edges. Pick one for new pools and rivers in the panel, or right-click a pool (Liquid Here) to switch just that one. The Fill tool set to Liquid (or right-click > Fill Room With) floods a whole room, up to its walls and doors, and `Shift`+click (or right-click > Drain Room) empties it again.
- **Rivers**: Click points along the way and the River tool lays a river through them that winds between the points and swells and narrows as it goes; click the first point again to close it into a loop, such as a moat around a castle. Set its narrowest and widest width, how far it wanders and a seed (roll a new one for another river along the same points). It merges with painted water into one shoreline, and the eraser takes it away cell by cell.
- **Paint Floor**: Brush a texture onto the ground (dirt, cobbles, sand, grass, flagstones...) without making a room: no walls, hatching or shadows. For a clearing, a muddy patch or a cobbled market square on an outdoor map; it hides the ground beneath and the eraser takes it away.
- **Roads & Paths**: Click points along the way and the Road / Path tool paints a winding track through them in any texture (a dirt track, a cobbled road, a sand path), with no walls; click the first point again for a ring road. Set its narrowest and widest width, how far it wanders and a seed, as for rivers.
- **Foliage & Terrain**: Paint trees, bushes and boulders.
- **Lighting**: Place lights with their own colour, radius and intensity; the rest of the map goes dark and walls cast shadows. Torches give off light too. Windows (the Window tool) let light through a wall onto the far side, dimmed by how much light the pane lets through and tinted by its colour, so stained glass casts coloured light.
- **Walls**: Drag along the grid with the Wall tool to put thin walls inside or between rooms, such as splitting a hall in two (on hex grids they follow hex edges). Walls that close off an area make it a room, in the floor texture picked in the panel, so a building or yard can be outlined wall by wall. They're drawn in the room wall style, block light, stop the Fill tool and export as VTT walls; a door on one opens it. `Shift`+drag erases them, and they can be selected, moved and deleted like doors.
- **Doors, Stairs & Props**: Doors snap to the nearest wall edge (standard, double, secret, portcullis, archway), or onto a diagonal, curved or hex wall nearby, turned to run along it (and exported to VTT at that angle), stairs, pillars, chests, tables, altars, torches, barrels and sarcophagi.
- **Procedural Generators**:
  - BSP Dungeon Generator (rooms + corridors)
  - Cellular Automata Cave Generator (winding organic caverns)
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
| `Shift` + click / drag a box (select tool) | Add to or take from the selection / select everything the box touches |
| `R` (with a selection) | Rotate selection |
| `Delete` / `Backspace` | Delete selection |
| Double-click linked stairs (select tool) | Go to the level they lead to |
| Arrow keys (with a selection) | Nudge selection: labels half a cell (`Shift`: a whole cell), other objects and groups a cell |
| `Esc` | Clear selection |
| `B` | Room brush |
| `R` | Rectangle room |
| `T` | Corridor / tunnel |
| `N` | Polygon room |
| `C` | Circle room |
| `H` | Free path |
| `K` | Fill room with the chosen floor texture or liquid (`Shift`+click drains it) |
| `Alt` + click (room and fill tools) | Pick the floor texture under the pointer |
| `Enter` / `Backspace` / `Esc` (while drawing a polygon, path, river or road) | Finish / remove last point / cancel |
| `W` | Water |
| `Y` | River |
| `U` | Paint floor |
| `O` | Road / path |
| `F` | Foliage & terrain |
| `A` | Wall (`Shift` + drag erases walls) |
| `D` | Door |
| `J` | Window |
| `S` | Stairs |
| `P` | Props |
| `L` | Text label |
| `I` | Light |
| `E` | Eraser |
| `Page Up` / `Page Down` | Go up / down a level |
| `G` | Toggle grid |
| `M` | Show / hide the map settings drawer |
| `Ctrl + Z` / `Cmd + Z` | Undo |
| `Ctrl + Y` / `Cmd + Shift + Z` | Redo |
| `Ctrl + C` / `Cmd + C` | Copy the selected objects |
| `Ctrl + V` / `Cmd + V` | Paste it under the pointer (or one cell along), on the active layer |
| `Ctrl + D` / `Cmd + D` | Duplicate the selected objects |
| Right-click / long-press / `Shift + F10` | Menu for the object or spot under the pointer (or the selection) |
| `Ctrl + Alt + N` / `Cmd + Option + N` | New map |
| `Ctrl + O` / `Cmd + O` | Open project |
| `Ctrl + S` / `Cmd + S` | Save project (`.dndmap`) |
| `Ctrl + E` / `Cmd + E` | Export |
| `Ctrl + ,` / `Cmd + ,` | Preferences |
| `?` | Keyboard shortcuts (also under Help) |

---

## 📜 License
Distributed under the GNU Affero General Public License, version 3 or later (AGPL-3.0-or-later); see [LICENSE](LICENSE). You may use, change and share Cartographer freely, but if you distribute it or run a modified version for others over a network, you must offer them its source code under the same license. Built with passion for tabletop RPG Game Masters and players worldwide.
