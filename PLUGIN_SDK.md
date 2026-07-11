# Rigel Plugin SDK

Rigel loads custom plugins as ES modules (`.js` / `.mjs`). A plugin can export a plain object or use helpers from `js/sdk/rigelPluginSdk.js`.

See `examples/plugins/panel-effect.plugin.js` for a complete loadable panel plugin.
See `js/plugins/colorCorrectionPanelPlugin.js` for a full built-in effect window with sliders, checkboxes, presets, header actions, and active-layer transforms.

## UI panel plugin

```js
import { createPanelPlugin } from '/js/sdk/rigelPluginSdk.js';

export default createPanelPlugin({
  id: 'my.panel',
  name: 'My Panel',
  group: 'Panels',
  tags: ['panel', 'workflow'],
  title: 'My Panel',
  docked: true,
  hidden: false,
  width: 300,
  render({ body, api }) {
    const button = document.createElement('button');
    button.textContent = 'Apply outline';
    button.onclick = () => api.effects.applyLayer('rigel.layer.outline');
    body.append(button);
  },
});
```

## Control panel plugin

```js
import { createControlPanelPlugin } from '/js/sdk/rigelPluginSdk.js';

export default createControlPanelPlugin({
  id: 'my.controls',
  name: 'My Controls',
  title: 'My Controls',
  group: 'Panels',
  tags: ['panel', 'controls'],
  width: 320,
  render({ ui, api }) {
    const section = ui.section('Tone');
    let brightness = 0;
    ui.slider(section, {
      label: 'Brightness',
      min: -100,
      max: 100,
      value: brightness,
      onInput: (value) => { brightness = value; },
    });
    const buttons = ui.group();
    ui.button(buttons, 'Apply', () => {
      api.effects.transformActiveLayer('My Controls', (grid, { hexToRgb, rgbToHex }) => {
        const out = grid.clone();
        // transform cells here
        return out;
      });
    });
  },
});
```

## Layer effect plugin

```js
import { createLayerEffectPlugin } from '/js/sdk/rigelPluginSdk.js';

export default createLayerEffectPlugin({
  id: 'my.magenta',
  name: 'Magenta Cell',
  group: 'Color',
  tags: ['color', 'test'],
  apply(grid) {
    const out = grid.clone();
    out.setCell(0, 0, {
      char: 'M',
      fg: '#ffffff',
      bg: '#ff00ff',
      fgAlpha: 1,
      bgAlpha: 1,
      empty: false,
    });
    return out;
  },
});
```

## Available API

- `api.ANSIGrid`
- `api.clamp`
- `api.hexToRgb`
- `api.rgbToHex`
- `api.mixColors`
- `api.layout.registerPanel(options)`
- `api.layout.unregisterPanel(id)`
- `api.layout.openPanel(id)`
- `api.layout.closePanel(id)`
- `api.layout.dockPanel(id)`
- `api.layout.floatPanel(id)`
- `api.layout.save()`
- `api.effects.applyLayer(pluginId)`
- `api.effects.transformActiveLayer(label, transformFn)`
- `api.effects.listLayerEffects()`

## Panel UI helpers

`createControlPanelPlugin` gives `render({ ui })` helpers:

- `ui.section(title)`
- `ui.group(parent?)`
- `ui.row(parent, label, control)`
- `ui.button(parent, label, onClick)`
- `ui.slider(parent, options)`
- `ui.checkbox(parent, options)`
- `ui.color(parent, options)`
- `ui.select(parent, options)`

## Manifest grouping

Use `group` and `tags` in the plugin manifest or SDK helper options. Rigel groups plugins by `group` in the plugin manager and renders `tags` as small searchable labels for humans.
