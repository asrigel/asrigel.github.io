export function defineRigelPlugin(plugin) {
  return plugin;
}

export function createPanelPlugin({
  id,
  name,
  version = '1.0.0',
  group = 'Panels',
  tags = [],
  title = name,
  docked = true,
  render,
}) {
  return defineRigelPlugin({
    type: 'ui',
    manifest: {
      id,
      name,
      version,
      group,
      tags,
      dependencies: [],
      sandbox: 'rigel-ui-panel',
    },
    setup(api) {
      api.layout.registerPanel({
        id,
        title,
        docked,
        render,
      });
    },
    destroy(api) {
      api.layout.unregisterPanel(id);
    },
  });
}

export function createLayerEffectPlugin({
  id,
  name,
  version = '1.0.0',
  group = 'Layer Effects',
  tags = [],
  apply,
}) {
  return defineRigelPlugin({
    type: 'layer-effect',
    manifest: {
      id,
      name,
      version,
      group,
      tags,
      dependencies: [],
      sandbox: 'pure-grid-transform',
    },
    apply,
  });
}

export const RigelPluginTypes = Object.freeze({
  Ui: 'ui',
  Effect: 'effect',
  LayerEffect: 'layer-effect',
  Tool: 'tool',
});
