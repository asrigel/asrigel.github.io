import { ANSIGrid } from './grid.js';
import { Renderer } from './renderer.js';
import { BrushEngine } from './brushEngine.js';
import { AnsiExporter } from './exporter.js';
import { History } from './history.js';
import { clamp, hexToRgb, mixColors, rgbToHex } from './utils.js';

class App {
  constructor() {
    this.canvas = document.getElementById('editorCanvas');
    this.grid = new ANSIGrid(80, 25);
    this.layers = [{
      id: crypto.randomUUID?.() || String(Date.now()),
      name: 'Слой 1',
      type: 'pixel',
      locked: false,
      visible: true,
      opacity: 1,
      grid: this.grid,
    }];
    this.activeLayerIndex = 0;
    this.renderer = new Renderer(this.canvas, this.grid);
    this.brushEngine = new BrushEngine(this.grid);
    this.exporter = new AnsiExporter(this.grid);
    this.history = new History(() => ({
      activeLayerIndex: this.activeLayerIndex,
      layers: this.layers.map((layer) => ({ ...layer, grid: layer.grid.clone() })),
    }), (snapshot) => {
      this.layers = snapshot.layers.map((layer) => ({ ...layer, grid: layer.grid.clone() }));
      this.activeLayerIndex = clamp(snapshot.activeLayerIndex, 0, this.layers.length - 1);
      this.grid = this.layers[this.activeLayerIndex].grid;
      this.selection = { cells: new Set(), floating: false };
      this.selectionGesture = null;
      this.syncGridRefs();
      this.render();
    });

    this.currentTool = 'pencil';
    this.brushMode = 'free';
    this.brushCharset = 'blocks';
    this.brushLevel = 0.7;
    this.brushSize = 1;
    this.brushSmoothing = true;
    this.symbol = '█';
    this.textValue = '';
    this.fgColor = '#f8fafc';
    this.bgColor = '#0f172a';
    this.fgTransparent = false;
    this.bgTransparent = false;
    this.zoom = 100;
    this.zoomMode = 'fit';
    this.mirrorX = false;
    this.mirrorY = false;
    this.isDrawing = false;
    this.paintBackground = false;
    this.isPanning = false;
    this.panStart = null;
    this.lastPoint = null;
    this.shapeStart = null;
    this.shapeSnapshot = null;
    this.previewPoint = null;
    this.selection = { cells: new Set(), floating: false };
    this.selectionGesture = null;
    this.magicTolerance = 26;
    this.magicContiguous = true;
    this.internalClipboard = null;
    this.layerClipboard = null;
    this.pendingTextPoint = null;
    this.pendingCloseDocumentId = null;
    this.pendingImageImport = null;
    this.tabDefaults = this.readTabDefaults();
    this.placingLight = false;
    this.selectedLightId = null;
    this.showTechnicalIndicators = localStorage.getItem('rigel-show-technical-indicators') !== 'false';
    this.lighting = {
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
    this.projectId = crypto.randomUUID?.() || String(Date.now());
    this.projectName = 'Новый проект';
    this.activeDocumentId = crypto.randomUUID?.() || `${Date.now()}-tab`;
    this.documents = [{ id: this.activeDocumentId, name: 'Вкладка 1', snapshot: null, undoStack: [], redoStack: [] }];
    this.classicPalette = ['#000000', '#808080', '#c0c0c0', '#ffffff', '#800000', '#ff0000', '#808000', '#ffff00', '#008000', '#00ff00', '#008080', '#00ffff', '#000080', '#0000ff', '#800080', '#ff00ff'];
    this.palettePresets = {
      ansi16: { name: 'ANSI 16', colors: this.classicPalette },
      grayscale: { name: 'Серая шкала', colors: ['#000000', '#242424', '#484848', '#6d6d6d', '#919191', '#b6b6b6', '#dadada', '#ffffff'] },
      gameboy: { name: 'Game Boy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
      amber: { name: 'Янтарный терминал', colors: ['#120b00', '#402600', '#805000', '#bf7b00', '#ffb000', '#ffd36a'] },
      cga: { name: 'CGA', colors: ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'] },
    };
    this.savedPalettes = this.readSavedPalettes();
    this.palette = [...this.classicPalette];
    this.uiTheme = localStorage.getItem('rigel-ui-theme') === 'light' ? 'light' : 'dark';
    this.autosaveReady = false;
    this.autosaveTimer = null;

    this.bindEvents();
    this.applyUiTheme();
    this.bindLayerEvents();
    this.bindLightingPanel();
    this.updateLightingControls();
    this.bindCanvasResize();
    this.bindProjectUI();
    this.bindPanelLayout();
    this.seedPalette();
    this.refreshPalettePresets();
    this.render();
    this.updatePreview();
    this.updateLayers();
    this.renderDocumentTabs();
  }

  bindEvents() {
    document.querySelectorAll('.tool-btn').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectTool(button.dataset.tool);
      });
    });

    this.bindIfExists('brushMode', 'change', (event) => {
      this.brushMode = event.target.value;
      this.updateBrushOptionVisibility();
      this.updateStatus();
      this.scheduleAutosave();
    });
    this.bindIfExists('brushCharset', 'change', (event) => {
      this.brushCharset = event.target.value;
      this.updateBrushOptionVisibility();
      this.scheduleAutosave();
    });
    this.bindIfExists('brushLevel', 'input', (event) => {
      const max = Math.max(1, Number(event.target.max));
      this.brushLevel = Number(event.target.value) / max;
      this.updateBrushLevelPreview();
      this.scheduleAutosave();
    });
    this.bindIfExists('brushSize', 'input', (event) => {
      this.brushSize = Number(event.target.value);
      this.updateRangeLabels();
      this.scheduleAutosave();
    });
    this.bindIfExists('brushSmoothing', 'change', (event) => {
      this.brushSmoothing = event.target.checked;
      this.scheduleAutosave();
    });
    this.bindIfExists('magicTolerance', 'input', (event) => {
      this.magicTolerance = Number(event.target.value);
      const output = document.getElementById('magicToleranceValue');
      if (output) output.textContent = String(this.magicTolerance);
      this.scheduleAutosave();
    });
    this.bindIfExists('magicContiguous', 'change', (event) => {
      this.magicContiguous = event.target.checked;
      this.scheduleAutosave();
    });
    this.bindIfExists('symbolInput', 'input', (event) => {
      this.symbol = event.target.value || '█';
      this.scheduleAutosave();
    });
    this.bindIfExists('textInput', 'input', (event) => {
      this.textValue = event.target.value;
      this.scheduleAutosave();
    });
    this.bindIfExists('textInput', 'keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.commitPendingText();
      } else if (event.key === 'Escape') {
        this.cancelPendingText();
      }
    });
    this.bindIfExists('fgColor', 'input', (event) => {
      this.fgColor = event.target.value;
      this.fgTransparent = false;
      this.seedPalette();
      this.scheduleAutosave();
    });
    this.bindIfExists('bgColor', 'input', (event) => {
      this.bgColor = event.target.value;
      this.bgTransparent = false;
      this.seedPalette();
      this.scheduleAutosave();
    });
    this.bindIfExists('swapColorsBtn', 'click', () => this.swapColors());
    this.bindIfExists('swapColorsPanelBtn', 'click', () => this.swapColors());
    this.bindIfExists('themeToggleBtn', 'click', () => this.toggleUiTheme());
    this.bindIfExists('fgTransparentBtn', 'click', () => this.toggleTransparentColor('foreground'));
    this.bindIfExists('bgTransparentBtn', 'click', () => this.toggleTransparentColor('background'));

    this.bindIfExists('palettePreset', 'change', (event) => this.applyPalettePreset(event.target.value));
    this.bindIfExists('savePalette', 'click', () => this.saveCurrentPalette());
    this.bindIfExists('deletePalette', 'click', () => this.deleteCurrentPalette());

    this.bindIfExists('undoBtn', 'click', () => this.undo());
    this.bindIfExists('redoBtn', 'click', () => this.redo());
    this.bindIfExists('saveProjectBtn', 'click', () => this.downloadProject());
    this.bindIfExists('clearBtn', 'click', () => this.clearCanvas());
    this.bindIfExists('randomTextureBtn', 'click', () => this.generateRandomTexture());
    this.bindIfExists('copyAnsiBtn', 'click', () => this.copyToClipboard(this.exporter.toAnsiText(), 'ANSI скопирован'));
    this.bindIfExists('copyAsciiBtn', 'click', () => this.copyToClipboard(this.exporter.toPlainText(), 'Текст скопирован'));
    this.bindIfExists('exportAnsBtn', 'click', () => this.downloadFile(this.exporter.exportAns(), 'art.ans'));
    this.bindIfExists('exportTxtBtn', 'click', () => this.downloadFile(this.exporter.exportTxt(), 'art.txt'));
    this.bindIfExists('importInput', 'change', (event) => this.importFile(event.target.files?.[0]));
    this.bindIfExists('projectInput', 'change', (event) => this.loadProjectFile(event.target.files?.[0]));
    this.bindIfExists('imageInput', 'change', (event) => this.importImage(event.target.files?.[0]));
    this.bindIfExists('applyImageImportBtn', 'click', () => this.applyPendingImageImport());
    document.getElementById('imageImportDialog')?.addEventListener('close', () => {
      if (this.pendingImageImport) this.clearPendingImageImport();
    });
    this.bindIfExists('zoomRange', 'input', (event) => this.setZoom(Number(event.target.value)));
    this.bindIfExists('zoomOutBtn', 'click', () => this.setZoom(this.zoom - 10));
    this.bindIfExists('zoomInBtn', 'click', () => this.setZoom(this.zoom + 10));
    this.bindIfExists('zoomFitBtn', 'click', () => this.setZoom('fit'));
    this.bindIfExists('applyCanvasSizeBtn', 'click', () => {
      const width = Number(document.getElementById('canvasWidthInput').value);
      const height = Number(document.getElementById('canvasHeightInput').value);
      this.resizeCanvas(width, height);
      document.getElementById('canvasSizeDialog').close();
    });

    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.canvas.addEventListener('pointercancel', (event) => this.onPointerCancel(event));
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    const canvasWrap = document.getElementById('canvasWrap');
    canvasWrap.addEventListener('wheel', (event) => this.onZoomWheel(event), { passive: false });
    canvasWrap.addEventListener('dblclick', (event) => {
      if (event.target !== this.canvas && !event.target.closest('.light-marker')) this.setZoom(100);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.persistLocalProject();
    });
    window.addEventListener('pagehide', () => this.persistLocalProject());
    window.addEventListener('beforeunload', () => this.persistLocalProject());

    this.bindMenus();

    window.addEventListener('keydown', (event) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
      this.handleShortcut(event);
    });
    window.addEventListener('resize', () => {
      if (this.zoomMode === 'fit') this.fitZoomToView();
    });

    this.updateRangeLabels();
    this.updateBrushOptionVisibility();
    this.setZoom(this.zoomMode === 'fit' ? 'fit' : this.zoom);
  }

  bindIfExists(id, eventName, handler) {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener(eventName, handler);
    }
  }

  selectTool(tool) {
    const button = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
    if (!button) return;
    this.setLightPlacement(false);
    if (this.currentTool === 'text' && tool !== 'text') this.cancelPendingText();
    document.querySelectorAll('.tool-btn').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    this.currentTool = tool;
    this.canvas.dataset.tool = tool;
    this.canvas.style.cursor = '';
    const label = document.querySelector('.options-tool');
    if (label) label.textContent = button.title.replace(/\s*\([^)]*\)$/, '');
    this.updateBrushOptionVisibility();
    this.updateStatus();
  }

  updateBrushOptionVisibility() {
    const brushTools = ['pencil', 'eraser', 'line', 'rect', 'rect-fill', 'ellipse', 'spray'];
    const usesBrush = brushTools.includes(this.currentTool);
    document.querySelectorAll('.brush-option').forEach((option) => {
      option.hidden = !usesBrush;
    });
    const textOption = document.getElementById('textOption');
    if (textOption) {
      textOption.hidden = this.currentTool !== 'text' && !(usesBrush && this.brushMode === 'letters');
    }
    const symbolOption = document.getElementById('symbolOption');
    if (symbolOption) symbolOption.hidden = !usesBrush || this.brushMode !== 'free';
    const charsetOption = document.getElementById('charsetOption');
    if (charsetOption) charsetOption.hidden = !usesBrush || this.brushMode !== 'smart';
    const levelOption = document.getElementById('brushLevelOption');
    if (levelOption) levelOption.hidden = !usesBrush || ['free', 'letters'].includes(this.brushMode);
    const levelInput = document.getElementById('brushLevel');
    if (levelInput) levelInput.disabled = this.brushMode === 'smart';
    const smoothingOption = document.getElementById('smoothingOption');
    if (smoothingOption) smoothingOption.hidden = this.currentTool !== 'pencil';
    const magicTool = ['magic-select', 'magic-pencil'].includes(this.currentTool);
    document.querySelectorAll('.selection-option').forEach((option) => {
      option.hidden = !magicTool;
    });
    const magicContiguousOption = document.getElementById('magicContiguousOption');
    if (magicContiguousOption) magicContiguousOption.hidden = !magicTool || this.currentTool === 'magic-pencil';
    this.updateBrushLevelPreview();
  }

  updateBrushLevelPreview() {
    const output = document.getElementById('brushLevelValue');
    if (!output) return;
    if (this.brushMode === 'smart') {
      output.textContent = 'AUTO';
      return;
    }
    const families = {
      blocks: '░▒▓█',
      halfblocks: '▁▂▃▄▅▆▇█',
      shading: '░▒▓',
      dots: '·•●',
      ascii: ' .:-=+*#%@',
      binary: '01',
      hatch: '╱╲╳▓',
      box: '·┼╬█',
    };
    const characters = Array.from(families[this.brushMode] || this.symbol || '█');
    const character = characters[Math.round(this.brushLevel * (characters.length - 1))];
    output.textContent = `${character} ${Math.round(this.brushLevel * 100)}%`;
  }

  handleShortcut(event) {
    const key = event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    const run = (action) => {
      event.preventDefault();
      this.runMenuAction(action);
    };

    if (key === 'escape') {
      this.setLightPlacement(false);
      this.cancelPendingText();
      if (this.selection.floating) this.cancelFloatingSelection();
      else if (this.selection.cells.size) this.clearSelection();
      return;
    }

    if (key === 'enter' && this.selection.floating) {
      event.preventDefault();
      this.commitFloatingSelection();
      return;
    }

    if (event.key === 'F1') return run('shortcuts');
    if (event.key === 'F6') return run('toggle-tools');
    if (event.key === 'F7') return run('toggle-inspector');
    if (event.key === 'F8') return run('toggle-theme');
    if (event.key === 'F9') return run('toggle-indicators');

    if (event.altKey && !command) {
      const effects = {
        Digit1: 'lighting',
        Digit2: 'effect-invert',
        Digit3: 'effect-grayscale',
        Digit4: 'effect-contrast',
        Digit5: 'effect-color-shift',
        Digit6: 'effect-dither',
        Digit7: 'effect-posterize',
        Digit8: 'effect-sepia',
        Digit9: 'effect-neon',
        Digit0: 'effect-glow',
        Minus: 'effect-shadow',
        KeyR: 'effect-3d-render',
        KeyE: 'effect-emboss',
        KeyH: 'effect-mirror-x',
        KeyV: 'effect-mirror-y',
        KeyT: 'texture',
        BracketRight: 'layer-up',
        BracketLeft: 'layer-down',
      };
      if (effects[event.code]) return run(effects[event.code]);
    }

    if (command) {
      if (event.altKey && event.code === 'KeyC') return run('canvas-size');
      if (event.altKey && event.code === 'KeyO') return run(event.shiftKey ? 'import-image' : 'import-text');
      if (event.altKey && event.code === 'KeyA') return run('copy-ansi');
      if (event.altKey && event.code === 'KeyL') return run('layer-lock');
      if (event.altKey && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].includes(event.code)) {
        return run({
          Digit1: 'export-ans',
          Digit2: 'export-txt',
          Digit3: 'export-go',
          Digit4: 'export-image-png',
          Digit5: 'export-image-jpeg',
          Digit6: 'export-image-webp',
        }[event.code]);
      }
      if (event.shiftKey && key === 'n') return run('layer-new');
      if (event.shiftKey && key === 'i') return run('selection-invert');
      if (event.shiftKey && key === 'c') return run('layer-copy');
      if (event.shiftKey && key === 'v') return run('layer-paste');
      if (event.shiftKey && (key === 'delete' || key === 'backspace')) return run('layer-delete');
      if (key === 'j') return run('layer-duplicate');
      if (key === '0') return run('zoom-100');
      if (key === '1') return run('zoom-150');
      if (key === '5') return run('zoom-50');
      if (key === '9') return run('zoom-fit');
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if (key === 'c') {
        event.preventDefault();
        if (!this.copySelection()) this.copyToClipboard(this.exporter.toAnsiText(), 'ANSI скопирован');
        return;
      }
      if (key === 'x') {
        event.preventDefault();
        this.cutSelection();
        return;
      }
      if (key === 'v') {
        event.preventDefault();
        this.pasteSelection();
        return;
      }
      if (key === 'd') {
        event.preventDefault();
        this.clearSelection();
        return;
      }
      if (key === 'a') {
        event.preventDefault();
        this.selectAll();
        return;
      }

      const actions = {
        n: () => this.openNewProjectDialog(),
        o: () => document.getElementById('projectInput').click(),
        s: () => this.downloadProject(),
        y: () => this.redo(),
      };
      const action = actions[key];
      if (action) {
        event.preventDefault();
        action();
      }
      return;
    }

    const toolShortcuts = {
      p: 'pencil',
      v: 'move',
      m: 'select-rect',
      a: 'lasso',
      w: event.shiftKey ? 'magic-pencil' : 'magic-select',
      e: 'eraser',
      f: 'fill',
      i: 'eyedropper',
      l: 'line',
      r: 'rect',
      g: 'rect-fill',
      o: 'ellipse',
      s: 'spray',
      t: 'text',
      h: 'pan',
      z: 'zoom',
    };

    if (toolShortcuts[key]) {
      event.preventDefault();
      this.selectTool(toolShortcuts[key]);
    } else if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      if (event.shiftKey) this.clearCanvas();
      else this.deleteSelection();
    } else if (key === 'x') {
      event.preventDefault();
      this.swapColors();
    } else if (key === 'q') {
      event.preventDefault();
      this.toggleTransparentColor(event.shiftKey ? 'background' : 'foreground');
    } else if (key === 'd') {
      event.preventDefault();
      this.resetColors();
    } else if (key === '[') {
      event.preventDefault();
      this.setBrushSize(this.brushSize - 1);
    } else if (key === ']') {
      event.preventDefault();
      this.setBrushSize(this.brushSize + 1);
    } else if (key === '-' || key === '_') {
      event.preventDefault();
      this.setZoom(this.zoom - 10);
    } else if (key === '+' || key === '=') {
      event.preventDefault();
      this.setZoom(this.zoom + 10);
    }
  }

  setBrushSize(value) {
    this.brushSize = clamp(value, 1, 8);
    document.getElementById('brushSize').value = String(this.brushSize);
    this.updateRangeLabels();
  }

  bindMenus() {
    const menuBar = document.querySelector('.menu-bar');
    const triggers = document.querySelectorAll('.menu-trigger');

    const closeMenus = () => {
      document.querySelectorAll('.menu-root > .menu-popup').forEach((menu) => {
        menu.hidden = true;
      });
      document.querySelectorAll('.menu-submenu.open').forEach((submenu) => {
        submenu.classList.remove('open');
        submenu.querySelector('.menu-submenu-trigger')?.setAttribute('aria-expanded', 'false');
      });
      triggers.forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
    };

    triggers.forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const menu = document.getElementById(trigger.dataset.menu);
        const shouldOpen = menu.hidden;
        closeMenus();
        if (shouldOpen) {
          menu.hidden = false;
          trigger.setAttribute('aria-expanded', 'true');
        }
      });

      trigger.addEventListener('pointerenter', () => {
        const openMenu = document.querySelector('.menu-trigger[aria-expanded="true"]');
        if (!openMenu || openMenu === trigger) return;
        closeMenus();
        document.getElementById(trigger.dataset.menu).hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
      });
    });

    menuBar.addEventListener('click', (event) => {
      const submenuTrigger = event.target.closest('.menu-submenu-trigger');
      if (submenuTrigger) {
        event.stopPropagation();
        const submenu = submenuTrigger.closest('.menu-submenu');
        const open = !submenu.classList.contains('open');
        document.querySelectorAll('.menu-submenu.open').forEach((item) => item.classList.remove('open'));
        submenu.classList.toggle('open', open);
        submenuTrigger.setAttribute('aria-expanded', String(open));
        return;
      }
      const item = event.target.closest('[data-menu-action]');
      if (!item) return;
      this.runMenuAction(item.dataset.menuAction);
      closeMenus();
    });

    document.addEventListener('click', closeMenus);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenus();
    });

    document.querySelectorAll('[data-dialog-close]').forEach((button) => {
      button.addEventListener('click', () => button.closest('dialog').close());
    });
  }

  runMenuAction(action) {
    const actions = {
      new: () => this.openNewProjectDialog(),
      open: () => document.getElementById('projectInput').click(),
      save: () => this.downloadProject(),
      'import-text': () => document.getElementById('importInput').click(),
      'export-ans': () => this.downloadFile(this.exporter.exportAns(), 'art.ans'),
      'export-txt': () => this.downloadFile(this.exporter.exportTxt(), 'art.txt'),
      'export-go': () => this.downloadFile(this.exporter.exportGo(), 'art.go'),
      'export-image-png': () => this.exportImage('png'),
      'export-image-jpeg': () => this.exportImage('jpeg'),
      'export-image-webp': () => this.exportImage('webp'),
      undo: () => this.undo(),
      redo: () => this.redo(),
      'selection-copy': () => this.copySelection(),
      'selection-cut': () => this.cutSelection(),
      'selection-paste': () => this.pasteSelection(),
      'selection-delete': () => this.deleteSelection(),
      'selection-clear': () => this.clearSelection(),
      'layer-copy': () => this.copyActiveLayer(),
      'layer-paste': () => this.pasteLayer(),
      'layer-new': () => this.addLayer(),
      'layer-duplicate': () => this.duplicateLayer(),
      'layer-delete': () => this.deleteLayer(),
      'layer-up': () => this.moveLayer(1),
      'layer-down': () => this.moveLayer(-1),
      'layer-lock': () => this.toggleActiveLayerLock(),
      'selection-all': () => this.selectAll(),
      'selection-invert': () => this.invertSelection(),
      'copy-ansi': () => this.copyToClipboard(this.exporter.toAnsiText(), 'ANSI скопирован'),
      'copy-text': () => this.copyToClipboard(this.exporter.toPlainText(), 'Текст скопирован'),
      'toggle-tools': () => document.querySelector('.editor-layout').classList.toggle('hide-toolbox'),
      'toggle-inspector': () => document.querySelector('.editor-layout').classList.toggle('hide-inspector'),
      'toggle-theme': () => this.toggleUiTheme(),
      'reset-layout': () => this.resetPanelLayout(),
      'zoom-50': () => this.setZoom(50),
      'zoom-100': () => this.setZoom(100),
      'zoom-150': () => this.setZoom(150),
      'zoom-fit': () => this.setZoom('fit'),
      'toggle-indicators': () => this.toggleTechnicalIndicators(),
      clear: () => this.clearCanvas(),
      'canvas-size': () => {
        document.getElementById('canvasWidthInput').value = String(this.grid.width);
        document.getElementById('canvasHeightInput').value = String(this.grid.height);
        document.getElementById('canvasSizeDialog').showModal();
      },
      texture: () => this.generateRandomTexture(),
      'import-image': () => document.getElementById('imageInput').click(),
      lighting: () => this.openLightingPanel(),
      'effect-invert': () => this.applyLayerEffect('invert'),
      'effect-grayscale': () => this.applyLayerEffect('grayscale'),
      'effect-contrast': () => this.applyLayerEffect('contrast'),
      'effect-color-shift': () => this.applyLayerEffect('color-shift'),
      'effect-dither': () => this.applyLayerEffect('dither'),
      'effect-posterize': () => this.applyLayerEffect('posterize'),
      'effect-sepia': () => this.applyLayerEffect('sepia'),
      'effect-neon': () => this.applyLayerEffect('neon'),
      'effect-glow': () => this.applyLayerEffect('glow'),
      'effect-shadow': () => this.applyLayerEffect('shadow'),
      'effect-3d-render': () => this.applyLayerEffect('3d-render'),
      'effect-emboss': () => this.applyLayerEffect('emboss'),
      'effect-mirror-x': () => this.applyLayerEffect('mirror-x'),
      'effect-mirror-y': () => this.applyLayerEffect('mirror-y'),
      'choose-fg': () => document.getElementById('fgColor').click(),
      'choose-bg': () => document.getElementById('bgColor').click(),
      'swap-colors': () => this.swapColors(),
      'transparent-fg': () => this.toggleTransparentColor('foreground'),
      'transparent-bg': () => this.toggleTransparentColor('background'),
      'reset-colors': () => this.resetColors(),
      'classic-palette': () => {
        this.palette = [...this.classicPalette];
        this.seedPalette();
        this.updateStatus();
        this.scheduleAutosave();
      },
      'palette-manager': () => document.getElementById('palettePreset').focus(),
      'save-palette': () => document.getElementById('savePalette').click(),
      shortcuts: () => document.getElementById('shortcutsDialog').showModal(),
      about: () => document.getElementById('aboutDialog').showModal(),
    };

    actions[action]?.();
  }

  applyUiTheme() {
    const light = this.uiTheme === 'light';
    document.body.classList.toggle('light-theme', light);
    const button = document.getElementById('themeToggleBtn');
    if (button) {
      button.classList.toggle('active', light);
      button.title = `${light ? 'Тёмная' : 'Светлая'} тема (F8)`;
      button.setAttribute('aria-label', `Включить ${light ? 'тёмную' : 'светлую'} тему`);
      button.setAttribute('aria-pressed', String(light));
    }
  }

  toggleUiTheme() {
    this.uiTheme = this.uiTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('rigel-ui-theme', this.uiTheme);
    this.applyUiTheme();
  }

  toggleTechnicalIndicators() {
    this.showTechnicalIndicators = !this.showTechnicalIndicators;
    localStorage.setItem('rigel-show-technical-indicators', String(this.showTechnicalIndicators));
    this.updateLightingControls();
    this.updateLightMarkers();
  }

  readSavedPalettes() {
    try {
      return JSON.parse(localStorage.getItem('rigel-saved-palettes') || '[]');
    } catch {
      return [];
    }
  }

  refreshPalettePresets(selectedValue = null) {
    const select = document.getElementById('palettePreset');
    if (!select) return;
    select.innerHTML = '';
    if (selectedValue === 'current') {
      const current = document.createElement('option');
      current.value = 'current';
      current.textContent = 'Палитра проекта';
      select.appendChild(current);
    }

    const builtInGroup = document.createElement('optgroup');
    builtInGroup.label = 'Встроенные';
    Object.entries(this.palettePresets).forEach(([id, preset]) => {
      const option = document.createElement('option');
      option.value = `builtin:${id}`;
      option.textContent = preset.name;
      builtInGroup.appendChild(option);
    });
    select.appendChild(builtInGroup);

    if (this.savedPalettes.length) {
      const savedGroup = document.createElement('optgroup');
      savedGroup.label = 'Сохраненные';
      this.savedPalettes.forEach((preset) => {
        const option = document.createElement('option');
        option.value = `saved:${preset.id}`;
        option.textContent = preset.name;
        savedGroup.appendChild(option);
      });
      select.appendChild(savedGroup);
    }
    select.value = selectedValue || 'builtin:ansi16';
  }

  applyPalettePreset(value) {
    if (value.startsWith('builtin:')) {
      const preset = this.palettePresets[value.slice(8)];
      if (preset) this.palette = [...preset.colors];
    } else if (value.startsWith('saved:')) {
      const preset = this.savedPalettes.find((item) => item.id === value.slice(6));
      if (preset) this.palette = [...preset.colors];
    }
    this.seedPalette();
    this.scheduleAutosave();
  }

  saveCurrentPalette() {
    const name = prompt('Название палитры', `Палитра ${this.savedPalettes.length + 1}`);
    if (!name?.trim()) return;
    const preset = {
      id: crypto.randomUUID?.() || `${Date.now()}`,
      name: name.trim(),
      colors: [...this.palette],
    };
    this.savedPalettes.push(preset);
    localStorage.setItem('rigel-saved-palettes', JSON.stringify(this.savedPalettes));
    this.refreshPalettePresets(`saved:${preset.id}`);
  }

  deleteCurrentPalette() {
    const select = document.getElementById('palettePreset');
    if (!select.value.startsWith('saved:')) return;
    const id = select.value.slice(6);
    this.savedPalettes = this.savedPalettes.filter((preset) => preset.id !== id);
    localStorage.setItem('rigel-saved-palettes', JSON.stringify(this.savedPalettes));
    this.refreshPalettePresets();
    this.applyPalettePreset('builtin:ansi16');
  }

  swapColors() {
    [this.fgColor, this.bgColor] = [this.bgColor, this.fgColor];
    [this.fgTransparent, this.bgTransparent] = [this.bgTransparent, this.fgTransparent];
    document.getElementById('fgColor').value = this.fgColor;
    document.getElementById('bgColor').value = this.bgColor;
    this.seedPalette();
    this.updateColorUI();
    this.updateStatus();
    this.scheduleAutosave();
  }

  resetColors() {
    this.fgColor = '#ffffff';
    this.bgColor = '#000000';
    this.fgTransparent = false;
    this.bgTransparent = false;
    document.getElementById('fgColor').value = this.fgColor;
    document.getElementById('bgColor').value = this.bgColor;
    this.seedPalette();
    this.updateStatus();
    this.scheduleAutosave();
  }

  updateColorUI() {
    const fg = document.querySelector('.mini-fg');
    const bg = document.querySelector('.mini-bg');
    if (fg) {
      fg.style.background = this.fgTransparent ? '' : this.fgColor;
      fg.classList.toggle('transparent-color', this.fgTransparent);
    }
    if (bg) {
      bg.style.background = this.bgTransparent ? '' : this.bgColor;
      bg.classList.toggle('transparent-color', this.bgTransparent);
    }
    const fgTransparentButton = document.getElementById('fgTransparentBtn');
    const bgTransparentButton = document.getElementById('bgTransparentBtn');
    fgTransparentButton?.classList.toggle('active', this.fgTransparent);
    bgTransparentButton?.classList.toggle('active', this.bgTransparent);
    fgTransparentButton?.setAttribute('aria-pressed', String(this.fgTransparent));
    bgTransparentButton?.setAttribute('aria-pressed', String(this.bgTransparent));
    document.querySelector('.fg-chip')?.classList.toggle('transparent-color', this.fgTransparent);
    document.querySelector('.bg-chip')?.classList.toggle('transparent-color', this.bgTransparent);
  }

  toggleTransparentColor(target) {
    if (target === 'background') this.bgTransparent = !this.bgTransparent;
    else this.fgTransparent = !this.fgTransparent;
    this.seedPalette();
    this.updateStatus();
    this.scheduleAutosave();
  }

  seedPalette() {
    const swatches = document.getElementById('paletteSwatches');
    if (!swatches) return;
    swatches.innerHTML = '';
    this.palette.forEach((color) => {
      const swatch = document.createElement('button');
      swatch.className = 'swatch';
      swatch.style.background = color;
      swatch.title = `${color} · ЛКМ: знак · ПКМ/Shift: фон`;
      swatch.setAttribute('aria-label', `${color}: цвет символа левой кнопкой, цвет фона правой`);
      swatch.addEventListener('click', (event) => {
        this.setPaletteColor(color, event.shiftKey ? 'background' : 'foreground');
      });
      swatch.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this.setPaletteColor(color, 'background');
      });
      swatch.addEventListener('auxclick', (event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        this.setPaletteColor(color, 'background');
      });
      if (color.toLowerCase() === this.fgColor.toLowerCase()) {
        swatch.classList.add('active');
      }
      if (color.toLowerCase() === this.bgColor.toLowerCase()) {
        swatch.classList.add('secondary-active');
      }
      swatches.appendChild(swatch);
    });
    this.updateColorUI();
  }

  setPaletteColor(color, target) {
    const isBackground = target === 'background';
    if (isBackground) {
      this.bgColor = color;
      this.bgTransparent = false;
      document.getElementById('bgColor').value = color;
    } else {
      this.fgColor = color;
      this.fgTransparent = false;
      document.getElementById('fgColor').value = color;
    }
    this.seedPalette();
    const status = document.getElementById('statusBar');
    if (status) status.textContent = `${isBackground ? 'Фон' : 'Цвет символа'}: ${color}`;
    this.scheduleAutosave();
  }

  render() {
    const composite = this.applyLighting(this.composeLayers());
    const displayLayers = this.layers
      .filter((layer) => layer.visible && layer.opacity > 0)
      .map((layer) => ({
        grid: this.applyLighting(layer.grid),
        opacity: layer.opacity,
      }));
    this.renderer.setGrid(composite);
    this.renderer.setLayers(displayLayers);
    this.renderer.setSelection(this.selection);
    this.exporter.setGrid(composite);
    this.renderer.resize();
    if (this.zoomMode === 'fit') this.fitZoomToView();
    this.renderer.render();
    this.brushEngine.setGrid(this.grid);
    this.updatePreview();
    this.updateStatus(this.previewPoint);
    this.updateLayers();
    this.updateLightMarkers();
    this.scheduleAutosave();
  }

  enableAutosave() {
    this.autosaveReady = true;
    this.scheduleAutosave();
  }

  scheduleAutosave() {
    if (!this.autosaveReady) return;
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => this.persistLocalProject(), 450);
  }

  persistLocalProject() {
    if (!this.autosaveReady) return;
    clearTimeout(this.autosaveTimer);
    try {
      const project = this.serializeProject();
      localStorage.setItem('rigel-project', JSON.stringify(project));
      this.updateRecentProjects(project);
    } catch (error) {
      console.error('Autosave failed', error);
      const status = document.getElementById('statusBar');
      if (status) status.textContent = 'Автосохранение не удалось';
    }
  }

  composeLayers() {
    return this.composeLayerRange(this.layers.length);
  }

  composeLayerRange(endExclusive) {
    const composite = new ANSIGrid(this.grid.width, this.grid.height);
    const compositeChannel = (targetColor, targetAlpha, sourceColor, sourceAlpha) => {
      const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
      if (outputAlpha <= 0) return { color: sourceColor, alpha: 0 };
      const sourceWeight = sourceAlpha / outputAlpha;
      return {
        color: mixColors(targetColor, sourceColor, sourceWeight),
        alpha: outputAlpha,
      };
    };
    this.layers.slice(0, endExclusive).forEach((layer) => {
      if (!layer.visible || layer.opacity <= 0) return;
      for (let y = 0; y < layer.grid.height; y += 1) {
        for (let x = 0; x < layer.grid.width; x += 1) {
          const source = layer.grid.getCell(x, y);
          if (!source || source.empty) continue;
          const target = composite.getCell(x, y);
          const opacity = clamp(layer.opacity, 0, 1);
          const sourceFgAlpha = (source.fgAlpha ?? 1) * opacity;
          const sourceBgAlpha = (source.bgAlpha ?? 1) * opacity;
          const targetFgAlpha = target.empty ? 0 : target.fgAlpha ?? 1;
          const targetBgAlpha = target.empty ? 0 : target.bgAlpha ?? 1;
          const foreground = compositeChannel(
            targetFgAlpha > 0 ? target.fg : source.fg,
            targetFgAlpha,
            source.fg,
            sourceFgAlpha,
          );
          const background = compositeChannel(
            targetBgAlpha > 0 ? target.bg : source.bg,
            targetBgAlpha,
            source.bg,
            sourceBgAlpha,
          );
          const sourceCharacterVisible = sourceFgAlpha >= 0.5 || targetFgAlpha <= 0;
          composite.setCell(x, y, {
            char: sourceCharacterVisible ? source.char : target.char,
            fg: foreground.color,
            bg: background.color,
            brightness: sourceCharacterVisible ? source.brightness : target.brightness,
            density: sourceCharacterVisible ? source.density : target.density,
            fgAlpha: foreground.alpha,
            bgAlpha: background.alpha,
            empty: foreground.alpha <= 0 && background.alpha <= 0,
          });
        }
      }
    });
    return composite;
  }

  backgroundBelowActiveLayer(x, y) {
    if (this.activeLayerIndex <= 0) return this.bgColor;
    const below = this.composeLayerRange(this.activeLayerIndex).getCell(x, y);
    if (below && !below.empty && (below.bgAlpha ?? 0) > 0) return below.bg;
    return this.bgColor;
  }

  applyLighting(grid) {
    if (!this.lighting.enabled || !this.lighting.points.length) return grid;
    const lit = grid.clone();
    for (let y = 0; y < lit.height; y += 1) {
      for (let x = 0; x < lit.width; x += 1) {
        const cell = lit.getCell(x, y);
        if (!cell || cell.empty) continue;
        const lighting = this.surfaceLightingAt(grid, x, y, this.lighting.volumeEnabled ? 'volume-live' : 'live');
        let fg = cell.fg;
        let bg = cell.bg;
        if ((cell.fgAlpha ?? 1) > 0) {
          fg = mixColors(mixColors(fg, '#000000', lighting.shadow), lighting.color, lighting.highlight);
        }
        if ((cell.bgAlpha ?? 1) > 0) {
          bg = mixColors(mixColors(bg, '#000000', lighting.shadow * 0.8), lighting.color, lighting.highlight * 0.42);
        }
        lit.setCell(x, y, { fg, bg });
      }
    }
    return lit;
  }

  cellHeightValue(grid, x, y) {
    const cell = grid.getCell(x, y);
    if (!cell || cell.empty) return 0;
    const alpha = Math.max(cell.fgAlpha ?? 1, cell.bgAlpha ?? 1);
    const visibleColor = (cell.fgAlpha ?? 1) > 0 ? cell.fg : cell.bg;
    const { r, g, b } = hexToRgb(visibleColor);
    const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    const density = cell.density ?? luminance;
    const brightness = cell.brightness ?? luminance;
    return clamp((density * 0.62 + brightness * 0.24 + (1 - luminance) * 0.14) * alpha, 0, 1);
  }

  surfaceNormal(grid, x, y, depth = 1) {
    const nx = (this.cellHeightValue(grid, x - 1, y) - this.cellHeightValue(grid, x + 1, y)) * depth;
    const ny = (this.cellHeightValue(grid, x, y - 1) - this.cellHeightValue(grid, x, y + 1)) * depth;
    const nz = 0.9;
    const length = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / length, y: ny / length, z: nz / length };
  }

  surfaceLightingAt(grid, x, y, mode = 'effect') {
    const points = this.lighting.points?.length
      ? this.lighting.points.map((point) => this.normalizeLightPoint(point))
      : [{ x: -grid.width * 0.25, y: -grid.height * 0.3, color: '#ffffff', intensity: 0.85, radius: Math.max(grid.width, grid.height), height: 1.2 }];
    const volumeMode = mode === 'volume-live' || mode === 'effect' || mode === 'emboss';
    const normal = this.surfaceNormal(grid, x, y, mode === 'live' ? 0.55 : mode === 'volume-live' ? 1.55 : 1.35);
    let highlight = mode === 'live' ? 0 : mode === 'volume-live' ? 0.03 : 0.04;
    let shadow = mode === 'live' ? 0.01 : mode === 'volume-live' ? 0.16 : 0.18;
    let color = '#ffffff';

    points.forEach((point) => {
      const radius = Math.max(1, Number(point.radius ?? this.lighting.radius));
      const intensity = Number(point.intensity ?? this.lighting.intensity);
      const height = Number(point.height ?? this.lighting.height ?? 1.1);
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
      color = mixColors(color, point.color || this.lighting.color, clamp(falloff * intensity * 0.55, 0, 1));
    });

    return {
      color,
      highlight: clamp(highlight, 0, mode === 'live' ? 0.62 : mode === 'volume-live' ? 1 : 1.1),
      shadow: clamp(shadow, 0, mode === 'live' ? 0.18 : mode === 'volume-live' ? 0.62 : 0.72),
    };
  }

  setActiveGrid(grid) {
    this.grid = grid;
    this.layers[this.activeLayerIndex].grid = grid;
    this.syncGridRefs();
  }

  selectionBounds(cells = this.selection.cells) {
    if (!cells?.size) return null;
    const points = [...cells].map((key) => key.split(',').map(Number));
    return {
      minX: Math.min(...points.map(([x]) => x)),
      minY: Math.min(...points.map(([, y]) => y)),
      maxX: Math.max(...points.map(([x]) => x)),
      maxY: Math.max(...points.map(([, y]) => y)),
    };
  }

  rectangleSelection(start, end) {
    const cells = new Set();
    for (let y = Math.min(start.y, end.y); y <= Math.max(start.y, end.y); y += 1) {
      for (let x = Math.min(start.x, end.x); x <= Math.max(start.x, end.x); x += 1) {
        cells.add(`${x},${y}`);
      }
    }
    return cells;
  }

  lassoSelection(path) {
    if (path.length < 3) return new Set(path.map((point) => `${point.x},${point.y}`));
    const minX = Math.max(0, Math.min(...path.map((point) => point.x)));
    const maxX = Math.min(this.grid.width - 1, Math.max(...path.map((point) => point.x)));
    const minY = Math.max(0, Math.min(...path.map((point) => point.y)));
    const maxY = Math.min(this.grid.height - 1, Math.max(...path.map((point) => point.y)));
    const cells = new Set();
    const inside = (x, y) => {
      let result = false;
      for (let i = 0, j = path.length - 1; i < path.length; j = i, i += 1) {
        const a = path[i];
        const b = path[j];
        if (((a.y > y) !== (b.y > y)) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1) + a.x) {
          result = !result;
        }
      }
      return result;
    };
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (inside(x + 0.5, y + 0.5)) cells.add(`${x},${y}`);
      }
    }
    path.forEach((point) => cells.add(`${point.x},${point.y}`));
    return cells;
  }

  cellColorSignature(cell) {
    if (!cell || cell.empty) return null;
    const fgAlpha = cell.fgAlpha ?? 1;
    const bgAlpha = cell.bgAlpha ?? 1;
    const fg = hexToRgb(fgAlpha > 0 ? cell.fg : cell.bg);
    const bg = hexToRgb(bgAlpha > 0 ? cell.bg : cell.fg);
    const alphaTotal = clamp(fgAlpha + bgAlpha, 0, 2) / 2;
    const foregroundWeight = fgAlpha > 0 ? 0.62 : 0;
    const backgroundWeight = bgAlpha > 0 ? 1 - foregroundWeight : 0;
    const total = Math.max(0.001, foregroundWeight + backgroundWeight);
    return {
      r: (fg.r * foregroundWeight + bg.r * backgroundWeight) / total,
      g: (fg.g * foregroundWeight + bg.g * backgroundWeight) / total,
      b: (fg.b * foregroundWeight + bg.b * backgroundWeight) / total,
      alpha: alphaTotal,
      char: fgAlpha > 0 ? cell.char || ' ' : ' ',
    };
  }

  signatureDistance(a, b) {
    if (!a && !b) return 0;
    if (!a || !b) return 999;
    const colorDistance = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    const alphaDistance = Math.abs(a.alpha - b.alpha) * 96;
    const charPenalty = a.char !== b.char ? 8 : 0;
    return colorDistance + alphaDistance + charPenalty;
  }

  magicSelection(point, { contiguous = true } = {}) {
    const composite = this.applyLighting(this.composeLayers());
    const target = this.cellColorSignature(composite.getCell(point.x, point.y));
    const tolerance = this.magicTolerance;
    const matches = (x, y) => this.signatureDistance(this.cellColorSignature(composite.getCell(x, y)), target) <= tolerance;
    const cells = new Set();

    if (!contiguous) {
      for (let y = 0; y < composite.height; y += 1) {
        for (let x = 0; x < composite.width; x += 1) {
          if (matches(x, y)) cells.add(`${x},${y}`);
        }
      }
      return cells;
    }

    const seen = new Set();
    const stack = [[point.x, point.y]];
    while (stack.length) {
      const [x, y] = stack.pop();
      const key = `${x},${y}`;
      if (seen.has(key) || x < 0 || y < 0 || x >= composite.width || y >= composite.height) continue;
      seen.add(key);
      if (!matches(x, y)) continue;
      cells.add(key);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return cells;
  }

  applyMagicSelection(point, event = {}) {
    const contiguous = this.currentTool === 'magic-pencil' ? false : this.magicContiguous;
    const nextCells = this.magicSelection(point, { contiguous });
    const mode = this.currentTool === 'magic-pencil' && this.selectionCombineMode(event) === 'replace'
      ? 'add'
      : this.selectionCombineMode(event);
    this.selection = {
      cells: this.combineSelectionCells(nextCells, mode),
      floating: false,
    };
    this.render();
  }

  selectionCombineMode(event = {}) {
    if (event.shiftKey && event.altKey) return 'intersect';
    if (event.altKey) return 'subtract';
    if (event.shiftKey || event.metaKey || event.ctrlKey) return 'add';
    return 'replace';
  }

  combineSelectionCells(nextCells, mode = 'replace', baseCells = this.selection.cells) {
    if (mode === 'replace') return new Set(nextCells);
    if (mode === 'add') return new Set([...baseCells, ...nextCells]);
    if (mode === 'subtract') {
      const result = new Set(baseCells);
      nextCells.forEach((key) => result.delete(key));
      return result;
    }
    if (mode === 'intersect') {
      return new Set([...baseCells].filter((key) => nextCells.has(key)));
    }
    return new Set(nextCells);
  }

  beginSelectionGesture(point, event = {}) {
    if (this.currentTool === 'move') {
      if (this.selection.cells.has(`${point.x},${point.y}`)) this.beginSelectionMove(point);
      else if (this.selection.floating) this.clearSelection();
      return;
    }
    this.history.capture();
    this.selection.floating = false;
    this.selectionGesture = {
      type: this.currentTool === 'lasso' ? 'lasso' : 'rect',
      start: point,
      path: [point],
      combine: this.selectionCombineMode(event),
      baseCells: new Set(this.selection.cells),
    };
    this.selection.cells = this.combineSelectionCells(new Set([`${point.x},${point.y}`]), this.selectionGesture.combine, this.selectionGesture.baseCells);
    this.render();
  }

  updateSelectionGesture(point) {
    const gesture = this.selectionGesture;
    if (!gesture) return;
    if (gesture.type === 'rect') {
      this.selection.cells = this.combineSelectionCells(this.rectangleSelection(gesture.start, point), gesture.combine, gesture.baseCells);
    } else if (gesture.type === 'lasso') {
      const previous = gesture.path[gesture.path.length - 1];
      const steps = Math.max(Math.abs(point.x - previous.x), Math.abs(point.y - previous.y));
      for (let step = 1; step <= steps; step += 1) {
        gesture.path.push({
          x: Math.round(previous.x + ((point.x - previous.x) * step) / steps),
          y: Math.round(previous.y + ((point.y - previous.y) * step) / steps),
        });
      }
      this.selection.cells = this.combineSelectionCells(new Set(gesture.path.map((item) => `${item.x},${item.y}`)), gesture.combine, gesture.baseCells);
    } else if (gesture.type === 'move') {
      this.previewSelectionMove(point);
    }
    this.render();
  }

  finishSelectionGesture() {
    if (!this.selectionGesture) return;
    const movedContent = this.selectionGesture.type === 'move';
    if (this.selectionGesture.type === 'lasso') {
      this.selection.cells = this.combineSelectionCells(
        this.lassoSelection(this.selectionGesture.path),
        this.selectionGesture.combine,
        this.selectionGesture.baseCells,
      );
    }
    this.selectionGesture = null;
    this.canvas.classList.remove('selection-dragging');
    this.render();
    if (movedContent) this.persistLocalProject();
  }

  captureSelection(cells = this.selection.cells) {
    const bounds = this.selectionBounds(cells);
    if (!bounds) return null;
    const payload = { width: bounds.maxX - bounds.minX + 1, height: bounds.maxY - bounds.minY + 1, cells: [], mask: [] };
    cells.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      payload.mask.push([x - bounds.minX, y - bounds.minY]);
      const cell = this.grid.getCell(x, y);
      if (cell && !cell.empty) payload.cells.push([x - bounds.minX, y - bounds.minY, { ...cell }]);
    });
    return payload;
  }

  copySelection() {
    const payload = this.captureSelection();
    if (!payload) return false;
    this.internalClipboard = payload;
    document.getElementById('statusBar').textContent = 'Выделение скопировано';
    return true;
  }

  cutSelection() {
    if (!this.copySelection()) return;
    this.deleteSelection();
  }

  deleteSelection() {
    if (!this.selection.cells.size) return;
    this.history.capture();
    this.selection.cells.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      this.grid.clearCell(x, y);
    });
    this.selection.floating = false;
    this.render();
    this.persistLocalProject();
  }

  pasteSelection() {
    if (!this.internalClipboard) return;
    this.history.capture();
    const cancelGrid = this.grid.clone();
    const currentBounds = this.selectionBounds();
    const origin = currentBounds
      ? { x: currentBounds.minX, y: currentBounds.minY }
      : { x: 0, y: 0 };
    const base = this.grid.clone();
    this.placeSelectionPayload(base, this.internalClipboard, origin.x, origin.y);
    this.selection.floating = true;
    this.selection.cancelGrid = cancelGrid;
    this.render();
    this.persistLocalProject();
  }

  placeSelectionPayload(base, payload, originX, originY) {
    const grid = base.clone();
    payload.cells.forEach(([offsetX, offsetY, cell]) => {
      grid.setCell(originX + offsetX, originY + offsetY, { ...cell });
    });
    this.setActiveGrid(grid);
    this.selection.cells = new Set(
      payload.mask
        .map(([offsetX, offsetY]) => [originX + offsetX, originY + offsetY])
        .filter(([x, y]) => x >= 0 && y >= 0 && x < this.grid.width && y < this.grid.height)
        .map(([x, y]) => `${x},${y}`),
    );
  }

  beginSelectionMove(point) {
    const payload = this.captureSelection();
    if (!payload) return;
    if (!this.selection.floating) this.history.capture();
    const cancelGrid = this.selection.cancelGrid || this.grid.clone();
    const bounds = this.selectionBounds();
    const base = this.selection.floating && this.selection.cancelGrid
      ? this.selection.cancelGrid.clone()
      : this.grid.clone();
    if (!this.selection.floating) {
      this.selection.cells.forEach((key) => {
        const [x, y] = key.split(',').map(Number);
        base.clearCell(x, y);
      });
    }
    this.selectionGesture = {
      type: 'move',
      start: point,
      origin: { x: bounds.minX, y: bounds.minY },
      payload,
      base,
      cancelGrid,
    };
    this.canvas.classList.add('selection-dragging');
  }

  previewSelectionMove(point) {
    const gesture = this.selectionGesture;
    const originX = gesture.origin.x + point.x - gesture.start.x;
    const originY = gesture.origin.y + point.y - gesture.start.y;
    this.placeSelectionPayload(gesture.base, gesture.payload, originX, originY);
    this.selection.floating = true;
    this.selection.cancelGrid = gesture.cancelGrid;
  }

  clearSelection() {
    this.selection = { cells: new Set(), floating: false };
    this.selectionGesture = null;
    this.canvas.classList.remove('selection-dragging');
    this.render();
  }

  selectAll() {
    const cells = new Set();
    for (let y = 0; y < this.grid.height; y += 1) {
      for (let x = 0; x < this.grid.width; x += 1) cells.add(`${x},${y}`);
    }
    this.selection = { cells, floating: false };
    this.render();
  }

  invertSelection() {
    const cells = new Set();
    for (let y = 0; y < this.grid.height; y += 1) {
      for (let x = 0; x < this.grid.width; x += 1) {
        const key = `${x},${y}`;
        if (!this.selection.cells.has(key)) cells.add(key);
      }
    }
    this.selection = { cells, floating: false };
    this.render();
  }

  commitFloatingSelection() {
    if (!this.selection.floating) return;
    this.clearSelection();
    const status = document.getElementById('statusBar');
    if (status) status.textContent = 'Перемещение применено';
  }

  cancelFloatingSelection() {
    const cancelGrid = this.selection.cancelGrid;
    if (cancelGrid) this.setActiveGrid(cancelGrid.clone());
    this.clearSelection();
    const status = document.getElementById('statusBar');
    if (status) status.textContent = 'Перемещение отменено';
  }

  onPointerDown(event) {
    event.preventDefault();
    if (![0, 2].includes(event.button)) return;
    const point = this.getCanvasPoint(event);
    if (!point) return;
    if (event.pointerId != null && !this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.setPointerCapture(event.pointerId);
    }
    if (this.placingLight) {
      this.addLightPoint(point);
      return;
    }
    if (['magic-select', 'magic-pencil'].includes(this.currentTool)) {
      this.applyMagicSelection(point, event);
      return;
    }
    if (['select-rect', 'lasso', 'move'].includes(this.currentTool)) {
      this.beginSelectionGesture(point, event);
      return;
    }
    if (this.currentTool === 'zoom') {
      this.zoomAtClientPoint(
        event.clientX,
        event.clientY,
        this.zoom + (event.button === 2 || event.altKey ? -25 : 25),
      );
      return;
    }
    const activeLayer = this.layers[this.activeLayerIndex];
    const mutatingTools = ['pencil', 'eraser', 'fill', 'line', 'rect', 'rect-fill', 'ellipse', 'spray', 'text'];
    if (mutatingTools.includes(this.currentTool) && (activeLayer.locked || !activeLayer.visible)) {
      const status = document.getElementById('statusBar');
      if (status) status.textContent = activeLayer.locked ? 'Активный слой заблокирован' : 'Активный слой скрыт';
      return;
    }
    if (mutatingTools.includes(this.currentTool) && this.currentTool !== 'text') this.history.capture();
    this.isDrawing = true;
    this.paintBackground = event.button === 2;
    this.lastPoint = point;
    this.shapeStart = point;
    this.shapeSnapshot = this.grid.clone();
    this.previewPoint = point;

    if (this.currentTool === 'pan') {
      this.isPanning = true;
      const wrap = document.getElementById('canvasWrap');
      this.panStart = {
        x: event.clientX,
        y: event.clientY,
        scrollLeft: wrap.scrollLeft,
        scrollTop: wrap.scrollTop,
      };
      return;
    }

    if (this.currentTool === 'eyedropper') {
      const cell = this.applyLighting(this.composeLayers()).getCell(point.x, point.y);
      if (cell && !cell.empty) {
        this.fgColor = cell.fg;
        this.bgColor = cell.bg;
        this.symbol = cell.char || ' ';
        document.getElementById('fgColor').value = cell.fg;
        document.getElementById('bgColor').value = cell.bg;
        document.getElementById('symbolInput').value = this.symbol;
        this.seedPalette();
        this.updateStatus(point);
      }
      this.isDrawing = false;
      return;
    }

    if (this.currentTool === 'fill') {
      this.fillArea(point.x, point.y);
      this.isDrawing = false;
      this.render();
      this.persistLocalProject();
      return;
    }

    if (this.currentTool === 'text') {
      this.pendingTextPoint = point;
      this.textValue = '';
      const input = document.getElementById('textInput');
      input.value = '';
      input.focus();
      this.isDrawing = false;
      document.getElementById('statusBar').textContent = 'Введите текст и нажмите Enter · Esc для отмены';
      return;
    }

    if (this.isShapeTool()) {
      this.render();
      return;
    }

    this.applyTool(point.x, point.y);
  }

  onPointerMove(event) {
    const point = this.getCanvasPoint(event);
    this.previewPoint = point;
    this.updateStatus(point);
    if (this.isPanning && this.panStart) {
      const wrap = document.getElementById('canvasWrap');
      wrap.scrollLeft = this.panStart.scrollLeft - (event.clientX - this.panStart.x);
      wrap.scrollTop = this.panStart.scrollTop - (event.clientY - this.panStart.y);
      return;
    }
    if (this.selectionGesture) {
      this.updateSelectionGesture(point);
      return;
    }
    if (this.currentTool === 'move' && this.selection.cells.has(`${point.x},${point.y}`)) {
      this.canvas.style.cursor = 'move';
    } else {
      this.canvas.style.cursor = '';
    }
    if (!point) return;
    if (!this.isDrawing) return;

    if (this.isShapeTool() && this.shapeSnapshot && this.shapeStart) {
      this.setActiveGrid(this.shapeSnapshot.clone());
      this.paintShape(this.shapeStart, point);
      this.render();
      return;
    }

    if (['pencil', 'eraser', 'spray'].includes(this.currentTool)) {
      const interpolate = this.currentTool !== 'pencil' || this.brushSmoothing;
      if (this.lastPoint && interpolate) {
        this.drawLine(this.lastPoint.x, this.lastPoint.y, point.x, point.y);
      } else {
        this.paintAt(point.x, point.y);
      }
      this.lastPoint = point;
      this.render();
    }
  }

  onPointerUp(event) {
    const finishedMutatingTool = this.isDrawing && ['pencil', 'eraser', 'fill', 'line', 'rect', 'rect-fill', 'ellipse', 'spray', 'text'].includes(this.currentTool);
    if (event?.pointerId != null && this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    if (this.selectionGesture) {
      this.finishSelectionGesture();
      return;
    }
    if (this.isShapeTool() && this.isDrawing && this.shapeSnapshot && this.shapeStart) {
      const point = event ? this.getCanvasPoint(event) : this.previewPoint || this.shapeStart;
      this.setActiveGrid(this.shapeSnapshot.clone());
      this.paintShape(this.shapeStart, point);
    }
    this.isDrawing = false;
    this.isPanning = false;
    this.panStart = null;
    this.paintBackground = false;
    this.lastPoint = null;
    this.shapeStart = null;
    this.shapeSnapshot = null;
    this.render();
    if (finishedMutatingTool) this.persistLocalProject();
  }

  onPointerCancel(event) {
    if (event?.pointerId != null && this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    if (this.selectionGesture?.type === 'move') this.cancelFloatingSelection();
    else {
      this.selectionGesture = null;
      this.isDrawing = false;
      this.lastPoint = null;
      this.shapeStart = null;
      this.shapeSnapshot = null;
      this.canvas.classList.remove('selection-dragging');
      this.render();
    }
  }

  getCanvasPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.grid.width / rect.width;
    const scaleY = this.grid.height / rect.height;
    const x = Math.floor((event.clientX - rect.left) * scaleX);
    const y = Math.floor((event.clientY - rect.top) * scaleY);
    return { x: clamp(x, 0, this.grid.width - 1), y: clamp(y, 0, this.grid.height - 1) };
  }

  applyTool(x, y) {
    this.paintAt(x, y);
    this.render();
  }

  selectedPaintMask() {
    return this.selection.cells?.size ? this.selection.cells : null;
  }

  canPaintCell(x, y) {
    const mask = this.selectedPaintMask();
    return !mask || mask.has(`${x},${y}`);
  }

  paintAt(x, y) {
    if (!this.canPaintCell(x, y)) return;
    if (this.currentTool === 'spray') {
      this.paintSpray(x, y);
      return;
    }

    const options = {
      size: this.brushSize,
      mode: this.brushMode,
      symbol: this.symbol,
      pattern: this.textValue,
      charset: this.brushCharset,
      level: this.brushLevel,
      fg: this.fgColor,
      bg: this.bgTransparent && !this.paintBackground ? this.backgroundBelowActiveLayer(x, y) : this.bgColor,
      fgTransparent: this.fgTransparent,
      bgTransparent: this.bgTransparent,
      mirrorX: this.mirrorX,
      mirrorY: this.mirrorY,
      erase: this.currentTool === 'eraser',
      backgroundOnly: this.paintBackground,
      allowedCells: this.selectedPaintMask(),
    };
    this.brushEngine.applyStroke(x, y, options);
  }

  paintSpray(x, y) {
    const radius = Math.max(1, this.brushSize * 1.8);
    const count = Math.max(8, this.brushSize * 7);
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius;
      const targetX = Math.round(x + Math.cos(angle) * distance);
      const targetY = Math.round(y + Math.sin(angle) * distance);
      if (!this.canPaintCell(targetX, targetY)) continue;
      this.brushEngine.applyStroke(
        targetX,
        targetY,
        {
          size: 1,
          mode: this.brushMode,
          symbol: this.paintBackground ? ' ' : this.symbol,
          pattern: this.textValue,
          charset: this.brushCharset,
          level: this.brushLevel,
          fg: this.fgColor,
          bg: this.bgTransparent && !this.paintBackground
            ? this.backgroundBelowActiveLayer(Math.round(x + Math.cos(angle) * distance), Math.round(y + Math.sin(angle) * distance))
            : this.bgColor,
          fgTransparent: this.fgTransparent,
          bgTransparent: this.bgTransparent,
          backgroundOnly: this.paintBackground,
          allowedCells: this.selectedPaintMask(),
        },
      );
    }
  }

  drawLine(x1, y1, x2, y2) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= steps; i += 1) {
      const t = steps === 0 ? 0 : i / steps;
      const x = Math.round(x1 + (x2 - x1) * t);
      const y = Math.round(y1 + (y2 - y1) * t);
      this.paintAt(x, y);
    }
  }

  drawRect(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (x === minX || x === maxX || y === minY || y === maxY) {
          this.paintAt(x, y);
        }
      }
    }
  }

  drawFilledRect(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        this.paintAt(x, y);
      }
    }
  }

  drawEllipse(x1, y1, x2, y2) {
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const radiusX = Math.abs(x2 - x1) / 2;
    const radiusY = Math.abs(y2 - y1) / 2;
    if (radiusX === 0 || radiusY === 0) {
      this.drawLine(x1, y1, x2, y2);
      return;
    }

    const steps = Math.max(16, Math.ceil(Math.PI * Math.max(radiusX, radiusY) * 4));
    const points = new Set();
    for (let index = 0; index < steps; index += 1) {
      const angle = (index / steps) * Math.PI * 2;
      const x = Math.round(centerX + Math.cos(angle) * radiusX);
      const y = Math.round(centerY + Math.sin(angle) * radiusY);
      points.add(`${x},${y}`);
    }
    points.forEach((point) => {
      const [x, y] = point.split(',').map(Number);
      this.paintAt(x, y);
    });
  }

  drawText(x, y) {
    Array.from(this.textValue || '').forEach((char, offset) => {
      if (!this.canPaintCell(x + offset, y)) return;
      this.brushEngine.applyStroke(x + offset, y, {
        size: 1,
        mode: 'ansi',
        symbol: this.paintBackground ? ' ' : char,
        fg: this.fgColor,
        bg: this.bgTransparent && !this.paintBackground ? this.backgroundBelowActiveLayer(x + offset, y) : this.bgColor,
        fgTransparent: this.fgTransparent,
        bgTransparent: this.bgTransparent,
        backgroundOnly: this.paintBackground,
        allowedCells: this.selectedPaintMask(),
      });
    });
  }

  commitPendingText() {
    if (!this.pendingTextPoint || !this.textValue) {
      this.cancelPendingText();
      return;
    }
    this.history.capture();
    this.drawText(this.pendingTextPoint.x, this.pendingTextPoint.y);
    this.pendingTextPoint = null;
    this.render();
    this.persistLocalProject();
  }

  cancelPendingText() {
    this.pendingTextPoint = null;
    if (this.currentTool === 'text') {
      const status = document.getElementById('statusBar');
      if (status) status.textContent = 'Текст отменен';
    }
  }

  isShapeTool() {
    return ['line', 'rect', 'rect-fill', 'ellipse'].includes(this.currentTool);
  }

  paintShape(start, end) {
    if (this.currentTool === 'line') {
      this.drawLine(start.x, start.y, end.x, end.y);
    }
    if (this.currentTool === 'rect') {
      this.drawRect(start.x, start.y, end.x, end.y);
    }
    if (this.currentTool === 'rect-fill') {
      this.drawFilledRect(start.x, start.y, end.x, end.y);
    }
    if (this.currentTool === 'ellipse') {
      this.drawEllipse(start.x, start.y, end.x, end.y);
    }
  }

  fillArea(x, y) {
    if (!this.canPaintCell(x, y)) return;
    const target = this.grid.getCell(x, y);
    if (!target) return;
    const fillChar = this.paintBackground ? ' ' : this.symbol;
    const targetKey = `${target.empty}|${target.char}|${target.fg}|${target.bg}|${target.fgAlpha}|${target.bgAlpha}`;
    const nextFgAlpha = this.paintBackground || this.fgTransparent ? 0 : 1;
    const nextBgAlpha = this.bgTransparent ? 0 : 1;
    const fillKey = `${nextFgAlpha <= 0 && nextBgAlpha <= 0}|${fillChar}|${this.fgColor}|${this.bgColor}|${nextFgAlpha}|${nextBgAlpha}`;
    if (targetKey === fillKey) return;

    const seen = new Set();
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      const key = `${cx},${cy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!this.canPaintCell(cx, cy)) continue;
      const cell = this.grid.getCell(cx, cy);
      if (!cell || `${cell.empty}|${cell.char}|${cell.fg}|${cell.bg}|${cell.fgAlpha}|${cell.bgAlpha}` !== targetKey) continue;
      this.grid.setCell(cx, cy, {
        fg: this.fgColor,
        bg: this.bgColor,
        char: fillChar,
        density: 1,
        brightness: 1,
        fgAlpha: nextFgAlpha,
        bgAlpha: nextBgAlpha,
        empty: nextFgAlpha <= 0 && nextBgAlpha <= 0,
      });
      if (this.grid.getCell(cx + 1, cy)) stack.push([cx + 1, cy]);
      if (this.grid.getCell(cx - 1, cy)) stack.push([cx - 1, cy]);
      if (this.grid.getCell(cx, cy + 1)) stack.push([cx, cy + 1]);
      if (this.grid.getCell(cx, cy - 1)) stack.push([cx, cy - 1]);
    }
  }

  syncGridRefs() {
    this.brushEngine.setGrid(this.grid);
  }

  undo() {
    if (this.history.undo()) this.render();
  }

  redo() {
    if (this.history.redo()) this.render();
  }

  clearCanvas() {
    this.history.capture();
    this.grid.clear();
    this.render();
  }

  bindProjectUI() {
    this.bindIfExists('startNewProjectBtn', 'click', () => this.openNewProjectDialog());
    this.bindIfExists('startOpenProjectBtn', 'click', () => document.getElementById('projectInput').click());
    this.bindIfExists('showStartBtn', 'click', () => this.showStartScreen());
    this.bindIfExists('addDocumentTabBtn', 'click', () => this.openNewTabDialog());
    this.bindIfExists('newProjectPreset', 'change', (event) => this.applyProjectPreset(event.target.value));
    document.querySelectorAll('input[name="projectOrientation"]').forEach((input) => {
      input.addEventListener('change', () => {
        const width = document.getElementById('newProjectWidth');
        const height = document.getElementById('newProjectHeight');
        const portrait = document.querySelector('input[name="projectOrientation"]:checked').value === 'portrait';
        const values = [Number(width.value), Number(height.value)];
        width.value = String(portrait ? Math.min(...values) : Math.max(...values));
        height.value = String(portrait ? Math.max(...values) : Math.min(...values));
      });
    });
    this.bindIfExists('createProjectBtn', 'click', () => {
      this.createProject({
        name: document.getElementById('newProjectName').value.trim() || 'Новый проект',
        width: Number(document.getElementById('newProjectWidth').value),
        height: Number(document.getElementById('newProjectHeight').value),
      });
      document.getElementById('newProjectDialog').close();
    });
    const tabList = document.getElementById('documentTabList');
    tabList?.addEventListener('click', (event) => {
      const tab = event.target.closest('.document-tab');
      if (!tab) return;
      if (event.target.closest('.tab-close')) this.requestCloseDocumentTab(tab.dataset.id);
      else this.switchDocumentTab(tab.dataset.id);
    });
    tabList?.addEventListener('dblclick', (event) => {
      const tab = event.target.closest('.document-tab');
      if (!tab) return;
      const document = this.documents.find((item) => item.id === tab.dataset.id);
      const name = prompt('Название вкладки', document.name);
      if (name?.trim()) {
        document.name = name.trim();
        this.renderDocumentTabs();
        this.scheduleAutosave();
      }
    });
    document.getElementById('recentProjects')?.addEventListener('click', (event) => {
      const card = event.target.closest('.recent-project');
      if (!card) return;
      const recent = this.readRecentProjects().find((item) => item.id === card.dataset.id);
      if (recent) {
        this.applyProjectData(recent.data);
        this.hideStartScreen();
      }
    });
    this.bindIfExists('confirmCloseTabBtn', 'click', () => {
      const id = this.pendingCloseDocumentId;
      this.pendingCloseDocumentId = null;
      document.getElementById('closeTabDialog').close();
      if (id) this.closeDocumentTab(id);
    });
    document.getElementById('closeTabDialog')?.addEventListener('close', () => {
      this.pendingCloseDocumentId = null;
    });
    this.bindIfExists('createDocumentTabBtn', 'click', () => {
      const width = clamp(Number(document.getElementById('newTabWidth').value), 8, 240);
      const height = clamp(Number(document.getElementById('newTabHeight').value), 4, 120);
      const remember = document.getElementById('rememberTabSize').checked;
      this.tabDefaults = remember ? { width, height } : null;
      if (remember) localStorage.setItem('rigel-tab-defaults', JSON.stringify(this.tabDefaults));
      else localStorage.removeItem('rigel-tab-defaults');
      this.addDocumentTab({
        name: document.getElementById('newTabName').value.trim() || `Вкладка ${this.documents.length + 1}`,
        width,
        height,
      });
      document.getElementById('newTabDialog').close();
    });
    document.getElementById('newTabDialog')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        document.getElementById('createDocumentTabBtn').click();
      }
    });
  }

  openNewProjectDialog() {
    document.getElementById('newProjectDialog').showModal();
  }

  readTabDefaults() {
    try {
      const data = JSON.parse(localStorage.getItem('rigel-tab-defaults') || 'null');
      return data && Number.isFinite(data.width) && Number.isFinite(data.height) ? data : null;
    } catch {
      return null;
    }
  }

  openNewTabDialog() {
    const defaults = this.tabDefaults || { width: this.grid.width, height: this.grid.height };
    document.getElementById('newTabName').value = `Вкладка ${this.documents.length + 1}`;
    document.getElementById('newTabWidth').value = String(defaults.width);
    document.getElementById('newTabHeight').value = String(defaults.height);
    document.getElementById('rememberTabSize').checked = Boolean(this.tabDefaults);
    const dialog = document.getElementById('newTabDialog');
    dialog.showModal();
    document.getElementById('newTabName').select();
  }

  applyProjectPreset(preset) {
    const presets = {
      'terminal-large': [120, 40],
      'terminal-small': [80, 25],
      'terminal-custom': [100, 30],
      a4: [84, 60],
      square: [64, 64],
    };
    if (!presets[preset]) return;
    const [width, height] = presets[preset];
    document.getElementById('newProjectWidth').value = String(width);
    document.getElementById('newProjectHeight').value = String(height);
  }

  createProject({ name, width, height }) {
    if (this.autosaveReady) this.persistLocalProject();
    this.projectId = crypto.randomUUID?.() || String(Date.now());
    this.projectName = name;
    this.activeDocumentId = crypto.randomUUID?.() || `${Date.now()}-tab`;
    const grid = new ANSIGrid(clamp(width, 8, 240), clamp(height, 4, 120));
    this.layers = [this.createLayer('Слой 1', grid)];
    this.activeLayerIndex = 0;
    this.grid = grid;
    this.lighting.points = [];
    this.lighting.enabled = false;
    this.selectedLightId = null;
    this.documents = [{ id: this.activeDocumentId, name: 'Вкладка 1', snapshot: null, undoStack: [], redoStack: [] }];
    this.textValue = '';
    document.getElementById('textInput').value = '';
    this.history.undoStack = [];
    this.history.redoStack = [];
    this.syncGridRefs();
    document.querySelector('.document-name').textContent = `${this.projectName}.rigel.json`;
    const lightingEnabled = document.getElementById('lightingEnabled');
    if (lightingEnabled) lightingEnabled.checked = false;
    this.hideStartScreen();
    this.renderDocumentTabs();
    this.render();
  }

  newProject() {
    this.createProject({ name: 'Новый проект', width: 80, height: 25 });
  }

  snapshotDocument() {
    return {
      layers: this.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        type: layer.type || 'pixel',
        locked: layer.locked === true,
        visible: layer.visible,
        opacity: layer.opacity,
        grid: layer.grid.toSparseJSON(),
      })),
      activeLayerIndex: this.activeLayerIndex,
      lighting: structuredClone(this.lighting),
    };
  }

  stashActiveDocument() {
    const document = this.documents.find((item) => item.id === this.activeDocumentId);
    if (document) {
      document.snapshot = this.snapshotDocument();
      document.undoStack = this.history.undoStack;
      document.redoStack = this.history.redoStack;
    }
  }

  touchActiveDocument() {
    const document = this.documents.find((item) => item.id === this.activeDocumentId);
    if (!document) return;
    document.snapshot = this.snapshotDocument();
  }

  loadDocumentSnapshot(snapshot) {
    this.layers = snapshot.layers.map((layer, index) => ({
      id: layer.id || `${Date.now()}-${index}`,
      name: layer.name || `Слой ${index + 1}`,
      type: layer.type || 'pixel',
      locked: layer.locked === true,
      visible: layer.visible !== false,
      opacity: layer.opacity ?? 1,
      grid: ANSIGrid.fromJSON(layer.grid),
    }));
    this.activeLayerIndex = clamp(snapshot.activeLayerIndex ?? 0, 0, this.layers.length - 1);
    this.grid = this.layers[this.activeLayerIndex].grid;
    this.lighting = { ...this.lighting, ...(snapshot.lighting || {}) };
    this.lighting.points = (this.lighting.points || []).map((point) => this.normalizeLightPoint(point));
    this.selectedLightId = this.lighting.points[0]?.id || null;
    this.history.undoStack = [];
    this.history.redoStack = [];
    this.clearSelection();
    this.syncGridRefs();
  }

  addDocumentTab({
    name = `Вкладка ${this.documents.length + 1}`,
    width = this.grid.width,
    height = this.grid.height,
  } = {}) {
    this.stashActiveDocument();
    const id = crypto.randomUUID?.() || `${Date.now()}-tab`;
    const grid = new ANSIGrid(clamp(Math.floor(width), 8, 240), clamp(Math.floor(height), 4, 120));
    const layer = this.createLayer('Слой 1', grid);
    this.documents.push({
      id,
      name,
      snapshot: { layers: [{ ...layer, grid: grid.toSparseJSON() }], activeLayerIndex: 0, lighting: { ...this.lighting, points: [], enabled: false } },
      undoStack: [],
      redoStack: [],
    });
    this.switchDocumentTab(id);
  }

  switchDocumentTab(id) {
    if (id === this.activeDocumentId) return;
    this.stashActiveDocument();
    const document = this.documents.find((item) => item.id === id);
    if (!document) return;
    this.activeDocumentId = id;
    this.loadDocumentSnapshot(document.snapshot);
    this.history.undoStack = document.undoStack || [];
    this.history.redoStack = document.redoStack || [];
    this.renderDocumentTabs();
    this.render();
  }

  closeDocumentTab(id) {
    if (this.documents.length === 1) return;
    const index = this.documents.findIndex((item) => item.id === id);
    if (index < 0) return;
    const wasActive = id === this.activeDocumentId;
    this.documents.splice(index, 1);
    if (wasActive) {
      const next = this.documents[Math.max(0, index - 1)];
      this.activeDocumentId = next.id;
      this.loadDocumentSnapshot(next.snapshot);
      this.history.undoStack = next.undoStack || [];
      this.history.redoStack = next.redoStack || [];
      this.render();
    }
    this.renderDocumentTabs();
    this.scheduleAutosave();
  }

  requestCloseDocumentTab(id) {
    const targetDocument = this.documents.find((item) => item.id === id);
    if (!targetDocument) return;
    if (this.documents.length === 1) {
      const status = document.getElementById('statusBar');
      if (status) status.textContent = 'Нельзя закрыть единственную вкладку';
      return;
    }
    this.pendingCloseDocumentId = id;
    document.getElementById('closeTabName').textContent = targetDocument.name;
    const dialog = document.getElementById('closeTabDialog');
    dialog.showModal();
    dialog.querySelector('[data-dialog-close]')?.focus();
  }

  renderDocumentTabs() {
    const list = document.getElementById('documentTabList');
    if (!list) return;
    list.innerHTML = '';
    this.documents.forEach((doc) => {
      const button = window.document.createElement('button');
      button.className = `document-tab${doc.id === this.activeDocumentId ? ' active' : ''}`;
      button.dataset.id = doc.id;
      button.type = 'button';
      button.title = doc.name;
      button.setAttribute('aria-label', `Открыть вкладку ${doc.name}`);
      const name = window.document.createElement('span');
      name.className = 'tab-name';
      name.textContent = doc.name;
      const close = window.document.createElement('span');
      close.className = 'tab-close';
      close.textContent = '×';
      close.title = `Закрыть ${doc.name}`;
      close.setAttribute('aria-label', `Закрыть вкладку ${doc.name}`);
      button.append(name, close);
      list.appendChild(button);
    });
    const activeTab = list.querySelector('.document-tab.active');
    if (activeTab) {
      requestAnimationFrame(() => {
        const tabRect = activeTab.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        if (tabRect.left < listRect.left) list.scrollLeft -= listRect.left - tabRect.left;
        else if (tabRect.right > listRect.right) list.scrollLeft += tabRect.right - listRect.right;
      });
    }
  }

  readRecentProjects() {
    try {
      return JSON.parse(localStorage.getItem('rigel-recent-projects') || '[]');
    } catch {
      return [];
    }
  }

  updateRecentProjects(project) {
    const recent = this.readRecentProjects().filter((item) => item.id !== this.projectId);
    recent.unshift({
      id: this.projectId,
      name: this.projectName,
      width: this.grid.width,
      height: this.grid.height,
      modified: new Date().toISOString(),
      data: project,
    });
    localStorage.setItem('rigel-recent-projects', JSON.stringify(recent.slice(0, 8)));
  }

  renderRecentProjects() {
    const container = document.getElementById('recentProjects');
    if (!container) return;
    const recent = this.readRecentProjects();
    container.innerHTML = '';
    if (!recent.length) {
      container.innerHTML = '<p class="recent-empty">Проектов пока нет</p>';
      return;
    }
    recent.forEach((project) => {
      const card = document.createElement('button');
      card.className = 'recent-project';
      card.dataset.id = project.id;
      const date = new Date(project.modified).toLocaleString('ru-RU');
      card.innerHTML = '<canvas class="recent-thumb" width="68" height="48" aria-label="Миниатюра проекта"></canvas><span class="recent-info"><strong></strong><small></small><time></time></span>';
      card.querySelector('strong').textContent = project.name;
      card.querySelector('small').textContent = `${project.width} × ${project.height}`;
      card.querySelector('time').textContent = date;
      this.renderRecentProjectThumbnail(card.querySelector('.recent-thumb'), project.data);
      container.appendChild(card);
    });
  }

  getSnapshotPaintedCellCount(snapshot) {
    if (!snapshot?.layers?.length) return 0;
    const cells = new Set();
    snapshot.layers.forEach((layer) => {
      if (layer.visible === false || !layer.grid) return;
      if (layer.grid.sparse) {
        (layer.grid.cells || []).forEach(([x, y, , , , , , fgAlpha = 1, bgAlpha = 1]) => {
          if ((fgAlpha ?? 1) <= 0 && (bgAlpha ?? 1) <= 0) return;
          cells.add(`${x}:${y}`);
        });
        return;
      }
      (layer.grid.cells || []).forEach((row, y) => {
        (row || []).forEach((cell, x) => {
          if (!cell || cell.empty) return;
          if ((cell.fgAlpha ?? 1) <= 0 && (cell.bgAlpha ?? 1) <= 0) return;
          cells.add(`${x}:${y}`);
        });
      });
    });
    return cells.size;
  }

  getRecentPreviewSnapshot(projectData) {
    const snapshots = [];
    if (Array.isArray(projectData?.documents)) {
      projectData.documents.forEach((doc) => {
        if (doc?.snapshot?.layers?.length) snapshots.push(doc.snapshot);
      });
    }
    if (!snapshots.length && Array.isArray(projectData?.layers)) {
      snapshots.push({
        layers: projectData.layers,
        activeLayerIndex: projectData.activeLayerIndex || 0,
        lighting: projectData.lighting || null,
      });
    }
    return snapshots
      .map((snapshot) => ({ snapshot, score: this.getSnapshotPaintedCellCount(snapshot) }))
      .sort((a, b) => b.score - a.score)[0]?.snapshot || null;
  }

  renderRecentProjectThumbnail(canvas, projectData) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const tile = 4;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += tile) {
      for (let x = 0; x < canvas.width; x += tile) {
        ctx.fillStyle = ((x / tile + y / tile) & 1) ? '#20252a' : '#111519';
        ctx.fillRect(x, y, tile, tile);
      }
    }

    const snapshot = this.getRecentPreviewSnapshot(projectData);
    if (!snapshot?.layers?.length) {
      ctx.fillStyle = '#7b8794';
      ctx.font = '10px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ANSI', canvas.width / 2, canvas.height / 2);
      return;
    }

    const sourceGrid = snapshot.layers.find((layer) => layer.grid)?.grid;
    const width = sourceGrid?.width || projectData?.width || this.grid.width;
    const height = sourceGrid?.height || projectData?.height || this.grid.height;
    const scale = Math.min((canvas.width - 4) / width, (canvas.height - 4) / height);
    const previewWidth = width * scale;
    const previewHeight = height * scale;
    const originX = (canvas.width - previewWidth) / 2;
    const originY = (canvas.height - previewHeight) / 2;
    ctx.strokeStyle = '#07090b';
    ctx.strokeRect(Math.floor(originX) - 1, Math.floor(originY) - 1, Math.ceil(previewWidth) + 2, Math.ceil(previewHeight) + 2);

    snapshot.layers.forEach((layer) => {
      if (layer.visible === false || !layer.grid) return;
      let grid;
      try {
        grid = ANSIGrid.fromJSON(layer.grid);
      } catch {
        return;
      }
      const layerOpacity = clamp(layer.opacity ?? 1, 0, 1);
      for (let y = 0; y < grid.height; y += 1) {
        for (let x = 0; x < grid.width; x += 1) {
          const cell = grid.getCell(x, y);
          if (!cell || cell.empty) continue;
          const left = Math.floor(originX + x * scale);
          const top = Math.floor(originY + y * scale);
          const cellWidth = Math.max(1, Math.ceil(scale));
          const cellHeight = Math.max(1, Math.ceil(scale));
          if ((cell.bgAlpha ?? 1) > 0) {
            ctx.globalAlpha = layerOpacity * (cell.bgAlpha ?? 1);
            ctx.fillStyle = cell.bg;
            ctx.fillRect(left, top, cellWidth, cellHeight);
          }
          if ((cell.fgAlpha ?? 1) > 0) {
            ctx.globalAlpha = layerOpacity * (cell.fgAlpha ?? 1);
            ctx.fillStyle = cell.fg;
            const insetX = Math.max(0, Math.floor(cellWidth * 0.28));
            const insetY = Math.max(0, Math.floor(cellHeight * 0.18));
            ctx.fillRect(left + insetX, top + insetY, Math.max(1, cellWidth - insetX * 2), Math.max(1, cellHeight - insetY * 2));
          }
        }
      }
      ctx.globalAlpha = 1;
    });
  }

  showStartScreen() {
    this.stashActiveDocument();
    document.getElementById('startScreen').hidden = false;
    document.querySelector('.editor-layout').hidden = true;
    document.querySelector('.options-bar').hidden = true;
    document.querySelector('.status-bar').hidden = true;
    this.renderRecentProjects();
  }

  hideStartScreen() {
    document.getElementById('startScreen').hidden = true;
    document.querySelector('.editor-layout').hidden = false;
    document.querySelector('.options-bar').hidden = false;
    document.querySelector('.status-bar').hidden = false;
  }

  resizeCanvas(width, height) {
    const nextWidth = clamp(Math.floor(width || this.grid.width), 8, 240);
    const nextHeight = clamp(Math.floor(height || this.grid.height), 4, 120);
    this.layers.forEach((layer) => layer.grid.resize(nextWidth, nextHeight));
    this.grid = this.layers[this.activeLayerIndex].grid;
    this.lighting.points = (this.lighting.points || []).map((point) => this.normalizeLightPoint(point));
    this.syncGridRefs();
    this.touchActiveDocument();
    this.render();
    this.persistLocalProject();
  }

  bindCanvasResize() {
    document.querySelectorAll('.canvas-resize-handle').forEach((handle) => {
      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.history.capture();
        const edge = handle.dataset.edge;
        const originals = this.layers.map((layer) => layer.grid.clone());
        const start = {
          x: event.clientX,
          y: event.clientY,
          width: this.grid.width,
          height: this.grid.height,
        };
        handle.setPointerCapture(event.pointerId);

        const move = (moveEvent) => {
          const cellWidth = this.renderer.cellWidth * (this.zoom / 100);
          const cellHeight = this.renderer.cellHeight * (this.zoom / 100);
          const deltaX = Math.round((moveEvent.clientX - start.x) / cellWidth);
          const deltaY = Math.round((moveEvent.clientY - start.y) / cellHeight);
          const fromWest = edge.includes('w');
          const fromNorth = edge.includes('n');
          const width = clamp(start.width + (edge.includes('e') ? deltaX : fromWest ? -deltaX : 0), 8, 240);
          const height = clamp(start.height + (edge.includes('s') ? deltaY : fromNorth ? -deltaY : 0), 4, 120);
          const offsetX = fromWest ? width - start.width : 0;
          const offsetY = fromNorth ? height - start.height : 0;
          this.resizeLayersFromSnapshot(originals, width, height, offsetX, offsetY);
        };
        const finishResize = () => {
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', finishResize);
          handle.removeEventListener('pointercancel', finishResize);
          handle.removeEventListener('lostpointercapture', finishResize);
          this.touchActiveDocument();
          this.persistLocalProject();
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', finishResize);
        handle.addEventListener('pointercancel', finishResize);
        handle.addEventListener('lostpointercapture', finishResize);
      });
    });
  }

  resizeLayersFromSnapshot(originals, width, height, offsetX, offsetY) {
    this.layers.forEach((layer, index) => {
      const source = originals[index];
      const resized = new ANSIGrid(width, height);
      for (let y = 0; y < source.height; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
          const cell = source.getCell(x, y);
          if (!cell || cell.empty) continue;
          resized.setCell(x + offsetX, y + offsetY, { ...cell });
        }
      }
      layer.grid = resized;
    });
    this.grid = this.layers[this.activeLayerIndex].grid;
    if (offsetX || offsetY) {
      this.lighting.points = (this.lighting.points || []).map((point) => this.normalizeLightPoint({
        ...point,
        x: point.x + offsetX,
        y: point.y + offsetY,
      }));
    } else {
      this.lighting.points = (this.lighting.points || []).map((point) => this.normalizeLightPoint(point));
    }
    this.syncGridRefs();
    this.selection = { cells: new Set(), floating: false };
    this.selectionGesture = null;
    this.canvas.classList.remove('selection-dragging');
    this.touchActiveDocument();
    this.render();
  }

  generateRandomTexture() {
    this.history.capture();
    for (let y = 0; y < this.grid.height; y += 1) {
      for (let x = 0; x < this.grid.width; x += 1) {
        const density = Math.random();
        this.grid.setCell(x, y, {
          char: density > 0.9 ? '█' : density > 0.7 ? '▓' : density > 0.4 ? '▒' : ' ',
          fg: density > 0.7 ? '#3b82f6' : '#64748b',
          bg: density > 0.5 ? '#020617' : '#000000',
          brightness: density,
          density,
          empty: false,
        });
      }
    }
    this.render();
  }

  applyLayerEffect(type) {
    if (type === '3d-render') {
      this.lighting.volumeEnabled = true;
      this.lighting.enabled = true;
      this.lighting.mode = 'multi';
      this.openLightingPanel();
      this.setLightPlacement(true);
      this.updateLightingControls();
      this.touchActiveDocument();
      this.render();
      this.persistLocalProject();
      return;
    }

    this.history.capture();

    if (type === 'mirror-x' || type === 'mirror-y') {
      const mirrored = new ANSIGrid(this.grid.width, this.grid.height);
      for (let y = 0; y < this.grid.height; y += 1) {
        for (let x = 0; x < this.grid.width; x += 1) {
          const cell = this.grid.getCell(x, y);
          if (!cell || cell.empty) continue;
          const targetX = type === 'mirror-x' ? this.grid.width - 1 - x : x;
          const targetY = type === 'mirror-y' ? this.grid.height - 1 - y : y;
          mirrored.setCell(targetX, targetY, { ...cell });
        }
      }
      this.setActiveGrid(mirrored);
      this.render();
      return;
    }

    if (type === 'emboss') {
      const source = this.grid.clone();
      const result = source.clone();
      for (let y = 0; y < source.height; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
          const cell = source.getCell(x, y);
          if (!cell || cell.empty) continue;
          const lighting = this.surfaceLightingAt(source, x, y, 'emboss');
          const embossNormal = this.surfaceNormal(source, x, y, 1.8);
          const embossBias = embossNormal ? clamp((embossNormal.x + embossNormal.y) * 0.28, -0.22, 0.22) : 0;
          const shadow = clamp(lighting.shadow - embossBias, 0, 0.78);
          const highlight = clamp(lighting.highlight + embossBias, 0, 1.05);
          const patch = {};
          if ((cell.fgAlpha ?? 1) > 0) {
            patch.fg = mixColors(mixColors(cell.fg, '#000000', shadow), lighting.color, highlight);
          }
          if ((cell.bgAlpha ?? 1) > 0) {
            patch.bg = mixColors(mixColors(cell.bg, '#000000', shadow * 0.9), lighting.color, highlight * 0.45);
          }
          patch.brightness = clamp(cell.brightness + highlight - shadow, 0, 1);
          result.setCell(x, y, patch);
        }
      }
      this.setActiveGrid(result);
      this.render();
      return;
    }

    if (type === 'glow' || type === 'shadow') {
      const source = this.grid.clone();
      const result = new ANSIGrid(source.width, source.height);
      for (let y = 0; y < source.height; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
          const cell = source.getCell(x, y);
          if (!cell || cell.empty) continue;
          if (type === 'shadow') {
            result.setCell(x + 1, y + 1, {
              char: ' ',
              fg: '#000000',
              bg: '#000000',
              fgAlpha: 0,
              bgAlpha: 0.7,
              density: cell.density,
              brightness: 0,
              empty: false,
            });
          } else {
            for (let oy = -1; oy <= 1; oy += 1) {
              for (let ox = -1; ox <= 1; ox += 1) {
                if (ox === 0 && oy === 0) continue;
                const target = result.getCell(x + ox, y + oy);
                if (!target || !target.empty) continue;
                result.setCell(x + ox, y + oy, {
                  char: ' ',
                  fg: cell.fg,
                  bg: mixColors('#000000', cell.fg, 0.5),
                  fgAlpha: 0,
                  bgAlpha: 0.45,
                  density: 0.4,
                  brightness: 0.5,
                  empty: false,
                });
              }
            }
          }
        }
      }
      for (let y = 0; y < source.height; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
          const cell = source.getCell(x, y);
          if (cell && !cell.empty) result.setCell(x, y, { ...cell });
        }
      }
      this.setActiveGrid(result);
      this.render();
      return;
    }

    const transformColor = (color) => {
      const { r, g, b } = hexToRgb(color);
      if (type === 'invert') return rgbToHex(255 - r, 255 - g, 255 - b);
      if (type === 'grayscale') {
        const value = r * 0.299 + g * 0.587 + b * 0.114;
        return rgbToHex(value, value, value);
      }
      if (type === 'contrast') {
        const adjust = (value) => (value - 128) * 1.5 + 128;
        return rgbToHex(adjust(r), adjust(g), adjust(b));
      }
      if (type === 'color-shift') return rgbToHex(g, b, r);
      if (type === 'posterize') {
        const reduce = (value) => Math.round(value / 85) * 85;
        return rgbToHex(reduce(r), reduce(g), reduce(b));
      }
      if (type === 'sepia') {
        return rgbToHex(
          r * 0.393 + g * 0.769 + b * 0.189,
          r * 0.349 + g * 0.686 + b * 0.168,
          r * 0.272 + g * 0.534 + b * 0.131,
        );
      }
      if (type === 'neon') {
        const peak = Math.max(r, g, b);
        return rgbToHex(
          r === peak ? 255 : r * 0.25,
          g === peak ? 255 : g * 0.25,
          b === peak ? 255 : b * 0.25,
        );
      }
      return color;
    };

    const ditherSymbols = '.:-=+*#%@';
    for (let y = 0; y < this.grid.height; y += 1) {
      for (let x = 0; x < this.grid.width; x += 1) {
        const cell = this.grid.getCell(x, y);
        if (!cell || cell.empty) continue;
        const patch = {
          fg: transformColor(cell.fg),
          bg: transformColor(cell.bg),
        };
        if (type === 'dither') {
          const { r, g, b } = hexToRgb(cell.fg);
          const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
          const threshold = ((x & 1) + ((y & 1) * 2)) / 12 - 0.125;
          const density = clamp(luminance + threshold, 0, 1);
          patch.char = ditherSymbols[Math.round(density * (ditherSymbols.length - 1))];
          patch.density = density;
        }
        this.grid.setCell(x, y, patch);
      }
    }
    this.render();
  }

  updatePreview() {
    const preview = document.getElementById('previewText');
    if (preview) {
      preview.innerHTML = this.exporter.toHtml();
    }
  }

  updateRangeLabels() {
    const brushSizeValue = document.getElementById('brushSizeValue');
    if (brushSizeValue) brushSizeValue.textContent = String(this.brushSize);
  }

  updateStatus(point = null) {
    const status = document.getElementById('statusBar');
    if (!status) return;
    const toolNames = {
      pencil: 'Карандаш',
      move: 'Перемещение',
      'select-rect': 'Прямоугольное выделение',
      lasso: 'Лассо',
      'magic-select': 'Волшебное выделение',
      'magic-pencil': 'Волшебный карандаш',
      eraser: 'Ластик',
      fill: 'Заливка',
      eyedropper: 'Пипетка',
      line: 'Линия',
      rect: 'Рамка',
      'rect-fill': 'Заполненная рамка',
      ellipse: 'Эллипс',
      spray: 'Распылитель',
      text: 'Текст',
      pan: 'Рука',
      zoom: 'Масштаб',
    };
    const tool = toolNames[this.currentTool] || this.currentTool;
    const coords = point ? ` · X ${point.x + 1}, Y ${point.y + 1}` : '';
    status.textContent = `Готово · ${tool} · ${this.grid.width}x${this.grid.height} · ${this.zoom}%${coords}`;
  }

  setZoom(value) {
    if (value === 'fit') {
      this.zoomMode = 'fit';
      this.fitZoomToView();
      return;
    }
    this.zoomMode = 'manual';
    this.applyZoomValue(value);
  }

  applyZoomValue(value) {
    this.zoom = clamp(Math.round(value), 25, 400);
    const range = document.getElementById('zoomRange');
    const output = document.getElementById('zoomValue');
    if (range) {
      range.min = '25';
      range.max = '400';
      range.value = String(this.zoom);
    }
    if (output) output.textContent = this.zoomMode === 'fit' ? `Fit ${this.zoom}%` : `${this.zoom}%`;
    this.renderer.setZoom(this.zoom);
    this.updateLightMarkers();
    this.updateStatus(this.previewPoint);
  }

  zoomAtClientPoint(clientX, clientY, nextZoom) {
    const wrap = document.getElementById('canvasWrap');
    const before = this.canvas.getBoundingClientRect();
    const localX = clientX - before.left;
    const localY = clientY - before.top;
    const ratioX = before.width ? localX / before.width : 0.5;
    const ratioY = before.height ? localY / before.height : 0.5;
    const clampedZoom = clamp(nextZoom, 25, 400);
    if (clampedZoom === this.zoom) return;

    this.setZoom(clampedZoom);

    const after = this.canvas.getBoundingClientRect();
    const anchoredX = after.left + after.width * ratioX;
    const anchoredY = after.top + after.height * ratioY;
    wrap.scrollLeft += anchoredX - clientX;
    wrap.scrollTop += anchoredY - clientY;
  }

  fitZoomToView() {
    const wrap = document.getElementById('canvasWrap');
    if (!wrap || !this.grid.width || !this.grid.height) return;
    const canvasWidth = this.grid.width * this.renderer.cellWidth;
    const canvasHeight = this.grid.height * this.renderer.cellHeight;
    const availableWidth = Math.max(120, wrap.clientWidth - 72);
    const availableHeight = Math.max(120, wrap.clientHeight - 72);
    const fit = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight);
    const percent = clamp(Math.floor((fit * 100) / 5) * 5, 25, 400);
    this.applyZoomValue(percent);
  }

  onZoomWheel(event) {
    if (!event.ctrlKey && !event.metaKey && !event.altKey) return;
    event.preventDefault();

    const direction = event.deltaY < 0 ? 1 : -1;
    const step = Math.abs(event.deltaY) > 80 ? 20 : 10;
    this.zoomAtClientPoint(event.clientX, event.clientY, this.zoom + direction * step);
  }

  bindLightingPanel() {
    this.bindIfExists('lightingEnabled', 'change', (event) => {
      this.lighting.enabled = event.target.checked;
      this.touchActiveDocument();
      this.render();
    });
    this.bindIfExists('lightingMode', 'change', (event) => {
      this.lighting.mode = event.target.value;
      this.touchActiveDocument();
      this.scheduleAutosave();
    });
    this.bindIfExists('lightingVolume', 'change', (event) => {
      this.lighting.volumeEnabled = event.target.checked;
      this.lighting.enabled = this.lighting.enabled || event.target.checked;
      this.updateLightingControls();
      this.touchActiveDocument();
      this.render();
    });
    this.bindIfExists('lightingColor', 'input', (event) => {
      this.updateSelectedLightPatch({ color: event.target.value });
      this.render();
    });
    this.bindIfExists('lightingIntensity', 'input', (event) => {
      this.updateSelectedLightPatch({ intensity: Number(event.target.value) });
      this.render();
    });
    this.bindIfExists('lightingRadius', 'input', (event) => {
      this.updateSelectedLightPatch({ radius: Number(event.target.value) });
      this.render();
    });
    this.bindIfExists('lightingHeight', 'input', (event) => {
      this.updateSelectedLightPatch({ height: Number(event.target.value) });
      this.render();
    });
    this.bindIfExists('technicalIndicators', 'change', (event) => {
      this.showTechnicalIndicators = event.target.checked;
      localStorage.setItem('rigel-show-technical-indicators', String(this.showTechnicalIndicators));
      this.updateLightMarkers();
    });
    this.bindIfExists('deleteLightPointBtn', 'click', () => this.deleteSelectedLightPoint());
    this.bindIfExists('addLightPointBtn', 'click', () => {
      this.setLightPlacement(true);
    });
    this.bindIfExists('clearLightsBtn', 'click', () => {
      this.lighting.points = [];
      this.selectedLightId = null;
      this.lighting.enabled = false;
      this.setLightPlacement(false);
      this.updateLightingControls();
      this.touchActiveDocument();
      this.render();
    });
    this.bindIfExists('closeLightingBtn', 'click', () => {
      document.getElementById('lightingPanel').hidden = true;
      this.setLightPlacement(false);
      this.savePanelLayout();
    });
    this.bindIfExists('dockLightingBtn', 'click', () => this.toggleLightingDock());

    const panel = document.getElementById('lightingPanel');
    const handle = document.getElementById('lightingPanelHeader');
    let drag = null;
    handle?.addEventListener('pointerdown', (event) => {
      if (this.lighting.docked || event.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      drag = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
      handle.setPointerCapture(event.pointerId);
    });
    handle?.addEventListener('pointermove', (event) => {
      if (!drag) return;
      panel.style.left = `${clamp(event.clientX - drag.offsetX, 0, window.innerWidth - panel.offsetWidth)}px`;
      panel.style.top = `${clamp(event.clientY - drag.offsetY, 0, window.innerHeight - panel.offsetHeight)}px`;
    });
    handle?.addEventListener('pointerup', () => {
      drag = null;
      this.savePanelLayout();
    });
  }

  openLightingPanel() {
    const panel = document.getElementById('lightingPanel');
    panel.hidden = false;
    this.updateLightingControls();
    if (!this.lighting.docked && !panel.style.left) {
      panel.style.left = `${Math.max(100, window.innerWidth - 600)}px`;
      panel.style.top = '150px';
    }
    this.savePanelLayout();
    this.scheduleAutosave();
  }

  toggleLightingDock() {
    const panel = document.getElementById('lightingPanel');
    this.lighting.docked = !this.lighting.docked;
    panel.classList.toggle('docked', this.lighting.docked);
    document.getElementById('dockLightingBtn').textContent = this.lighting.docked ? '↗' : '◆';
    if (this.lighting.docked) {
      panel.style.left = '';
      panel.style.top = '';
      document.getElementById('rightDock').prepend(panel);
    } else {
      document.body.appendChild(panel);
      panel.style.left = `${Math.max(100, window.innerWidth - 600)}px`;
      panel.style.top = '150px';
    }
    this.attachPanelDrag(panel);
    this.savePanelLayout();
    this.touchActiveDocument();
  }

  normalizeLightPoint(point = {}) {
    return {
      id: point.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      x: clamp(Math.round(point.x ?? 0), 0, this.grid.width - 1),
      y: clamp(Math.round(point.y ?? 0), 0, this.grid.height - 1),
      color: point.color || this.lighting.color,
      intensity: Number(point.intensity ?? this.lighting.intensity),
      radius: Number(point.radius ?? this.lighting.radius),
      height: Number(point.height ?? this.lighting.height ?? 1.1),
    };
  }

  selectedLightPoint() {
    return this.lighting.points.find((point) => point.id === this.selectedLightId) || null;
  }

  updateSelectedLightPatch(patch) {
    const point = this.selectedLightPoint();
    if (point) {
      Object.assign(point, patch);
    } else {
      Object.assign(this.lighting, patch);
    }
    this.updateLightingControls();
    this.touchActiveDocument();
    this.scheduleAutosave();
  }

  selectLightPoint(id, { refreshMarkers = true } = {}) {
    this.selectedLightId = id;
    const point = this.selectedLightPoint();
    if (point) {
      this.lighting.color = point.color;
      this.lighting.intensity = point.intensity;
      this.lighting.radius = point.radius;
      this.lighting.height = point.height;
    }
    this.updateLightingControls();
    if (refreshMarkers) {
      this.updateLightMarkers();
    } else {
      document.querySelectorAll('.light-marker').forEach((marker) => {
        marker.classList.toggle('active', marker.dataset.lightId === id);
      });
    }
  }

  updateLightingControls() {
    const point = this.selectedLightPoint();
    const color = point?.color ?? this.lighting.color;
    const intensity = point?.intensity ?? this.lighting.intensity;
    const radius = point?.radius ?? this.lighting.radius;
    const height = point?.height ?? this.lighting.height ?? 1.1;
    const fields = [
      ['lightingColor', color],
      ['lightingIntensity', intensity],
      ['lightingRadius', radius],
      ['lightingHeight', height],
    ];
    fields.forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.value = String(value);
    });
    const indicatorToggle = document.getElementById('technicalIndicators');
    if (indicatorToggle) indicatorToggle.checked = this.showTechnicalIndicators;
    const enabledToggle = document.getElementById('lightingEnabled');
    if (enabledToggle) enabledToggle.checked = this.lighting.enabled;
    const volumeToggle = document.getElementById('lightingVolume');
    if (volumeToggle) volumeToggle.checked = this.lighting.volumeEnabled === true;
    const modeSelect = document.getElementById('lightingMode');
    if (modeSelect) modeSelect.value = this.lighting.mode;
    const selectedControls = document.getElementById('selectedLightControls');
    if (selectedControls) selectedControls.hidden = !point;
    const selectedName = document.getElementById('selectedLightName');
    if (selectedName && point) {
      const index = this.lighting.points.findIndex((candidate) => candidate.id === point.id) + 1;
      selectedName.textContent = `Точка света ${index} · X ${point.x + 1}, Y ${point.y + 1}`;
    }
  }

  deleteSelectedLightPoint() {
    if (!this.selectedLightId) return;
    this.lighting.points = this.lighting.points.filter((point) => point.id !== this.selectedLightId);
    this.selectedLightId = this.lighting.points[0]?.id || null;
    if (!this.lighting.points.length) {
      this.lighting.enabled = false;
      this.setLightPlacement(false);
    }
    this.updateLightingControls();
    this.touchActiveDocument();
    this.render();
  }

  addLightPoint(point) {
    if (this.lighting.mode === 'single') this.lighting.points = [];
    const nextPoint = this.normalizeLightPoint({
      x: point.x,
      y: point.y,
      color: this.lighting.color,
      intensity: this.lighting.intensity,
      radius: this.lighting.radius,
      height: this.lighting.height,
    });
    this.lighting.points.push(nextPoint);
    this.selectedLightId = nextPoint.id;
    this.lighting.enabled = true;
    document.getElementById('lightingEnabled').checked = true;
    this.setLightPlacement(this.lighting.mode === 'multi');
    this.updateLightingControls();
    this.touchActiveDocument();
    this.render();
  }

  setLightPlacement(active) {
    this.placingLight = active;
    document.getElementById('addLightPointBtn')?.classList.toggle('active', active);
    this.canvas.classList.toggle('placing-light', active);
    if (active) {
      document.getElementById('statusBar').textContent = 'Щелкните на холсте, чтобы поставить источник света · Esc для отмены';
    }
  }

  updateLightMarkers() {
    const markerLayer = document.getElementById('lightMarkers');
    if (!markerLayer) return;
    markerLayer.innerHTML = '';
    if (!this.lighting.enabled || !this.showTechnicalIndicators) return;
    this.lighting.points = this.lighting.points.map((point) => this.normalizeLightPoint(point));
    this.lighting.points.forEach((point, index) => {
      const centerLeft = (point.x + 0.5) * this.renderer.cellWidth * (this.zoom / 100);
      const centerTop = (point.y + 0.5) * this.renderer.cellHeight * (this.zoom / 100);
      const radius = Number(point.radius ?? this.lighting.radius);
      const boundary = document.createElement('span');
      boundary.className = `light-radius${point.id === this.selectedLightId ? ' active' : ''}`;
      boundary.style.left = `${centerLeft}px`;
      boundary.style.top = `${centerTop}px`;
      boundary.style.width = `${radius * 2 * this.renderer.cellWidth * (this.zoom / 100)}px`;
      boundary.style.height = `${radius * 2 * this.renderer.cellHeight * (this.zoom / 100)}px`;
      boundary.style.borderColor = point.color;
      markerLayer.appendChild(boundary);

      const marker = document.createElement('button');
      marker.className = `light-marker${point.id === this.selectedLightId ? ' active' : ''}`;
      marker.dataset.lightId = point.id;
      marker.type = 'button';
      marker.title = `Источник ${index + 1} · перетащить или выбрать`;
      marker.style.left = `${centerLeft}px`;
      marker.style.top = `${centerTop}px`;
      marker.style.borderColor = point.color;
      marker.addEventListener('click', (event) => {
        event.stopPropagation();
        this.selectLightPoint(point.id);
      });
      marker.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.selectLightPoint(point.id, { refreshMarkers: false });
        marker.setPointerCapture(event.pointerId);
        const move = (moveEvent) => {
          const nextPoint = this.getCanvasPoint(moveEvent);
          point.x = nextPoint.x;
          point.y = nextPoint.y;
          const nextLeft = (point.x + 0.5) * this.renderer.cellWidth * (this.zoom / 100);
          const nextTop = (point.y + 0.5) * this.renderer.cellHeight * (this.zoom / 100);
          marker.style.left = `${nextLeft}px`;
          marker.style.top = `${nextTop}px`;
          boundary.style.left = `${nextLeft}px`;
          boundary.style.top = `${nextTop}px`;
          this.updateLightingControls();
        };
        const up = () => {
          marker.removeEventListener('pointermove', move);
          marker.removeEventListener('pointerup', up);
          this.touchActiveDocument();
          this.render();
          this.scheduleAutosave();
        };
        marker.addEventListener('pointermove', move);
        marker.addEventListener('pointerup', up);
      });
      markerLayer.appendChild(marker);
    });
  }

  bindLayerEvents() {
    this.bindIfExists('addLayerBtn', 'click', () => this.addLayer());
    this.bindIfExists('duplicateLayerBtn', 'click', () => this.duplicateLayer());
    this.bindIfExists('deleteLayerBtn', 'click', () => this.deleteLayer());
    this.bindIfExists('layerUpBtn', 'click', () => this.moveLayer(1));
    this.bindIfExists('layerDownBtn', 'click', () => this.moveLayer(-1));
    this.bindIfExists('layerOpacity', 'input', (event) => {
      this.layers[this.activeLayerIndex].opacity = Number(event.target.value) / 100;
      document.getElementById('layerOpacityValue').textContent = `${event.target.value}%`;
      this.render();
    });

    const list = document.getElementById('layerList');
    list?.addEventListener('click', (event) => {
      const item = event.target.closest('.layer-item');
      if (!item) return;
      const index = Number(item.dataset.index);
      if (event.target.closest('.layer-visibility')) {
        this.layers[index].visible = !this.layers[index].visible;
        this.render();
        return;
      }
      this.selectLayer(index);
    });
    list?.addEventListener('dblclick', (event) => {
      const item = event.target.closest('.layer-item');
      if (!item) return;
      const index = Number(item.dataset.index);
      const name = prompt('Имя слоя', this.layers[index].name);
      if (name?.trim()) {
        this.layers[index].name = name.trim();
        this.updateLayers();
        this.scheduleAutosave();
      }
    });
    list?.addEventListener('dragstart', (event) => {
      const item = event.target.closest('.layer-item');
      if (!item) return;
      this.draggedLayerId = this.layers[Number(item.dataset.index)]?.id;
      item.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', this.draggedLayerId || '');
    });
    list?.addEventListener('dragover', (event) => {
      const item = event.target.closest('.layer-item');
      if (!item) return;
      event.preventDefault();
      list.querySelectorAll('.drop-target').forEach((target) => target.classList.remove('drop-target'));
      item.classList.add('drop-target');
    });
    list?.addEventListener('drop', (event) => {
      const item = event.target.closest('.layer-item');
      if (!item || !this.draggedLayerId) return;
      event.preventDefault();
      this.history.capture();
      const sourceIndex = this.layers.findIndex((layer) => layer.id === this.draggedLayerId);
      const targetId = this.layers[Number(item.dataset.index)]?.id;
      if (sourceIndex < 0 || targetId === this.draggedLayerId) {
        this.draggedLayerId = null;
        this.updateLayers();
        return;
      }
      const [layer] = this.layers.splice(sourceIndex, 1);
      const targetIndex = this.layers.findIndex((candidate) => candidate.id === targetId);
      const rect = item.getBoundingClientRect();
      const placeAbove = event.clientY < rect.top + rect.height / 2;
      const insertIndex = targetIndex < 0 ? this.layers.length : targetIndex + (placeAbove ? 1 : 0);
      this.layers.splice(insertIndex, 0, layer);
      this.activeLayerIndex = this.layers.findIndex((candidate) => candidate.id === layer.id);
      this.grid = layer.grid;
      this.draggedLayerId = null;
      this.syncGridRefs();
      this.render();
    });
    list?.addEventListener('dragend', () => {
      this.draggedLayerId = null;
      list.querySelectorAll('.dragging,.drop-target').forEach((item) => item.classList.remove('dragging', 'drop-target'));
    });
  }

  bindPanelLayout() {
    const dock = document.getElementById('rightDock');
    if (!dock) return;
    dock.querySelectorAll('[data-panel-id]').forEach((panel) => this.attachPanelDrag(panel));
    dock.addEventListener('dragover', (event) => {
      if (!this.draggedPanel) return;
      event.preventDefault();
      const target = event.target.closest('#rightDock > [data-panel-id]');
      if (target && target !== this.draggedPanel) {
        const rect = target.getBoundingClientRect();
        dock.insertBefore(this.draggedPanel, event.clientY < rect.top + rect.height / 2 ? target : target.nextSibling);
      }
    });
    this.restorePanelLayout();
  }

  attachPanelDrag(panel) {
    if (!panel || panel.dataset.dragBound === 'true') return;
    const handle = panel.querySelector(':scope > h2, :scope > .floating-panel-header');
    if (!handle) return;
    panel.dataset.dragBound = 'true';
    handle.draggable = true;
    handle.addEventListener('dragstart', (event) => {
      if (panel.parentElement?.id !== 'rightDock') {
        event.preventDefault();
        return;
      }
      event.stopPropagation();
      this.draggedPanel = panel;
      panel.classList.add('panel-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', panel.dataset.panelId || '');
    });
    handle.addEventListener('dragend', (event) => {
      event.stopPropagation();
      this.draggedPanel = null;
      panel.classList.remove('panel-dragging');
      this.savePanelLayout();
    });
  }

  savePanelLayout() {
    const lightingPanel = document.getElementById('lightingPanel');
    const order = [...document.querySelectorAll('#rightDock > [data-panel-id]')].map((panel) => panel.dataset.panelId);
    const layout = {
      order,
      lighting: {
        docked: lightingPanel?.parentElement?.id === 'rightDock',
        hidden: lightingPanel?.hidden === true,
        left: lightingPanel?.style.left || '',
        top: lightingPanel?.style.top || '',
      },
    };
    localStorage.setItem('rigel-panel-layout', JSON.stringify(layout));
  }

  restorePanelLayout() {
    try {
      const saved = JSON.parse(localStorage.getItem('rigel-panel-layout') || 'null');
      const order = Array.isArray(saved) ? saved : saved?.order || [];
      const dock = document.getElementById('rightDock');
      const lightingPanel = document.getElementById('lightingPanel');
      if (lightingPanel && !Array.isArray(saved) && saved?.lighting) {
        lightingPanel.hidden = saved.lighting.hidden === true;
        this.lighting.docked = saved.lighting.docked === true;
        lightingPanel.classList.toggle('docked', this.lighting.docked);
        document.getElementById('dockLightingBtn').textContent = this.lighting.docked ? '↗' : '◆';
        if (this.lighting.docked) {
          lightingPanel.style.left = '';
          lightingPanel.style.top = '';
          dock.appendChild(lightingPanel);
        } else {
          document.body.appendChild(lightingPanel);
          lightingPanel.style.left = saved.lighting.left || lightingPanel.style.left;
          lightingPanel.style.top = saved.lighting.top || lightingPanel.style.top;
        }
        this.attachPanelDrag(lightingPanel);
      }
      order.forEach((id) => {
        const panel = id === 'lighting'
          ? document.getElementById('lightingPanel')
          : dock.querySelector(`[data-panel-id="${id}"]`);
        if (!panel) return;
        if (id === 'lighting' && !this.lighting.docked) return;
        dock.appendChild(panel);
      });
    } catch {
      // Ignore a stale layout.
    }
  }

  resetPanelLayout() {
    localStorage.removeItem('rigel-panel-layout');
    const dock = document.getElementById('rightDock');
    const lightingPanel = document.getElementById('lightingPanel');
    if (lightingPanel) {
      this.lighting.docked = false;
      lightingPanel.classList.remove('docked');
      lightingPanel.hidden = true;
      document.body.appendChild(lightingPanel);
      lightingPanel.style.left = '';
      lightingPanel.style.top = '';
      document.getElementById('dockLightingBtn').textContent = '◆';
    }
    ['color', 'layers'].forEach((id) => {
      const panel = dock.querySelector(`[data-panel-id="${id}"]`);
      if (panel) dock.appendChild(panel);
    });
  }

  createLayer(name, grid = new ANSIGrid(this.grid.width, this.grid.height)) {
    return {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      name,
      type: 'pixel',
      locked: false,
      visible: true,
      opacity: 1,
      grid,
    };
  }

  toggleActiveLayerLock() {
    const layer = this.layers[this.activeLayerIndex];
    if (!layer) return;
    layer.locked = !layer.locked;
    this.updateLayers();
    this.updateStatus();
    this.scheduleAutosave();
  }

  selectLayer(index) {
    if (!this.layers[index]) return;
    this.activeLayerIndex = index;
    this.grid = this.layers[index].grid;
    this.history.undoStack = [];
    this.history.redoStack = [];
    this.syncGridRefs();
    this.updateLayers();
    this.updateStatus();
    this.scheduleAutosave();
  }

  addLayer() {
    this.history.capture();
    const layer = this.createLayer(`Слой ${this.layers.length + 1}`);
    this.layers.splice(this.activeLayerIndex + 1, 0, layer);
    this.selectLayer(this.activeLayerIndex + 1);
    this.render();
  }

  duplicateLayer() {
    this.history.capture();
    const source = this.layers[this.activeLayerIndex];
    const layer = this.createLayer(`${source.name} копия`, source.grid.clone());
    layer.opacity = source.opacity;
    this.layers.splice(this.activeLayerIndex + 1, 0, layer);
    this.selectLayer(this.activeLayerIndex + 1);
    this.render();
  }

  copyActiveLayer() {
    const layer = this.layers[this.activeLayerIndex];
    this.layerClipboard = {
      name: layer.name,
      type: layer.type || 'pixel',
      locked: layer.locked === true,
      visible: layer.visible,
      opacity: layer.opacity,
      grid: layer.grid.toSparseJSON(),
    };
    document.getElementById('statusBar').textContent = 'Слой скопирован';
  }

  pasteLayer() {
    if (!this.layerClipboard) return;
    this.history.capture();
    const source = this.layerClipboard;
    const grid = ANSIGrid.fromJSON(source.grid);
    if (grid.width !== this.grid.width || grid.height !== this.grid.height) grid.resize(this.grid.width, this.grid.height);
    const layer = this.createLayer(`${source.name} копия`, grid);
    layer.visible = source.visible;
    layer.opacity = source.opacity;
    layer.type = source.type || 'pixel';
    layer.locked = source.locked === true;
    this.layers.splice(this.activeLayerIndex + 1, 0, layer);
    this.selectLayer(this.activeLayerIndex + 1);
    this.render();
  }

  deleteLayer() {
    if (this.layers.length === 1) {
      this.clearCanvas();
      return;
    }
    this.history.capture();
    this.layers.splice(this.activeLayerIndex, 1);
    this.selectLayer(Math.min(this.activeLayerIndex, this.layers.length - 1));
    this.render();
  }

  moveLayer(direction) {
    const target = this.activeLayerIndex + direction;
    if (target < 0 || target >= this.layers.length) return;
    this.history.capture();
    [this.layers[this.activeLayerIndex], this.layers[target]] = [this.layers[target], this.layers[this.activeLayerIndex]];
    this.activeLayerIndex = target;
    this.render();
  }

  updateLayers() {
    const layerList = document.getElementById('layerList');
    if (!layerList) return;
    layerList.innerHTML = '';
    [...this.layers].reverse().forEach((layer, reverseIndex) => {
      const index = this.layers.length - 1 - reverseIndex;
      const item = document.createElement('div');
      item.className = `layer-item${index === this.activeLayerIndex ? ' active' : ''}`;
      item.dataset.index = String(index);
      item.draggable = true;
      item.innerHTML = `
        <button class="layer-visibility" type="button" title="Видимость">${layer.visible ? '●' : '○'}</button>
        <canvas class="layer-thumbnail" width="41" height="31" aria-label="Миниатюра слоя"></canvas>
        <span class="layer-name"></span>
        <span class="layer-lock" title="${layer.locked ? 'Слой заблокирован' : 'Слой разблокирован'}">${layer.locked ? '■' : ''}</span>
      `;
      item.querySelector('.layer-name').textContent = layer.name;
      this.renderLayerThumbnail(item.querySelector('.layer-thumbnail'), layer.grid);
      layerList.appendChild(item);
    });
    const opacity = Math.round(this.layers[this.activeLayerIndex].opacity * 100);
    const range = document.getElementById('layerOpacity');
    if (range) range.value = String(opacity);
    const output = document.getElementById('layerOpacityValue');
    if (output) output.textContent = `${opacity}%`;
  }

  renderLayerThumbnail(canvas, grid) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const tile = 4;
    for (let y = 0; y < canvas.height; y += tile) {
      for (let x = 0; x < canvas.width; x += tile) {
        ctx.fillStyle = ((x / tile + y / tile) & 1) ? '#20252a' : '#111519';
        ctx.fillRect(x, y, tile, tile);
      }
    }
    const scale = Math.min((canvas.width - 2) / grid.width, (canvas.height - 2) / grid.height);
    const width = grid.width * scale;
    const height = grid.height * scale;
    const originX = (canvas.width - width) / 2;
    const originY = (canvas.height - height) / 2;
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const cell = grid.getCell(x, y);
        if (!cell || cell.empty) continue;
        const left = Math.floor(originX + x * scale);
        const top = Math.floor(originY + y * scale);
        const cellWidth = Math.max(1, Math.ceil(scale));
        const cellHeight = Math.max(1, Math.ceil(scale));
        if ((cell.bgAlpha ?? 1) > 0) {
          ctx.globalAlpha = cell.bgAlpha ?? 1;
          ctx.fillStyle = cell.bg;
          ctx.fillRect(left, top, cellWidth, cellHeight);
        }
        if ((cell.fgAlpha ?? 1) > 0) {
          ctx.globalAlpha = cell.fgAlpha ?? 1;
          ctx.fillStyle = cell.fg;
          ctx.fillRect(left + Math.floor(cellWidth / 3), top, Math.max(1, Math.ceil(cellWidth / 3)), cellHeight);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  copyToClipboard(text, message) {
    const status = document.getElementById('statusBar');
    const updateStatus = (value) => {
      if (status) status.textContent = value;
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => updateStatus(message)).catch(() => this.copyToClipboardFallback(text, updateStatus));
      return;
    }
    this.copyToClipboardFallback(text, updateStatus);
  }

  copyToClipboardFallback(text, updateStatus) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);
    textarea.select();
    try {
      const successful = document.execCommand('copy');
      updateStatus(successful ? 'ANSI скопирован' : 'Буфер обмена недоступен');
    } catch {
      updateStatus('Буфер обмена недоступен');
    }
    document.body.removeChild(textarea);
  }

  downloadFile(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async importFile(file) {
    if (!file) return;
    const text = await file.text();
    this.history.capture();
    if (file.name.toLowerCase().endsWith('.json')) {
      const data = JSON.parse(text);
      this.applyProjectData(data);
      return;
    }
    const lines = text.split(/\r?\n/).slice(0, this.grid.height);
    lines.forEach((line, y) => {
      line.split('').forEach((char, x) => {
        if (char === ' ') return;
        this.grid.setCell(x, y, {
          char,
          fg: this.fgColor,
          bg: this.bgColor,
          brightness: 0.8,
          density: 0.8,
          empty: false,
        });
      });
    });
    this.render();
  }

  async importImage(file) {
    if (!file) return;
    this.clearPendingImageImport();
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      this.pendingImageImport = { image, file, url };
      document.getElementById('imageImportPreview').src = url;
      document.getElementById('imageImportWidth').value = String(this.grid.width);
      document.getElementById('imageImportHeight').value = String(this.grid.height);
      document.getElementById('imageImportDialog').showModal();
      document.getElementById('imageInput').value = '';
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      document.getElementById('imageInput').value = '';
      document.getElementById('statusBar').textContent = 'Не удалось прочитать изображение';
    };
    image.src = url;
  }

  clearPendingImageImport() {
    if (this.pendingImageImport?.url) URL.revokeObjectURL(this.pendingImageImport.url);
    this.pendingImageImport = null;
    const preview = document.getElementById('imageImportPreview');
    if (preview) preview.removeAttribute('src');
  }

  applyPendingImageImport() {
    if (!this.pendingImageImport) return;
    const { image, file } = this.pendingImageImport;
    const width = clamp(Math.floor(Number(document.getElementById('imageImportWidth').value)), 8, 240);
    const height = clamp(Math.floor(Number(document.getElementById('imageImportHeight').value)), 4, 120);
    const fit = document.getElementById('imageImportFit').value;
    const charsetName = document.getElementById('imageImportCharset').value;
    const layerMode = document.getElementById('imageImportLayerMode').value;
    const dither = document.getElementById('imageImportDither').checked;
    const transparent = document.getElementById('imageImportTransparent').checked;
    const resizeCanvas = document.getElementById('imageImportResizeCanvas').checked;
    const charsets = {
      ascii: ' .:-=+*#%@',
      blocks: ' ░▒▓█',
      halfblocks: ' ▁▂▃▄▅▆▇█',
    };
    const characters = Array.from(charsets[charsetName] || charsets.ascii);

    this.history.capture();
    if (resizeCanvas) this.resizeCanvas(width, height);
    const targetWidth = Math.min(width, this.grid.width);
    const targetHeight = Math.min(height, this.grid.height);
    let targetGrid;
    if (layerMode === 'new') {
      const layer = this.createLayer(file.name.replace(/\.[^.]+$/, '') || `Изображение ${this.layers.length + 1}`);
      this.layers.splice(this.activeLayerIndex + 1, 0, layer);
      this.activeLayerIndex += 1;
      this.grid = layer.grid;
      targetGrid = layer.grid;
    } else {
      this.grid.clear();
      targetGrid = this.grid;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    let drawWidth = targetWidth;
    let drawHeight = targetHeight;
    let drawX = 0;
    let drawY = 0;
    if (fit !== 'stretch') {
      const scale = fit === 'cover'
        ? Math.max(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight)
        : Math.min(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
      drawWidth = image.naturalWidth * scale;
      drawHeight = image.naturalHeight * scale;
      drawX = (targetWidth - drawWidth) / 2;
      drawY = (targetHeight - drawHeight) / 2;
    }
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    const pixels = ctx.getImageData(0, 0, targetWidth, targetHeight).data;
    const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    for (let y = 0; y < targetHeight; y += 1) {
      for (let x = 0; x < targetWidth; x += 1) {
        const offset = (y * targetWidth + x) * 4;
        const alpha = pixels[offset + 3] / 255;
        if (alpha <= 0.03) continue;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        let luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        if (dither) luminance = clamp(luminance + (bayer[y % 4][x % 4] / 15 - 0.5) * 0.16, 0, 1);
        const density = 1 - luminance;
        const char = characters[Math.round(density * (characters.length - 1))];
        const fgAlpha = char === ' ' ? 0 : alpha;
        const bgAlpha = transparent ? 0 : alpha;
        if (fgAlpha <= 0 && bgAlpha <= 0) continue;
        targetGrid.setCell(x, y, {
          char,
          fg: rgbToHex(r, g, b),
          bg: this.bgColor,
          brightness: luminance,
          density,
          fgAlpha,
          bgAlpha,
          empty: false,
        });
      }
    }
    this.syncGridRefs();
    this.clearPendingImageImport();
    document.getElementById('imageImportDialog').close();
    this.render();
  }

  exportImage(format) {
    const composite = this.applyLighting(this.composeLayers());
    const canvas = document.createElement('canvas');
    const renderer = new Renderer(canvas, composite);
    renderer.setLayers(this.layers
      .filter((layer) => layer.visible && layer.opacity > 0)
      .map((layer) => ({ grid: this.applyLighting(layer.grid), opacity: layer.opacity })));
    renderer.resize();
    renderer.render();

    let output = canvas;
    if (format === 'jpeg') {
      output = document.createElement('canvas');
      output.width = canvas.width;
      output.height = canvas.height;
      const ctx = output.getContext('2d');
      ctx.fillStyle = '#070b0f';
      ctx.fillRect(0, 0, output.width, output.height);
      ctx.drawImage(canvas, 0, 0);
    }
    const mime = `image/${format}`;
    const extension = format === 'jpeg' ? 'jpg' : format;
    const activeDocument = this.documents.find((item) => item.id === this.activeDocumentId);
    const filename = `${this.projectName}-${activeDocument?.name || 'art'}.${extension}`;
    output.toBlob((blob) => {
      if (blob) this.downloadFile(blob, filename);
    }, mime, format === 'jpeg' ? 0.92 : undefined);
  }

  serializeProject() {
    this.stashActiveDocument();
    return {
      version: 4,
      id: this.projectId,
      name: this.projectName,
      activeDocumentId: this.activeDocumentId,
      documents: this.documents.map((document) => ({
        id: document.id,
        name: document.name,
        snapshot: document.snapshot,
      })),
      layers: this.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        type: layer.type || 'pixel',
        locked: layer.locked === true,
        visible: layer.visible,
        opacity: layer.opacity,
        grid: layer.grid.toSparseJSON(),
      })),
      activeLayerIndex: this.activeLayerIndex,
      lighting: this.lighting,
      palette: this.palette,
      settings: {
        fgColor: this.fgColor,
        bgColor: this.bgColor,
        fgTransparent: this.fgTransparent,
        bgTransparent: this.bgTransparent,
        symbol: this.symbol,
        textValue: this.textValue,
        brushMode: this.brushMode,
        brushCharset: this.brushCharset,
        brushLevel: this.brushLevel,
        brushSize: this.brushSize,
        brushSmoothing: this.brushSmoothing,
        magicTolerance: this.magicTolerance,
        magicContiguous: this.magicContiguous,
        zoomMode: this.zoomMode,
        zoom: this.zoom,
      },
    };
  }

  downloadProject() {
    const project = this.serializeProject();
    this.persistLocalProject();
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json;charset=utf-8' });
    this.downloadFile(blob, `${this.projectName}.rigel.json`);
    const status = document.getElementById('statusBar');
    if (status) status.textContent = 'Проект сохранен в файл';
  }

  async loadProjectFile(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      this.history.capture();
      this.applyProjectData(data);
      this.persistLocalProject();
      document.querySelector('.document-name').textContent = file.name;
      document.getElementById('statusBar').textContent = 'Проект загружен';
    } catch (error) {
      document.getElementById('statusBar').textContent = 'Не удалось загрузить проект';
      console.error(error);
    } finally {
      document.getElementById('projectInput').value = '';
    }
  }

  applyProjectData(data) {
    this.history.undoStack = [];
    this.history.redoStack = [];
    this.projectId = data.id || this.projectId;
    this.projectName = data.name || this.projectName;
    if (Array.isArray(data.documents) && data.documents.length) {
      this.documents = data.documents.map((document) => ({
        id: document.id,
        name: document.name,
        snapshot: document.snapshot,
        undoStack: [],
        redoStack: [],
      }));
      this.activeDocumentId = data.activeDocumentId || this.documents[0].id;
      const active = this.documents.find((document) => document.id === this.activeDocumentId) || this.documents[0];
      this.activeDocumentId = active.id;
      this.loadDocumentSnapshot(active.snapshot);
    } else if (Array.isArray(data.layers) && data.layers.length) {
      this.layers = data.layers.map((layer, index) => ({
        id: layer.id || `${Date.now()}-${index}`,
        name: layer.name || `Слой ${index + 1}`,
        type: layer.type || 'pixel',
        locked: layer.locked === true,
        visible: layer.visible !== false,
        opacity: layer.opacity ?? 1,
        grid: ANSIGrid.fromJSON(layer.grid),
      }));
      this.activeLayerIndex = clamp(data.activeLayerIndex ?? 0, 0, this.layers.length - 1);
      this.grid = this.layers[this.activeLayerIndex].grid;
      this.activeDocumentId = crypto.randomUUID?.() || `${Date.now()}-tab`;
      this.documents = [{ id: this.activeDocumentId, name: 'Вкладка 1', snapshot: this.snapshotDocument(), undoStack: [], redoStack: [] }];
    } else {
      this.grid = ANSIGrid.fromJSON(data.grid || data);
      this.layers = [this.createLayer('Слой 1', this.grid)];
      this.activeLayerIndex = 0;
      this.activeDocumentId = crypto.randomUUID?.() || `${Date.now()}-tab`;
      this.documents = [{ id: this.activeDocumentId, name: 'Вкладка 1', snapshot: this.snapshotDocument(), undoStack: [], redoStack: [] }];
    }
    this.lighting = { ...this.lighting, ...(data.lighting || {}) };
    this.lighting.points = (this.lighting.points || []).map((point) => this.normalizeLightPoint(point));
    this.selectedLightId = this.lighting.points[0]?.id || null;
    this.palette = data.palette || this.palette;
    this.refreshPalettePresets('current');
    const settings = data.settings || {};
    this.fgColor = settings.fgColor || this.fgColor;
    this.bgColor = settings.bgColor || this.bgColor;
    this.fgTransparent = settings.fgTransparent === true;
    this.bgTransparent = settings.bgTransparent === true;
    this.symbol = settings.symbol || this.symbol;
    this.textValue = settings.textValue || this.textValue;
    const brushModes = ['free', 'smart', 'blocks', 'halfblocks', 'shading', 'dots', 'ascii', 'letters', 'binary', 'hatch', 'box'];
    this.brushMode = brushModes.includes(settings.brushMode) ? settings.brushMode : this.brushMode;
    this.brushCharset = settings.brushCharset || this.brushCharset;
    this.brushLevel = settings.brushLevel ?? this.brushLevel;
    this.brushSize = settings.brushSize || this.brushSize;
    this.brushSmoothing = settings.brushSmoothing ?? this.brushSmoothing;
    this.magicTolerance = settings.magicTolerance ?? this.magicTolerance;
    this.magicContiguous = settings.magicContiguous ?? this.magicContiguous;
    this.zoomMode = settings.zoomMode || this.zoomMode;
    this.zoom = settings.zoom || this.zoom;
    this.syncGridRefs();

    document.getElementById('fgColor').value = this.fgColor;
    document.getElementById('bgColor').value = this.bgColor;
    document.getElementById('symbolInput').value = this.symbol;
    document.getElementById('textInput').value = this.textValue;
    document.getElementById('brushMode').value = this.brushMode;
    document.getElementById('brushCharset').value = this.brushCharset;
    document.getElementById('brushLevel').value = String(Math.round(this.brushLevel * 100));
    document.getElementById('brushSize').value = String(this.brushSize);
    document.getElementById('brushSmoothing').checked = this.brushSmoothing;
    document.getElementById('magicTolerance').value = String(this.magicTolerance);
    document.getElementById('magicToleranceValue').textContent = String(this.magicTolerance);
    document.getElementById('magicContiguous').checked = this.magicContiguous;
    const lightingEnabled = document.getElementById('lightingEnabled');
    if (lightingEnabled) lightingEnabled.checked = this.lighting.enabled;
    const lightingMode = document.getElementById('lightingMode');
    if (lightingMode) lightingMode.value = this.lighting.mode;
    const lightingVolume = document.getElementById('lightingVolume');
    if (lightingVolume) lightingVolume.checked = this.lighting.volumeEnabled === true;
    const lightingColor = document.getElementById('lightingColor');
    if (lightingColor) lightingColor.value = this.lighting.color;
    const lightingIntensity = document.getElementById('lightingIntensity');
    if (lightingIntensity) lightingIntensity.value = String(this.lighting.intensity);
    const lightingRadius = document.getElementById('lightingRadius');
    if (lightingRadius) lightingRadius.value = String(this.lighting.radius);
    const lightingHeight = document.getElementById('lightingHeight');
    if (lightingHeight) lightingHeight.value = String(this.lighting.height ?? 1.1);
    this.updateLightingControls();
    this.seedPalette();
    this.updateBrushOptionVisibility();
    this.updateRangeLabels();
    document.querySelector('.document-name').textContent = `${this.projectName}.rigel.json`;
    this.renderDocumentTabs();
    this.setZoom(this.zoomMode === 'fit' ? 'fit' : this.zoom);
    this.render();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    const app = new App();
    window.rigelApp = app;

    const saved = localStorage.getItem('rigel-project');
    if (saved) {
      try {
        app.applyProjectData(JSON.parse(saved));
      } catch (error) {
        console.error('Saved project restore failed', error);
        localStorage.removeItem('rigel-project');
      }
    }

    const savedPalette = localStorage.getItem('rigel-palette');
    if (savedPalette) {
      try {
        const palette = JSON.parse(savedPalette);
        if (Array.isArray(palette)) {
          app.palette = palette;
          app.seedPalette();
        } else {
          localStorage.removeItem('rigel-palette');
        }
      } catch (error) {
        console.error('Saved palette restore failed', error);
        localStorage.removeItem('rigel-palette');
      }
    }

    app.enableAutosave();
    app.showStartScreen();
  } catch (error) {
    console.error('Rigel startup failed', error);
    localStorage.removeItem('rigel-panel-layout');
    const status = document.getElementById('statusBar');
    if (status) status.textContent = 'Сбой запуска. Сброшена компоновка, обновите страницу.';
  }
});
