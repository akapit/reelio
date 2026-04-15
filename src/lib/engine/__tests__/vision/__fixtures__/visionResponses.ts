import type { VisionRaw } from "@/lib/engine/vision/googleVision";

export interface MakeRawInput {
  labels?: Array<{ description: string; score: number }>;
  objects?: Array<{ name: string; score: number }>;
  colors?: Array<{
    r: number;
    g: number;
    b: number;
    pixelFraction?: number;
    score?: number;
  }>;
  safe?: Partial<NonNullable<VisionRaw["safeSearchAnnotation"]>>;
  width?: number;
  height?: number;
}

export function makeRaw(input: MakeRawInput = {}): VisionRaw {
  const {
    labels = [],
    objects = [],
    colors,
    safe,
    width = 1920,
    height = 1080,
  } = input;

  const raw: VisionRaw = {
    labelAnnotations: labels,
    localizedObjectAnnotations: objects,
    width,
    height,
  };

  if (colors && colors.length > 0) {
    raw.imagePropertiesAnnotation = {
      dominantColors: {
        colors: colors.map((c) => ({
          color: { red: c.r, green: c.g, blue: c.b },
          pixelFraction: c.pixelFraction,
          score: c.score,
        })),
      },
    };
  }

  if (safe) {
    raw.safeSearchAnnotation = { ...safe };
  }

  return raw;
}

// Named fixtures used across tests --------------------------------------------

export const FIXTURE_HERO_EXTERIOR: VisionRaw = makeRaw({
  width: 3840,
  height: 2160,
  labels: [
    { description: "House", score: 0.95 },
    { description: "Facade", score: 0.88 },
    { description: "Sky", score: 0.82 },
    { description: "Driveway", score: 0.77 },
    { description: "Yard", score: 0.7 },
    { description: "Architecture", score: 0.85 },
  ],
  objects: [{ name: "Building", score: 0.9 }],
  colors: [
    { r: 180, g: 195, b: 210, pixelFraction: 0.5 },
    { r: 90, g: 105, b: 120, pixelFraction: 0.3 },
    { r: 60, g: 65, b: 70, pixelFraction: 0.2 },
  ],
  safe: { adult: "VERY_UNLIKELY", violence: "VERY_UNLIKELY" },
});

export const FIXTURE_WOW_VIEW: VisionRaw = makeRaw({
  width: 1920,
  height: 1080,
  labels: [
    { description: "Ocean view", score: 0.92 },
    { description: "Sunset", score: 0.88 },
    { description: "Balcony", score: 0.8 },
    { description: "Sky", score: 0.86 },
    { description: "Pool", score: 0.72 },
  ],
  objects: [],
  colors: [
    { r: 240, g: 180, b: 120, pixelFraction: 0.6 },
    { r: 120, g: 130, b: 150, pixelFraction: 0.4 },
  ],
  safe: { adult: "VERY_UNLIKELY", violence: "VERY_UNLIKELY" },
});

export const FIXTURE_LOWRES_BLURRY: VisionRaw = makeRaw({
  width: 320,
  height: 240,
  labels: [{ description: "Wall", score: 0.4 }],
  objects: [],
  colors: [
    { r: 12, g: 12, b: 14, pixelFraction: 0.9 }, // very dark
    { r: 20, g: 20, b: 22, pixelFraction: 0.1 },
  ],
  safe: { adult: "VERY_UNLIKELY", violence: "VERY_UNLIKELY" },
});

export const FIXTURE_KITCHEN: VisionRaw = makeRaw({
  width: 1920,
  height: 1080,
  labels: [
    { description: "Kitchen", score: 0.94 },
    { description: "Countertop", score: 0.75 },
    { description: "Furniture", score: 0.6 },
  ],
  objects: [
    { name: "Stove", score: 0.82 },
    { name: "Refrigerator", score: 0.78 },
  ],
  colors: [
    { r: 200, g: 200, b: 205, pixelFraction: 0.7 },
    { r: 80, g: 70, b: 60, pixelFraction: 0.3 },
  ],
  safe: { adult: "VERY_UNLIKELY", violence: "VERY_UNLIKELY" },
});

export const FIXTURE_BEDROOM: VisionRaw = makeRaw({
  width: 1920,
  height: 1080,
  labels: [
    { description: "Bedroom", score: 0.91 },
    { description: "Bed", score: 0.88 },
    { description: "Pillow", score: 0.7 },
    { description: "Furniture", score: 0.8 },
  ],
  objects: [{ name: "Bed", score: 0.9 }],
  colors: [
    { r: 140, g: 140, b: 150, pixelFraction: 0.7 },
    { r: 220, g: 215, b: 210, pixelFraction: 0.3 },
  ],
  safe: { adult: "VERY_UNLIKELY", violence: "VERY_UNLIKELY" },
});

export const FIXTURE_UNSAFE_ADULT: VisionRaw = makeRaw({
  width: 1920,
  height: 1080,
  labels: [{ description: "Person", score: 0.9 }],
  colors: [{ r: 128, g: 128, b: 128, pixelFraction: 1 }],
  safe: { adult: "LIKELY", violence: "VERY_UNLIKELY" },
});
