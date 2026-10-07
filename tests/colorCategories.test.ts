import { describe, expect, it } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { LayerControl } from '../src/lib/core/LayerControl';
import { getLayerColorCategories } from '../src/lib/utils/symbolUtils';

function makeMap(paint: Record<string, unknown>, specPaint: Record<string, unknown> = {}) {
  return {
    getPaintProperty: (_id: string, property: string) => paint[property],
    getStyle: () => ({ layers: [{ id: 'test', type: 'fill', paint: specPaint }] }),
    getLayer: () => ({ id: 'test', type: 'fill' }),
  } as unknown as MapLibreMap;
}

const match = ['match', ['get', 'type'], 'park', '#0a0', ['lake', 'river'], 'rgb(0,102,255)', '#ccc'];

describe('getLayerColorCategories', () => {
  it('preserves match order, grouped labels, normalized colors, and the fallback', () => {
    expect(getLayerColorCategories(makeMap({ 'fill-color': match }), 'test', 'fill')).toEqual({
      property: 'fill-color',
      categories: [
        { label: 'park', title: 'park', color: '#00aa00' },
        { label: 'lake, river', title: 'lake, river', color: '#0066ff' },
        { label: 'Other', title: 'Other', color: '#cccccc' },
      ],
    });
  });

  it('formats simple case comparisons while retaining the full condition tooltip', () => {
    const conditions = [['==', ['get', 'kind'], 'highway'], ['>', ['get', 'lanes'], 2]];
    const result = getLayerColorCategories(makeMap({
      'line-color': ['case', conditions[0], '#f00', conditions[1], '#fa0', '#999'],
    }), 'test', 'line');
    expect(result?.categories.map(({ label }) => label)).toEqual(['kind = highway', 'lanes > 2', 'Other']);
    expect(result?.categories[0].title).toBe(JSON.stringify(conditions[0]));
  });

  it('formats presence conditions and uses JSON for complex conditions', () => {
    const complex = ['all', ['has', 'kind'], ['>', ['get', 'lanes'], 2]];
    const result = getLayerColorCategories(makeMap({
      'line-color': ['case', ['has', 'kind'], '#f00', ['!', ['has', 'kind']], '#0f0', complex, '#00f', '#999'],
    }), 'test', 'line');
    expect(result?.categories.map(({ label }) => label)).toEqual([
      'has kind', 'no kind', `${JSON.stringify(complex).slice(0, 39)}…`, 'Other',
    ]);
    expect(result?.categories[2].title).toBe(JSON.stringify(complex));
  });

  it('uses text-color when icon-color has no categories', () => {
    expect(getLayerColorCategories(makeMap({ 'text-color': match }), 'test', 'symbol')?.property).toBe('text-color');
  });

  it('uses the first qualifying color property', () => {
    expect(getLayerColorCategories(makeMap({ 'icon-color': match, 'text-color': match }), 'test', 'symbol')?.property).toBe('icon-color');
  });

  it.each(['runtime', 'spec'])('excludes patterned fills from %s paint', (source) => {
    const pattern = { 'fill-pattern': 'texture' };
    const map = makeMap({ 'fill-color': match, ...(source === 'runtime' ? pattern : {}) }, source === 'spec' ? pattern : {});
    expect(getLayerColorCategories(map, 'test', 'fill')).toBeNull();
  });

  it.each([
    { value: ['interpolate', ['linear'], ['zoom'], 5, '#000', 10, match] },
    { value: ['step', ['zoom'], '#000', 10, match] },
    { value: '#ff0000' },
    { value: ['match', ['get', 'type'], '#ccc'] },
  ])('rejects non-top-level categories or an expression without classes: $value', ({ value }) => {
    expect(getLayerColorCategories(makeMap({ 'fill-color': value }), 'test', 'fill')).toBeNull();
  });

  it('renders unsupported category outputs as gray rather than parsing CSS or nested expressions', () => {
    const result = getLayerColorCategories(makeMap({
      'fill-color': ['match', ['get', 'type'], 'named', 'red', 'hsl', 'hsl(0,100%,50%)', 'nested', ['rgb', 0, 0, 0], '#ccc'],
    }), 'test', 'fill');
    expect(result?.categories.map(({ color }) => color)).toEqual([null, null, null, '#cccccc']);
  });

  it('truncates labels to 40 characters but keeps the complete tooltip', () => {
    const label = 'x'.repeat(50);
    const result = getLayerColorCategories(makeMap({ 'fill-color': ['match', ['get', 'type'], label, '#f00', '#ccc'] }), 'test', 'fill');
    expect(result?.categories[0]).toEqual({ label: `${'x'.repeat(39)}…`, title: label, color: '#ff0000' });
  });

  it('falls back to spec paint when runtime paint is missing or throws', () => {
    const map = makeMap({}, { 'fill-color': match });
    expect(getLayerColorCategories(map, 'test', 'fill')?.categories[0].label).toBe('park');
    map.getPaintProperty = () => { throw new Error('Unavailable runtime property'); };
    expect(getLayerColorCategories(map, 'test', 'fill')?.categories[0].label).toBe('park');
  });

  it.each(['circle', 'fill-extrusion'])('supports %s categories', (type) => {
    expect(getLayerColorCategories(makeMap({ [`${type}-color`]: match }), 'test', type)?.property).toBe(`${type}-color`);
  });

  it.each(['heatmap', 'background', 'raster', 'custom-raster'])('leaves %s legends unchanged', (type) => {
    expect(getLayerColorCategories(makeMap({ [`${type}-color`]: match }), 'test', type)).toBeNull();
  });
});

type CategoryControl = {
  map: MapLibreMap;
  panel: HTMLElement;
  state: { expandedCategoryLayers: Set<string> };
  addLayerItem(id: string, state: { visible: boolean; opacity: number; name: string }): void;
  refreshLayerCategories(): void;
  updateFillSymbols(): void;
};

describe('category row transitions', () => {
  it('preserves expansion, row identity, and an open editor through live category and plain-color changes', () => {
    const paint: Record<string, unknown> = { 'fill-color': match };
    const control = new LayerControl({ enableDragAndDrop: false, showStyleEditor: false }) as unknown as CategoryControl;
    control.map = makeMap(paint);
    control.panel = document.createElement('div');
    control.addLayerItem('test', { visible: true, opacity: 1, name: 'Test layer' });
    const item = control.panel.firstElementChild as HTMLElement;
    const row = item.querySelector('.layer-control-row');
    const toggle = item.querySelector<HTMLButtonElement>('.layer-control-categories-toggle')!;
    expect(item.querySelector<HTMLElement>('.layer-control-categories')!.hidden).toBe(true);
    expect(toggle.getAttribute('aria-label')).toBe('Show categories for Test layer');
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    control.updateFillSymbols();
    expect(Array.from(item.querySelectorAll('.layer-control-symbol rect'), (rect) => rect.getAttribute('fill')))
      .toEqual(['#e15759', '#4e79a7', '#59a14f', '#f2c94c']);
    const legend = item.querySelector('.layer-control-categories');
    control.refreshLayerCategories();
    expect(item.querySelector('.layer-control-categories')).toBe(legend);
    const editor = document.createElement('div');
    editor.className = 'layer-control-style-editor';
    const input = document.createElement('input');
    input.value = 'unsaved editor value';
    editor.append(input);
    item.append(editor);
    paint['fill-color'] = ['match', ['get', 'type'], 'forest', '#090', '#ccc'];
    control.refreshLayerCategories();
    expect(item.querySelector('.layer-control-row')).toBe(row);
    expect(item.querySelector('.layer-control-category-label')?.textContent).toBe('forest');
    expect(item.querySelector<HTMLElement>('.layer-control-categories')!.hidden).toBe(false);
    expect(item.querySelectorAll('.layer-control-categories-toggle')).toHaveLength(1);
    expect(item.querySelectorAll('.layer-control-categories')).toHaveLength(1);
    item.querySelector<HTMLButtonElement>('.layer-control-categories-toggle')!.click();
    expect(item.querySelector<HTMLElement>('.layer-control-categories')!.hidden).toBe(true);
    paint['fill-color'] = '#088';
    control.refreshLayerCategories();
    expect(item.querySelector('.layer-control-categories-toggle')).toBeNull();
    expect(item.querySelector('.layer-control-categories')).toBeNull();
    expect(item.querySelector('.layer-control-symbol rect')?.getAttribute('fill')).toBe('#008888');
    expect(item.classList.contains('categories-expanded')).toBe(false);
    paint['fill-color'] = '#246';
    control.updateFillSymbols();
    expect(item.querySelector('.layer-control-symbol rect')?.getAttribute('fill')).toBe('#224466');
    expect(editor.parentElement).toBe(item);
    expect(input.value).toBe('unsaved editor value');
    paint['fill-color'] = match;
    control.refreshLayerCategories();
    expect(item.querySelector<HTMLElement>('.layer-control-categories')!.hidden).toBe(true);
    expect(control.state.expandedCategoryLayers.has('test')).toBe(false);
  });
});
