export class TemplateError extends Error {
  constructor(msg: string, public cause?: unknown) {
    super(msg);
    this.name = "TemplateError";
  }
}
