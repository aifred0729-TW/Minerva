import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, PackageX } from 'lucide-react';
import { isChunkLoadError } from '../lib/lazyRetry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Minerva] Uncaught error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      // A chunk that would not load has already had its silent retries and its
      // one automatic reload (see lib/lazyRetry). React.lazy keeps the failed
      // payload for the life of the tab, so re-rendering the same route cannot
      // recover — do not offer "Try Again" here and pretend otherwise.
      const chunkFailure = isChunkLoadError(this.state.error);

      return (
        <div className="flex flex-col items-center justify-center h-screen w-screen bg-void text-signal font-mono gap-4 p-8">
          {chunkFailure
            ? <PackageX className="text-red-400" size={44} strokeWidth={1.5} />
            : <AlertTriangle className="text-red-400" size={44} strokeWidth={1.5} />}
          <h1 className="text-sm font-bold tracking-[0.3em] uppercase text-red-400">
            {chunkFailure ? 'Interface out of date' : 'Something went wrong'}
          </h1>
          <p className="text-xs text-signal max-w-lg text-center leading-relaxed">
            {chunkFailure
              ? 'This page could not be fetched from the server. The console was most likely updated while this tab was open — reload to pick up the current build.'
              : (this.state.error?.message || 'An unexpected error occurred.')}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-4 py-2 mt-2 bg-black/40 hover:bg-signal/5 border border-signal/20 hover:border-signal/40 rounded-md text-[10px] font-bold tracking-[0.2em] uppercase transition-colors"
          >
            <RotateCcw size={12} strokeWidth={2} />
            Reload
          </button>
          {!chunkFailure && (
            <button
              onClick={this.handleReset}
              className="text-[10px] font-bold tracking-[0.2em] uppercase text-signal hover:text-accent transition-colors"
            >
              Try Again
            </button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
