export class FfmpegError extends Error {
  constructor(
    msg: string,
    public stderrTail?: string,
  ) {
    super(msg);
    this.name = "FfmpegError";
  }
}
