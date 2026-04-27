interface PropertyAsset {
  id: string;
  asset_type?: string | null;
  status?: string | null;
  tool_used?: string | null;
  original_url?: string | null;
  processed_url?: string | null;
  thumbnail_url?: string | null;
  source_asset_id?: string | null;
  metadata?: unknown;
  created_at?: string | null;
}

function assetTime(asset: PropertyAsset): number {
  const time = asset.created_at ? new Date(asset.created_at).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function imageUrl(asset: PropertyAsset | undefined): string | null {
  if (!asset) return null;
  return asset.thumbnail_url ?? asset.processed_url ?? asset.original_url ?? null;
}

function metadataValue(asset: PropertyAsset, key: string): unknown {
  return asset.metadata && typeof asset.metadata === "object"
    ? (asset.metadata as Record<string, unknown>)[key]
    : undefined;
}

function metadataText(asset: PropertyAsset): string {
  const meta = asset.metadata;
  if (!meta || typeof meta !== "object") return "";
  const values: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === "string") values.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      collect(record.name);
      collect(record.description);
      collect(record.label);
    }
  };
  collect((meta as Record<string, unknown>).visionLabels);
  collect((meta as Record<string, unknown>).visionObjects);
  collect((meta as Record<string, unknown>).labels);
  collect((meta as Record<string, unknown>).objects);
  collect((meta as Record<string, unknown>).roomType);
  return values.join(" ").toLowerCase();
}

function isUploadedSourceImage(asset: PropertyAsset): boolean {
  return (
    asset.asset_type === "image" &&
    asset.status === "uploaded" &&
    !asset.tool_used
  );
}

function isLivingRoom(asset: PropertyAsset): boolean {
  return metadataValue(asset, "roomType") === "living_room";
}

function isDoorLike(asset: PropertyAsset): boolean {
  const roomType = metadataValue(asset, "roomType");
  if (roomType === "hallway" || roomType === "exterior") return true;
  return /\b(door|front door|entrance|entry|entryway|foyer|lobby)\b/i.test(
    metadataText(asset),
  );
}

export function pickPropertyThumbnailUrl(assets: PropertyAsset[]): string | null {
  const images = assets
    .filter((asset) => asset.asset_type === "image")
    .sort((a, b) => assetTime(a) - assetTime(b));
  const imagesById = new Map(images.map((asset) => [asset.id, asset]));

  const latestVideoWithSource = [...assets]
    .filter((asset) => asset.asset_type === "video" && asset.source_asset_id)
    .sort((a, b) => assetTime(b) - assetTime(a))
    .find((asset) => imagesById.has(asset.source_asset_id ?? ""));

  const videoSourceUrl = imageUrl(
    latestVideoWithSource
      ? imagesById.get(latestVideoWithSource.source_asset_id ?? "")
      : undefined,
  );
  if (videoSourceUrl) return videoSourceUrl;

  const uploadedImages = images.filter(isUploadedSourceImage);
  return (
    imageUrl(uploadedImages.find(isLivingRoom)) ??
    imageUrl(uploadedImages.find(isDoorLike)) ??
    imageUrl(uploadedImages[0]) ??
    imageUrl(images[0])
  );
}
