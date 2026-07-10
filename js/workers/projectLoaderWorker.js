const stages = [
  ['Reading project...', 10],
  ['Loading assets...', 24],
  ['Building scene...', 48],
  ['Initializing plugins...', 66],
  ['Compiling effects...', 82],
  ['Finalizing...', 96],
];

const progress = (stage, value, fileName) => {
  postMessage({ type: 'progress', stage, progress: value, fileName });
};

self.onmessage = async (event) => {
  const { type, file } = event.data || {};
  if (type !== 'load' || !file) return;
  const fileName = file.name || 'project';
  try {
    progress(stages[0][0], stages[0][1], fileName);
    const text = await file.text();
    progress(stages[1][0], stages[1][1], fileName);
    await new Promise((resolve) => setTimeout(resolve, 0));
    progress(stages[2][0], stages[2][1], fileName);
    const data = JSON.parse(text);
    for (const [stage, value] of stages.slice(3)) {
      progress(stage, value, fileName);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    postMessage({ type: 'done', data });
  } catch (error) {
    postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
