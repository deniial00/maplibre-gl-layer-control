/**
 * Style properties the style editor can edit, per layer type, with the
 * MapLibre style-spec defaults used when `showAllStyleProperties` exposes a
 * control whose value is absent from the layer style.
 */

export type EditableLayerType =
  | "fill"
  | "line"
  | "circle"
  | "raster"
  | "symbol";

export type StylePropertySpec =
  | {
      kind: "color";
      property: string;
      label: string;
      /** Style-spec default shown while the property is unset */
      defaultValue: string;
      /**
       * Property MapLibre falls back to while this one is unset (e.g.
       * `fill-outline-color` inherits `fill-color`)
       */
      inheritsFrom?: string;
    }
  | {
      kind: "slider";
      property: string;
      label: string;
      /** Style-spec default shown while the property is unset */
      defaultValue: number;
      min: number;
      max: number;
      step: number;
    }
  | { kind: "pattern"; property: "fill-pattern" };

const opacity = (property: string, label: string): StylePropertySpec => ({
  kind: "slider",
  property,
  label,
  defaultValue: 1,
  min: 0,
  max: 1,
  step: 0.05,
});

const rasterSlider = (
  property: string,
  label: string,
  defaultValue: number,
  min = -1,
  max = 1,
  step = 0.05,
): StylePropertySpec => ({
  kind: "slider",
  property,
  label,
  defaultValue,
  min,
  max,
  step,
});

/**
 * Every control the editor supports, in display order. Labels, ranges and
 * steps match the controls shown without `showAllStyleProperties`.
 */
export const STYLE_PROPERTY_SPECS: Record<
  EditableLayerType,
  StylePropertySpec[]
> = {
  fill: [
    {
      kind: "color",
      property: "fill-color",
      label: "Fill Color",
      defaultValue: "#000000",
    },
    { kind: "pattern", property: "fill-pattern" },
    opacity("fill-opacity", "Fill Opacity"),
    {
      kind: "color",
      property: "fill-outline-color",
      label: "Outline Color",
      defaultValue: "#000000",
      inheritsFrom: "fill-color",
    },
  ],
  line: [
    {
      kind: "color",
      property: "line-color",
      label: "Line Color",
      defaultValue: "#000000",
    },
    {
      kind: "slider",
      property: "line-width",
      label: "Line Width",
      defaultValue: 1,
      min: 0,
      max: 20,
      step: 0.5,
    },
    opacity("line-opacity", "Line Opacity"),
    {
      kind: "slider",
      property: "line-blur",
      label: "Line Blur",
      defaultValue: 0,
      min: 0,
      max: 5,
      step: 0.1,
    },
  ],
  circle: [
    {
      kind: "color",
      property: "circle-color",
      label: "Circle Color",
      defaultValue: "#000000",
    },
    {
      kind: "slider",
      property: "circle-radius",
      label: "Radius",
      defaultValue: 5,
      min: 0,
      max: 40,
      step: 0.5,
    },
    opacity("circle-opacity", "Opacity"),
    {
      kind: "color",
      property: "circle-stroke-color",
      label: "Stroke Color",
      defaultValue: "#000000",
    },
    {
      kind: "slider",
      property: "circle-stroke-width",
      label: "Stroke Width",
      defaultValue: 0,
      min: 0,
      max: 10,
      step: 0.1,
    },
  ],
  raster: [
    opacity("raster-opacity", "Opacity"),
    rasterSlider("raster-brightness-min", "Brightness Min", 0),
    rasterSlider("raster-brightness-max", "Brightness Max", 1),
    rasterSlider("raster-saturation", "Saturation", 0),
    rasterSlider("raster-contrast", "Contrast", 0),
    rasterSlider("raster-hue-rotate", "Hue Rotate", 0, 0, 350, 5),
  ],
  symbol: [
    {
      kind: "color",
      property: "text-color",
      label: "Text Color",
      defaultValue: "#000000",
    },
    opacity("text-opacity", "Text Opacity"),
    opacity("icon-opacity", "Icon Opacity"),
  ],
};

/** Editable paint property name -> its spec. */
export const STYLE_PROPERTY_SPEC_BY_PROPERTY: Record<
  string,
  StylePropertySpec
> = Object.fromEntries(
  Object.values(STYLE_PROPERTY_SPECS)
    .flat()
    .map((spec) => [spec.property, spec]),
);

/**
 * Whether a paint/layout value counts as "not set" for dependency checks
 * (`fill-pattern`, `text-field`, `icon-image`).
 */
export function isUnsetValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}
