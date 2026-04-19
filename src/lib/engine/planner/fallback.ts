export class PlannerAbort extends Error {
  constructor(public slotIds: string[]) {
    super("planner_slots_unfillable");
    this.name = "PlannerAbort";
  }
}

export class InsufficientImages extends Error {
  constructor(
    public have: number,
    public need: number,
  ) {
    super(`have ${have}, need ${need}`);
    this.name = "InsufficientImages";
  }
}
