import "./global.css";
import { RootProvider } from "fumadocs-ui/provider";
import type { ReactNode } from "react";

export const metadata = {
  title: {
    default: "Relay-E — Multi-tenant context-aware AI orchestration",
    template: "%s — Relay-E",
  },
  description:
    "Skills, tools, and a context resolver in front of any LLM — Anthropic, OpenAI, OpenRouter, or local Ollama. Multi-tenant, local-first, durable.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
