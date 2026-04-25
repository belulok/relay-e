import "./global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";

export const metadata = {
  title: {
    default: "Relay-E — Multi-tenant context-aware AI orchestration",
    template: "%s — Relay-E",
  },
  description:
    "Skills, tools, and a context resolver in front of any LLM — Anthropic, OpenAI, OpenRouter, or local Ollama. Multi-tenant, local-first, durable.",
  // Favicon is auto-injected from app/icon.svg by Next.js — no need to wire `icons` manually.
  openGraph: {
    title: "Relay-E",
    description:
      "Multi-tenant context-aware AI orchestration engine. Skills, tools, and a context resolver in front of any LLM.",
    images: ["/logo_dark.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay-E",
    description:
      "Multi-tenant context-aware AI orchestration engine.",
    images: ["/logo_dark.png"],
  },
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
