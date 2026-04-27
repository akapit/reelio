import { describe, expect, it } from "vitest";
import { pickPropertyThumbnailUrl } from "../thumbnail";

describe("pickPropertyThumbnailUrl", () => {
  it("prefers the latest video source image thumbnail", () => {
    expect(
      pickPropertyThumbnailUrl([
        {
          id: "living",
          asset_type: "image",
          status: "uploaded",
          thumbnail_url: "living-thumb.jpg",
          metadata: { roomType: "living_room" },
          created_at: "2026-04-01T00:00:00Z",
        },
        {
          id: "source",
          asset_type: "image",
          status: "uploaded",
          thumbnail_url: "source-thumb.jpg",
          metadata: { roomType: "bedroom" },
          created_at: "2026-04-02T00:00:00Z",
        },
        {
          id: "video",
          asset_type: "video",
          source_asset_id: "source",
          created_at: "2026-04-03T00:00:00Z",
        },
      ]),
    ).toBe("source-thumb.jpg");
  });

  it("falls back to uploaded living-room photos before the first upload", () => {
    expect(
      pickPropertyThumbnailUrl([
        {
          id: "kitchen",
          asset_type: "image",
          status: "uploaded",
          thumbnail_url: "kitchen-thumb.jpg",
          metadata: { roomType: "kitchen" },
          created_at: "2026-04-01T00:00:00Z",
        },
        {
          id: "living",
          asset_type: "image",
          status: "uploaded",
          thumbnail_url: "living-thumb.jpg",
          metadata: { roomType: "living_room" },
          created_at: "2026-04-02T00:00:00Z",
        },
      ]),
    ).toBe("living-thumb.jpg");
  });

  it("uses door-like uploaded photos before a generic first upload", () => {
    expect(
      pickPropertyThumbnailUrl([
        {
          id: "bedroom",
          asset_type: "image",
          status: "uploaded",
          thumbnail_url: "bedroom-thumb.jpg",
          metadata: { roomType: "bedroom" },
          created_at: "2026-04-01T00:00:00Z",
        },
        {
          id: "door",
          asset_type: "image",
          status: "uploaded",
          thumbnail_url: "door-thumb.jpg",
          metadata: { labels: ["front door", "entryway"] },
          created_at: "2026-04-02T00:00:00Z",
        },
      ]),
    ).toBe("door-thumb.jpg");
  });
});
