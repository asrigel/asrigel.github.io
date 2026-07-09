export function createCell(overrides = {}) {
  return {
    char: ' ',
    fg: '#c0c0c0',
    bg: '#000000',
    brightness: 0.5,
    density: 0,
    fgAlpha: 0,
    bgAlpha: 0,
    empty: true,
    ...overrides,
  };
}

export function isCellEmpty(cell) {
  return !cell || cell.empty === true;
}

export class ANSIGrid {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.cells = this.createCells(width, height);
  }

  createCells(width, height) {
    return Array.from({ length: height }, () => Array.from({ length: width }, () => createCell()));
  }

  getCell(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.cells[y][x];
  }

  setCell(x, y, patch) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const current = this.cells[y][x];
    const normalized = { ...patch };
    if (patch.empty === false && current.empty) {
      if (patch.fgAlpha == null) normalized.fgAlpha = 1;
      if (patch.bgAlpha == null) normalized.bgAlpha = 1;
    }
    this.cells[y][x] = { ...current, ...normalized };
  }

  clearCell(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.cells[y][x] = createCell();
  }

  clear() {
    this.cells = this.createCells(this.width, this.height);
  }

  resize(width, height) {
    const next = this.createCells(width, height);
    const copyWidth = Math.min(width, this.width);
    const copyHeight = Math.min(height, this.height);
    for (let y = 0; y < copyHeight; y += 1) {
      for (let x = 0; x < copyWidth; x += 1) {
        next[y][x] = { ...this.cells[y][x] };
      }
    }
    this.width = width;
    this.height = height;
    this.cells = next;
  }

  clone() {
    const copy = new ANSIGrid(this.width, this.height);
    copy.cells = this.cells.map((row) => row.map((cell) => ({ ...cell })));
    return copy;
  }

  getContentBounds() {
    let minX = this.width;
    let minY = this.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (isCellEmpty(this.cells[y][x])) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    return maxX < 0 ? null : { minX, minY, maxX, maxY };
  }

  toJSON() {
    return {
      width: this.width,
      height: this.height,
      cells: this.cells.map((row) => row.map((cell) => ({ ...cell }))),
    };
  }

  toSparseJSON() {
    const cells = [];
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const cell = this.cells[y][x];
        if (isCellEmpty(cell)) continue;
        cells.push([
          x, y, cell.char, cell.fg, cell.bg, cell.brightness,
          cell.density, cell.fgAlpha, cell.bgAlpha,
        ]);
      }
    }
    return { width: this.width, height: this.height, sparse: true, cells };
  }

  static fromJSON(data) {
    if (!data || !Number.isFinite(data.width) || !Number.isFinite(data.height)) {
      throw new TypeError('Некорректные данные холста');
    }
    const grid = new ANSIGrid(data.width, data.height);
    if (data.sparse) {
      (data.cells || []).forEach(([x, y, char, fg, bg, brightness, density, fgAlpha, bgAlpha]) => {
        grid.setCell(x, y, createCell({
          char,
          fg,
          bg,
          brightness,
          density,
          fgAlpha,
          bgAlpha,
          empty: false,
        }));
      });
      return grid;
    }
    if (!Array.isArray(data.cells)) return grid;
    grid.cells = grid.cells.map((row, y) => row.map((fallback, x) => {
      const cell = data.cells[y]?.[x];
      if (!cell) return fallback;
      const empty = typeof cell.empty === 'boolean'
        ? cell.empty
        : cell.char === ' ' && cell.bg === '#000000' && (cell.density || 0) === 0;
      return createCell({ ...cell, empty });
    }));
    return grid;
  }
}
