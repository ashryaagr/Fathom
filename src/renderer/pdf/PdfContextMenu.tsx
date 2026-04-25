import { useEffect } from 'react';

/**
 * Minimal right-click menu for the PDF viewer. Two options:
 *   - "Dive into this selection" when text is selected
 *   - "Dive in here" otherwise (commits a focus at the cursor)
 *
 * Positions itself at the click coordinates, closes on outside click or
 * Escape. Deliberately small — we're not replacing the full macOS context
 * menu, just exposing the zoom action for users who prefer a click to a
 * pinch gesture.
 */

export interface PdfContextMenuProps {
  x: number;
  y: number;
  selection: string;
  onDiveIn: () => void;
  onClose: () => void;
}

export default function PdfContextMenu({
  x,
  y,
  selection,
  onDiveIn,
  onClose,
}: PdfContextMenuProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const onClick = (e: MouseEvent) => {
      // Any click outside the menu dismisses it.
      if (!(e.target as HTMLElement | null)?.closest('[data-fathom-ctxmenu]')) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  const hasSelection = selection.length > 0;
  const selectionPreview =
    selection.length > 40 ? selection.slice(0, 40) + '…' : selection;

  // Clamp to viewport so the menu never opens off-screen.
  const left = Math.min(x, window.innerWidth - 260);
  const top = Math.min(y, window.innerHeight - 80);

  return (
    <div
      data-fathom-ctxmenu
      className="fixed z-[150] min-w-[240px] overflow-hidden rounded-lg border border-black/10 bg-white shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        onClick={() => {
          onDiveIn();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#1a1614] hover:bg-[color:var(--color-lens-soft)]"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0 text-[color:var(--color-lens)]"
        >
          <circle cx="7" cy="7" r="5" />
          <path d="M11 11 L14 14" />
          <path d="M5 7 H9 M7 5 V9" />
        </svg>
        <span className="flex-1 truncate">
          {hasSelection ? (
            <>
              Dive into <span className="italic text-black/70">"{selectionPreview}"</span>
            </>
          ) : (
            <>Dive in here</>
          )}
        </span>
        <span className="font-mono text-[10.5px] text-black/35">⌘-pinch</span>
      </button>
    </div>
  );
}
