import type {
  ImageDataset,
  ImageMetadata,
  ImageScores,
  RoomType,
} from "@/lib/engine/models";

type MakeImageInput = {
  path: string;
  roomType: RoomType;
  /** @deprecated ignored — scores are no longer consumed. Retained so the
   *  existing fixture literals keep compiling without a large rewrite. */
  scores?: Partial<ImageScores>;
  aspectRatio?: number;
  /** @deprecated no longer used; retained to avoid rewriting callers. */
  asHero?: boolean;
  /** @deprecated */
  asWow?: boolean;
  /** @deprecated */
  asClosing?: boolean;
  /** Defaults to true. Flip to false to simulate an unusable photo. */
  usable?: boolean;
  reason?: string;
};

export function makeImage(input: MakeImageInput): ImageMetadata {
  const aspectRatio = input.aspectRatio ?? 1.5;
  const width = 1920;
  const height = Math.round(width / aspectRatio);
  return {
    path: input.path,
    roomType: input.roomType,
    usable: input.usable ?? true,
    ...(input.reason ? { reason: input.reason } : {}),
    dims: {
      width,
      height,
      aspectRatio,
    },
    visionLabels: [],
    visionObjects: [],
    dominantColorsHex: [],
  };
}

export function makeDataset(images: ImageMetadata[]): ImageDataset {
  return {
    images,
    availableRoomTypes: Array.from(new Set(images.map((i) => i.roomType))),
    usableCount: images.filter((i) => i.usable).length,
    analyzedAt: "2026-01-01T00:00:00.000Z",
  };
}

// Canonical 12-image fixture covering all room types with varied scores.
export function twelveImageFixture(): ImageMetadata[] {
  return [
    // Two exteriors — one clear hero, one fallback.
    makeImage({
      path: "/img/ext-1.jpg",
      roomType: "exterior",
      scores: { hero: 0.95, quality: 0.9, wow: 0.8, composition: 0.85, lighting: 0.8, detail: 0.85 },
      asHero: true,
      aspectRatio: 1.78,
    }),
    makeImage({
      path: "/img/ext-2.jpg",
      roomType: "exterior",
      scores: { hero: 0.6, quality: 0.7, wow: 0.5, composition: 0.6, lighting: 0.55, detail: 0.6 },
      aspectRatio: 1.78,
    }),
    // Living rooms
    makeImage({
      path: "/img/liv-1.jpg",
      roomType: "living",
      scores: { quality: 0.85, composition: 0.8, lighting: 0.85, wow: 0.6, detail: 0.75, hero: 0.55 },
      aspectRatio: 1.5,
    }),
    makeImage({
      path: "/img/liv-2.jpg",
      roomType: "living",
      scores: { quality: 0.65, composition: 0.6, lighting: 0.6, wow: 0.5, detail: 0.55, hero: 0.4 },
      aspectRatio: 1.5,
    }),
    // Kitchen
    makeImage({
      path: "/img/kit-1.jpg",
      roomType: "kitchen",
      scores: { quality: 0.8, composition: 0.75, lighting: 0.75, wow: 0.7, detail: 0.7, hero: 0.5 },
      aspectRatio: 1.5,
    }),
    // Bedroom — high wow
    makeImage({
      path: "/img/bed-1.jpg",
      roomType: "bedroom",
      scores: { quality: 0.8, composition: 0.75, lighting: 0.8, wow: 0.95, detail: 0.8, hero: 0.5 },
      asWow: true,
      aspectRatio: 1.5,
    }),
    makeImage({
      path: "/img/bed-2.jpg",
      roomType: "bedroom",
      scores: { quality: 0.55, composition: 0.5, lighting: 0.5, wow: 0.55, detail: 0.5, hero: 0.4 },
      aspectRatio: 1.5,
    }),
    // Bathroom
    makeImage({
      path: "/img/bath-1.jpg",
      roomType: "bathroom",
      scores: { quality: 0.7, composition: 0.65, lighting: 0.7, wow: 0.6, detail: 0.7, hero: 0.4 },
      aspectRatio: 1.5,
    }),
    // Dining
    makeImage({
      path: "/img/din-1.jpg",
      roomType: "dining",
      scores: { quality: 0.7, composition: 0.7, lighting: 0.65, wow: 0.5, detail: 0.6, hero: 0.4 },
      aspectRatio: 1.5,
    }),
    // Balcony — second-highest wow for fallback tests
    makeImage({
      path: "/img/balc-1.jpg",
      roomType: "balcony",
      scores: { quality: 0.75, composition: 0.8, lighting: 0.85, wow: 0.85, detail: 0.7, hero: 0.55 },
      aspectRatio: 1.5,
    }),
    // Office
    makeImage({
      path: "/img/off-1.jpg",
      roomType: "office",
      scores: { quality: 0.65, composition: 0.6, lighting: 0.65, wow: 0.45, detail: 0.55, hero: 0.35 },
      aspectRatio: 1.5,
    }),
    // Hallway — portrait
    makeImage({
      path: "/img/hall-1.jpg",
      roomType: "hallway",
      scores: { quality: 0.55, composition: 0.55, lighting: 0.55, wow: 0.4, detail: 0.5, hero: 0.3 },
      aspectRatio: 0.75, // portrait, to exercise motion override
    }),
  ];
}
