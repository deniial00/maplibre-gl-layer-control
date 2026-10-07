import { describe, expect, it } from "vitest";
import type { LayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import {
  createLayerSymbolSVG,
  getLayerColor,
  getLayerColorFromSpec,
} from "../src/lib/utils/symbolUtils";

type ColorLayerType = "fill" | "line" | "circle";

type TestLayer = {
  id: string;
  type: ColorLayerType;
  source: string;
  paint: Record<string, unknown>;
};

function makeLayer(
  type: ColorLayerType,
  paint: Record<string, unknown>,
): LayerSpecification {
  const layer: TestLayer = { id: "layer-1", type, source: "source-1", paint };
  return layer as unknown as LayerSpecification;
}

function makeMap(
  layer: LayerSpecification,
  runtimePaint: Record<string, unknown> = {},
): MapLibreMap {
  const paint = new Map(Object.entries(runtimePaint));
  const map = {
    getPaintProperty(_layerId: string, property: string) {
      return paint.get(property);
    },
    getStyle() {
      return { layers: [layer] };
    },
  };
  return map as unknown as MapLibreMap;
}

function expectSymbolColor(
  type: ColorLayerType,
  color: string | null,
  expected: string,
): void {
  const container = document.createElement("div");
  container.innerHTML = createLayerSymbolSVG(type, color);
  const selector = type === "line" ? "line" : type === "circle" ? "circle" : "rect";
  const attribute = type === "line" ? "stroke" : "fill";
  expect(container.querySelector(selector)?.getAttribute(attribute)).toBe(expected);
}

describe("layer color symbols", () => {
  it("renders named and functional CSS colors for fill, line, and circle layers", () => {
    const examples: Array<{
      layer: LayerSpecification;
      type: ColorLayerType;
      expected: string;
    }> = [
      { layer: makeLayer("fill", { "fill-color": "red" }), type: "fill", expected: "#ff0000" },
      {
        layer: makeLayer("line", { "line-color": "hsl(120, 60%, 40%)" }),
        type: "line",
        expected: "#29a329",
      },
      {
        layer: makeLayer("circle", { "circle-color": "rebeccapurple" }),
        type: "circle",
        expected: "#663399",
      },
    ];

    for (const { layer, type, expected } of examples) {
      const color = getLayerColorFromSpec(layer);
      expect(color).toBe(expected);
      expect(getLayerColor(makeMap(layer), layer.id, type)).toBe(expected);
      expectSymbolColor(type, color, expected);
    }
  });

  it("extracts only result colors from case, match, and interpolate expressions", () => {
    const expressions: Array<{ expression: unknown[]; expected: string }> = [
      {
        expression: ["match", ["get", "category"], "red", "rebeccapurple", "#ff0000"],
        expected: "#663399",
      },
      {
        expression: [
          "case",
          ["==", ["get", "blue"], "red"],
          "rebeccapurple",
          "#ff0000",
        ],
        expected: "#663399",
      },
      {
        expression: [
          "interpolate",
          ["linear"],
          ["get", "red"],
          0,
          "rebeccapurple",
          10,
          "#ff0000",
        ],
        expected: "#663399",
      },
      {
        expression: [
          "case",
          ["==", ["get", "kind"], "blue"],
          ["match", ["get", "category"], "red", "rebeccapurple", "#ff0000"],
          "#00ff00",
        ],
        expected: "#663399",
      },
      {
        expression: [
          "case",
          ["==", ["get", "kind"], "red"],
          "invalid",
          ["==", ["get", "kind"], "blue"],
          "rebeccapurple",
          "#ff0000",
        ],
        expected: "#663399",
      },
    ];

    for (const { expression, expected } of expressions) {
      const layer = makeLayer("fill", { "fill-color": expression });
      const color = getLayerColorFromSpec(layer);
      expect(color).toBe(expected);
      expect(getLayerColor(makeMap(layer), layer.id, "fill")).toBe(expected);
      expectSymbolColor("fill", color, expected);
    }
  });

  it("continues past invalid runtime and primary colors while preserving precedence", () => {
    const runtimeFallback = makeLayer("fill", { "fill-color": "red" });
    expect(
      getLayerColor(
        makeMap(runtimeFallback, { "fill-color": "invalid" }),
        runtimeFallback.id,
        "fill",
      ),
    ).toBe("#ff0000");

    const secondaryColor = makeLayer("fill", {
      "fill-color": "invalid",
      "fill-outline-color": "rebeccapurple",
    });
    expect(getLayerColorFromSpec(secondaryColor)).toBe("#663399");
    expect(getLayerColor(makeMap(secondaryColor), secondaryColor.id, "fill")).toBe(
      "#663399",
    );

    const runtimePrecedence = makeLayer("fill", { "fill-color": "red" });
    expect(
      getLayerColor(
        makeMap(runtimePrecedence, { "fill-color": "rebeccapurple" }),
        runtimePrecedence.id,
        "fill",
      ),
    ).toBe("#663399");
  });

  it("returns null when no color parses and renders the existing gray fallback", () => {
    const layer = makeLayer("fill", {
      "fill-color": "invalid",
      "fill-outline-color": ["case", ["==", ["get", "red"], "blue"], "invalid"],
    });

    expect(getLayerColorFromSpec(layer)).toBeNull();
    expect(getLayerColor(makeMap(layer), layer.id, "fill")).toBeNull();
    expectSymbolColor("fill", null, "#888888");
  });
});
