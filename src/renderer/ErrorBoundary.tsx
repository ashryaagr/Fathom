import React, { type ReactNode } from 'react';

interface Props {
  /** Human-readable label that identifies *which* subtree crashed. Shows in
   * the log line so we can distinguish a FocusView crash from a PdfViewer
   * crash without reading a stack trace. */
  where: string;
  /** Optional custom fallback UI. Defaults to a minimal inline error card
   * so the user at least sees something happened — beats a white screen. */
  fallback?: (err: Error, retry: () => void) => ReactNode;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * React error boundary wired into Fathom's renderer → main log bridge.
 * When a descendant throws during render / lifecycle, the error is logged
 * via `window.lens.logDev(...)` so it lands in `~/Library/Logs/Fathom/fathom.log`.
 * Without this, a component-level crash just shows as a blank white window —
 * which is exactly the "white screen" bug we were blind to.
 *
 * Usage: wrap any subtree whose failure shouldn't take the whole app down.
 *
 *   <ErrorBoundary where="FocusView">
 *     <FocusView />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const data = {
      where: this.props.where,
      message: error.message,
      stack: (error.stack ?? '').slice(0, 4000),
      componentStack: (info.componentStack ?? '').slice(0, 2000),
    };
    try {
      void window.lens?.logDev?.('error', 'Fathom Renderer', 'React error boundary tripped', data);
    } catch {
      /* preload not available (e.g. dev-only path) — fall back below. */
    }
    console.error(`[Fathom Renderer] ${this.props.where} crashed:`, error, info);
  }

  retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.retry);
      return (
        <div
          role="alert"
          style={{
            padding: '32px',
            maxWidth: 520,
            margin: '64px auto',
            background: '#faf4e8',
            border: '1px solid #e0d3ac',
            borderRadius: 12,
            color: '#1a1614',
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>
            Something went wrong in {this.props.where}.
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: '#5a4a3a', marginBottom: 14 }}>
            Fathom logged the full error to{' '}
            <code style={{ background: '#f3ead7', padding: '1px 5px', borderRadius: 4 }}>
              ~/Library/Logs/Fathom/fathom.log
            </code>
            . If you share that file with a bug report, the session up to
            this point is recoverable.
          </div>
          <details style={{ fontSize: 12, color: '#7a6a52' }}>
            <summary style={{ cursor: 'pointer' }}>Error details</summary>
            <pre
              style={{
                marginTop: 8,
                padding: 10,
                background: '#f3ead7',
                borderRadius: 6,
                fontSize: 11,
                lineHeight: 1.45,
                overflow: 'auto',
                maxHeight: 220,
              }}
            >
              {error.message}
              {error.stack ? '\n\n' + error.stack : ''}
            </pre>
          </details>
          <button
            onClick={this.retry}
            style={{
              marginTop: 14,
              padding: '8px 18px',
              borderRadius: 999,
              border: 'none',
              background: '#1a1614',
              color: '#faf4e8',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
