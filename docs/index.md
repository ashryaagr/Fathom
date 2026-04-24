---
layout: default
title: Fathom
---

<div class="handwritten" markdown="1">

## Built out of necessity

I'm [Ashrya](https://github.com/ashryaagr), an AI scientist. I read a lot of
research papers, and I got tired of the same spiral: hit a dense paragraph,
paste it into Claude, ask for clarification, then clarification of the
clarification, then of *that* — and by the time I'd surfaced, the paper was
gone. So I built the reader I wanted. When it was polished enough for me to
use daily, it felt like it might be useful to someone else.

There's nothing to sign up for, no subscription, no account. If you already
pay for Claude, you have everything Fathom needs.

</div>

## A new way to read a paper

Fathom asks you not to leave the document. The explanation comes to the
page, right where your eye already is. You pinch in when you want to
understand; you swipe back when you want to keep going. One gesture — the
same pinch you'd already use to look closer — is how you ask for help.

It's a reading app shaped around the way you already read, not an AI
assistant bolted onto a PDF viewer.

## What it feels like

Hold **⌘** and pinch on any passage. The page gives way to a full-screen
lens, and the explanation starts streaming in. Pinch a phrase inside the
lens to drill deeper — recursively, as far as the idea goes. Swipe back,
the way you came. Every lens persists across sessions: close the PDF, open
it next month, pinch the same paragraph, and the thread you had is still
there, exactly where you left it.

## What makes it different

- **The zoom is the explanation.** No side panel, no context switch, no
  "AI assistant" icon. The gesture you'd already use to look closer is how
  you ask for help.
- **Grounded in the paper itself.** Claude is given a file-system index of
  the paper — `content.md`, per-figure PNGs, a digest — and navigates it
  with `Read` / `Grep` / `Glob`. No RAG, no embeddings, no similarity
  search. The paper is a filesystem; the AI is a shell.
- **Diagrams when they help.** Architectures, pipelines, and relationships
  render as hand-drawn inline SVG. Never ASCII, never Mermaid.
- **Durable across sessions.** Every lens round-trips across app restarts:
  the viewport crop, the full thread, the exact prompt that was sent.

## Install

Fathom's primary install path is the terminal. One line — see the
chip at the top of this page, or copy from here:

```bash
curl -fsSL https://raw.githubusercontent.com/ashryaagr/Fathom/main/install.sh | bash
```

The script extracts Fathom to `/Applications`, clears the
`com.apple.quarantine` xattr so Gatekeeper doesn't prompt, ad-hoc
re-signs, and drops a `fathom` launcher at `~/.local/bin/fathom`
so `fathom`, `fathom paper.pdf`, and `fathom update` work from any
shell. Then it launches Fathom — you land on the welcome screen in
one motion. Full walkthrough in the
[install guide]({{ '/INSTALL' | relative_url }}).

Prefer a drag-to-Applications install?
See the [Mac DMG section of the install guide]({{ '/INSTALL' | relative_url }}#option-b--dmg)
— the DMG download link + the one-time Gatekeeper approval walkthrough live there.

## Your data stays yours

Fathom runs entirely on your machine. No telemetry. No analytics. No
accounts. No server ever sees your PDFs, your explanations, or your
conversations with Claude. The only network calls are your own Claude
Code CLI talking to Anthropic on your behalf, and the app's
auto-updater checking GitHub for new Fathom releases.

Every paper's index and chat history lives under
`~/Library/Application Support/Fathom/`. Delete that folder any time
to wipe all of Fathom's state; your PDFs themselves are untouched.

## Free and open source

Fathom is MIT-licensed and built in the open.

- [**Source →**](https://github.com/ashryaagr/Fathom)
- [**Releases →**](https://github.com/ashryaagr/Fathom/releases)
- [**Methodology →**]({{ '/METHODOLOGY' | relative_url }}) — how
  Fathom actually works under the hood: extraction pipeline, grounding
  strategy, why not RAG.
- [**Design principles →**]({{ '/PRINCIPLES' | relative_url }}) — the
  rules Fathom was built on. Read before proposing changes.
- [**Report a bug →**](https://github.com/ashryaagr/Fathom/issues)

There's no roadmap document because the roadmap is whatever the paper I'm
reading this week demands. If you're using Fathom on something it handles
badly, opening an issue with the PDF attached is the most direct way to
shape what ships next.
