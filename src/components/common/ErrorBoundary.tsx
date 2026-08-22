import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[DeepScout ErrorBoundary Caught]:", error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-grow flex items-center justify-center p-8 bg-[#080a0c] text-white">
          <div className="max-w-lg w-full p-6 rounded-3xl bg-[#14171c] border border-rose-500/30 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h2 className="text-base font-bold text-white">
                {this.props.fallbackTitle || "Workspace Rendering Error"}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                An unexpected exception was caught. The details have been logged to the Debug Console.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-black/50 border border-white/5 font-mono text-[11px] text-rose-300 text-left overflow-x-auto max-h-36">
              {this.state.error?.message || "Unknown error"}
            </div>

            <button
              onClick={this.handleReset}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all inline-flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset & Reload Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
