import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <span className="flex items-center gap-2 font-semibold tracking-tight">
        {/* Light-mode logo (visible by default, hidden when html.dark) */}
        <Image
          src="/logo_light.png"
          alt="Relay-E"
          width={240}
          height={56}
          priority
          className="h-12 w-auto dark:hidden"
        />
        {/* Dark-mode logo (only visible when html.dark) */}
        <Image
          src="/logo_dark.png"
          alt="Relay-E"
          width={240}
          height={56}
          priority
          className="hidden h-12 w-auto dark:block"
        />
      </span>
    ),
  },
  links: [
    {
      text: "GitHub",
      url: "https://github.com/belulok/relay-e",
      external: true,
    },
    {
      text: "API Spec",
      url: "/docs/api/messages",
    },
  ],
  githubUrl: "https://github.com/belulok/relay-e",
};
