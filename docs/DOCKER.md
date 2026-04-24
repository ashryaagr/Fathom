# Dev container

A Docker image with all the build-time dependencies needed to develop Fathom without installing them on your host. **This is a build and test environment, not a runtime** — Electron's UI can't render in a headless Docker container. The final `.dmg` still has to be produced on macOS (for `iconutil` and native signing).

## What you can do inside the container

- Run `npm install`, `npm run build`, `npm run typecheck`.
- Run Node-only unit tests (not yet added).
- Run `electron-builder --linux` if you want to produce a Linux AppImage for experimentation (not officially supported).

## What you *can't* do inside the container

- Launch the Electron window (no display server).
- Produce a signed / notarized macOS `.dmg`.
- Use `iconutil` to regenerate `resources/icon.icns` (macOS-only tool).

---

## Dockerfile

See [`../Dockerfile`](../Dockerfile) at the repo root.

## Build the image

```bash
docker build -t fathom-dev .
```

## Use the container as a dev shell

```bash
docker run --rm -it \
  -v "$PWD":/workspace \
  -w /workspace \
  fathom-dev bash
```

Inside the container:
```bash
npm install
npm run typecheck
npm run build
```

---

## Why not run Electron in Docker?

Technically you can run Electron headless under Xvfb, but:
- macOS gesture / trackpad semantics (pinch with `ctrlKey`, two-finger swipe deltaX) don't exist on a Linux virtual display.
- `@anthropic-ai/claude-agent-sdk` spawns the local `claude` binary, which you'd also need inside the container with your auth.
- The native `better-sqlite3` build inside the Linux container doesn't match the macOS Electron ABI you ship to users.

Keep the container for **CI-style checks** and **deterministic builds of the JS side**. Do actual app runs on your Mac.
