/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  declare props: Readonly<Props>;
  declare setState: (state: Partial<State> | ((prevState: Readonly<State>) => Partial<State> | null)) => void;
  state: State = {
    hasError: false,
    errorMessage: ''
  };

  public static getDerivedStateFromError(error: Error): State {
    let msg = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(msg);
      if (parsed && typeof parsed.error === 'string') {
        msg = `${parsed.operationType?.toUpperCase() || 'Database'} error (${parsed.path || 'unknown'}): ${parsed.error}`;
      }
    } catch {}
    return { hasError: true, errorMessage: msg };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, errorInfo);
  }

  private handleRecover = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-rose-200 p-6 space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Something went wrong</h2>
            <p className="text-xs text-slate-600 leading-relaxed break-words bg-slate-50 p-3 rounded-xl border border-slate-200">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={this.handleRecover}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Return to Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
