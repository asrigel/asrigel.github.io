export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function hexToRgb(hex) {
  if (typeof hex === 'string' && hex.startsWith('rgb')) {
    const values = hex.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
    if (values?.length === 3) {
      return { r: values[0], g: values[1], b: values[2] };
    }
  }
  const value = String(hex || '#000000').replace('#', '');
  const normalized = value.length === 3
    ? value.split('').map((part) => part + part).join('')
    : value;
  const parsed = Number.parseInt(normalized, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

export function rgbToAnsi(color, background = false) {
  const { r, g, b } = hexToRgb(color);
  return `\u001b[${background ? 48 : 38};2;${Math.round(r)};${Math.round(g)};${Math.round(b)}m`;
}

export function rgbToHex(r, g, b) {
  const toHex = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function mixColors(a, b, amount) {
  const colorA = hexToRgb(a);
  const colorB = hexToRgb(b);
  const t = clamp(amount, 0, 1);
  return rgbToHex(
    colorA.r + (colorB.r - colorA.r) * t,
    colorA.g + (colorB.g - colorA.g) * t,
    colorA.b + (colorB.b - colorA.b) * t,
  );
}

export function randomColor() {
  return `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
}
