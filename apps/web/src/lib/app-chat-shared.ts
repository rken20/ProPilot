/** Shared by the buyer chat's server actions and its client component. */
export const MAX_CHAT_CHARS = 1000;
export type ChatMessage = { id: string; sender: "buyer" | "ai" | "agent" | "page"; body: string; created_at: string };
