"use client";

import { useEffect, useId, useState } from "react";
import { useTheme } from "next-themes";

interface MermaidProps {
  chart: string;
  caption?: string;
}

export function Mermaid({ chart, caption }: MermaidProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "_");
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === "dark" ? "dark" : "neutral",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          themeVariables: {
            // Match the Fumadocs neutral palette so diagrams blend with the page.
            primaryColor: resolvedTheme === "dark" ? "#1f1f1f" : "#fafafa",
            primaryTextColor: resolvedTheme === "dark" ? "#fafafa" : "#1f1f1f",
            primaryBorderColor: resolvedTheme === "dark" ? "#3f3f3f" : "#d4d4d4",
            lineColor: resolvedTheme === "dark" ? "#a3a3a3" : "#525252",
            secondaryColor: resolvedTheme === "dark" ? "#262626" : "#f5f5f5",
            tertiaryColor: resolvedTheme === "dark" ? "#171717" : "#ffffff",
            background: "transparent",
            mainBkg: resolvedTheme === "dark" ? "#1f1f1f" : "#fafafa",
            nodeBorder: resolvedTheme === "dark" ? "#3f3f3f" : "#d4d4d4",
            clusterBkg: resolvedTheme === "dark" ? "#0f0f0f" : "#fafafa",
            clusterBorder: resolvedTheme === "dark" ? "#3f3f3f" : "#e5e5e5",
            edgeLabelBackground: resolvedTheme === "dark" ? "#171717" : "#ffffff",
            fontSize: "14px",
          },
          flowchart: {
            curve: "basis",
            padding: 16,
            useMaxWidth: true,
          },
          sequence: {
            actorMargin: 60,
            messageFontSize: 13,
            useMaxWidth: true,
          },
        });

        const { svg } = await mermaid.render(`mermaid-${id}`, chart.trim());
        if (!cancelled) {
          setSvg(svg);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "render failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, resolvedTheme, id]);

  if (error) {
    return (
      <div className="my-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
        <strong>Diagram failed to render.</strong>
        <pre className="mt-2 whitespace-pre-wrap text-xs">{error}</pre>
      </div>
    );
  }

  return (
    <figure className="my-8 flex flex-col items-center gap-2">
      <div
        className="w-full overflow-x-auto [&>svg]:mx-auto [&>svg]:h-auto [&>svg]:max-w-full"
        // svg comes from mermaid render (trusted)
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {caption ? (
        <figcaption className="text-center text-sm text-fd-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
