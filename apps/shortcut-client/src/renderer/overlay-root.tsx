import type { PositionedRegion } from "./coordinate-mapper";
import { TranslationRegion } from "./translation-region";

export interface OverlayRegion {
  key: string;
  position: PositionedRegion;
  text: string;
}

export function OverlayRoot({ regions }: { regions: OverlayRegion[] }) {
  return (
    <>
      {regions.map((region) => (
        <TranslationRegion key={region.key} position={region.position} text={region.text} />
      ))}
    </>
  );
}
