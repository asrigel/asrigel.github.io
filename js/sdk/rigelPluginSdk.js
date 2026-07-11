export function defineRigelPlugin(plugin) {
  return plugin;
}

export function createPanelUi(body) {
  const append = (parent, child) => {
    parent.appendChild(child);
    return child;
  };
  const el = (tag, className = '', text = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const makeRow = (label, control) => {
    const row = el('label', 'plugin-control-row');
    const caption = el('span', 'plugin-control-label', label);
    row.append(caption, control);
    return row;
  };
  const api = {
    section(title) {
      const section = append(body, el('section', 'plugin-control-section'));
      if (title) append(section, el('strong', 'plugin-control-title', title));
      return section;
    },
    group(parent = body) {
      return append(parent, el('div', 'plugin-control-group'));
    },
    row(parent, label, control) {
      return append(parent, makeRow(label, control));
    },
    button(parent, label, onClick, { title = label, className = '' } = {}) {
      const button = el('button', className);
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.addEventListener('click', onClick);
      return append(parent, button);
    },
    slider(parent, {
      label,
      min = 0,
      max = 100,
      step = 1,
      value = 0,
      suffix = '',
      onInput = null,
      onChange = null,
    }) {
      const wrap = el('div', 'plugin-slider');
      const input = el('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      const output = el('output', '', `${value}${suffix}`);
      const update = () => {
        output.textContent = `${input.value}${suffix}`;
        onInput?.(Number(input.value), input);
      };
      input.addEventListener('input', update);
      input.addEventListener('change', () => onChange?.(Number(input.value), input));
      wrap.append(input, output);
      append(parent, makeRow(label, wrap));
      return input;
    },
    checkbox(parent, { label, checked = false, onChange = null }) {
      const input = el('input');
      input.type = 'checkbox';
      input.checked = checked;
      input.addEventListener('change', () => onChange?.(input.checked, input));
      append(parent, makeRow(label, input));
      return input;
    },
    color(parent, { label, value = '#ffffff', onChange = null }) {
      const input = el('input');
      input.type = 'color';
      input.value = value;
      input.addEventListener('input', () => onChange?.(input.value, input));
      append(parent, makeRow(label, input));
      return input;
    },
    select(parent, { label, options = [], value = '', onChange = null }) {
      const select = el('select');
      options.forEach((option) => {
        const item = el('option');
        item.value = option.value;
        item.textContent = option.label;
        select.appendChild(item);
      });
      select.value = value;
      select.addEventListener('change', () => onChange?.(select.value, select));
      append(parent, makeRow(label, select));
      return select;
    },
  };
  return api;
}

export function createPanelPlugin({
  id,
  name,
  version = '1.0.0',
  group = 'Panels',
  tags = [],
  title = name,
  docked = true,
  hidden = false,
  width = 270,
  className = '',
  actions = [],
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
      const layout = api.layout || api.publicApi?.layout;
      if (!layout?.registerPanel) {
        throw new Error(`Rigel panel plugin "${id}" requires api.layout.registerPanel`);
      }
      layout.registerPanel({
        id,
        title,
        docked,
        hidden,
        width,
        className,
        actions,
        render,
      });
    },
    destroy(api) {
      const layout = api.layout || api.publicApi?.layout;
      layout?.unregisterPanel?.(id);
    },
  });
}

export function createControlPanelPlugin(options) {
  return createPanelPlugin({
    ...options,
    className: ['plugin-control-panel', options.className].filter(Boolean).join(' '),
    render(context) {
      const ui = createPanelUi(context.body);
      return options.render?.({ ...context, ui });
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
