import { z } from "zod";

export const TextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const ImageBlockSchema = z.object({
  type: z.literal("image"),
  file_id: z.string().optional(),
  url: z.string().url().optional(),
  mime: z.string().default("image/png"),
});

export const AudioBlockSchema = z.object({
  type: z.literal("audio"),
  file_id: z.string().optional(),
  transcript: z.string().optional(),
  duration_s: z.number().optional(),
});

export const VideoBlockSchema = z.object({
  type: z.literal("video"),
  file_id: z.string(),
  frames: z.array(z.string()).optional(),
  transcript: z.string().optional(),
});

export const DocumentBlockSchema = z.object({
  type: z.literal("document"),
  file_id: z.string(),
  summary: z.string().optional(),
  chunks: z
    .array(z.object({ text: z.string(), index: z.number() }))
    .optional(),
});

export const ToolResultBlockSchema = z.object({
  type: z.literal("tool_result"),
  tool_call_id: z.string(),
  output: z.unknown(),
  is_error: z.boolean().optional(),
});

export const ContentBlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  ImageBlockSchema,
  AudioBlockSchema,
  VideoBlockSchema,
  DocumentBlockSchema,
  ToolResultBlockSchema,
]);

export type ContentBlock = z.infer<typeof ContentBlockSchema>;

export type Modality = "text" | "image" | "audio" | "video" | "document";

export function modalitiesIn(blocks: ContentBlock[]): Set<Modality> {
  const set = new Set<Modality>();
  for (const b of blocks) {
    if (b.type === "text") set.add("text");
    else if (b.type === "image") set.add("image");
    else if (b.type === "audio") set.add("audio");
    else if (b.type === "video") set.add("video");
    else if (b.type === "document") set.add("document");
  }
  return set;
}

export const MessageRoleSchema = z.enum(["user", "assistant", "tool", "system"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.array(ContentBlockSchema),
});

export type Message = z.infer<typeof MessageSchema>;
