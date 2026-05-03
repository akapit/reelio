export const LOGO_ASSET_ROLE = "logo";
export const DEFAULT_LOGO_END_CARD_DURATION_SEC = 3;

export type LogoCornerPosition =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left";

export interface VideoLogoPlacement {
  corner?: boolean;
  endCard?: boolean;
  cornerPosition?: LogoCornerPosition;
  endCardDurationSec?: number;
}

export interface VideoLogoRenderOptions {
  url: string;
  placement: VideoLogoPlacement;
}

export interface LogoAssetLike {
  metadata?: unknown;
}

export function isLogoAsset(asset: LogoAssetLike): boolean {
  const metadata = asset.metadata;
  return (
    !!metadata &&
    typeof metadata === "object" &&
    (metadata as Record<string, unknown>).role === LOGO_ASSET_ROLE
  );
}

export function normalizeLogoPlacement(
  placement?: VideoLogoPlacement,
): VideoLogoPlacement {
  return {
    corner: placement?.corner ?? false,
    endCard: placement?.endCard ?? false,
    cornerPosition: placement?.cornerPosition ?? "top-right",
    endCardDurationSec:
      placement?.endCardDurationSec ?? DEFAULT_LOGO_END_CARD_DURATION_SEC,
  };
}

export function hasLogoPlacement(placement?: VideoLogoPlacement): boolean {
  const normalized = normalizeLogoPlacement(placement);
  return Boolean(normalized.corner || normalized.endCard);
}
