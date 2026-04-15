import { ImageAnnotatorClient } from "@google-cloud/vision";

export interface VisionRaw {
  labelAnnotations: Array<{ description: string; score: number }>;
  localizedObjectAnnotations: Array<{ name: string; score: number }>;
  imagePropertiesAnnotation?: {
    dominantColors?: {
      colors?: Array<{
        color: { red?: number; green?: number; blue?: number };
        score?: number;
        pixelFraction?: number;
      }>;
    };
  };
  safeSearchAnnotation?: {
    adult?: string;
    violence?: string;
    racy?: string;
    medical?: string;
    spoof?: string;
  };
  width: number;
  height: number;
}

export interface VisionProvider {
  annotate(bytes: Buffer): Promise<VisionRaw>;
}

// --- observability ---------------------------------------------------------

function logVision(event: string, data: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      source: "vision",
      event,
      ...data,
    }),
  );
}

// --- tiny header-parser for width/height -----------------------------------
// Supports JPEG (SOI + SOF0/SOF1/SOF2), PNG (IHDR), WebP (VP8 / VP8L / VP8X).

export function readImageDims(buf: Buffer): { width: number; height: number } {
  if (buf.length < 12) return { width: 0, height: 0 };

  // PNG: 89 50 4E 47 0D 0A 1A 0A  then IHDR at offset 16 (width) / 20 (height)
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }

  // JPEG: starts with FF D8
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 9) {
      if (buf[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      // skip any run of 0xFF padding bytes
      while (offset < buf.length && buf[offset] === 0xff) offset += 1;
      if (offset >= buf.length) break;
      const marker = buf[offset];
      offset += 1;
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 carry dims
      const isSOF =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSOF) {
        // segment: length (2) precision(1) height(2) width(2)
        if (offset + 7 > buf.length) break;
        const height = buf.readUInt16BE(offset + 3);
        const width = buf.readUInt16BE(offset + 5);
        return { width, height };
      }
      // skip this segment
      if (offset + 2 > buf.length) break;
      const segLen = buf.readUInt16BE(offset);
      offset += segLen;
    }
    return { width: 0, height: 0 };
  }

  // WebP: "RIFF" .... "WEBP" then chunk
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8 " && buf.length >= 30) {
      // Bitstream: 3-byte tag 9D 01 2A, then width (14 bits), height (14 bits)
      const w = buf.readUInt16LE(26) & 0x3fff;
      const h = buf.readUInt16LE(28) & 0x3fff;
      return { width: w, height: h };
    }
    if (chunk === "VP8L" && buf.length >= 25) {
      // 1 sig byte (0x2F) at offset 20, then 14 bits width-1, 14 bits height-1
      const b0 = buf[21];
      const b1 = buf[22];
      const b2 = buf[23];
      const b3 = buf[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width, height };
    }
    if (chunk === "VP8X" && buf.length >= 30) {
      // 24-bit width-1 at offset 24, 24-bit height-1 at offset 27 (little-endian)
      const width =
        1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height =
        1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { width, height };
    }
  }

  return { width: 0, height: 0 };
}

// --- google vision adapter -------------------------------------------------

let cachedClient: ImageAnnotatorClient | null = null;
function getClient(): ImageAnnotatorClient {
  if (!cachedClient) {
    cachedClient = new ImageAnnotatorClient();
  }
  return cachedClient;
}

export const googleVision: VisionProvider = {
  async annotate(bytes: Buffer): Promise<VisionRaw> {
    const started = Date.now();
    const client = getClient();
    const [result] = await client.annotateImage({
      image: { content: bytes },
      features: [
        { type: "LABEL_DETECTION", maxResults: 20 },
        { type: "IMAGE_PROPERTIES" },
        { type: "SAFE_SEARCH_DETECTION" },
        { type: "OBJECT_LOCALIZATION", maxResults: 20 },
      ],
    });

    const labelAnnotations = (result.labelAnnotations ?? [])
      .filter((l) => typeof l.description === "string" && typeof l.score === "number")
      .map((l) => ({
        description: String(l.description),
        score: Number(l.score),
      }));

    const localizedObjectAnnotations = (result.localizedObjectAnnotations ?? [])
      .filter((o) => typeof o.name === "string" && typeof o.score === "number")
      .map((o) => ({ name: String(o.name), score: Number(o.score) }));

    // NOTE: Vision API doesn't reliably return width/height — parse the image header ourselves.
    const { width, height } = readImageDims(bytes);

    const raw: VisionRaw = {
      labelAnnotations,
      localizedObjectAnnotations,
      imagePropertiesAnnotation: result.imagePropertiesAnnotation
        ? {
            dominantColors: result.imagePropertiesAnnotation.dominantColors
              ? {
                  colors: (
                    result.imagePropertiesAnnotation.dominantColors.colors ?? []
                  ).map((c) => ({
                    color: {
                      red: c.color?.red ?? 0,
                      green: c.color?.green ?? 0,
                      blue: c.color?.blue ?? 0,
                    },
                    score: c.score ?? 0,
                    pixelFraction: c.pixelFraction ?? 0,
                  })),
                }
              : undefined,
          }
        : undefined,
      safeSearchAnnotation: result.safeSearchAnnotation
        ? {
            adult: stringLikelihood(result.safeSearchAnnotation.adult),
            violence: stringLikelihood(result.safeSearchAnnotation.violence),
            racy: stringLikelihood(result.safeSearchAnnotation.racy),
            medical: stringLikelihood(result.safeSearchAnnotation.medical),
            spoof: stringLikelihood(result.safeSearchAnnotation.spoof),
          }
        : undefined,
      width,
      height,
    };

    logVision("annotate", {
      ms: Date.now() - started,
      bytes: bytes.length,
      labelCount: raw.labelAnnotations.length,
    });

    return raw;
  },
};

function stringLikelihood(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value);
}
