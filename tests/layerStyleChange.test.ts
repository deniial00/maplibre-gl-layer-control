import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { LayerControl } from "../src/lib/core/LayerControl";

/**
 * Private control members exposed through a typed seam for DOM tests.
 */
type TestableLayerControl = {
  map: unknown;
  state: {
    activeStyleEditor: string | null;
    originalStyles: Map<string, { paint: Record<string, unknown> }>;
  };
  styleEditors: Map<string, HTMLElement>;
  createSliderControl(
    container: HTMLElement,
    layerId: string,
    property: string,
    label: string,
    initialValue: number,
    min: number,
    max: number,
    step: number,
  ): void;
  createColorControl(
    container: HTMLElement,
    layerId: string,
    property: string,
    label: string,
    initialValue: string,
  ): void;
  addFillControls(container: HTMLElement, layerId: string): void;
  resetLayerStyle(layerId: string): void;
};

/**
 * Build a LayerControl wired to a minimal in-memory mock map.
 */
function makeControl(
  options: ConstructorParameters<typeof LayerControl>[0] = {},
  images: Record<string, { sdf: boolean }> = {},
  includeImageApi = true,
) {
  const paintProps = new Map<string, unknown>();
  const key = (id: string, prop: string) => `${id}::${prop}`;

  const mockMap = {
    getPaintProperty: (id: string, prop: string) =>
      paintProps.get(key(id, prop)),
    setPaintProperty: (id: string, prop: string, value: unknown) => {
      paintProps.set(key(id, prop), value);
    },
    getStyle: () => ({ layers: [] }),
    getLayer: () => ({ type: "fill" }),
    ...(includeImageApi
      ? {
          listImages: () => Object.keys(images),
          getImage: (id: string) => {
            const image = images[id];
            return image
              ? {
                  data: {
                    width: 2,
                    height: 2,
                    data: new Uint8Array(16),
                  },
                  pixelRatio: 1,
                  sdf: image.sdf,
                }
              : undefined;
          },
        }
      : {}),
  };

  const control = new LayerControl(options);
  const internals = control as unknown as TestableLayerControl;
  internals.map = mockMap;

  return { control, internals, paintProps, key };
}

describe("onLayerStyleChange callback", () => {
  it("fires when a slider control is changed, reporting the active editor's layer id", () => {
    const onLayerStyleChange = vi.fn();
    const { control, internals, paintProps, key } = makeControl({
      onLayerStyleChange,
    });

    // The editor was opened for the outer layer id, but the slider edits a
    // native sub-layer id internally — the callback must report the outer id.
    internals.state.activeStyleEditor = "geolibre-layer";
    const container = document.createElement("div");
    internals.createSliderControl(
      container,
      "native-primary",
      "raster-brightness-max",
      "Brightness Max",
      1,
      -1,
      1,
      0.05,
    );

    const slider = container.querySelector(
      ".style-control-slider",
    ) as HTMLInputElement;
    slider.value = "0.4";
    slider.dispatchEvent(new Event("input", { bubbles: true }));

    // The map was updated...
    expect(paintProps.get(key("native-primary", "raster-brightness-max"))).toBe(
      0.4,
    );
    // ...and the host was notified with the outer layer id, not the native one.
    expect(onLayerStyleChange).toHaveBeenCalledTimes(1);
    expect(onLayerStyleChange).toHaveBeenCalledWith(
      "geolibre-layer",
      "raster-brightness-max",
      0.4,
    );
  });

  it("fires when a color control is changed", () => {
    const onLayerStyleChange = vi.fn();
    const { internals, control } = makeControl({ onLayerStyleChange });

    internals.state.activeStyleEditor = "layer-1";
    const container = document.createElement("div");
    internals.createColorControl(
      container,
      "layer-1",
      "fill-color",
      "Fill Color",
      "#ff0000",
    );

    const picker = container.querySelector(
      ".style-control-color-picker",
    ) as HTMLInputElement;
    picker.value = "#00ff00";
    picker.dispatchEvent(new Event("input", { bubbles: true }));

    expect(onLayerStyleChange).toHaveBeenCalledWith(
      "layer-1",
      "fill-color",
      "#00ff00",
    );
  });

  it("does not throw or notify when no callback is provided", () => {
    const { internals } = makeControl();

    internals.state.activeStyleEditor = "layer-1";
    const container = document.createElement("div");
    internals.createSliderControl(
      container,
      "layer-1",
      "raster-opacity",
      "Opacity",
      1,
      0,
      1,
      0.05,
    );

    const slider = container.querySelector(
      ".style-control-slider",
    ) as HTMLInputElement;
    slider.value = "0.5";
    expect(() =>
      slider.dispatchEvent(new Event("input", { bubbles: true })),
    ).not.toThrow();
  });
});

describe("refreshStyleEditor", () => {
  it("re-reads an open editor's slider from the current map paint", () => {
    const { control, internals, paintProps, key } = makeControl();

    const editor = document.createElement("div");
    internals.state.activeStyleEditor = "layer-1";
    internals.styleEditors.set("layer-1", editor);
    internals.createSliderControl(
      editor,
      "layer-1",
      "raster-brightness-max",
      "Brightness Max",
      1,
      -1,
      1,
      0.05,
    );

    const slider = editor.querySelector(
      ".style-control-slider",
    ) as HTMLInputElement;
    expect(slider.value).toBe("1");

    // An external editor (e.g. a sidebar) writes a new value to the map.
    paintProps.set(key("layer-1", "raster-brightness-max"), 0.3);
    control.refreshStyleEditor("layer-1");

    expect(slider.value).toBe("0.3");
    const display = slider.parentElement?.querySelector(".style-control-value");
    expect(display?.textContent).toBe("0.30");
  });
  it("normalizes refreshed colors and preserves them for invalid map values", () => {
    const { control, internals, paintProps, key } = makeControl();
    const editor = document.createElement("div");
    internals.state.activeStyleEditor = "layer-1";
    internals.styleEditors.set("layer-1", editor);
    internals.createColorControl(
      editor,
      "layer-1",
      "fill-color",
      "Fill Color",
      "#ff0000",
    );
    const picker = editor.querySelector(
      ".style-control-color-picker",
    ) as HTMLInputElement;
    const display = editor.querySelector(
      ".style-control-color-value",
    ) as HTMLInputElement;

    paintProps.set(key("layer-1", "fill-color"), "rebeccapurple");
    control.refreshStyleEditor("layer-1");
    expect(picker.value).toBe("#663399");
    expect(display.value).toBe("#663399");

    paintProps.set(key("layer-1", "fill-color"), "invalid");
    control.refreshStyleEditor("layer-1");
    expect(picker.value).toBe("#663399");
    expect(display.value).toBe("#663399");
  });

  it("is a no-op when the editor is not open", () => {
    const { control } = makeControl();
    expect(() => control.refreshStyleEditor("missing")).not.toThrow();
  });
});

describe("color control initialization", () => {
  it("creates a picker for a valid color and omits it for an invalid color", () => {
    const valid = makeControl();
    valid.paintProps.set(valid.key("layer-1", "fill-color"), "red");
    const validContainer = document.createElement("div");
    valid.internals.addFillControls(validContainer, "layer-1");
    const validPicker = validContainer.querySelector(
      ".style-control-color-picker",
    ) as HTMLInputElement | null;
    expect(validPicker?.value).toBe("#ff0000");

    const invalid = makeControl();
    invalid.paintProps.set(invalid.key("layer-1", "fill-color"), "invalid");
    const invalidContainer = document.createElement("div");
    invalid.internals.addFillControls(invalidContainer, "layer-1");
    expect(
      invalidContainer.querySelector(".style-control-color-picker"),
    ).toBeNull();
  });
});

describe("fill pattern picker", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selects loaded images, reports changes, and clears to a solid fill", () => {
    const onLayerStyleChange = vi.fn();
    const { internals, paintProps, key } = makeControl(
      { onLayerStyleChange },
      { dots: { sdf: true }, stripes: { sdf: false } },
    );
    internals.state.activeStyleEditor = "layer-1";

    paintProps.set(key("layer-1", "fill-pattern"), "stripes");
    paintProps.set(key("layer-1", "fill-color"), "#ff0000");

    const container = document.createElement("div");
    internals.addFillControls(container, "layer-1");

    const stripes = container.querySelector<HTMLButtonElement>(
      '.style-control-pattern-option[data-pattern-id="stripes"]',
    );
    expect(stripes?.getAttribute("aria-selected")).toBe("true");
    const fillColor = container.querySelector<HTMLInputElement>(
      '.style-control-color-picker[data-property="fill-color"]',
    );
    const fillColorValue = container.querySelector<HTMLInputElement>(
      ".style-control-color-value",
    );
    expect(fillColor?.disabled).toBe(true);
    expect(fillColorValue?.disabled).toBe(true);
    expect(
      container.querySelector(".style-control-pattern-hint")?.textContent,
    ).toContain("Fill Color is disabled while it is selected");
    expect(
      container.querySelector(
        '.style-control-pattern-option[data-pattern-id="dots"] .style-control-pattern-badge',
      )?.textContent,
    ).toBe("SDF");
    expect(onLayerStyleChange).not.toHaveBeenCalled();

    container
      .querySelector<HTMLButtonElement>(
        '.style-control-pattern-option[data-pattern-id="dots"]',
      )
      ?.click();
    expect(paintProps.get(key("layer-1", "fill-pattern"))).toBe("dots");
    expect(onLayerStyleChange).toHaveBeenLastCalledWith(
      "layer-1",
      "fill-pattern",
      "dots",
    );
    expect(
      container.querySelector(".style-control-pattern-hint")?.textContent,
    ).toContain("SDF pattern");
    expect(fillColor?.disabled).toBe(false);
    expect(fillColorValue?.disabled).toBe(false);

    container
      .querySelector<HTMLButtonElement>(
        '.style-control-pattern-option[data-pattern-id=""]',
      )
      ?.click();
    expect(paintProps.get(key("layer-1", "fill-pattern"))).toBeUndefined();
    expect(onLayerStyleChange).toHaveBeenLastCalledWith(
      "layer-1",
      "fill-pattern",
      undefined,
    );
    expect(fillColor?.disabled).toBe(false);
    expect(paintProps.get(key("layer-1", "fill-color"))).toBe("#ff0000");
  });

  it("preserves an expression until the user selects an option", () => {
    const onLayerStyleChange = vi.fn();
    const { internals, paintProps, key } = makeControl(
      { onLayerStyleChange },
      { dots: { sdf: true } },
    );
    const expression = ["match", ["get", "kind"], "a", "dots", "dots"];
    paintProps.set(key("layer-1", "fill-pattern"), expression);

    const container = document.createElement("div");
    internals.addFillControls(container, "layer-1");

    expect(paintProps.get(key("layer-1", "fill-pattern"))).toBe(expression);
    expect(
      container.querySelector(
        '.style-control-pattern-option[aria-selected="true"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(".style-control-pattern-current")?.textContent,
    ).toContain("data-driven expression");
    expect(onLayerStyleChange).not.toHaveBeenCalled();

    container
      .querySelector<HTMLButtonElement>(
        '.style-control-pattern-option[data-pattern-id="dots"]',
      )
      ?.click();
    expect(paintProps.get(key("layer-1", "fill-pattern"))).toBe("dots");
  });

  it("keeps a missing image unchanged and tolerates absent image APIs", () => {
    const onLayerStyleChange = vi.fn();
    const { internals, paintProps, key } = makeControl(
      { onLayerStyleChange },
      {},
      false,
    );
    internals.state.activeStyleEditor = "layer-1";
    paintProps.set(key("layer-1", "fill-pattern"), "ghost");

    const container = document.createElement("div");
    expect(() => internals.addFillControls(container, "layer-1")).not.toThrow();

    const missing = container.querySelector<HTMLButtonElement>(
      '.style-control-pattern-option[data-pattern-id="ghost"]',
    );
    expect(missing?.disabled).toBe(true);
    expect(missing?.getAttribute("aria-selected")).toBe("true");
    expect(missing?.textContent).toContain("ghost (not loaded)");
    expect(
      container.querySelector(".style-control-pattern-empty")?.textContent,
    ).toContain("No images loaded");
    expect(paintProps.get(key("layer-1", "fill-pattern"))).toBe("ghost");
    expect(onLayerStyleChange).not.toHaveBeenCalled();
  });

  it("reset removes a pattern added to a layer that had none", () => {
    const onLayerStyleChange = vi.fn();
    const { internals, paintProps, key } = makeControl(
      { onLayerStyleChange },
      { dots: { sdf: true } },
    );
    internals.state.activeStyleEditor = "layer-1";
    internals.state.originalStyles.set("layer-1", {
      paint: { "fill-color": "#ff0000" },
    });

    const editor = document.createElement("div");
    internals.styleEditors.set("layer-1", editor);
    internals.addFillControls(editor, "layer-1");
    editor
      .querySelector<HTMLButtonElement>(
        '.style-control-pattern-option[data-pattern-id="dots"]',
      )
      ?.click();

    internals.resetLayerStyle("layer-1");

    expect(paintProps.get(key("layer-1", "fill-pattern"))).toBeUndefined();
    expect(
      editor
        .querySelector<HTMLButtonElement>(
          '.style-control-pattern-option[data-pattern-id=""]',
        )
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(onLayerStyleChange).toHaveBeenLastCalledWith(
      "layer-1",
      "fill-pattern",
      undefined,
    );
  });
});
