import test from 'node:test';
import assert from 'node:assert/strict';
import { ANSIGrid } from '../js/grid.js';
import { BrushEngine } from '../js/brushEngine.js';
import { AnsiExporter } from '../js/exporter.js';

test('an empty grid exports no whitespace', () => {
  const grid = new ANSIGrid(80, 25);
  const exporter = new AnsiExporter(grid);

  assert.equal(exporter.toPlainText(), '');
  assert.equal(exporter.toAnsiText(), '');
});

test('export crops outer whitespace and preserves relative offsets', () => {
  const grid = new ANSIGrid(12, 8);
  grid.setCell(5, 2, { char: 'A', fg: '#ff0000', bg: '#000000', empty: false });
  grid.setCell(7, 2, { char: 'C', fg: '#0000ff', bg: '#000000', empty: false });
  grid.setCell(6, 4, { char: 'B', fg: '#00ff00', bg: '#000000', empty: false });

  const exporter = new AnsiExporter(grid);
  assert.equal(exporter.toPlainText(), 'A C\n\n B');
});

test('a painted background space is content and remains in ANSI output', () => {
  const grid = new ANSIGrid(8, 4);
  const brush = new BrushEngine(grid);
  brush.applyStroke(3, 1, {
    size: 1,
    symbol: '#',
    fg: '#ffffff',
    bg: '#800000',
    backgroundOnly: true,
  });

  const exporter = new AnsiExporter(grid);
  assert.equal(grid.getCell(3, 1).empty, false);
  assert.equal(grid.getCell(3, 1).char, ' ');
  assert.match(exporter.toAnsiText(), /\u001b\[48;2;128;0;0m/);
});

test('eraser restores a painted cell to transparent empty state', () => {
  const grid = new ANSIGrid(5, 5);
  const brush = new BrushEngine(grid);
  brush.applyStroke(2, 2, { size: 1, symbol: '@', fg: '#ffffff', bg: '#000000' });
  brush.applyStroke(2, 2, { size: 1, erase: true });

  assert.equal(grid.getCell(2, 2).empty, true);
  assert.equal(new AnsiExporter(grid).toPlainText(), '');
});

test('the regular symbol brush keeps selected colors exact', () => {
  const grid = new ANSIGrid(3, 3);
  const brush = new BrushEngine(grid);
  brush.applyStroke(1, 1, {
    size: 1,
    mode: 'free',
    symbol: 'X',
    fg: '#ff00ff',
    bg: '#000080',
    light: { intensity: 1, direction: 'top' },
  });

  assert.equal(grid.getCell(1, 1).fg, '#ff00ff');
  assert.equal(grid.getCell(1, 1).bg, '#000080');
});

test('grid resizing preserves cells inside the new bounds', () => {
  const grid = new ANSIGrid(4, 3);
  grid.setCell(2, 1, { char: 'R', fg: '#ffffff', bg: '#000000', empty: false });
  grid.resize(8, 5);

  assert.equal(grid.width, 8);
  assert.equal(grid.height, 5);
  assert.equal(grid.getCell(2, 1).char, 'R');
  assert.equal(grid.getCell(7, 4).empty, true);
});

test('Go export returns one Colorista Render function with exact RGB styles', () => {
  const grid = new ANSIGrid(5, 3);
  grid.setCell(2, 1, { char: 'X', fg: '#ff0080', bg: '#000040', empty: false });
  const source = new AnsiExporter(grid).toColoristaGo();

  assert.match(source, /func Render\(\) string/);
  assert.match(source, /github\.com\/rp1s\/colorista/);
  assert.match(source, /colorista\.NewColorista\(colorista\.ThemeAuto\)/);
  const payload = source.match(/DecodeString\("([^"]*)"\)/)[1];
  const bytes = Buffer.from(payload, 'base64');
  assert.deepEqual([...bytes.subarray(2, 8)], [255, 0, 128, 0, 0, 64]);
  assert.equal(bytes.subarray(13).toString(), 'X');
});

test('empty Go export still marks the Colorista instance as used', () => {
  const source = new AnsiExporter(new ANSIGrid(3, 3)).toColoristaGo();
  assert.match(source, /_ = c/);
});

test('Go export stays compact for a fully painted canvas', () => {
  const grid = new ANSIGrid(80, 25);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      grid.setCell(x, y, { char: 'X', fg: '#ffffff', bg: '#000000', empty: false });
    }
  }
  const source = new AnsiExporter(grid).toColoristaGo();

  assert.ok(source.split('\n').length < 50);
  assert.equal((source.match(/c\.Apply/g) || []).length, 3);
  assert.ok(source.length < 6000);
});

test('letter brush repeats the configured text pattern', () => {
  const grid = new ANSIGrid(6, 2);
  const brush = new BrushEngine(grid);
  brush.applyStroke(2, 0, {
    size: 1,
    mode: 'letters',
    pattern: 'ABC',
    fg: '#ffffff',
    bg: '#000000',
  });
  brush.applyStroke(3, 0, {
    size: 1,
    mode: 'letters',
    pattern: 'ABC',
    fg: '#ffffff',
    bg: '#000000',
  });

  assert.equal(grid.getCell(2, 0).char, 'C');
  assert.equal(grid.getCell(3, 0).char, 'A');
});

test('manual brush level selects one stable ASCII symbol for the whole stroke', () => {
  const brush = new BrushEngine(new ANSIGrid(7, 7));
  assert.equal(brush.selectSymbol('ascii', '█', '', 'blocks', 0.5, 3, 3), '+');
});

test('sparse project grids restore symbols and colors exactly', () => {
  const grid = new ANSIGrid(80, 25);
  grid.setCell(31, 12, {
    char: 'Ж',
    fg: '#12abef',
    bg: '#230045',
    brightness: 0.8,
    density: 1,
    fgAlpha: 1,
    bgAlpha: 1,
    empty: false,
  });

  const restored = ANSIGrid.fromJSON(grid.toSparseJSON());
  assert.deepEqual(restored.getCell(31, 12), grid.getCell(31, 12));
  assert.equal(restored.getCell(0, 0).empty, true);
});

test('sparse storage avoids serializing empty cells', () => {
  const grid = new ANSIGrid(80, 25);
  const fullSize = JSON.stringify(grid.toJSON()).length;
  const sparse = grid.toSparseJSON();

  assert.equal(sparse.cells.length, 0);
  assert.ok(JSON.stringify(sparse).length < fullSize / 100);
});

test('smart brush accumulates density instead of mixing random symbol families', () => {
  const grid = new ANSIGrid(3, 3);
  const brush = new BrushEngine(grid);
  const options = {
    size: 1,
    mode: 'smart',
    charset: 'blocks',
    fg: '#ffffff',
    bg: '#000000',
  };

  brush.applyStroke(1, 1, options);
  const first = grid.getCell(1, 1);
  brush.applyStroke(1, 1, options);
  const second = grid.getCell(1, 1);
  brush.applyStroke(1, 1, options);
  const third = grid.getCell(1, 1);

  assert.equal(first.char, '▒');
  assert.equal(second.char, '▓');
  assert.equal(third.char, '█');
  assert.ok(second.density > first.density);
});

test('brush density changes symbols without punching holes in a stroke', () => {
  const grid = new ANSIGrid(10, 10);
  const brush = new BrushEngine(grid);
  for (let x = 1; x <= 8; x += 1) brush.applyStroke(x, 5, {
    size: 1,
    mode: 'blocks',
    level: 0.1,
    fg: '#123456',
    bg: '#654321',
  });

  const painted = grid.cells.flat().filter((cell) => !cell.empty);
  assert.equal(painted.length, 8);
  assert.ok(painted.every((cell) => cell.char === '░'));
  assert.ok(painted.every((cell) => cell.fg === '#123456' && cell.bg === '#654321'));
});

test('transparent background keeps only the character', () => {
  const grid = new ANSIGrid(3, 3);
  new BrushEngine(grid).applyStroke(1, 1, {
    symbol: 'A',
    fg: '#ffffff',
    bg: '#ff0000',
    bgTransparent: true,
  });

  const cell = grid.getCell(1, 1);
  assert.equal(cell.fgAlpha, 1);
  assert.equal(cell.bgAlpha, 0);
  assert.doesNotMatch(new AnsiExporter(grid).toAnsiText(), /\u001b\[48;/);
});

test('transparent character keeps only the painted background', () => {
  const grid = new ANSIGrid(3, 3);
  new BrushEngine(grid).applyStroke(1, 1, {
    symbol: 'A',
    fg: '#ffffff',
    bg: '#800000',
    fgTransparent: true,
  });

  const cell = grid.getCell(1, 1);
  assert.equal(cell.fgAlpha, 0);
  assert.equal(cell.bgAlpha, 1);
  assert.equal(new AnsiExporter(grid).toPlainText(), ' ');
  assert.match(new AnsiExporter(grid).toAnsiText(), /\u001b\[48;2;128;0;0m/);
});

test('brush strokes can be clipped to a selected cell mask', () => {
  const grid = new ANSIGrid(5, 5);
  const allowedCells = new Set(['2,2']);
  new BrushEngine(grid).applyStroke(2, 2, {
    size: 3,
    symbol: 'X',
    fg: '#ffffff',
    bg: '#000000',
    allowedCells,
  });

  const painted = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (!grid.getCell(x, y).empty) painted.push(`${x},${y}`);
    }
  }
  assert.deepEqual(painted, ['2,2']);
});
