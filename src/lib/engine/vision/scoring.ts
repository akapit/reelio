import type { ImageEligibility, ImageScores } from "../models";
import type { VisionRaw } from "./googleVision";

const WOW_RE = /view|sunset|beach|ocean|sky|pool|balcony|skyline|mountain|garden/i;
const DETAIL_RE = /texture|material|pattern|furniture|decor|fixture|detail/i;
const HERO_RE = /house|facade|exterior|aerial|driveway|entrance|yard|architecture/i;

const SAFE_OK = new Set(["VERY_UNLIKELY", "UNLIKELY"]);

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function safeSearchFactor(raw: VisionRaw): number {
  const ss = raw.safeSearchAnnotation;
  if (!ss) return 1;
  const adult = ss.adult ?? "VERY_UNLIKELY";
  const violence = ss.violence ?? "VERY_UNLIKELY";
  return SAFE_OK.has(adult) && SAFE_OK.has(violence) ? 1 : 0;
}

function computeQuality(raw: VisionRaw): number {
  const { width, height } = raw;
  if (!width || !height) return 0;
  const pixels = width * height;
  const target = 1920 * 1080;
  const base = Math.min(1, pixels / target);
  return clamp01(base * safeSearchFactor(raw));
}

function computeLighting(raw: VisionRaw): number {
  const colors = raw.imagePropertiesAnnotation?.dominantColors?.colors ?? [];
  if (colors.length === 0) return 0.5;

  let weightSum = 0;
  let brightnessWeighted = 0;
  for (const c of colors) {
    const r = c.color?.red ?? 0;
    const g = c.color?.green ?? 0;
    const b = c.color?.blue ?? 0;
    // perceptual luminance (Rec. 709)
    const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // prefer pixelFraction when present, else score
    const weight = c.pixelFraction ?? c.score ?? 0;
    if (weight <= 0) continue;
    brightnessWeighted += brightness * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return 0.5;
  const meanBrightness = brightnessWeighted / weightSum;
  const normalized = meanBrightness / 255;
  return clamp01(1 - 2 * Math.abs(normalized - 0.5));
}

function computeComposition(raw: VisionRaw): number {
  const { width, height } = raw;
  let base = 0;
  if (width > 0 && height > 0) {
    const ar = width / height;
    if (ar >= 1.4 && ar <= 1.9) {
      base = 1;
    } else {
      base = Math.max(0, 1 - 0.8 * Math.abs(ar - 16 / 9));
    }
  }

  // rule-of-thirds bonus: we only have names/scores, not bounding boxes on this
  // normalized shape. The spec mentions bounding-box centers; since the pipe
  // doesn't carry boxes, we degrade gracefully and skip the bonus.
  // NOTE: if bounding polys are added later, compute |cx - 1/3| <= 0.08 etc.
  return clamp01(base);
}

function weightedMatchSum(
  labels: VisionRaw["labelAnnotations"],
  re: RegExp,
  weight: number,
): number {
  let sum = 0;
  for (const l of labels) {
    if (re.test(l.description)) sum += l.score;
  }
  return clamp01(sum * weight);
}

function computeWow(raw: VisionRaw): number {
  return weightedMatchSum(raw.labelAnnotations, WOW_RE, 0.6);
}

function computeDetail(raw: VisionRaw): number {
  return weightedMatchSum(raw.labelAnnotations, DETAIL_RE, 0.5);
}

function computeHero(raw: VisionRaw): number {
  return weightedMatchSum(raw.labelAnnotations, HERO_RE, 0.6);
}

export function computeScores(raw: VisionRaw): ImageScores {
  return {
    quality: clamp01(computeQuality(raw)),
    lighting: clamp01(computeLighting(raw)),
    composition: clamp01(computeComposition(raw)),
    wow: clamp01(computeWow(raw)),
    detail: clamp01(computeDetail(raw)),
    hero: clamp01(computeHero(raw)),
  };
}

export function computeEligibility(scores: ImageScores): ImageEligibility {
  return {
    asHero: scores.hero >= 0.5,
    asWow: scores.wow >= 0.5,
    asClosing: scores.hero >= 0.4 || scores.wow >= 0.5,
  };
}
