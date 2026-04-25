import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <div className="space-y-6 max-w-2xl">
        {/* Light-mode logo */}
        <Image
          src="/logo_light.png"
          alt="Relay-E"
          width={420}
          height={210}
          priority
          className="mx-auto h-auto w-[260px] sm:w-[320px] dark:hidden"
        />
        {/* Dark-mode logo */}
        <Image
          src="/logo_dark.png"
          alt="Relay-E"
          width={420}
          height={210}
          priority
          className="mx-auto hidden h-auto w-[260px] dark:block sm:w-[320px]"
        />
        <p className="text-sm font-medium text-fd-muted-foreground">
          Multi-tenant AI orchestration engine
        </p>
        <p className="text-lg text-fd-muted-foreground">
          Skills, tools, and a context resolver in front of any LLM.
          Anthropic, OpenAI, OpenRouter, or local Ollama. Local-first by design.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/docs/get-started/introduction"
          className="rounded-md bg-fd-primary text-fd-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90 transition"
        >
          Read the docs →
        </Link>
        <Link
          href="/docs/get-started/quickstart"
          className="rounded-md border border-fd-border px-5 py-2.5 text-sm font-medium hover:bg-fd-accent transition"
        >
          Quickstart (5 min)
        </Link>
        <a
          href="https://github.com/belulok/relay-e"
          className="rounded-md border border-fd-border px-5 py-2.5 text-sm font-medium hover:bg-fd-accent transition"
        >
          GitHub →
        </a>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 max-w-4xl pt-12 text-left">
        <div className="rounded-lg border border-fd-border bg-fd-card p-5">
          <div className="text-sm font-semibold mb-2">Provider-agnostic</div>
          <p className="text-sm text-fd-muted-foreground">
            One key with OpenRouter (100+ models), or wire Anthropic / OpenAI / Ollama directly.
          </p>
        </div>
        <div className="rounded-lg border border-fd-border bg-fd-card p-5">
          <div className="text-sm font-semibold mb-2">Auto-generated OpenAPI</div>
          <p className="text-sm text-fd-muted-foreground">
            Zod schemas drive validation, types, and the spec. Postman imports in one click.
          </p>
        </div>
        <div className="rounded-lg border border-fd-border bg-fd-card p-5">
          <div className="text-sm font-semibold mb-2">Local-first</div>
          <p className="text-sm text-fd-muted-foreground">
            <code>docker compose up</code> boots the entire stack. Same image runs in production.
          </p>
        </div>
      </div>
    </main>
  );
}
