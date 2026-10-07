import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerControl } from "../src/lib/core/LayerControl";

type Internals = {
  map: unknown;
  panel: HTMLElement;
  state: {
    activeStyleEditor: string | null;
    originalStyles: Map<string, { paint: Record<string, unknown> }>;
  };
  styleEditors: Map<string, HTMLElement>;
  createStyleEditor(layerId: string): HTMLDivElement | null;
  createNativeSubLayerStyleEditor(
    layerId: string,
    nativeIds: string[],
  ): HTMLDivElement | null;
  openStyleEditor(layerId: string): void;
  closeStyleEditor(layerId: string): void;
  resetLayerStyle(layerId: string): void;
  refreshStyleEditor(layerId?: string): void;
};

type Props = Record<string, unknown>;

/**
 * LayerControl over an in-memory map. `layers` maps id -> type; `paint` and
 * `layout` seed explicit values per layer id. Every write is recorded.
 */
function setup(
  layers: Record<string, string>,
  seed: {
    paint?: Record<string, Props>;
    layout?: Record<string, Props>;
    images?: Record<string, { sdf: boolean }>;
  } = {},
  options: ConstructorParameters<typeof LayerControl>[0] = {},
) {
  const paint = new Map<string, Props>();
  const layout = new Map<string, Props>();
  for (const id of Object.keys(layers)) {
    paint.set(id, { ...(seed.paint?.[id] ?? {}) });
    layout.set(id, { ...(seed.layout?.[id] ?? {}) });
  }
  const images = seed.images ?? {};
  const writes: Array<[string, string, unknown]> = [];

  const map = {
    getLayer: (id: string) => (id in layers ? { type: layers[id] } : undefined),
    getStyle: () => ({ layers: [] }),
    getPaintProperty: (id: string, prop: string) => paint.get(id)?.[prop],
    getLayoutProperty: (id: string, prop: string) => layout.get(id)?.[prop],
    setPaintProperty: (id: string, prop: string, value: unknown) => {
      writes.push([id, prop, value]);
      if (value === undefined) delete paint.get(id)![prop];
      else paint.get(id)![prop] = value;
    },
    listImages: () => Object.keys(images),
    getImage: (id: string) =>
      images[id]
        ? {
            data: { width: 2, height: 2, data: new Uint8Array(16) },
            pixelRatio: 1,
            sdf: images[id].sdf,
          }
        : undefined,
  };

  const control = new LayerControl({ showStyleEditor: true, ...options });
  const internals = control as unknown as Internals;
  internals.map = map;
  return { control, internals, paint, layout, writes };
}

/** Open the editor for a layer and attach it so DOM queries behave. */
function openEditor(internals: Internals, layerId: string): HTMLElement {
  const editor = internals.createStyleEditor(layerId)!;
  internals.styleEditors.set(layerId, editor);
  internals.state.activeStyleEditor = layerId;
  document.body.appendChild(editor);
  return editor;
}

const picker = (root: HTMLElement, property: string) =>
  root.querySelector<HTMLInputElement>(
    `.style-control-color-picker[data-property="${property}"]`,
  );
const slider = (root: HTMLElement, property: string) =>
  root.querySelector<HTMLInputElement>(
    `.style-control-slider[data-property="${property}"]`,
  );
const groupOf = (el: HTMLElement | null) =>
  el?.closest<HTMLElement>(".style-control-group") ?? null;
const properties = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>("[data-property]")).map(
    (el) => el.dataset.property,
  );

function input(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("showAllStyleProperties: flag off (default)", () => {
  it("keeps conditional controls hidden when the properties are unset", () => {
    const { internals } = setup({ f: "fill" });
    const editor = openEditor(internals, "f");
    expect(slider(editor, "fill-opacity")).toBeNull();
    expect(picker(editor, "fill-outline-color")).toBeNull();

    const explicit = setup(
      { f: "fill" },
      { paint: { f: { "fill-opacity": 0.4, "fill-outline-color": "#00ff00" } } },
      { showAllStyleProperties: false },
    );
    const shown = openEditor(explicit.internals, "f");
    expect(slider(shown, "fill-opacity")?.value).toBe("0.4");
    expect(picker(shown, "fill-outline-color")?.value).toBe("#00ff00");
  });

  it("does not mark controls disabled or managed", () => {
    const { internals } = setup({ f: "fill" }, { paint: { f: { "fill-antialias": false, "fill-outline-color": "#00ff00" } } });
    const editor = openEditor(internals, "f");
    expect(picker(editor, "fill-outline-color")?.disabled).toBe(false);
    expect(editor.querySelector(".style-control-reason")).toBeNull();
  });
});

describe("showAllStyleProperties: exposing unset controls", () => {
  const on = { showAllStyleProperties: true };

  it("fill: shows opacity and outline color with effective defaults", () => {
    const { internals } = setup({ f: "fill" }, {}, on);
    const editor = openEditor(internals, "f");
    expect(slider(editor, "fill-opacity")?.value).toBe("1");
    expect(picker(editor, "fill-outline-color")?.value).toBe("#000000");
    expect(picker(editor, "fill-outline-color")?.disabled).toBe(false);
    expect(properties(editor)).toEqual([
      "fill-color",
      "fill-pattern",
      "fill-opacity",
      "fill-outline-color",
    ]);
  });

  it("fill: unset outline color inherits fill-color", () => {
    const { internals } = setup(
      { f: "fill" },
      { paint: { f: { "fill-color": "#ff0000" } } },
      on,
    );
    const editor = openEditor(internals, "f");
    expect(picker(editor, "fill-outline-color")?.value).toBe("#ff0000");
  });

  it("preserves explicit values", () => {
    const { internals } = setup(
      { f: "fill" },
      {
        paint: {
          f: {
            "fill-color": "#ff0000",
            "fill-opacity": 0.25,
            "fill-outline-color": "#0000ff",
          },
        },
      },
      on,
    );
    const editor = openEditor(internals, "f");
    expect(slider(editor, "fill-opacity")?.value).toBe("0.25");
    expect(picker(editor, "fill-outline-color")?.value).toBe("#0000ff");
  });

  it("line, circle, raster and symbol show their unset controls with spec defaults", () => {
    const { internals } = setup(
      { l: "line", c: "circle", r: "raster", s: "symbol" },
      { layout: { s: { "text-field": "{name}", "icon-image": "pin" } } },
      on,
    );

    const line = openEditor(internals, "l");
    expect(properties(line)).toEqual([
      "line-color",
      "line-width",
      "line-opacity",
      "line-blur",
    ]);
    expect(slider(line, "line-opacity")?.value).toBe("1");
    expect(slider(line, "line-blur")?.value).toBe("0");
    expect(picker(line, "line-color")?.value).toBe("#000000");

    const circle = openEditor(internals, "c");
    expect(properties(circle)).toEqual([
      "circle-color",
      "circle-radius",
      "circle-opacity",
      "circle-stroke-color",
      "circle-stroke-width",
    ]);
    expect(slider(circle, "circle-radius")?.value).toBe("5");
    expect(slider(circle, "circle-opacity")?.value).toBe("1");
    expect(picker(circle, "circle-stroke-color")?.value).toBe("#000000");
    expect(slider(circle, "circle-stroke-width")?.value).toBe("0");

    const raster = openEditor(internals, "r");
    expect(properties(raster)).toHaveLength(6);
    expect(slider(raster, "raster-opacity")?.value).toBe("1");
    expect(slider(raster, "raster-brightness-max")?.value).toBe("1");
    expect(slider(raster, "raster-hue-rotate")?.value).toBe("0");

    const symbol = openEditor(internals, "s");
    expect(properties(symbol)).toEqual([
      "text-color",
      "text-opacity",
      "icon-opacity",
    ]);
    expect(picker(symbol, "text-color")?.value).toBe("#000000");
    expect(slider(symbol, "text-opacity")?.value).toBe("1");
    expect(slider(symbol, "icon-opacity")?.value).toBe("1");
  });

  it("opening, refreshing and closing the editor writes nothing to the map", () => {
    const expression = ["interpolate", ["linear"], ["zoom"], 0, 0, 10, 1];
    const { control, internals, paint, writes } = setup(
      { f: "fill", l: "line", c: "circle", r: "raster", s: "symbol" },
      { paint: { f: { "fill-opacity": expression } } },
      { ...on, onLayerStyleChange: vi.fn() },
    );
    const snapshot = JSON.stringify([...paint]);
    for (const id of ["f", "l", "c", "r", "s"]) {
      const editor = openEditor(internals, id);
      control.refreshStyleEditor(id);
      editor.remove();
      internals.styleEditors.delete(id);
    }
    expect(writes).toEqual([]);
    expect(JSON.stringify([...paint])).toBe(snapshot);
    expect(paint.get("f")!["fill-opacity"]).toBe(expression);
  });

  it("editing a newly exposed control sets only that property and notifies", () => {
    const onLayerStyleChange = vi.fn();
    const { internals, paint, writes } = setup(
      { f: "fill" },
      {},
      { ...on, onLayerStyleChange },
    );
    const editor = openEditor(internals, "f");

    input(slider(editor, "fill-opacity")!, "0.5");
    expect(writes).toEqual([["f", "fill-opacity", 0.5]]);
    expect(paint.get("f")!["fill-opacity"]).toBe(0.5);
    expect(onLayerStyleChange).toHaveBeenLastCalledWith("f", "fill-opacity", 0.5);

    input(picker(editor, "fill-outline-color")!, "#123456");
    expect(paint.get("f")!["fill-outline-color"]).toBe("#123456");
    expect(onLayerStyleChange).toHaveBeenLastCalledWith(
      "f",
      "fill-outline-color",
      "#123456",
    );
    expect(paint.get("f")).not.toHaveProperty("fill-color");
  });

  it("an unedited outline color follows fill-color edits; an edited one does not", () => {
    const { internals } = setup({ f: "fill" }, {}, on);
    const editor = openEditor(internals, "f");
    const fill = picker(editor, "fill-color")!;
    const outline = picker(editor, "fill-outline-color")!;

    input(fill, "#ff0000");
    expect(outline.value).toBe("#ff0000");

    input(outline, "#00ff00");
    input(fill, "#0000ff");
    expect(outline.value).toBe("#00ff00");
  });
});

describe("showAllStyleProperties: disabled controls", () => {
  const on = { showAllStyleProperties: true };
  const reasonOf = (root: HTMLElement, property: string) =>
    groupOf(picker(root, property) ?? slider(root, property))?.querySelector(
      ".style-control-reason",
    )?.textContent;

  it("disables fill outline color with an explanation for antialias false or a fill pattern", () => {
    const aa = setup(
      { f: "fill" },
      { paint: { f: { "fill-antialias": false } } },
      on,
    );
    const aaEditor = openEditor(aa.internals, "f");
    expect(picker(aaEditor, "fill-outline-color")?.disabled).toBe(true);
    expect(reasonOf(aaEditor, "fill-outline-color")).toContain("antialiasing");

    const pat = setup(
      { f: "fill" },
      { paint: { f: { "fill-pattern": "dots" } }, images: { dots: { sdf: true } } },
      on,
    );
    const patEditor = openEditor(pat.internals, "f");
    expect(picker(patEditor, "fill-outline-color")?.disabled).toBe(true);
    expect(reasonOf(patEditor, "fill-outline-color")).toContain("fill pattern");
    // The control stays visible; sibling controls stay usable.
    expect(slider(patEditor, "fill-opacity")?.disabled).toBe(false);
  });

  it("re-enables outline color when the fill pattern is cleared in the editor", () => {
    const { internals, paint } = setup(
      { f: "fill" },
      { images: { dots: { sdf: true } } },
      on,
    );
    const editor = openEditor(internals, "f");
    const outline = picker(editor, "fill-outline-color")!;
    expect(outline.disabled).toBe(false);

    editor
      .querySelector<HTMLButtonElement>(
        '.style-control-pattern-option[data-pattern-id="dots"]',
      )
      ?.click();
    expect(paint.get("f")!["fill-pattern"]).toBe("dots");
    expect(outline.disabled).toBe(true);
    expect(reasonOf(editor, "fill-outline-color")).toBeTruthy();

    editor
      .querySelector<HTMLButtonElement>(
        '.style-control-pattern-option[data-pattern-id=""]',
      )
      ?.click();
    expect(outline.disabled).toBe(false);
    expect(reasonOf(editor, "fill-outline-color")).toBeUndefined();
  });

  it("disables symbol text/icon controls without text-field / icon-image", () => {
    const none = setup({ s: "symbol" }, {}, on);
    const noneEditor = openEditor(none.internals, "s");
    expect(picker(noneEditor, "text-color")?.disabled).toBe(true);
    expect(slider(noneEditor, "text-opacity")?.disabled).toBe(true);
    expect(slider(noneEditor, "icon-opacity")?.disabled).toBe(true);
    expect(reasonOf(noneEditor, "text-color")).toContain("text-field");
    expect(reasonOf(noneEditor, "icon-opacity")).toContain("icon-image");

    const textOnly = setup(
      { s: "symbol" },
      { layout: { s: { "text-field": "{name}" } } },
      on,
    );
    const textEditor = openEditor(textOnly.internals, "s");
    expect(picker(textEditor, "text-color")?.disabled).toBe(false);
    expect(slider(textEditor, "text-opacity")?.disabled).toBe(false);
    expect(slider(textEditor, "icon-opacity")?.disabled).toBe(true);
  });

  it("disables line color while a line pattern is set", () => {
    const { internals } = setup(
      { l: "line" },
      { paint: { l: { "line-pattern": "dash" } } },
      on,
    );
    const editor = openEditor(internals, "l");
    expect(picker(editor, "line-color")?.disabled).toBe(true);
    expect(slider(editor, "line-width")?.disabled).toBe(false);
  });

  it("never replaces expressions: the control is disabled and the value untouched", () => {
    const opacity = ["interpolate", ["linear"], ["zoom"], 0, 0, 10, 1];
    const color = ["get", "color"];
    const { internals, paint, writes } = setup(
      { f: "fill", l: "line" },
      {
        paint: {
          f: { "fill-color": color, "fill-opacity": opacity },
          l: { "line-width": ["get", "w"] },
        },
      },
      on,
    );
    const editor = openEditor(internals, "f");
    expect(slider(editor, "fill-opacity")?.disabled).toBe(true);
    expect(reasonOf(editor, "fill-opacity")).toContain("expression");
    expect(picker(editor, "fill-color")?.disabled).toBe(true);
    // Outline inherits the expression-valued fill-color.
    expect(picker(editor, "fill-outline-color")?.disabled).toBe(true);
    expect(reasonOf(editor, "fill-outline-color")).toContain("Inherits Fill Color");

    const line = openEditor(internals, "l");
    expect(slider(line, "line-width")?.disabled).toBe(true);

    // Editing a disabled control (e.g. forced event) is not possible via UI;
    // opening alone must leave expressions and the style untouched.
    expect(writes).toEqual([]);
    expect(paint.get("f")!["fill-opacity"]).toBe(opacity);
    expect(paint.get("f")!["fill-color"]).toBe(color);
  });

  it("refreshStyleEditor re-evaluates availability after external changes", () => {
    const { control, internals, paint } = setup({ f: "fill" }, {}, on);
    const editor = openEditor(internals, "f");
    const outline = picker(editor, "fill-outline-color")!;
    expect(outline.disabled).toBe(false);

    paint.get("f")!["fill-antialias"] = false;
    paint.get("f")!["fill-color"] = "#abcdef";
    control.refreshStyleEditor("f");
    expect(outline.disabled).toBe(true);
    expect(outline.value).toBe("#abcdef");
  });
});

describe("showAllStyleProperties: native sublayers", () => {
  it("exposes unset controls and applies edits to every sublayer in the group", () => {
    const { internals, paint, writes } = setup(
      { n1: "fill", n2: "fill", ln: "line" },
      {},
      { showAllStyleProperties: true },
    );
    const editor = internals.createNativeSubLayerStyleEditor("custom", [
      "n1",
      "n2",
      "ln",
    ])!;
    document.body.appendChild(editor);
    internals.state.activeStyleEditor = "custom";

    expect(slider(editor, "fill-opacity")).not.toBeNull();
    expect(picker(editor, "fill-outline-color")).not.toBeNull();
    expect(slider(editor, "line-blur")).not.toBeNull();
    expect(writes).toEqual([]);

    input(slider(editor, "fill-opacity")!, "0.3");
    expect(paint.get("n1")!["fill-opacity"]).toBe(0.3);
    expect(paint.get("n2")!["fill-opacity"]).toBe(0.3);
    expect(paint.get("ln")).not.toHaveProperty("fill-opacity");
  });

  it("keeps current conditional visibility with the flag off", () => {
    const { internals } = setup({ n1: "fill" }, {});
    const editor = internals.createNativeSubLayerStyleEditor("custom", ["n1"])!;
    expect(slider(editor, "fill-opacity")).toBeNull();
    expect(picker(editor, "fill-outline-color")).toBeNull();
  });

  it("Reset Style unsets properties the user added to every sublayer", () => {
    const onLayerStyleChange = vi.fn();
    const { internals, paint } = setup(
      { n1: "fill", n2: "fill" },
      { paint: { n1: { "fill-color": "#ff0000" }, n2: { "fill-color": "#ff0000" } } },
      { showAllStyleProperties: true, onLayerStyleChange },
    );
    internals.state.originalStyles.set("n1", { paint: { "fill-color": "#ff0000" } });
    internals.state.originalStyles.set("n2", { paint: { "fill-color": "#ff0000" } });
    const editor = internals.createNativeSubLayerStyleEditor("custom", ["n1", "n2"])!;
    document.body.appendChild(editor);
    internals.state.activeStyleEditor = "custom";

    input(slider(editor, "fill-opacity")!, "0.3");
    internals.panel = document.createElement("div");
    editor
      .querySelector<HTMLButtonElement>(".style-editor-button-reset")!
      .click();

    expect(paint.get("n1")).not.toHaveProperty("fill-opacity");
    expect(paint.get("n2")).not.toHaveProperty("fill-opacity");
    expect(onLayerStyleChange).toHaveBeenCalledWith(
      "custom",
      "fill-opacity",
      undefined,
    );
  });
});

describe("showAllStyleProperties: Reset Style", () => {
  it("unsets added properties, keeps original explicit values and restores the control", () => {
    const onLayerStyleChange = vi.fn();
    const { internals, paint } = setup(
      { f: "fill" },
      { paint: { f: { "fill-color": "#ff0000", "fill-outline-color": "#00ff00" } } },
      { showAllStyleProperties: true, onLayerStyleChange },
    );
    internals.state.originalStyles.set("f", {
      paint: { "fill-color": "#ff0000", "fill-outline-color": "#00ff00" },
    });
    const editor = openEditor(internals, "f");

    input(slider(editor, "fill-opacity")!, "0.5");
    input(picker(editor, "fill-outline-color")!, "#0000ff");
    internals.resetLayerStyle("f");

    expect(paint.get("f")).not.toHaveProperty("fill-opacity");
    expect(paint.get("f")!["fill-outline-color"]).toBe("#00ff00");
    expect(slider(editor, "fill-opacity")?.value).toBe("1");
    expect(picker(editor, "fill-outline-color")?.value).toBe("#00ff00");
    expect(onLayerStyleChange).toHaveBeenCalledWith("f", "fill-opacity", undefined);
  });
});

describe("showAllStyleProperties: production open/close and mixed groups", () => {
  it("openStyleEditor / closeStyleEditor leave the map style untouched", () => {
    const { internals, writes } = setup(
      { f: "fill" },
      { paint: { f: { "fill-color": "#ff0000" } } },
      { showAllStyleProperties: true },
    );
    const panel = document.createElement("div");
    const item = document.createElement("div");
    item.dataset.layerId = "f";
    panel.appendChild(item);
    internals.panel = panel;

    internals.openStyleEditor("f");
    expect(item.querySelector(".layer-control-style-editor")).not.toBeNull();
    expect(slider(item, "fill-opacity")).not.toBeNull();
    internals.refreshStyleEditor("f");
    internals.closeStyleEditor("f");

    expect(item.querySelector(".layer-control-style-editor")).toBeNull();
    expect(writes).toEqual([]);
  });

  it("keeps outline color enabled when only some grouped layers block it", () => {
    const { internals, paint } = setup(
      { n1: "fill", n2: "fill" },
      { paint: { n1: { "fill-antialias": false } } },
      { showAllStyleProperties: true },
    );
    const editor = internals.createNativeSubLayerStyleEditor("custom", ["n1", "n2"])!;
    document.body.appendChild(editor);
    internals.state.activeStyleEditor = "custom";

    const outline = picker(editor, "fill-outline-color")!;
    expect(outline.disabled).toBe(false);
    input(outline, "#123456");
    expect(paint.get("n1")!["fill-outline-color"]).toBe("#123456");
    expect(paint.get("n2")!["fill-outline-color"]).toBe("#123456");
  });

  it("disables a grouped control when any sublayer holds an expression", () => {
    const expression = ["get", "o"];
    const { internals, paint } = setup(
      { n1: "fill", n2: "fill" },
      { paint: { n1: { "fill-opacity": 0.5 }, n2: { "fill-opacity": expression } } },
      { showAllStyleProperties: true },
    );
    const editor = internals.createNativeSubLayerStyleEditor("custom", ["n1", "n2"])!;
    document.body.appendChild(editor);

    expect(slider(editor, "fill-opacity")?.disabled).toBe(true);
    expect(
      groupOf(slider(editor, "fill-opacity"))?.querySelector(".style-control-reason")
        ?.textContent,
    ).toContain("expression");
    expect(paint.get("n2")!["fill-opacity"]).toBe(expression);
  });
});
