# Rigel ANSI Studio

Dark desktop-style ANSI art editor for the browser.

## Run locally
- Open the project in a browser via a local static server, for example:
  - `cd /Users/petrov/Documents/rigel`
  - `python3 -m http.server 8000`
- Then visit `http://127.0.0.1:8000/index.html`

## Included features
- ANSI canvas editor with smart brush logic
- downloadable JSON projects with full workspace restoration
- debounced sparse autosave that restores the last drawing after reload
- Photoshop-style start screen with named recent projects and new-project presets
- multiple document tabs with independent canvases, layers, lighting, and in-memory undo history
- Cmd/Ctrl shortcuts for history, files, tools, brush size, colors, and zoom
- pencil, eraser, fill, picker, line, rectangles, ellipse, spray, text, rectangular selection, lasso, and move tools
- Photoshop-style color and layer panels with visibility, opacity, duplication, and ordering
- rectangular and lasso mask selections with floating move/copy/cut/paste/delete operations
- draggable layer ordering and persistent dock-panel ordering
- resizable canvas and movable/dockable multi-point lighting
- smart density, block, half-block, shading, dot, ASCII, binary, hatch, box, letter-pattern, and custom-symbol brushes
- selectable character families with stepped brush density and automatic smart-brush density
- invert, grayscale, contrast, color-shift, ANSI dither, mirror, texture, and lighting effects
- built-in and named user palette presets with local persistence
- ANSI/TXT export, clipboard copy, and compact Base64-packed Go source export using [rp1s/colorista](https://github.com/rp1s/colorista)

## Layer rule

The bottom layer is an ordinary transparent pixel layer with the lowest z-index. It can be hidden, reordered, renamed, or deleted. Drawing text on it does not convert it into a background layer. A special locked background layer is never created implicitly.
