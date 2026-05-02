import { Component, type ReactNode } from "react";
import { Button } from "../ui/button";

interface Props {
    children: ReactNode;
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

    public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
                    <div className="w-full max-w-[640px] space-y-6 rounded-3xl border border-destructive/40 bg-destructive/10 px-6 py-8">
                        <div>
                            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-destructive">
                                CRITICAL SYSTEM FAILURE
                            </p>
                            <h2 className="mt-2 font-sans text-[24px] leading-[1.2] text-foreground">
                                Surface Halted
                            </h2>
                        </div>
                        <div className="space-y-2 border border-destructive/20 bg-background/50 p-4">
                            <p className="font-mono text-[12px] text-destructive">
                                {this.state.error?.name || "Error"}
                            </p>
                            <p className="font-mono text-[12px] text-foreground/70">
                                {this.state.error?.message || "An unexpected error occurred."}
                            </p>
                        </div>
                        <div className="flex justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => window.location.reload()}
                                className="border-destructive/40 text-destructive hover:bg-destructive/20 hover:text-destructive"
                            >
                                Reboot Surface
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
