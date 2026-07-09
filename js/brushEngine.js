import { clamp } from './utils.js';

const SYMBOLS = {
  blocks: '░▒▓█',
  halfblocks: '▁▂▃▄▅▆▇█',
  shading: '░▒▓█',
  dots: '·•●',
  ascii: ' .:-=+*#%@',
  binary: '01',
  hatch: '╱╲╳▓',
  box: '·┼╬█',
};

export class BrushEngine {
  constructor(grid) {
    this.grid = grid;
  }

  setGrid(grid) {
    this.grid = grid;
  }

  applyStroke(x, y, options = {}) {
    const {
      size = 1,
      mode = 'free',
      symbol = '█',
      pattern = '',
      charset = 'blocks',
      level = 1,
      fg = '#ffffff',
      bg = '#000000',
      opacity = 1,
      mirrorX = false,
      mirrorY = false,
      erase = false,
      backgroundOnly = false,
      fgTransparent = false,
      bgTransparent = false,
      allowedCells = null,
    } = options;
    const radius = Math.max(0, size - 1);

    for (let cy = -radius; cy <= radius; cy += 1) {
      for (let cx = -radius; cx <= radius; cx += 1) {
        const distance = Math.hypot(cx, cy);
        if (distance > radius + 0.5) continue;
        const targetX = x + cx;
        const targetY = y + cy;
        const mirrored = this.getMirror(targetX, targetY, mirrorX, mirrorY, x, y);
        if (allowedCells && !allowedCells.has(`${mirrored.x},${mirrored.y}`)) continue;
        if (erase) {
          this.grid.clearCell(mirrored.x, mirrored.y);
          continue;
        }
        this.paintCell(mirrored.x, mirrored.y, {
          symbol,
          pattern,
          charset,
          level,
          fg,
          bg,
          opacity,
          mode,
          backgroundOnly,
          fgTransparent,
          bgTransparent,
          pressure: 1 - distance / (radius + 1),
        });
      }
    }
  }

  getMirror(x, y, mirrorX, mirrorY, originX, originY) {
    return {
      x: mirrorX ? originX * 2 - x : x,
      y: mirrorY ? originY * 2 - y : y,
    };
  }

  paintCell(x, y, options) {
    const cell = this.grid.getCell(x, y);
    if (!cell) return;
    const {
      symbol, pattern, charset, level, fg, bg, opacity,
      mode, backgroundOnly, fgTransparent, bgTransparent, pressure,
    } = options;
    const previousDensity = cell.empty ? 0 : cell.density || 0;
    const density = mode === 'smart'
      ? this.computeSmartDensity(x, y, previousDensity, pressure)
      : clamp(level, 0, 1);
    const nextChar = backgroundOnly
      ? ' '
      : this.selectSymbol(mode, symbol, pattern, charset, density, x, y);

    const fgAlpha = backgroundOnly || fgTransparent ? 0 : opacity;
    const bgAlpha = bgTransparent ? 0 : opacity;
    this.grid.setCell(x, y, {
      char: nextChar,
      fg,
      bg,
      brightness: density,
      density,
      fgAlpha,
      bgAlpha,
      empty: fgAlpha <= 0 && bgAlpha <= 0,
    });
  }

  selectSymbol(mode, symbol, pattern, charset, density, x, y) {
    const pick = (characters) => {
      const values = Array.from(characters);
      return values[Math.round(clamp(density, 0, 1) * (values.length - 1))];
    };
    if (mode === 'smart') return pick(SYMBOLS[charset] || SYMBOLS.blocks);
    if (SYMBOLS[mode]) return pick(SYMBOLS[mode]);
    if (mode === 'letters') {
      const letters = Array.from(pattern || symbol || 'A');
      return letters[Math.abs(x + y) % letters.length];
    }
    if (mode === 'ansi') return symbol || '█';
    return symbol || '█';
  }

  computeSmartDensity(x, y, previousDensity, pressure) {
    let total = 0;
    let count = 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (ox === 0 && oy === 0) continue;
        const neighbor = this.grid.getCell(x + ox, y + oy);
        if (!neighbor || neighbor.empty) continue;
        total += neighbor.density || 0;
        count += 1;
      }
    }
    const surrounding = count ? total / count : 0;
    return clamp(previousDensity * 0.72 + pressure * 0.45 + surrounding * 0.12, 0, 1);
  }
}
