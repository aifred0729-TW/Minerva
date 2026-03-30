import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

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

      return (
        <div className="flex flex-col items-center justify-center h-screen w-screen bg-void text-gray-300 font-mono gap-4 p-8">
          <AlertTriangle className="text-red-500" size={48} />
          <h1 className="text-xl text-red-400 font-bold">Something went wrong</h1>
          <p className="text-sm text-gray-500 max-w-lg text-center">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 mt-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded text-sm transition-colors"
          >
            <RotateCcw size={14} />
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
