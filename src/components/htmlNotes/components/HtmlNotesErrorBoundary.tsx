import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  onResetToHome?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class HtmlNotesErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('HtmlNotesErrorBoundary caught an error in Notes Studio:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    if (this.props.onResetToHome) {
      this.props.onResetToHome();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 w-full h-full min-h-[400px] flex items-center justify-center p-6 bg-slate-50 dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3]">
          <div className="max-w-md w-full bg-white dark:bg-[#1a1c23] rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200 dark:border-zinc-800 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Note Studio Recovered</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                An unexpected display error occurred while rendering the editor. Your notes and project files are safe in storage.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 bg-slate-100 dark:bg-zinc-900 rounded-xl text-[11px] font-mono text-left text-slate-700 dark:text-zinc-300 overflow-x-auto max-h-24">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:w-auto px-4 py-2.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-semibold text-xs border-0 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Projects</span>
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: undefined })}
                className="w-full sm:w-auto px-4 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-semibold text-xs border-0 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
