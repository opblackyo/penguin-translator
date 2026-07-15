import type { PositionedRegion } from "./coordinate-mapper";

interface TranslationRegionProps {
  position: PositionedRegion;
  text: string;
}

export function TranslationRegion({ position, text }: TranslationRegionProps) {
  return (
    <div
      data-penguin-translator-region="true"
      style={{
        position: "absolute",
        boxSizing: "border-box",
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: `${position.width}px`,
        minHeight: `${position.height}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        padding: "4px",
        border: "1px solid rgba(30, 41, 59, 0.25)",
        borderRadius: "6px",
        background: "rgba(248, 250, 252, 0.9)",
        color: "#0f172a",
        fontFamily: "system-ui, sans-serif",
        fontSize: "clamp(12px, 3vw, 24px)",
        lineHeight: 1.25,
        textAlign: "center",
        pointerEvents: "auto",
      }}
    >
      {text}
    </div>
  );
}
