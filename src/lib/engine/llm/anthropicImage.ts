import path from "node:path";
import { readFile } from "node:fs/promises";

function inferMediaType(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export async function buildAnthropicImageContent(
  imagePath: string,
): Promise<Record<string, unknown>> {
  if (isHttpUrl(imagePath)) {
    return {
      type: "image",
      source: {
        type: "url",
        url: imagePath,
      },
    };
  }

  const bytes = await readFile(imagePath);
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: inferMediaType(imagePath),
      data: bytes.toString("base64"),
    },
  };
}
