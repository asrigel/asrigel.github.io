# Rigel Plugin SDK

Rigel loads custom plugins as ES modules (`.js` / `.mjs`). A plugin can export a plain object or use helpers from `js/sdk/rigelPluginSdk.js`.

See `examples/plugins/panel-effect.plugin.js` for a complete loadable panel plugin.

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
  render({ body, api }) {
    const button = document.createElement('button');
    button.textContent = 'Apply outline';
    button.onclick = () => api.effects.applyLayer('rigel.layer.outline');
    body.append(button);
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
- `api.effects.listLayerEffects()`

## Manifest grouping

Use `group` and `tags` in the plugin manifest or SDK helper options. Rigel groups plugins by `group` in the plugin manager and renders `tags` as small searchable labels for humans.
