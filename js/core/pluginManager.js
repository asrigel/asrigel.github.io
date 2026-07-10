export class PluginManager {
  constructor(api = {}) {
    this.api = api;
    this.publicApi = api.publicApi || api;
    this.plugins = new Map();
    this.effectOrder = [];
    this.layerEffectOrder = [];
    this.hotReloadToken = 0;
  }

  register(plugin) {
    if (!plugin?.manifest?.id) throw new Error('Plugin manifest.id is required');
    const id = plugin.manifest.id;
    const previous = this.plugins.get(id);
    if (previous?.destroy) previous.destroy(this.api);
    const instance = { ...plugin, enabled: plugin.enabled !== false };
    this.plugins.set(id, instance);
    if (instance.type === 'effect' && !this.effectOrder.includes(id)) this.effectOrder.push(id);
    if (instance.type === 'layer-effect' && !this.layerEffectOrder.includes(id)) this.layerEffectOrder.push(id);
    instance.setup?.(instance.custom ? this.publicApi : this.api);
    this.api.eventBus?.emit('plugin:registered', instance.manifest);
    return instance;
  }

  unregister(id) {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;
    plugin.destroy?.(this.api);
    this.plugins.delete(id);
    this.effectOrder = this.effectOrder.filter((item) => item !== id);
    this.layerEffectOrder = this.layerEffectOrder.filter((item) => item !== id);
    this.api.eventBus?.emit('plugin:unregistered', { id });
    return true;
  }

  hotReload(plugin) {
    this.hotReloadToken += 1;
    this.unregister(plugin?.manifest?.id);
    return this.register(plugin);
  }

  setEnabled(id, enabled) {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    plugin.enabled = enabled === true;
    this.api.eventBus?.emit('plugin:enabled', { id, enabled: plugin.enabled });
  }

  get(id) {
    return this.plugins.get(id) || null;
  }

  list() {
    return [...this.plugins.values()].map((plugin) => ({
      ...plugin.manifest,
      type: plugin.type,
      enabled: plugin.enabled !== false,
      custom: plugin.custom === true,
    }));
  }

  getLayerEffects() {
    return this.layerEffectOrder
      .map((id) => this.plugins.get(id))
      .filter((plugin) => plugin && plugin.enabled !== false && typeof plugin.apply === 'function');
  }

  applyEffects(grid, context = {}) {
    return this.effectOrder.reduce((current, id) => {
      const plugin = this.plugins.get(id);
      if (!plugin?.enabled || typeof plugin.apply !== 'function') return current;
      const api = plugin.custom ? this.publicApi : this.api;
      return plugin.apply(current, { ...api, ...context }) || current;
    }, grid);
  }

  applyLayerEffect(id, grid, context = {}) {
    const plugin = this.plugins.get(id);
    if (!plugin || plugin.enabled === false || plugin.type !== 'layer-effect' || typeof plugin.apply !== 'function') {
      return null;
    }
    const api = plugin.custom ? this.publicApi : this.api;
    return plugin.apply(grid, { ...api, ...context }) || grid;
  }
}
