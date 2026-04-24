import { useState } from 'react';
import { useHighlightsStore } from '../state/highlights';

interface Props {
  paperHash: string;
  pageNumber: number;
  /** Base page height at zoom=1, in CSS pixels. Used to flip PDF's
   * bottom-up y-axis to CSS top-down. */
  pageHeight: number;
  zoom: number;
}

/**
 * Renders all highlights for a given page as amber fills *under* the
 * pdf.js text layer. Order in the DOM:
 *
 *   <canvas>             — rendered PDF pixels
 *   <HighlightLayer>     — amber rectangles (z-index ambient)
 *   <div class=textLayer>— pdf.js spans (selectable text)
 *
 * The amber rects use `mix-blend-mode: multiply` so the underlying text
 * stays readable through them. Clicking a highlight deletes it — the
 * UX convention from Apple Books. No hover-popover for v1; keep it
 * minimal and reversible.
 */
export default function HighlightLayer({
  paperHash,
  pageNumber,
  pageHeight,
  zoom,
}: Props) {
  const ids = useHighlightsStore((s) => s.byPage.get(`${paperHash}:${pageNumber}`));
  const byId = useHighlightsStore((s) => s.byId);
  const remove = useHighlightsStore((s) => s.remove);
  const [hovering, setHovering] = useState<string | null>(null);

  if (!ids || ids.length === 0) return null;

  const onDelete = async (id: string) => {
    remove(id);
    try {
      await window.lens.deleteHighlight(id);
    } catch (err) {
      console.warn('[Highlights] delete persistence failed', err);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      {ids.map((id) => {
        const h = byId.get(id);
        if (!h) return null;
        return h.rects.map((r, idx) => {
          // PDF user-space is bottom-up; CSS is top-down. Flip y.
          const topCss = (pageHeight - r.y - r.height) * zoom;
          const leftCss = r.x * zoom;
          const widthCss = r.width * zoom;
          const heightCss = r.height * zoom;
          const isHovering = hovering === id;
          return (
            <div
              key={`${id}-${idx}`}
              className="pointer-events-auto absolute cursor-pointer transition-opacity"
              style={{
                top: topCss,
                left: leftCss,
                width: widthCss,
                height: heightCss,
                background: 'rgba(201, 131, 42, 0.28)', // amber @ 28% — multiplies to warm yellow
                mixBlendMode: 'multiply',
                outline: isHovering ? '1.5px solid rgba(201, 131, 42, 0.9)' : 'none',
                outlineOffset: '1px',
                borderRadius: '2px',
              }}
              onMouseEnter={() => setHovering(id)}
              onMouseLeave={() => setHovering((prev) => (prev === id ? null : prev))}
              onClick={(e) => {
                e.stopPropagation();
                if (
                  typeof window !== 'undefined' &&
                  window.confirm('Remove this highlight?')
                ) {
                  void onDelete(id);
                }
              }}
              title={h.text ? `"${h.text.slice(0, 80)}${h.text.length > 80 ? '…' : ''}" — click to remove` : 'Click to remove highlight'}
            />
          );
        });
      })}
    </div>
  );
}
