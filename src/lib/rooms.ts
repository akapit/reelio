/**
 * Closed vocabulary of room types we tag photo assets with. Stored on
 * `assets.metadata.roomType`. Both the manual-edit dropdown and the vision
 * classifier server call constrain themselves to this list.
 */
export const ROOM_TYPES = [
  "bedroom",
  "living_room",
  "kitchen",
  "bathroom",
  "dining_room",
  "office",
  "balcony",
  "hallway",
  "exterior",
  "other",
] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

export function isRoomType(value: unknown): value is RoomType {
  return typeof value === "string" && (ROOM_TYPES as readonly string[]).includes(value);
}
