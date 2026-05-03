export const VOICEOVER_WORDS_PER_SECOND = 2.2;
export const VOICEOVER_SAFETY_BUFFER_SEC = 1;

export function maxVoiceoverSeconds(videoDurationSec: number): number {
  const duration = Number.isFinite(videoDurationSec) ? videoDurationSec : 0;
  return Math.max(3, Math.round(duration) - VOICEOVER_SAFETY_BUFFER_SEC);
}

export function countVoiceoverWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function estimateVoiceoverSeconds(text: string): number {
  const words = countVoiceoverWords(text);
  if (words === 0) return 0;
  return Math.ceil(words / VOICEOVER_WORDS_PER_SECOND);
}

export function maxVoiceoverWords(maxSeconds: number): number {
  return Math.max(1, Math.floor(maxSeconds * VOICEOVER_WORDS_PER_SECOND));
}

export function isVoiceoverWithinDuration(
  text: string | undefined,
  videoDurationSec: number,
): boolean {
  if (!text || text.trim().length === 0) return true;
  return estimateVoiceoverSeconds(text) <= maxVoiceoverSeconds(videoDurationSec);
}
