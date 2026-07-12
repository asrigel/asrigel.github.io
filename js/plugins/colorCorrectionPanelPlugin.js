import { createControlPanelPlugin } from '../sdk/rigelPluginSdk.js?v=20260711-text-export-dialog';

const defaults = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  gamma: 1,
  temperature: 0,
  tint: 0,
  fg: true,
  bg: true,
  selectedOnly: true,
};

const presets = {
  neutral: { label: 'Neutral', values: {} },
  punch: { label: 'Punch', values: { contrast: 28, saturation: 18, brightness: 4 } },
  cold: { label: 'Cold Terminal', values: { temperature: -32, saturation: 8, contrast: 12 } },
  warm: { label: 'Warm Terminal', values: { temperature: 35, tint: 8, saturation: 10 } },
  faded: { label: 'Faded', values: { contrast: -24, saturation: -35, brightness: 8, gamma: 1.12 } },
  mono: { label: 'Mono ANSI', values: { saturation: -100, contrast: 18 } },
};

const visible = (cell) => cell && !cell.empty && Math.max(cell.fgAlpha ?? 0, cell.bgAlpha ?? 0) > 0;

const rgbToHsl = ({ r, g, b }) => {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const light = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: light };
  const delta = max - min;
  const sat = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue = max === nr
    ? (ng - nb) / delta + (ng < nb ? 6 : 0)
    : max === ng
      ? (nb - nr) / delta + 2
      : (nr - ng) / delta + 4;
  return { h: hue / 6, s: sat, l: light };
};

const hslToRgb = ({ h, s, l }) => {
  if (s === 0) {
    const value = l * 255;
    return { r: value, g: value, b: value };
  }
  const hue2rgb = (p, q, t) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  };
};

const applyColor = (color, state, { clamp, hexToRgb, rgbToHex }) => {
  let { r, g, b } = hexToRgb(color);
  r += state.temperature * 1.2 - state.tint * 0.25;
  g += state.tint * 0.95;
  b -= state.temperature * 1.2 + state.tint * 0.15;

  const contrastAmount = state.contrast * 2.55;
  const contrastFactor = (259 * (contrastAmount + 255)) / (255 * (259 - contrastAmount));
  const tone = (value) => contrastFactor * (value - 128) + 128 + state.brightness * 2.55;
  r = tone(r);
  g = tone(g);
  b = tone(b);

  const gamma = Math.max(0.2, state.gamma);
  r = Math.pow(clamp(r, 0, 255) / 255, 1 / gamma) * 255;
  g = Math.pow(clamp(g, 0, 255) / 255, 1 / gamma) * 255;
  b = Math.pow(clamp(b, 0, 255) / 255, 1 / gamma) * 255;

  const hsl = rgbToHsl({ r, g, b });
  hsl.h = (hsl.h + state.hue / 360 + 1) % 1;
  hsl.s = clamp(hsl.s * (1 + state.saturation / 100), 0, 1);
  return rgbToHex(...Object.values(hslToRgb(hsl)));
};

const applyCorrection = (grid, state, api) => {
  const result = grid.clone();
  const selected = state.selectedOnly && api.selection?.cells?.size ? api.selection.cells : null;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (selected && !selected.has(`${x},${y}`)) continue;
      const cell = grid.getCell(x, y);
      if (!visible(cell)) continue;
      const patch = {};
      if (state.fg && (cell.fgAlpha ?? 0) > 0) patch.fg = applyColor(cell.fg, state, api);
      if (state.bg && (cell.bgAlpha ?? 0) > 0) patch.bg = applyColor(cell.bg, state, api);
      result.setCell(x, y, patch);
    }
  }
  return result;
};

export function createColorCorrectionPanelPlugin() {
  return createControlPanelPlugin({
    id: 'rigel.panel.color-correction',
    name: 'Color Correction Panel',
    group: 'Panels',
    tags: ['color', 'correction', 'panel', 'effect-window'],
    title: 'Color Correction',
    docked: false,
    hidden: true,
    width: 330,
    actions: [
      {
        label: 'R',
        title: 'Reset values',
        onClick({ panel }) {
          panel.dispatchEvent(new CustomEvent('rigel:color-correction-reset'));
        },
      },
    ],
    render({ panel, ui, api }) {
      const state = { ...defaults };
      const inputs = new Map();
      const setValue = (key, value) => {
        state[key] = value;
        const input = inputs.get(key);
        if (input) input.value = String(value);
      };
      const setChecked = (key, value) => {
        state[key] = value;
        const input = inputs.get(key);
        if (input) input.checked = value;
      };
      const reset = () => {
        Object.entries(defaults).forEach(([key, value]) => {
          if (typeof value === 'boolean') setChecked(key, value);
          else setValue(key, value);
        });
      };
      const applyPreset = (preset) => {
        reset();
        Object.entries(presets[preset]?.values || {}).forEach(([key, value]) => setValue(key, value));
      };
      const apply = () => api.effects.transformActiveLayer('Color Correction', (grid, context) => {
        const mergedApi = { ...api, ...context };
        return applyCorrection(grid, state, mergedApi);
      });

      const tone = ui.section('Tone');
      inputs.set('brightness', ui.slider(tone, { label: 'Brightness', min: -100, max: 100, value: state.brightness, onInput: (value) => { state.brightness = value; } }));
      inputs.set('contrast', ui.slider(tone, { label: 'Contrast', min: -100, max: 100, value: state.contrast, onInput: (value) => { state.contrast = value; } }));
      inputs.set('gamma', ui.slider(tone, { label: 'Gamma', min: 0.2, max: 3, step: 0.05, value: state.gamma, onInput: (value) => { state.gamma = value; } }));

      const color = ui.section('Color');
      inputs.set('saturation', ui.slider(color, { label: 'Saturation', min: -100, max: 100, value: state.saturation, onInput: (value) => { state.saturation = value; } }));
      inputs.set('hue', ui.slider(color, { label: 'Hue', min: -180, max: 180, value: state.hue, suffix: '°', onInput: (value) => { state.hue = value; } }));
      inputs.set('temperature', ui.slider(color, { label: 'Temp', min: -100, max: 100, value: state.temperature, onInput: (value) => { state.temperature = value; } }));
      inputs.set('tint', ui.slider(color, { label: 'Tint', min: -100, max: 100, value: state.tint, onInput: (value) => { state.tint = value; } }));

      const scope = ui.section('Scope');
      inputs.set('fg', ui.checkbox(scope, { label: 'Characters', checked: state.fg, onChange: (value) => { state.fg = value; } }));
      inputs.set('bg', ui.checkbox(scope, { label: 'Backgrounds', checked: state.bg, onChange: (value) => { state.bg = value; } }));
      inputs.set('selectedOnly', ui.checkbox(scope, { label: 'Selection only', checked: state.selectedOnly, onChange: (value) => { state.selectedOnly = value; } }));

      const presetSection = ui.section('Presets');
      ui.select(presetSection, {
        label: 'Preset',
        value: 'neutral',
        options: Object.entries(presets).map(([value, preset]) => ({ value, label: preset.label })),
        onChange: applyPreset,
      });

      const buttons = ui.group();
      ui.button(buttons, 'Apply', apply);
      ui.button(buttons, 'Reset', reset);
      ui.button(buttons, 'Punch', () => applyPreset('punch'));

      panel.addEventListener('rigel:color-correction-reset', reset);
    },
  });
}

export default createColorCorrectionPanelPlugin;
