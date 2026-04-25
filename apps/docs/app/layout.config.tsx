import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <span className="font-semibold tracking-tight">Relay-E</span>
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
