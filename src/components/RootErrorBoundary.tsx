import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  showDetails: boolean;
}

/**
 * Top-Level Root Error Boundary for PrepLens
 * Prevents full-screen blank white screen crashes by catching uncaught render errors
 * and providing users with safe, one-click recovery options without losing local data.
 */
export class RootErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('PrepLens RootErrorBoundary caught an unhandled rendering error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    // Clear URL query/hash parameters that might have caused the state crash
    window.location.href = window.location.origin + window.location.pathname;
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#f8f9fa] dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3] font-sans transition-colors">
          <div className="max-w-lg w-full bg-white dark:bg-[#1a1c23] rounded-3xl p-6 sm:p-8 shadow-[0_8px_30px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)] border border-slate-200/80 dark:border-zinc-800 text-center space-y-5">
            {/* Warning Icon Badge */}
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 stroke-[2.2]" />
            </div>

            {/* Title & Description */}
            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Something went wrong
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                PrepLens encountered an unexpected display error. Your offline tests, practice notes, and stored questions remain safely intact.
              </p>
            </div>

            {/* Error Details (Expandable) */}
            {this.state.error?.message && (
              <div className="text-left">
                <button
                  type="button"
                  onClick={this.toggleDetails}
                  className="w-full flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 py-1 cursor-pointer outline-none border-0 bg-transparent transition-colors"
                >
                  <span className="font-medium">Technical Details</span>
                  {this.state.showDetails ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                {this.state.showDetails && (
                  <div className="mt-2 p-3 bg-slate-100 dark:bg-zinc-900 rounded-xl text-[11px] font-mono text-slate-700 dark:text-zinc-300 overflow-x-auto max-h-32 border border-slate-200 dark:border-zinc-800">
                    <p className="font-semibold text-rose-600 dark:text-rose-400 mb-1">
                      {this.state.error.name}: {this.state.error.message}
                    </p>
                    {this.state.error.stack && (
                      <pre className="text-[10px] text-slate-500 dark:text-zinc-500 whitespace-pre-wrap">
                        {this.state.error.stack.split('\n').slice(0, 5).join('\n')}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-sm border-0"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload App</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 border-0"
              >
                <Home className="w-4 h-4" />
                <span>Go to Home</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
