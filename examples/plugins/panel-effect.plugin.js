import { createPanelPlugin } from '/js/sdk/rigelPluginSdk.js';

export default createPanelPlugin({
  id: 'example.panel.effects',
  name: 'Example Effects Panel',
  group: 'Panels',
  tags: ['panel', 'effects', 'example'],
  title: 'Example Effects',
  docked: true,
  render({ body, api }) {
    const wrap = document.createElement('div');
    wrap.className = 'plugin-stack';

    const title = document.createElement('p');
    title.textContent = 'Layer effects';

    const select = document.createElement('select');
    api.effects.listLayerEffects().forEach((effect) => {
      const option = document.createElement('option');
      option.value = effect.id;
      option.textContent = effect.name || effect.id;
      select.appendChild(option);
    });

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.textContent = 'Apply';
    apply.addEventListener('click', () => {
      if (select.value) api.effects.applyLayer(select.value);
    });

    wrap.append(title, select, apply);
    body.appendChild(wrap);
  },
});
