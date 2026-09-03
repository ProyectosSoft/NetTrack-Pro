import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

// Global error boundary: keeps a render error from blanking the whole app.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled UI error:", error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-card rounded-xl border border-border p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h1 className="text-lg font-heading font-bold">Algo salió mal</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Ocurrió un error inesperado en la aplicación. Puedes reintentar o recargar la página.
            </p>
            {this.state.error?.message && (
              <p className="text-xs text-muted-foreground/70 mt-3 font-mono break-words">{this.state.error.message}</p>
            )}
            <div className="flex gap-2 justify-center mt-5">
              <Button variant="outline" size="sm" onClick={this.handleReset}>Reintentar</Button>
              <Button size="sm" onClick={() => window.location.reload()}>Recargar</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
