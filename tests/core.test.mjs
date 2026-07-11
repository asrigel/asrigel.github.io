import test from 'node:test';
import assert from 'node:assert/strict';
import { ANSIGrid } from '../js/grid.js';
import { BrushEngine } from '../js/brushEngine.js';
import { AnsiExporter } from '../js/exporter.js';
import { PluginManager } from '../js/core/pluginManager.js';
import { createControlPanelPlugin, createLayerEffectPlugin, createPanelPlugin } from '../js/sdk/rigelPluginSdk.js';
import { createBuiltinLayerEffectPlugins } from '../js/effects/builtinLayerPlugins.js';
import { createColorCorrectionPanelPlugin } from '../js/plugins/colorCorrectionPanelPlugin.js';

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

test('Go export can generate base64 variable only', () => {
  const source = new AnsiExporter(new ANSIGrid(3, 3)).toColoristaGo({
    mode: 'base64',
    variableName: 'Payload',
    includePackage: false,
  });

  assert.match(source, /^const Payload = "/);
  assert.doesNotMatch(source, /func Render/);
  assert.doesNotMatch(source, /import \(/);
});

test('Go export can generate a reusable RenderString function', () => {
  const source = new AnsiExporter(new ANSIGrid(3, 3)).toColoristaGo({
    mode: 'full',
    variableName: 'RigelArt',
    functionName: 'Draw',
  });

  assert.match(source, /const RigelArt = "/);
  assert.match(source, /func Draw\(\) string/);
  assert.match(source, /func RenderString\(payload string\) string/);
  assert.match(source, /colorista\.NewColorista\(colorista\.ThemeAuto\)/);
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

test('plugin SDK creates UI panel plugins with a stable manifest', () => {
  let registered = null;
  const plugin = createPanelPlugin({
    id: 'test.panel',
    name: 'Test Panel',
    render: () => 'hello',
  });

  plugin.setup({
    layout: {
      registerPanel(options) {
        registered = options;
      },
    },
  });

  assert.equal(plugin.type, 'ui');
  assert.equal(plugin.manifest.id, 'test.panel');
  assert.equal(plugin.manifest.version, '1.0.0');
  assert.equal(plugin.manifest.group, 'Panels');
  assert.deepEqual(plugin.manifest.tags, []);
  assert.equal(registered.id, 'test.panel');
  assert.equal(registered.title, 'Test Panel');
  assert.equal(registered.hidden, false);
});

test('control panel SDK forwards window options and wraps render with UI helpers', () => {
  const plugin = createControlPanelPlugin({
    id: 'test.controls',
    name: 'Controls',
    hidden: true,
    width: 320,
    render: () => null,
  });
  let registered = null;
  plugin.setup({
    layout: {
      registerPanel(options) {
        registered = options;
      },
    },
  });

  assert.equal(plugin.type, 'ui');
  assert.equal(registered.hidden, true);
  assert.equal(registered.width, 320);
  assert.match(registered.className, /plugin-control-panel/);
  assert.equal(typeof registered.render, 'function');
});

test('custom plugins receive the public API for setup and layer effects', () => {
  const calls = [];
  const manager = new PluginManager({
    secret: true,
    publicApi: { exposed: true },
  });
  const plugin = createLayerEffectPlugin({
    id: 'test.effect',
    name: 'Test Effect',
    apply(grid, api) {
      calls.push(api);
      return grid;
    },
  });
  plugin.custom = true;
  plugin.setup = (api) => calls.push(api);

  manager.register(plugin);
  manager.applyLayerEffect('test.effect', new ANSIGrid(1, 1));

  assert.deepEqual(calls, [{ exposed: true }, { exposed: true }]);
});

test('ui plugins receive the public layout API even when built in', () => {
  let registered = null;
  const manager = new PluginManager({
    internal: true,
    publicApi: {
      layout: {
        registerPanel(options) {
          registered = options;
        },
      },
    },
  });

  manager.register(createControlPanelPlugin({
    id: 'test.builtin.panel',
    name: 'Built In Panel',
    render: () => null,
  }));

  assert.equal(registered.id, 'test.builtin.panel');
});

test('panel SDK falls back to api.publicApi.layout for stale internal callers', () => {
  let registered = null;
  const plugin = createControlPanelPlugin({
    id: 'test.fallback.panel',
    name: 'Fallback Panel',
    render: () => null,
  });

  plugin.setup({
    publicApi: {
      layout: {
        registerPanel(options) {
          registered = options;
        },
      },
    },
  });

  assert.equal(registered.id, 'test.fallback.panel');
});

test('built-in layer effects still receive the internal effect API', () => {
  const calls = [];
  const manager = new PluginManager({
    internal: true,
    publicApi: { exposed: true },
  });
  manager.register(createLayerEffectPlugin({
    id: 'test.internal.effect',
    name: 'Internal Effect',
    apply(grid, api) {
      calls.push(api);
      return grid;
    },
  }));

  manager.applyLayerEffect('test.internal.effect', new ANSIGrid(1, 1));

  assert.equal(calls[0].internal, true);
});

test('built-in layer plugins expose groups and tags for the plugin manager', () => {
  const plugins = createBuiltinLayerEffectPlugins();
  const ids = plugins.map((plugin) => plugin.manifest.id);
  assert.ok(ids.includes('rigel.layer.invert'));
  assert.ok(ids.includes('rigel.layer.posterize'));
  assert.ok(ids.includes('rigel.layer.terminal-dither'));
  assert.ok(ids.includes('rigel.layer.edge-relief'));
  assert.ok(ids.includes('rigel.layer.duotone-cyan-magenta'));
  assert.ok(plugins.every((plugin) => plugin.manifest.group));
  assert.ok(plugins.every((plugin) => Array.isArray(plugin.manifest.tags)));
});

test('plugin manager list preserves plugin grouping metadata', () => {
  const manager = new PluginManager();
  manager.register(createLayerEffectPlugin({
    id: 'test.grouped',
    name: 'Grouped',
    group: 'Color',
    tags: ['demo', 'sdk'],
    apply: (grid) => grid,
  }));

  const listed = manager.list().find((plugin) => plugin.id === 'test.grouped');
  assert.equal(listed.group, 'Color');
  assert.deepEqual(listed.tags, ['demo', 'sdk']);
});

test('color correction panel is a standalone UI plugin file', () => {
  const plugin = createColorCorrectionPanelPlugin();

  assert.equal(plugin.type, 'ui');
  assert.equal(plugin.manifest.id, 'rigel.panel.color-correction');
  assert.equal(plugin.manifest.group, 'Panels');
  assert.ok(plugin.manifest.tags.includes('correction'));
});
