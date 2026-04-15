import type { RoomType, VisionLabel } from "../models";

const MIN_CONF = 0.5;

type RoomCandidate = { room: RoomType; confidence: number };

interface Bag {
  names: Map<string, number>; // lowercased name → max confidence seen
}

function buildBag(labels: VisionLabel[], objects: VisionLabel[]): Bag {
  const names = new Map<string, number>();
  for (const src of [labels, objects]) {
    for (const item of src) {
      if (!item?.name) continue;
      if (typeof item.confidence !== "number") continue;
      const key = item.name.toLowerCase();
      const prev = names.get(key) ?? 0;
      if (item.confidence > prev) names.set(key, item.confidence);
    }
  }
  return { names };
}

function has(bag: Bag, term: string, minConf = MIN_CONF): number {
  const c = bag.names.get(term.toLowerCase()) ?? 0;
  return c >= minConf ? c : 0;
}

function hasAny(bag: Bag, terms: string[], minConf = MIN_CONF): number {
  let best = 0;
  for (const t of terms) {
    const c = has(bag, t, minConf);
    if (c > best) best = c;
  }
  return best;
}

export function classifyRoom(
  labels: VisionLabel[],
  objects: VisionLabel[],
): RoomType {
  const bag = buildBag(labels, objects);

  const labelBag: Bag = { names: new Map() };
  for (const l of labels) {
    if (!l?.name) continue;
    labelBag.names.set(l.name.toLowerCase(), l.confidence);
  }
  const objectBag: Bag = { names: new Map() };
  for (const o of objects) {
    if (!o?.name) continue;
    objectBag.names.set(o.name.toLowerCase(), o.confidence);
  }

  // Rule 1: kitchen — label "kitchen" OR object {stove,oven,refrigerator} ≥0.6
  const kitchenLabel = has(labelBag, "kitchen");
  const kitchenObj = Math.max(
    has(objectBag, "stove", 0.6),
    has(objectBag, "oven", 0.6),
    has(objectBag, "refrigerator", 0.6),
  );
  const kitchenConf = Math.max(kitchenLabel, kitchenObj);
  const isKitchen = kitchenConf > 0;

  // Rule 2: bathroom — and NOT kitchen
  const bathroomConf = hasAny(bag, ["bathroom", "toilet", "shower", "bathtub"]);
  const isBathroom = bathroomConf > 0 && !isKitchen;

  // Rule 3: bedroom — and NOT kitchen
  const bedroomConf = hasAny(bag, ["bedroom", "bed"]);
  const isBedroom = bedroomConf > 0 && !isKitchen;

  // Rule 4: dining — and NOT kitchen
  const diningConf = hasAny(bag, ["dining room", "dining table"]);
  const isDining = diningConf > 0 && !isKitchen;

  // Rule 5: living
  const livingConf = hasAny(bag, ["living room", "sofa", "couch", "fireplace"]);
  const isLiving = livingConf > 0;

  // Rule 6: exterior
  const exteriorConf = hasAny(bag, [
    "facade",
    "house",
    "building",
    "yard",
    "driveway",
    "sky",
  ]);
  const isExterior = exteriorConf > 0;

  // Rule 7: balcony
  const balconyConf = hasAny(bag, ["balcony", "terrace", "patio", "view"]);
  const isBalcony = balconyConf > 0;

  // Rule 8: office
  const officeConf = hasAny(bag, ["desk", "monitor", "office"]);
  const isOffice = officeConf > 0;

  // Rule 9: hallway — and NOT bed/sofa/bathroom terms
  const hallwayConf = hasAny(bag, ["hallway", "corridor", "entrance"]);
  const hallwayBlocked =
    hasAny(bag, ["bed", "sofa", "couch", "bathroom", "toilet", "shower", "bathtub"], 0) > 0;
  const isHallway = hallwayConf > 0 && !hallwayBlocked;

  const candidates: RoomCandidate[] = [];
  // Rules are applied in order — but the spec also says "ties broken by higher
  // confidence". We collect all that fire, then pick the earliest rule-order
  // match, breaking ties within a priority by confidence.
  const ordered: Array<[boolean, RoomType, number]> = [
    [isKitchen, "kitchen", kitchenConf],
    [isBathroom, "bathroom", bathroomConf],
    [isBedroom, "bedroom", bedroomConf],
    [isDining, "dining", diningConf],
    [isLiving, "living", livingConf],
    [isExterior, "exterior", exteriorConf],
    [isBalcony, "balcony", balconyConf],
    [isOffice, "office", officeConf],
    [isHallway, "hallway", hallwayConf],
  ];

  for (const [fired, room, conf] of ordered) {
    if (fired) candidates.push({ room, confidence: conf });
  }

  if (candidates.length === 0) return "other";

  // Priority by rule order; within same priority pick higher confidence.
  return candidates[0].room;
}
