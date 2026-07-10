const STAGES = [
  ['reading', 'Reading project...', 10],
  ['assets', 'Loading assets...', 24],
  ['scene', 'Building scene...', 48],
  ['plugins', 'Initializing plugins...', 66],
  ['effects', 'Compiling effects...', 82],
  ['finalizing', 'Finalizing...', 96],
];

export class ProjectLoader {
  constructor(workerUrl = new URL('../workers/projectLoaderWorker.js', import.meta.url)) {
    this.workerUrl = workerUrl;
    this.worker = null;
    this.cancelled = false;
    this.rejectCurrent = null;
  }

  cancel() {
    this.cancelled = true;
    this.worker?.terminate();
    this.worker = null;
    if (this.rejectCurrent) {
      this.rejectCurrent(new DOMException('Loading cancelled', 'AbortError'));
      this.rejectCurrent = null;
    }
  }

  async loadFile(file, { onProgress } = {}) {
    this.cancel();
    this.cancelled = false;
    onProgress?.({ stage: STAGES[0][1], progress: 0, fileName: file?.name || 'project' });

    if (typeof Worker === 'undefined') {
      return this.loadFileFallback(file, { onProgress });
    }

    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerUrl, { type: 'module' });
      this.worker = worker;
      this.rejectCurrent = reject;
      worker.onmessage = (event) => {
        const message = event.data || {};
        if (message.type === 'progress') onProgress?.(message);
        if (message.type === 'done') {
          worker.terminate();
          if (this.worker === worker) this.worker = null;
          this.rejectCurrent = null;
          resolve(message.data);
        }
        if (message.type === 'error') {
          worker.terminate();
          if (this.worker === worker) this.worker = null;
          this.rejectCurrent = null;
          reject(new Error(message.message || 'Project load failed'));
        }
      };
      worker.onerror = (error) => {
        worker.terminate();
        if (this.worker === worker) this.worker = null;
        this.rejectCurrent = null;
        reject(error);
      };
      worker.postMessage({ type: 'load', file });
    });
  }

  async loadFileFallback(file, { onProgress } = {}) {
    const tick = () => new Promise((resolve) => requestAnimationFrame(resolve));
    for (const [, stage, progress] of STAGES.slice(0, 2)) {
      if (this.cancelled) throw new DOMException('Loading cancelled', 'AbortError');
      onProgress?.({ type: 'progress', stage, progress, fileName: file?.name || 'project' });
      await tick();
    }
    const text = await file.text();
    onProgress?.({ type: 'progress', stage: STAGES[2][1], progress: STAGES[2][2], fileName: file?.name || 'project' });
    await tick();
    const data = JSON.parse(text);
    for (const [, stage, progress] of STAGES.slice(3)) {
      if (this.cancelled) throw new DOMException('Loading cancelled', 'AbortError');
      onProgress?.({ type: 'progress', stage, progress, fileName: file?.name || 'project' });
      await tick();
    }
    return data;
  }
}
