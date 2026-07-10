import { ANSIGrid } from '../grid.js';
import { clamp, hexToRgb, mixColors } from '../utils.js';

const defaultLighting = {
  enabled: false,
  mode: 'single',
  color: '#fff2cc',
  intensity: 0.7,
  radius: 18,
  height: 1.1,
  volumeEnabled: false,
  points: [],
  docked: false,
};

const normalizePoint = (point, fallback) => ({
  id: point.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  x: Number(point.x ?? 0),
  y: Number(point.y ?? 0),
  color: point.color || fallback.color,
  intensity: Number(point.intensity ?? fallback.intensity),
  radius: Number(point.radius ?? fallback.radius),
  height: Number(point.height ?? fallback.height ?? 1.1),
});

const cellHeightValue = (grid, x, y) => {
  const cell = grid.getCell(x, y);
  if (!cell || cell.empty) return 0;
  const alpha = Math.max(cell.fgAlpha ?? 1, cell.bgAlpha ?? 1);
  const visibleColor = (cell.fgAlpha ?? 1) > 0 ? cell.fg : cell.bg;
  const { r, g, b } = hexToRgb(visibleColor);
  const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  const density = cell.density ?? luminance;
  const brightness = cell.brightness ?? luminance;
  return clamp((density * 0.62 + brightness * 0.24 + (1 - luminance) * 0.14) * alpha, 0, 1);
};

const surfaceNormal = (grid, x, y, depth = 1) => {
  const nx = (cellHeightValue(grid, x - 1, y) - cellHeightValue(grid, x + 1, y)) * depth;
  const ny = (cellHeightValue(grid, x, y - 1) - cellHeightValue(grid, x, y + 1)) * depth;
  const nz = 0.9;
  const length = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / length, y: ny / length, z: nz / length };
};

export function lightingAt(grid, x, y, lighting = defaultLighting, mode = 'effect') {
  const state = { ...defaultLighting, ...lighting };
  const points = state.points?.length
    ? state.points.map((point) => normalizePoint(point, state))
    : [{ x: -grid.width * 0.25, y: -grid.height * 0.3, color: '#ffffff', intensity: 0.85, radius: Math.max(grid.width, grid.height), height: 1.2 }];
  const volumeMode = mode === 'volume-live' || mode === 'effect' || mode === 'emboss';
  const normal = surfaceNormal(grid, x, y, mode === 'live' ? 0.55 : mode === 'volume-live' ? 1.55 : 1.35);
  let highlight = mode === 'live' ? 0 : mode === 'volume-live' ? 0.03 : 0.04;
  let shadow = mode === 'live' ? 0.01 : mode === 'volume-live' ? 0.16 : 0.18;
  let color = '#ffffff';

  points.forEach((point) => {
    const radius = Math.max(1, Number(point.radius ?? state.radius));
    const intensity = Number(point.intensity ?? state.intensity);
    const height = Number(point.height ?? state.height ?? 1.1);
    const lx = point.x - x;
    const ly = point.y - y;
    const lz = clamp(height, 0.2, 3) * 7;
    const lightLength = Math.hypot(lx, ly, lz) || 1;
    const distance = Math.hypot(lx, ly);
    const falloff = Math.pow(clamp(1 - distance / radius, 0, 1), 1.22);
    if (falloff <= 0) return;
    const dot = clamp(normal.x * (lx / lightLength) + normal.y * (ly / lightLength) + normal.z * (lz / lightLength), 0, 1);
    const amount = falloff * intensity * (volumeMode ? 0.12 + dot * 1.08 : 0.38 + dot * 0.42);
    highlight += amount;
    shadow -= amount * (volumeMode ? 0.26 : 0.5);
    color = mixColors(color, point.color || state.color, clamp(falloff * intensity * 0.55, 0, 1));
  });

  return {
    color,
    highlight: clamp(highlight, 0, mode === 'live' ? 0.62 : mode === 'volume-live' ? 1 : 1.1),
    shadow: clamp(shadow, 0, mode === 'live' ? 0.18 : mode === 'volume-live' ? 0.62 : 0.72),
  };
}

export function createLightingPlugin() {
  return {
    type: 'effect',
    manifest: {
      id: 'rigel.effects.lighting',
      name: 'Lighting',
      version: '1.0.0',
      dependencies: [],
      sandbox: 'pure-grid-transform',
    },
    apply(grid, { app }) {
      const lighting = app?.lighting || defaultLighting;
      if (!lighting.enabled || !lighting.points?.length) return grid;
      const lit = new ANSIGrid(grid.width, grid.height);
      for (let y = 0; y < grid.height; y += 1) {
        for (let x = 0; x < grid.width; x += 1) {
          const cell = grid.getCell(x, y);
          if (!cell || cell.empty) continue;
          const light = lightingAt(grid, x, y, lighting, lighting.volumeEnabled ? 'volume-live' : 'live');
          let fg = cell.fg;
          let bg = cell.bg;
          if ((cell.fgAlpha ?? 1) > 0) fg = mixColors(mixColors(fg, '#000000', light.shadow), light.color, light.highlight);
          if ((cell.bgAlpha ?? 1) > 0) bg = mixColors(mixColors(bg, '#000000', light.shadow * 0.8), light.color, light.highlight * 0.42);
          lit.setCell(x, y, { ...cell, fg, bg });
        }
      }
      return lit;
    },
  };
}
