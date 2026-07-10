import { ANSIGrid } from '../grid.js';
import { clamp, hexToRgb, mixColors, rgbToHex } from '../utils.js';

const visible = (cell) => cell && !cell.empty && Math.max(cell.fgAlpha ?? 0, cell.bgAlpha ?? 0) > 0;

const luminanceOf = (color) => {
  const { r, g, b } = hexToRgb(color);
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
};

const shiftColor = (color, amount) => {
  const { r, g, b } = hexToRgb(color);
  return rgbToHex(
    clamp(r + amount, 0, 255),
    clamp(g + amount, 0, 255),
    clamp(b + amount, 0, 255),
  );
};

const averageColor = (colors) => {
  if (!colors.length) return '#000000';
  const total = colors.reduce((acc, color) => {
    const rgb = hexToRgb(color);
    acc.r += rgb.r;
    acc.g += rgb.g;
    acc.b += rgb.b;
    return acc;
  }, { r: 0, g: 0, b: 0 });
  return rgbToHex(total.r / colors.length, total.g / colors.length, total.b / colors.length);
};

const manifest = (id, name, description) => ({
  id,
  name,
  description,
  version: '1.0.0',
  dependencies: [],
  sandbox: 'pure-grid-transform',
});

export function createBuiltinLayerEffectPlugins() {
  return [
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.outline', 'Outline', 'Контур вокруг видимых ячеек'),
      apply(grid, { app }) {
        const result = grid.clone();
        const color = app?.fgColor || '#ffffff';
        const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let y = 0; y < grid.height; y += 1) {
          for (let x = 0; x < grid.width; x += 1) {
            if (!visible(grid.getCell(x, y))) continue;
            offsets.forEach(([ox, oy]) => {
              const target = grid.getCell(x + ox, y + oy);
              if (target && target.empty) {
                result.setCell(x + ox, y + oy, {
                  char: ' ',
                  fg: color,
                  bg: color,
                  fgAlpha: 0,
                  bgAlpha: 0.85,
                  brightness: 0.3,
                  density: 0.35,
                  empty: false,
                });
              }
            });
          }
        }
        return result;
      },
    },
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.blur', 'Blur', 'Мягкое усреднение цветов фона'),
      apply(grid) {
        const result = grid.clone();
        for (let y = 0; y < grid.height; y += 1) {
          for (let x = 0; x < grid.width; x += 1) {
            const cell = grid.getCell(x, y);
            if (!visible(cell)) continue;
            const colors = [];
            for (let oy = -1; oy <= 1; oy += 1) {
              for (let ox = -1; ox <= 1; ox += 1) {
                const sample = grid.getCell(x + ox, y + oy);
                if (visible(sample) && (sample.bgAlpha ?? 0) > 0) colors.push(sample.bg);
              }
            }
            if (colors.length > 1) result.setCell(x, y, { bg: averageColor(colors) });
          }
        }
        return result;
      },
    },
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.bloom', 'Bloom', 'Лёгкое свечение от ярких пикселей'),
      apply(grid) {
        const result = grid.clone();
        for (let y = 0; y < grid.height; y += 1) {
          for (let x = 0; x < grid.width; x += 1) {
            const cell = grid.getCell(x, y);
            if (!visible(cell)) continue;
            const color = (cell.fgAlpha ?? 0) > 0 ? cell.fg : cell.bg;
            if (luminanceOf(color) < 0.58) continue;
            for (let oy = -1; oy <= 1; oy += 1) {
              for (let ox = -1; ox <= 1; ox += 1) {
                if (ox === 0 && oy === 0) continue;
                const target = result.getCell(x + ox, y + oy);
                if (!target) continue;
                const bg = target.empty ? mixColors('#000000', color, 0.45) : mixColors(target.bg, color, 0.32);
                result.setCell(x + ox, y + oy, {
                  char: target.char || ' ',
                  fg: target.fg,
                  bg,
                  fgAlpha: target.fgAlpha ?? 0,
                  bgAlpha: Math.max(target.bgAlpha ?? 0, 0.36),
                  density: Math.max(target.density ?? 0, 0.25),
                  brightness: Math.max(target.brightness ?? 0, 0.6),
                  empty: false,
                });
              }
            }
          }
        }
        return result;
      },
    },
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.drop-shadow', 'Drop Shadow', 'Тень со смещением вниз вправо'),
      apply(grid) {
        const result = new ANSIGrid(grid.width, grid.height);
        for (let y = 0; y < grid.height; y += 1) {
          for (let x = 0; x < grid.width; x += 1) {
            const cell = grid.getCell(x, y);
            if (!visible(cell)) continue;
            result.setCell(x + 1, y + 1, {
              char: ' ',
              fg: '#000000',
              bg: '#000000',
              fgAlpha: 0,
              bgAlpha: 0.55,
              brightness: 0,
              density: 0.4,
              empty: false,
            });
          }
        }
        for (let y = 0; y < grid.height; y += 1) {
          for (let x = 0; x < grid.width; x += 1) {
            const cell = grid.getCell(x, y);
            if (visible(cell)) result.setCell(x, y, { ...cell });
          }
        }
        return result;
      },
    },
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.noise', 'Noise', 'Цветовой шум ANSI'),
      apply(grid) {
        const result = grid.clone();
        for (let y = 0; y < grid.height; y += 1) {
          for (let x = 0; x < grid.width; x += 1) {
            const cell = grid.getCell(x, y);
            if (!visible(cell)) continue;
            const amount = (Math.random() - 0.5) * 34;
            const patch = {};
            if ((cell.fgAlpha ?? 0) > 0) patch.fg = shiftColor(cell.fg, amount);
            if ((cell.bgAlpha ?? 0) > 0) patch.bg = shiftColor(cell.bg, amount);
            result.setCell(x, y, patch);
          }
        }
        return result;
      },
    },
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.color-correction', 'Color Correction', 'Контраст и лёгкая насыщенность'),
      apply(grid) {
        const result = grid.clone();
        const correct = (color) => {
          const { r, g, b } = hexToRgb(color);
          const contrast = (v) => clamp((v - 128) * 1.18 + 128, 0, 255);
          return rgbToHex(contrast(r), contrast(g), contrast(b));
        };
        for (let y = 0; y < grid.height; y += 1) {
          for (let x = 0; x < grid.width; x += 1) {
            const cell = grid.getCell(x, y);
            if (!visible(cell)) continue;
            result.setCell(x, y, {
              fg: (cell.fgAlpha ?? 0) > 0 ? correct(cell.fg) : cell.fg,
              bg: (cell.bgAlpha ?? 0) > 0 ? correct(cell.bg) : cell.bg,
              brightness: clamp((cell.brightness ?? 0.5) * 1.08, 0, 1),
            });
          }
        }
        return result;
      },
    },
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.lut-warm', 'LUT Warm Terminal', 'Тёплый терминальный LUT'),
      apply(grid) {
        const result = grid.clone();
        for (let y = 0; y < grid.height; y += 1) {
          for (let x = 0; x < grid.width; x += 1) {
            const cell = grid.getCell(x, y);
            if (!visible(cell)) continue;
            result.setCell(x, y, {
              fg: (cell.fgAlpha ?? 0) > 0 ? mixColors(cell.fg, '#ffd18a', 0.18) : cell.fg,
              bg: (cell.bgAlpha ?? 0) > 0 ? mixColors(cell.bg, '#3b2b1f', 0.16) : cell.bg,
            });
          }
        }
        return result;
      },
    },
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.motion-blur', 'Motion Blur', 'Смазывание вправо'),
      apply(grid) {
        const result = grid.clone();
        for (let y = 0; y < grid.height; y += 1) {
          for (let x = 0; x < grid.width; x += 1) {
            const cell = grid.getCell(x, y);
            if (!visible(cell)) continue;
            for (let i = 1; i <= 3; i += 1) {
              const target = result.getCell(x + i, y);
              if (!target) continue;
              result.setCell(x + i, y, {
                char: target.char || ' ',
                fg: target.fg,
                bg: mixColors(target.empty ? '#000000' : target.bg, cell.bg, 0.24 / i),
                fgAlpha: target.fgAlpha ?? 0,
                bgAlpha: Math.max(target.bgAlpha ?? 0, 0.22 / i),
                density: Math.max(target.density ?? 0, 0.18 / i),
                brightness: target.brightness ?? 0.35,
                empty: false,
              });
            }
          }
        }
        return result;
      },
    },
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.dof', 'DOF Soft Focus', 'Мягкий фокус слабых деталей'),
      apply(grid) {
        const result = grid.clone();
        for (let y = 0; y < grid.height; y += 1) {
          for (let x = 0; x < grid.width; x += 1) {
            const cell = grid.getCell(x, y);
            if (!visible(cell) || (cell.density ?? 0) > 0.55) continue;
            const colors = [];
            for (let oy = -1; oy <= 1; oy += 1) {
              for (let ox = -1; ox <= 1; ox += 1) {
                const sample = grid.getCell(x + ox, y + oy);
                if (visible(sample) && (sample.bgAlpha ?? 0) > 0) colors.push(sample.bg);
              }
            }
            if (colors.length > 1) result.setCell(x, y, { bg: averageColor(colors), fgAlpha: (cell.fgAlpha ?? 0) * 0.7 });
          }
        }
        return result;
      },
    },
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.scanlines', 'CRT Scanlines', 'Тонкие CRT-линии'),
      apply(grid) {
        const result = grid.clone();
        for (let y = 1; y < grid.height; y += 2) {
          for (let x = 0; x < grid.width; x += 1) {
            const cell = grid.getCell(x, y);
            if (!visible(cell)) continue;
            result.setCell(x, y, {
              fg: (cell.fgAlpha ?? 0) > 0 ? mixColors(cell.fg, '#000000', 0.18) : cell.fg,
              bg: (cell.bgAlpha ?? 0) > 0 ? mixColors(cell.bg, '#000000', 0.22) : cell.bg,
              brightness: clamp((cell.brightness ?? 0.5) * 0.82, 0, 1),
            });
          }
        }
        return result;
      },
    },
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.sharpen', 'Sharpen', 'Усиление контраста деталей'),
      apply(grid) {
        const result = grid.clone();
        for (let y = 0; y < grid.height; y += 1) {
          for (let x = 0; x < grid.width; x += 1) {
            const cell = grid.getCell(x, y);
            if (!visible(cell)) continue;
            const amount = luminanceOf(cell.bg) > 0.5 ? 22 : -22;
            result.setCell(x, y, {
              fg: (cell.fgAlpha ?? 0) > 0 ? shiftColor(cell.fg, amount) : cell.fg,
              bg: (cell.bgAlpha ?? 0) > 0 ? shiftColor(cell.bg, amount) : cell.bg,
            });
          }
        }
        return result;
      },
    },
  ];
}
