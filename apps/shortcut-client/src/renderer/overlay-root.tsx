import type { PositionedRegion } from "./coordinate-mapper";
import type { RegionBackgroundMode } from "./region-style";
import { TranslationRegion } from "./translation-region";

export interface OverlayRegion {
  key: string;
  position: PositionedRegion;
  sourceText: string;
  translatedText: string;
  backgroundMode: RegionBackgroundMode;
}

export function OverlayRoot({
  regions,
  textMode,
}: {
  regions: OverlayRegion[];
  textMode: "source" | "translation";
}) {
  return (
    <>
      {regions.map((region) => (
        <TranslationRegion
          key={region.key}
          position={region.position}
          text={textMode === "source" ? region.sourceText : region.translatedText}
          backgroundMode={region.backgroundMode}
        />
      ))}
    </>
  );
}
