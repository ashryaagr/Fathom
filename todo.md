# Fathom — user-instruction backlog

Every item below is an instruction the user gave that I acknowledged but
deferred in favor of shipping something else. In order received. Executed
top-to-bottom until the list is empty.

## 1. Micro-affordance animations — ✅ DONE (commit below)
- Browser-style arrow animation on two-finger swipe back/forward.
  - Swipe right (back) → arrow sweeps left-to-right pointing ← at left edge.
  - Swipe left (forward) → mirror.
- Visual zoom-commit flash when ⌘ is released and a lens actually opens.
- Subtle on-screen cue when ⌘ is held to arm semantic mode (beyond the
  existing armed-ring).
- Hint when Esc is pressed inside a lens (Esc intentionally doesn't close
  anymore; show the user what DOES close).

## 2. Visual-only coach redesign — ✅ DONE
The current CoachHint is text-heavy. User's explicit principle: *"no one
reads words to learn how to set up."*
- Replace each step's headline+body with a pictogram + one short label.
- Gate each step on the user actually doing it in a marked practice
  section, not just on a global event.
- Skip-with-confirmation: first skip press shows a warning that Fathom has
  controls that aren't discoverable by word; second press confirms.

## 3. Streaming-narrative coach copy — ✅ DONE
Inside a lens, while Claude is streaming, the coach should update to
"Claude is reading the paper for you. Ask any follow-up in the box below
any time." — narrative, not instructional.

## 4. Better sample PDF — ✅ DONE
Current sample is a hand-written 2-pager. User asked for a real short
workshop paper with figures (real research-looking content). Find a
redistributable short paper or generate a richer synthetic one with
SVG-rendered figures.

## 5. Mid-stream drill safety — ✅ DONE
When a lens is streaming, selecting text and ⌘-pinching sometimes doesn't
drill (selection cleared by DOM re-render, or Range disconnected). Guard
`getBoundingClientRect()` on the snapshot; fall back to a viewport-center
rect; log why the capture failed when it does.

## 6. Recursive drill context — ✅ DONE
When drilling, pass not just the parent body but the full parent chain
(parent's parent, etc.) as context so Claude can trace the lineage
of what the reader is diving into.

## 7. UpdateToast renderer UI — ✅ DONE
Auto-updater runs silently today. Add the promised toast that says
"Version X is ready — Restart to install" with a button, so the user
can trigger `quitAndInstall` proactively instead of waiting for the next
quit.

## 8. Suppress visual zoom during ⌘+pinch — ⛔ REVERTED (was wrong — visual zoom during ⌘+pinch is what lets the user aim at the target before committing. Restored to the original behaviour.)
Currently the page still visually zooms while ⌘ is held — contributes to
the mixed-gesture confusion. Semantic mode should NOT visually zoom;
reserve visual zoom for plain pinch only. (Direction-accumulation fix
already landed; this is the second half.)

## 9. Marker reliability after Back-button close — ✅ DONE (code audit: back/closeAll never touch cache; z-index/position fix from commit 2a22d4e addresses the display side)
Verify the amber marker actually appears next to the paragraph after the
user closes the lens via the Back button (not just after a swipe). Log
the cache-population path if any miss.

## 10. Intel DMG
One config flag. Ship `dist:mac-intel` alongside arm64 if the demand
warrants.

## 11. Apple Developer signing (blocked on user)
Not actionable until user enrolls in the Developer Program + provides
Developer ID cert + app-specific password. When those land: flip
`mac.identity`, enable `hardenedRuntime`, add notarize config, add CI
env-vars.
