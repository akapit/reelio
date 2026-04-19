import {
  Template,
  type Template as TemplateT,
  TEMPLATE_NAMES,
  type TemplateName,
} from "../models";
import { TemplateError } from "./errors";

import luxury_30s from "./luxury_30s.json";
import family_30s from "./family_30s.json";
import fast_15s from "./fast_15s.json";
import investor_20s from "./investor_20s.json";
import premium_45s from "./premium_45s.json";

const TABLE: Record<TemplateName, unknown> = {
  luxury_30s,
  family_30s,
  fast_15s,
  investor_20s,
  premium_45s,
};

const cache = new Map<string, TemplateT>();

export function loadTemplate(name: string): TemplateT {
  if (cache.has(name)) return cache.get(name)!;
  if (!(TEMPLATE_NAMES as readonly string[]).includes(name)) {
    throw new TemplateError(`unknown template: ${name}`);
  }
  const raw = TABLE[name as TemplateName];
  if (raw === undefined) {
    throw new TemplateError(`failed to load template ${name}`);
  }
  const parsed = Template.safeParse(raw);
  if (!parsed.success) {
    throw new TemplateError(
      `invalid template ${name}: ${parsed.error.message}`,
      parsed.error,
    );
  }
  cache.set(name, parsed.data);
  return parsed.data;
}

export function listTemplates(): TemplateT[] {
  return TEMPLATE_NAMES.map(loadTemplate);
}
