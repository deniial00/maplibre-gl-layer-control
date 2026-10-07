import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { LayerControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

maplibregl.setWorkerUrl(workerUrl);

const landUseColors: ExpressionSpecification = [
  'match', ['get', 'kind'],
  'park', '#59a14f',
  ['residential', 'commercial'], '#4e79a7',
  '#f2c94c',
];

const alternateLandUseColors: ExpressionSpecification = [
  'match', ['get', 'kind'],
  'park', '#76b7b2',
  ['residential', 'commercial'], '#b07aa1',
  '#edc949',
];

const roadColors: ExpressionSpecification = [
  'case',
  ['==', ['get', 'kind'], 'highway'], '#e15759',
  ['>', ['get', 'lanes'], 2], '#f28e2b',
  '#79706e',
];

// Local data and a background-only style keep the example independent of tile services.
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f4f1ea' } }],
  },
  center: [0, 0],
  zoom: 13.5,
});
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

const fillMode = document.querySelector<HTMLSelectElement>('#fill-mode')!;
const lineMode = document.querySelector<HTMLSelectElement>('#line-mode')!;
const status = document.querySelector<HTMLElement>('#status')!;

map.on('load', () => {
  map.addSource('land-use', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature', properties: { kind: 'park' },
          geometry: { type: 'Polygon', coordinates: [[[-0.018, 0.002], [-0.018, 0.014], [-0.002, 0.014], [-0.002, 0.002], [-0.018, 0.002]]] },
        },
        {
          type: 'Feature', properties: { kind: 'residential' },
          geometry: { type: 'Polygon', coordinates: [[[0.002, 0.002], [0.002, 0.014], [0.018, 0.014], [0.018, 0.002], [0.002, 0.002]]] },
        },
        {
          type: 'Feature', properties: { kind: 'commercial' },
          geometry: { type: 'Polygon', coordinates: [[[-0.018, -0.014], [-0.018, -0.002], [-0.002, -0.002], [-0.002, -0.014], [-0.018, -0.014]]] },
        },
        {
          type: 'Feature', properties: { kind: 'industrial' },
          geometry: { type: 'Polygon', coordinates: [[[0.002, -0.014], [0.002, -0.002], [0.018, -0.002], [0.018, -0.014], [0.002, -0.014]]] },
        },
      ],
    },
  });
  map.addLayer({
    id: 'land-use', type: 'fill', source: 'land-use',
    paint: { 'fill-color': landUseColors, 'fill-opacity': 0.8, 'fill-outline-color': '#ffffff' },
  });

  map.addSource('roads', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature', properties: { kind: 'highway', lanes: 4 },
          geometry: { type: 'LineString', coordinates: [[-0.022, 0], [0.022, 0]] },
        },
        {
          type: 'Feature', properties: { kind: 'avenue', lanes: 3 },
          geometry: { type: 'LineString', coordinates: [[0, -0.018], [0, 0.018]] },
        },
        {
          type: 'Feature', properties: { kind: 'local', lanes: 1 },
          geometry: { type: 'LineString', coordinates: [[-0.022, -0.018], [0.022, 0.018]] },
        },
      ],
    },
  });
  map.addLayer({
    id: 'roads', type: 'line', source: 'roads',
    paint: { 'line-color': roadColors, 'line-width': 5 },
  });

  map.addSource('landmarks', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }],
    },
  });
  map.addLayer({
    id: 'landmarks', type: 'circle', source: 'landmarks',
    paint: { 'circle-color': '#7b5ea7', 'circle-radius': 10, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
  });

  map.addControl(new LayerControl({
    collapsed: false,
    layers: ['land-use', 'roads', 'landmarks'],
    panelWidth: 350,
  }), 'top-right');

  const updateStatus = (): void => {
    status.textContent = `Fill: ${fillMode.selectedOptions[0].text}. Lines: ${lineMode.selectedOptions[0].text}.`;
  };
  fillMode.addEventListener('change', () => {
    const color = fillMode.value === 'plain'
      ? '#4e79a7'
      : fillMode.value === 'alternate' ? alternateLandUseColors : landUseColors;
    map.setPaintProperty('land-use', 'fill-color', color);
    updateStatus();
  });
  lineMode.addEventListener('change', () => {
    map.setPaintProperty('roads', 'line-color', lineMode.value === 'plain' ? '#79706e' : roadColors);
    updateStatus();
  });
  fillMode.disabled = false;
  lineMode.disabled = false;
  updateStatus();
});
