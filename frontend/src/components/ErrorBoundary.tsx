import { Component, type ReactNode } from "react";

const RELOAD_FLAG = "chunk-reload";
const isStaleChunk = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(String((e as Error)?.message ?? e));

/** Catches render errors. After an update, an open tab may ask for old chunk files: reload once to pick up the new build. */
export default class ErrorBoundary extends Component<
  { children: ReactNode; reload?: () => void },
  { error: unknown }
> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    if (isStaleChunk(error) && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, "1");
      (this.props.reload ?? (() => window.location.reload()))();
    }
  }

  componentDidMount() {
    setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 10000);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card p-8 text-center">
        <p className="font-medium">Er ging iets mis</p>
        <p className="mt-1 text-sm text-muted">Laad de pagina opnieuw. Blijft dit gebeuren, herstart dan het dashboard.</p>
        <button onClick={() => (this.props.reload ?? (() => window.location.reload()))()} className="mt-5 h-9 rounded-xl border border-line px-4 text-sm hover:bg-surface-2">
          Opnieuw laden
        </button>
      </div>
    );
  }
}
