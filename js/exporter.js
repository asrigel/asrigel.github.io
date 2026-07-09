import { isCellEmpty } from './grid.js';
import { hexToRgb, rgbToAnsi } from './utils.js';

export class AnsiExporter {
  constructor(grid) {
    this.grid = grid;
  }

  setGrid(grid) {
    this.grid = grid;
  }

  toPlainText() {
    const bounds = this.grid.getContentBounds();
    if (!bounds) return '';

    return Array.from({ length: bounds.maxY - bounds.minY + 1 }, (_, offsetY) => {
      const y = bounds.minY + offsetY;
      const lastX = this.getLastContentX(y, bounds);
      if (lastX < bounds.minX) return '';
      return Array.from({ length: lastX - bounds.minX + 1 }, (_, offsetX) => {
        const cell = this.grid.getCell(bounds.minX + offsetX, y);
        return isCellEmpty(cell) || (cell.fgAlpha ?? 1) <= 0 ? ' ' : cell.char || ' ';
      }).join('');
    }).join('\n');
  }

  toAnsiText() {
    const bounds = this.grid.getContentBounds();
    if (!bounds) return '';

    const rows = [];
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      const lastX = this.getLastContentX(y, bounds);
      if (lastX < bounds.minX) {
        rows.push('');
        continue;
      }

      let row = '';
      let activeFg = null;
      let activeBg = null;
      for (let x = bounds.minX; x <= lastX; x += 1) {
        const cell = this.grid.getCell(x, y);
        if (isCellEmpty(cell)) {
          if (activeFg || activeBg) {
            row += '\u001b[0m';
            activeFg = null;
            activeBg = null;
          }
          row += ' ';
          continue;
        }
        const hasForeground = (cell.fgAlpha ?? 1) > 0;
        const hasBackground = (cell.bgAlpha ?? 1) > 0;
        if (!hasForeground && activeFg) {
          row += '\u001b[39m';
          activeFg = null;
        }
        if (!hasBackground && activeBg) {
          row += '\u001b[49m';
          activeBg = null;
        }
        if (hasForeground && cell.fg !== activeFg) {
          row += rgbToAnsi(cell.fg);
          activeFg = cell.fg;
        }
        if (hasBackground && cell.bg !== activeBg) {
          row += rgbToAnsi(cell.bg, true);
          activeBg = cell.bg;
        }
        row += hasForeground ? cell.char || ' ' : ' ';
      }
      rows.push(`${row}\u001b[0m`);
    }
    return rows.join('\n');
  }

  toHtml() {
    const bounds = this.grid.getContentBounds();
    if (!bounds) return '<span class="preview-empty">пустой холст</span>';

    const rows = [];
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      const lastX = this.getLastContentX(y, bounds);
      let row = '';
      for (let x = bounds.minX; x <= lastX; x += 1) {
        const cell = this.grid.getCell(x, y);
        if (isCellEmpty(cell)) {
          row += ' ';
          continue;
        }
        const char = this.escapeHtml((cell.fgAlpha ?? 1) > 0 ? cell.char || ' ' : ' ');
        const foreground = (cell.fgAlpha ?? 1) > 0 ? cell.fg : 'transparent';
        const background = (cell.bgAlpha ?? 1) > 0 ? cell.bg : 'transparent';
        row += `<span style="color:${foreground};background:${background}">${char}</span>`;
      }
      rows.push(row);
    }
    return rows.join('\n');
  }

  getLastContentX(y, bounds) {
    for (let x = bounds.maxX; x >= bounds.minX; x -= 1) {
      if (!isCellEmpty(this.grid.getCell(x, y))) return x;
    }
    return bounds.minX - 1;
  }

  escapeHtml(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  exportAns() {
    return new Blob([this.toAnsiText()], { type: 'text/plain;charset=utf-8' });
  }

  exportTxt() {
    return new Blob([this.toPlainText()], { type: 'text/plain;charset=utf-8' });
  }

  toColoristaGo() {
    const bounds = this.grid.getContentBounds();
    const styles = [];
    const styleIndexes = new Map();
    const runs = [];
    const appendRun = (text, styleIndex = 0xffff) => {
      if (!text) return;
      const previous = runs[runs.length - 1];
      if (previous?.styleIndex === styleIndex) previous.text += text;
      else runs.push({ text, styleIndex });
    };

    if (bounds) {
      for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
        const lastX = this.getLastContentX(y, bounds);
        for (let x = bounds.minX; x <= lastX; x += 1) {
          const cell = this.grid.getCell(x, y);
          if (isCellEmpty(cell)) {
            appendRun(' ');
            continue;
          }
          const flags = ((cell.fgAlpha ?? 1) > 0 ? 1 : 0) | ((cell.bgAlpha ?? 1) > 0 ? 2 : 0);
          const key = `${cell.fg}|${cell.bg}|${flags}`;
          if (!styleIndexes.has(key)) {
            styleIndexes.set(key, styles.length);
            styles.push({ fg: hexToRgb(cell.fg), bg: hexToRgb(cell.bg), flags });
          }
          appendRun(flags & 1 ? cell.char || ' ' : ' ', styleIndexes.get(key));
        }
        if (y < bounds.maxY) appendRun('\n');
      }
    }

    const bytes = [];
    const pushUint16 = (value) => bytes.push((value >> 8) & 0xff, value & 0xff);
    pushUint16(styles.length);
    styles.forEach(({ fg, bg, flags }) => {
      bytes.push(
        Math.round(fg.r), Math.round(fg.g), Math.round(fg.b),
        Math.round(bg.r), Math.round(bg.g), Math.round(bg.b),
        flags,
      );
    });
    const encoder = new TextEncoder();
    runs.forEach((run) => {
      const text = encoder.encode(run.text);
      pushUint16(run.styleIndex);
      pushUint16(text.length);
      bytes.push(...text);
    });
    let binaryPayload = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binaryPayload += String.fromCharCode(...bytes.slice(offset, offset + 0x8000));
    }
    const payload = btoa(binaryPayload);

    const lines = [
      'package art',
      '',
      'import (',
      '\t"encoding/base64"',
      '\t"encoding/binary"',
      '\t"strings"',
      '',
      '\t"github.com/rp1s/colorista"',
      ')',
      '',
      '// Render returns the ANSI artwork as one colored terminal string.',
      'func Render() string {',
      '\tc := colorista.NewColorista(colorista.ThemeAuto)',
      '\t_ = c',
      `\traw, _ := base64.StdEncoding.DecodeString("${payload}")`,
      '\toffset := 0',
      '\treadUint16 := func() uint16 {',
      '\t\tvalue := binary.BigEndian.Uint16(raw[offset:])',
      '\t\toffset += 2',
      '\t\treturn value',
      '\t}',
      '\tstyleCount := int(readUint16())',
      '\ttype renderStyle struct { fg, bg colorista.RGB; flags byte }; styles := make([]renderStyle, styleCount)',
      '\tfor i := range styles {',
      '\t\tstyles[i].fg = colorista.RGB{R: raw[offset], G: raw[offset+1], B: raw[offset+2]}',
      '\t\tstyles[i].bg = colorista.RGB{R: raw[offset+3], G: raw[offset+4], B: raw[offset+5]}',
      '\t\tstyles[i].flags = raw[offset+6]',
      '\t\toffset += 7',
      '\t}',
      '\tvar out strings.Builder',
      '\tfor offset < len(raw) {',
      '\t\tstyleIndex := readUint16()',
      '\t\tlength := int(readUint16())',
      '\t\ttext := string(raw[offset : offset+length])',
      '\t\toffset += length',
      '\t\tif styleIndex == 0xffff {',
      '\t\t\tout.WriteString(text)',
      '\t\t\tcontinue',
      '\t\t}',
      '\t\tstyle := styles[int(styleIndex)]',
      '\t\tswitch style.flags {',
      '\t\tcase 1: out.WriteString(c.Apply(text, colorista.Rgb(style.fg)))',
      '\t\tcase 2: out.WriteString(c.Apply(text, colorista.BgRgb(style.bg)))',
      '\t\tdefault: out.WriteString(c.Apply(text, colorista.Rgb(style.fg), colorista.BgRgb(style.bg)))',
      '\t\t}',
      '\t}',
      '\treturn out.String()',
      '}',
      '',
    ];
    return lines.join('\n');
  }

  exportGo() {
    return new Blob([this.toColoristaGo()], { type: 'text/x-go;charset=utf-8' });
  }
}
