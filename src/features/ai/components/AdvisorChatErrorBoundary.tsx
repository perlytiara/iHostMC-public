"use client";

import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface AdvisorChatErrorBoundaryProps {
  children: ReactNode;
  conversationId: string;
  onRecover: () => void;
}

interface AdvisorChatErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/** Catches render errors in the advisor chat (e.g. malformed conversation data) and shows a fallback instead of the full page error. */
class AdvisorChatErrorBoundaryClass extends Component<
  AdvisorChatErrorBoundaryProps & { t: (key: string, fallback: string) => string },
  AdvisorChatErrorBoundaryState
> {
  state: AdvisorChatErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): AdvisorChatErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps: AdvisorChatErrorBoundaryProps & { t: (key: string, fallback: string) => string }) {
    if (prevProps.conversationId !== this.props.conversationId && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      const { t, onRecover } = this.props;
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("advisor.conversationLoadError", "This conversation couldn’t be loaded.")}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              onRecover();
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("advisor.startNewChat", "Start new chat")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AdvisorChatErrorBoundary({ children, conversationId, onRecover }: AdvisorChatErrorBoundaryProps) {
  const { t } = useTranslation();
  return (
    <AdvisorChatErrorBoundaryClass t={t} conversationId={conversationId} onRecover={onRecover}>
      {children}
    </AdvisorChatErrorBoundaryClass>
  );
}
