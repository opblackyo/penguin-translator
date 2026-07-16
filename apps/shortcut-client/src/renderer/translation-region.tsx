import type { PositionedRegion } from "./coordinate-mapper";
import { fitRegionLayout, type RegionBackgroundMode } from "./region-style";

interface TranslationRegionProps {
  position: PositionedRegion;
  text: string;
  backgroundMode: RegionBackgroundMode;
}

export function TranslationRegion({ position, text, backgroundMode }: TranslationRegionProps) {
  const layout = fitRegionLayout(position, text);
  return (
    <div
      data-penguin-translator-region="true"
      data-penguin-translator-background={backgroundMode}
      style={{
        position: "absolute",
        boxSizing: "border-box",
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: `${position.width}px`,
        height: `${layout.height}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        padding: "6px",
        border: "1px solid rgba(30, 41, 59, 0.25)",
        borderRadius: "6px",
        background:
          backgroundMode === "opaque" ? "rgba(255, 255, 255, 0.98)" : "rgba(248, 250, 252, 0.88)",
        color: "#0f172a",
        fontFamily: "system-ui, sans-serif",
        fontSize: `${layout.fontSize}px`,
        lineHeight: 1.25,
        textAlign: "center",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        writingMode: "horizontal-tb",
        pointerEvents: "auto",
      }}
    >
      {text}
    </div>
  );
}
