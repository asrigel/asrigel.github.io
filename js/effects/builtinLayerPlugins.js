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

const manifest = (id, name, description, { group = 'Layer Effects', tags = [] } = {}) => ({
  id,
  name,
  description,
  version: '1.0.0',
  group,
  tags,
  dependencies: [],
  sandbox: 'pure-grid-transform',
});

const mapColor = (grid, mapper) => {
  const result = grid.clone();
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.getCell(x, y);
      if (!visible(cell)) continue;
      result.setCell(x, y, mapper(cell, x, y));
    }
  }
  return result;
};

const invertColor = (color) => {
  const { r, g, b } = hexToRgb(color);
  return rgbToHex(255 - r, 255 - g, 255 - b);
};

const posterizeColor = (color, levels = 4) => {
  const step = 255 / Math.max(1, levels - 1);
  const { r, g, b } = hexToRgb(color);
  return rgbToHex(
    Math.round(r / step) * step,
    Math.round(g / step) * step,
    Math.round(b / step) * step,
  );
};

export function createBuiltinLayerEffectPlugins() {
  return [
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.outline', 'Outline', 'Контур вокруг видимых ячеек', {
        group: 'Edges',
        tags: ['outline', 'mask', 'shape'],
      }),
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
      manifest: manifest('rigel.layer.blur', 'Blur', 'Мягкое усреднение цветов фона', {
        group: 'Blur & Focus',
        tags: ['blur', 'soft', 'background'],
      }),
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
      manifest: manifest('rigel.layer.bloom', 'Bloom', 'Лёгкое свечение от ярких пикселей', {
        group: 'Light',
        tags: ['glow', 'bright', 'light'],
      }),
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
      manifest: manifest('rigel.layer.drop-shadow', 'Drop Shadow', 'Тень со смещением вниз вправо', {
        group: 'Light',
        tags: ['shadow', 'depth', 'offset'],
      }),
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
      manifest: manifest('rigel.layer.noise', 'Noise', 'Цветовой шум ANSI', {
        group: 'Stylize',
        tags: ['noise', 'grain', 'ansi'],
      }),
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
      manifest: manifest('rigel.layer.color-correction', 'Color Correction', 'Контраст и лёгкая насыщенность', {
        group: 'Color',
        tags: ['contrast', 'color', 'correction'],
      }),
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
      manifest: manifest('rigel.layer.lut-warm', 'LUT Warm Terminal', 'Тёплый терминальный LUT', {
        group: 'Color',
        tags: ['lut', 'warm', 'terminal'],
      }),
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
      manifest: manifest('rigel.layer.motion-blur', 'Motion Blur', 'Смазывание вправо', {
        group: 'Blur & Focus',
        tags: ['motion', 'blur', 'speed'],
      }),
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
      manifest: manifest('rigel.layer.dof', 'DOF Soft Focus', 'Мягкий фокус слабых деталей', {
        group: 'Blur & Focus',
        tags: ['dof', 'focus', 'soft'],
      }),
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
      manifest: manifest('rigel.layer.scanlines', 'CRT Scanlines', 'Тонкие CRT-линии', {
        group: 'Stylize',
        tags: ['crt', 'scanlines', 'retro'],
      }),
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
      manifest: manifest('rigel.layer.sharpen', 'Sharpen', 'Усиление контраста деталей', {
        group: 'Edges',
        tags: ['sharp', 'detail', 'contrast'],
      }),
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
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.invert', 'Invert', 'Инверсия цветов символа и фона', {
        group: 'Color',
        tags: ['invert', 'negative', 'color'],
      }),
      apply(grid) {
        return mapColor(grid, (cell) => ({
          fg: (cell.fgAlpha ?? 0) > 0 ? invertColor(cell.fg) : cell.fg,
          bg: (cell.bgAlpha ?? 0) > 0 ? invertColor(cell.bg) : cell.bg,
          brightness: clamp(1 - (cell.brightness ?? 0.5), 0, 1),
        }));
      },
    },
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.posterize', 'Posterize 4', 'Сжимает цвета до четырёх уровней на канал', {
        group: 'Color',
        tags: ['posterize', 'palette', 'reduction'],
      }),
      apply(grid) {
        return mapColor(grid, (cell) => ({
          fg: (cell.fgAlpha ?? 0) > 0 ? posterizeColor(cell.fg, 4) : cell.fg,
          bg: (cell.bgAlpha ?? 0) > 0 ? posterizeColor(cell.bg, 4) : cell.bg,
        }));
      },
    },
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.duotone-cyan-magenta', 'Duotone Cyan/Magenta', 'Двухцветная ANSI-тонировка по яркости', {
        group: 'Color',
        tags: ['duotone', 'palette', 'terminal'],
      }),
      apply(grid) {
        const low = '#082f49';
        const high = '#f0abfc';
        return mapColor(grid, (cell) => {
          const fgAmount = luminanceOf(cell.fg);
          const bgAmount = luminanceOf(cell.bg);
          return {
            fg: (cell.fgAlpha ?? 0) > 0 ? mixColors(low, high, fgAmount) : cell.fg,
            bg: (cell.bgAlpha ?? 0) > 0 ? mixColors(low, high, bgAmount) : cell.bg,
          };
        });
      },
    },
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.terminal-dither', 'Terminal Dither', 'Переводит плотность в символы терминального дизеринга', {
        group: 'Stylize',
        tags: ['dither', 'ascii', 'density'],
      }),
      apply(grid) {
        const result = grid.clone();
        const symbols = [' ', '░', '▒', '▓', '█'];
        for (let y = 0; y < grid.height; y += 1) {
          for (let x = 0; x < grid.width; x += 1) {
            const cell = grid.getCell(x, y);
            if (!visible(cell)) continue;
            const color = (cell.bgAlpha ?? 0) > 0 ? cell.bg : cell.fg;
            const index = clamp(Math.round(luminanceOf(color) * (symbols.length - 1)), 0, symbols.length - 1);
            result.setCell(x, y, {
              char: symbols[index],
              fg: (cell.fgAlpha ?? 0) > 0 ? cell.fg : color,
              fgAlpha: Math.max(cell.fgAlpha ?? 0, 0.75),
              density: index / (symbols.length - 1),
              empty: false,
            });
          }
        }
        return result;
      },
    },
    {
      type: 'layer-effect',
      manifest: manifest('rigel.layer.edge-relief', 'Edge Relief', 'Рельеф по перепаду яркости соседних ячеек', {
        group: 'Edges',
        tags: ['relief', 'edge', 'height'],
      }),
      apply(grid) {
        const result = grid.clone();
        for (let y = 0; y < grid.height; y += 1) {
          for (let x = 0; x < grid.width; x += 1) {
            const cell = grid.getCell(x, y);
            if (!visible(cell)) continue;
            const left = grid.getCell(x - 1, y);
            const right = grid.getCell(x + 1, y);
            const top = grid.getCell(x, y - 1);
            const bottom = grid.getCell(x, y + 1);
            const sample = (candidate) => (visible(candidate)
              ? luminanceOf((candidate.bgAlpha ?? 0) > 0 ? candidate.bg : candidate.fg)
              : 0);
            const delta = ((sample(right) - sample(left)) + (sample(bottom) - sample(top))) * 58;
            result.setCell(x, y, {
              fg: (cell.fgAlpha ?? 0) > 0 ? shiftColor(cell.fg, delta) : cell.fg,
              bg: (cell.bgAlpha ?? 0) > 0 ? shiftColor(cell.bg, delta) : cell.bg,
              brightness: clamp((cell.brightness ?? 0.5) + delta / 255, 0, 1),
            });
          }
        }
        return result;
      },
    },
  ];
}
