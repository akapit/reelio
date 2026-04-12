export const ROOM_TYPES = [
  { value: "living_room", label: "Living Room" },
  { value: "bedroom", label: "Bedroom" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bathroom", label: "Bathroom" },
  { value: "office", label: "Office" },
] as const;

export const STAGING_STYLES = [
  { value: "modern", label: "Modern" },
  { value: "classic", label: "Classic" },
  { value: "scandinavian", label: "Scandinavian" },
  { value: "luxury", label: "Luxury" },
] as const;

export const SKY_TYPES = [
  { value: "sunset", label: "Sunset" },
  { value: "blue_sky", label: "Blue Sky" },
  { value: "dramatic", label: "Dramatic" },
  { value: "golden_hour", label: "Golden Hour" },
] as const;

export const TOOL_LABELS: Record<string, string> = {
  enhance: "AI Enhance",
  staging: "Virtual Staging",
  sky: "Sky Replacement",
  video: "Video Generation",
};

export const STATUS_LABELS: Record<string, string> = {
  uploaded: "Ready",
  processing: "Processing",
  done: "Complete",
  failed: "Failed",
};
