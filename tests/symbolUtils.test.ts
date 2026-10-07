import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  createLayerSymbolSVG,
  darkenColor,
  getLayerSymbolStyle,
  getLayerSymbolStyleFromSpec,
} from "../src/lib/utils/symbolUtils";

function makeMap(
  layerType: string,
  runtimePaint: Record<string, unknown>,
  stylePaint: Record<string, unknown> = runtimePaint,
): MapLibreMap {
  const layer = { id: "preview", type: layerType, paint: stylePaint };
  return {
    getPaintProperty: (_layerId: string, property: string) =>
      runtimePaint[property],
    getStyle: () => ({ layers: [layer] }),
  } as unknown as MapLibreMap;
}

describe("createLayerSymbolSVG line styles", () => {
  it("preserves the exact default line SVG when no dasharray is set", () => {
    expect(createLayerSymbolSVG("line", "#7c3aed")).toBe(
      `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
    <line x1="2" y1="8" x2="14" y2="8"
          stroke="#7c3aed" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
    );
    expect(createLayerSymbolSVG("line", "#7c3aed", { dasharray: [] })).toBe(
      createLayerSymbolSVG("line", "#7c3aed"),
    );
  });

  it("scales a dasharray to fit the preview line", () => {
    const svg = createLayerSymbolSVG("line", "#7c3aed", {
      dasharray: [3, 2],
    });

    expect(svg).toContain('stroke-dasharray="4.5 3"');
    expect(svg).toContain('stroke-linecap="butt"');
  });

  it("does not scale short dash patterns above the preview stroke width", () => {
    const svg = createLayerSymbolSVG("line", "#7c3aed", {
      dasharray: [1, 1],
    });

    expect(svg).toContain('stroke-dasharray="2 2"');
  });
});

describe("createLayerSymbolSVG circle styles", () => {
  it("preserves the default border when no stroke color is set", () => {
    expect(createLayerSymbolSVG("circle", "#14b8a6")).toBe(
      `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="5" fill="#14b8a6"
            stroke="${darkenColor("#14b8a6", 0.3)}" stroke-width="1"/>
  </svg>`,
    );
  });

  it("uses an explicit border color or disables the border", () => {
    const bordered = createLayerSymbolSVG("circle", "#14b8a6", {
      strokeColor: "#ffffff",
    });
    const borderless = createLayerSymbolSVG("circle", "#14b8a6", {
      strokeColor: null,
    });

    expect(bordered).toContain('stroke="#ffffff" stroke-width="1"');
    expect(borderless).toContain('stroke="none"');
    expect(borderless).not.toContain("stroke-width");
  });
});

describe("getLayerSymbolStyle", () => {
  it("extracts the first literal dasharray from runtime expressions", () => {
    expect(
      getLayerSymbolStyle(
        makeMap("line", { "line-dasharray": ["literal", [3, 2]] }),
        "preview",
        "line",
      ),
    ).toEqual({ dasharray: [3, 2] });

    expect(
      getLayerSymbolStyle(
        makeMap("line", {
          "line-dasharray": [
            "step",
            ["zoom"],
            ["literal", [1, 1]],
            10,
            ["literal", [3, 2]],
          ],
        }),
        "preview",
        "line",
      ),
    ).toEqual({ dasharray: [1, 1] });
  });

  it("ignores invalid or all-zero dash patterns", () => {
    expect(
      getLayerSymbolStyle(
        makeMap("line", { "line-dasharray": [0, 0] }),
        "preview",
        "line",
      ),
    ).toEqual({});
    expect(
      getLayerSymbolStyle(
        makeMap("line", { "line-dasharray": [2, -1] }),
        "preview",
        "line",
      ),
    ).toEqual({});
  });

  it("falls back to the style definition for a circle border color", () => {
    expect(
      getLayerSymbolStyle(
        makeMap("circle", {}, { "circle-stroke-color": "#ffffff" }),
        "preview",
        "circle",
      ),
    ).toEqual({ strokeColor: "#ffffff" });
  });

  it("treats a literal zero circle stroke width as no border", () => {
    expect(
      getLayerSymbolStyle(
        makeMap("circle", {
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 0,
        }),
        "preview",
        "circle",
      ),
    ).toEqual({ strokeColor: null });
  });

  it("does not interpret a stroke-width expression's zoom stop as zero", () => {
    expect(
      getLayerSymbolStyle(
        makeMap("circle", {
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            0,
            10,
            2,
          ],
        }),
        "preview",
        "circle",
      ),
    ).toEqual({ strokeColor: "#ffffff" });
  });

  it("normalizes a circle border color expression", () => {
    expect(
      getLayerSymbolStyle(
        makeMap("circle", {
          "circle-stroke-color": [
            "case",
            true,
            "rgb(255, 255, 255)",
            "#000000",
          ],
        }),
        "preview",
        "circle",
      ),
    ).toEqual({ strokeColor: "#ffffff" });
  });
});

describe("getLayerSymbolStyleFromSpec", () => {
  it("resolves the line dasharray from a layer specification", () => {
    expect(
      getLayerSymbolStyleFromSpec({
        id: "rail",
        type: "line",
        source: "rail-source",
        paint: {
          "line-color": "#7c3aed",
          "line-width": 2,
          "line-dasharray": [3, 2],
        },
      }),
    ).toEqual({ dasharray: [3, 2] });
  });
});
