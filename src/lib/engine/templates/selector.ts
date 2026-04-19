import { loadTemplate } from "./loader";
import { TemplateError } from "./errors";
import type { Template, RoomType } from "../models";

export interface SelectArgs {
  requested: string;
  usableCount: number;
  availableRoomTypes: RoomType[];
}

export interface SelectResult {
  template: Template;
  warning?: string;
}

export function selectTemplate(args: SelectArgs): SelectResult {
  if (args.usableCount < 5) {
    throw new TemplateError(
      "insufficient_images: need at least 5 usable images",
    );
  }
  if (args.usableCount < 8) {
    return {
      template: loadTemplate("fast_15s"),
      warning: `usableCount=${args.usableCount} below 8; forced fast_15s`,
    };
  }
  return { template: loadTemplate(args.requested) };
}
