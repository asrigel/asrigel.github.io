export class Renderer {
  constructor(canvas, grid) {
    this.canvas = canvas;
    this.grid = grid;
    this.ctx = canvas.getContext('2d');
    this.cellWidth = 12;
    this.cellHeight = 18;
    this.zoom = 1;
    this.dirtyRects = [];
    this.selection = null;
    this.layers = null;
  }

  resize() {
    const width = this.grid.width * this.cellWidth;
    const height = this.grid.height * this.cellHeight;
    this.canvas.width = width;
    this.canvas.height = height;
    this.applyZoom();
    this.ctx.font = `${this.cellHeight}px Menlo, Consolas, monospace`;
    this.ctx.textBaseline = 'top';
  }

  setGrid(grid) {
    this.grid = grid;
  }

  setLayers(layers) {
    this.layers = layers;
  }

  setZoom(percent) {
    this.zoom = percent / 100;
    this.applyZoom();
  }

  setSelection(selection) {
    this.selection = selection;
  }

  applyZoom() {
    this.canvas.style.width = `${this.canvas.width * this.zoom}px`;
    this.canvas.style.height = `${this.canvas.height * this.zoom}px`;
  }

  queueDirty(x, y) {
    this.dirtyRects.push({ x, y });
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const layers = this.layers?.length ? this.layers : [{ grid: this.grid, opacity: 1 }];
    layers.forEach(({ grid, opacity = 1 }) => {
      const layerOpacity = Math.max(0, Math.min(1, opacity));
      if (layerOpacity <= 0) return;
      for (let y = 0; y < grid.height; y += 1) {
        for (let x = 0; x < grid.width; x += 1) {
          const cell = grid.getCell(x, y);
          if (!cell || cell.empty) continue;

          const drawX = x * this.cellWidth;
          const drawY = y * this.cellHeight;
          const backgroundAlpha = (cell.bgAlpha ?? 1) * layerOpacity;
          const foregroundAlpha = (cell.fgAlpha ?? 1) * layerOpacity;
          if (backgroundAlpha > 0) {
            ctx.globalAlpha = backgroundAlpha;
            ctx.fillStyle = cell.bg;
            ctx.fillRect(drawX, drawY, this.cellWidth, this.cellHeight);
          }
          if (foregroundAlpha > 0) {
            ctx.globalAlpha = foregroundAlpha;
            ctx.fillStyle = cell.fg;
            ctx.fillText(cell.char || ' ', drawX, drawY);
          }
        }
      }
    });
    ctx.globalAlpha = 1;

    this.renderSelection();
  }

  renderSelection() {
    const cells = this.selection?.cells;
    if (!cells?.size) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(62, 140, 220, 0.24)';
    ctx.strokeStyle = '#9ccfff';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);

    cells.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      const left = x * this.cellWidth;
      const top = y * this.cellHeight;
      ctx.fillRect(left, top, this.cellWidth, this.cellHeight);
      if (!cells.has(`${x},${y - 1}`)) {
        ctx.beginPath();
        ctx.moveTo(left, top + 0.5);
        ctx.lineTo(left + this.cellWidth, top + 0.5);
        ctx.stroke();
      }
      if (!cells.has(`${x + 1},${y}`)) {
        ctx.beginPath();
        ctx.moveTo(left + this.cellWidth - 0.5, top);
        ctx.lineTo(left + this.cellWidth - 0.5, top + this.cellHeight);
        ctx.stroke();
      }
      if (!cells.has(`${x},${y + 1}`)) {
        ctx.beginPath();
        ctx.moveTo(left, top + this.cellHeight - 0.5);
        ctx.lineTo(left + this.cellWidth, top + this.cellHeight - 0.5);
        ctx.stroke();
      }
      if (!cells.has(`${x - 1},${y}`)) {
        ctx.beginPath();
        ctx.moveTo(left + 0.5, top);
        ctx.lineTo(left + 0.5, top + this.cellHeight);
        ctx.stroke();
      }
    });
    ctx.restore();
  }
}
