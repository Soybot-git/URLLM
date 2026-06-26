export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

export type EngineStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'error';
