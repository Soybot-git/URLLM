import { Injectable, inject, signal, computed } from '@angular/core';
import { ChatThread, ChatMessage } from '../models/chat.types';
import { IndexedDbService } from './indexed-db.service';
import { LlmService } from './llm.service';

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function createEmptyThread(): ChatThread {
  return {
    id: generateId(),
    title: 'Nuova Chat',
    messages: [],
    createdAt: Date.now(),
  };
}

/**
 * Store centrale reattivo (Angular Signals) per la gestione dei thread.
 * Coordina la persistenza su IndexedDB e lo stato della UI.
 */
@Injectable({ providedIn: 'root' })
export class ChatStateService {
  private readonly threadsSignal = signal<ChatThread[]>([]);
  private readonly activeThreadIdSignal = signal<string>('');

  readonly threads = this.threadsSignal.asReadonly();
  readonly activeThreadId = this.activeThreadIdSignal.asReadonly();
  readonly activeMessages = computed(() => {
    const id = this.activeThreadIdSignal();
    const thread = this.threadsSignal().find((t) => t.id === id);
    return thread ? thread.messages : [];
  });

  readonly generatingThreadId = signal<string | null>(null);
  private readonly streamingContentByThread = signal<Record<string, string>>({});

  readonly activeStreamingContent = computed(() => {
    const id = this.activeThreadIdSignal();
    const map = this.streamingContentByThread();
    const genId = this.generatingThreadId();
    return genId === id ? (map[id] ?? '') : '';
  });

  setGeneratingThreadId(threadId: string | null): void {
    this.generatingThreadId.set(threadId);
  }

  setStreamingContent(threadId: string, content: string): void {
    this.streamingContentByThread.update(map => ({ ...map, [threadId]: content }));
  }

  clearStreamingContent(threadId: string): void {
    this.streamingContentByThread.update(map => {
      const next = { ...map };
      delete next[threadId];
      return next;
    });
  }

  private readonly draftsByThread = signal<Record<string, string>>({});

  saveDraft(threadId: string, text: string): void {
    this.draftsByThread.update(map => ({ ...map, [threadId]: text }));
  }

  loadDraft(threadId: string): string {
    return this.draftsByThread()[threadId] ?? '';
  }

  private readonly db = inject(IndexedDbService);
  private readonly llm = inject(LlmService);

  async loadFromDb(): Promise<void> {
    try {
      const loaded = await this.db.getAllThreads();
      if (loaded.length === 0) {
        const first = createEmptyThread();
        await this.db.saveThread(first);
        this.threadsSignal.set([first]);
        this.activeThreadIdSignal.set(first.id);
      } else {
        loaded.sort((a, b) => b.createdAt - a.createdAt);
        this.threadsSignal.set(loaded);
        this.activeThreadIdSignal.set(loaded[0].id);
      }
    } catch (e) {
      console.error('Error loading IndexedDB', e);
      const fallback = createEmptyThread();
      this.threadsSignal.set([fallback]);
      this.activeThreadIdSignal.set(fallback.id);
    }
  }

  async createThread(): Promise<void> {
    const thread = createEmptyThread();
    await this.db.saveThread(thread);
    this.threadsSignal.update((threads) => [thread, ...threads]);
    this.activeThreadIdSignal.set(thread.id);
  }

  selectThread(id: string): void {
    this.activeThreadIdSignal.set(id);
  }

  async deleteThread(id: string): Promise<void> {
    if (this.generatingThreadId() === id) {
      this.llm.stopGeneration();
      this.generatingThreadId.set(null);
      this.clearStreamingContent(id);
    }
    await this.db.deleteThread(id);
    this.threadsSignal.update((threads) => threads.filter((t) => t.id !== id));
    if (this.activeThreadIdSignal() === id) {
      const remaining = this.threadsSignal();
      if (remaining.length > 0) {
        this.activeThreadIdSignal.set(remaining[0].id);
      } else {
        await this.createThread();
      }
    }
  }

  async clearAllData(): Promise<void> {
    if (this.generatingThreadId()) {
      this.llm.stopGeneration();
      this.generatingThreadId.set(null);
      this.streamingContentByThread.set({});
    }
    await this.db.clearAllThreads();
    const fresh = createEmptyThread();
    await this.db.saveThread(fresh);
    this.threadsSignal.set([fresh]);
    this.activeThreadIdSignal.set(fresh.id);
  }

  async removeLastMessage(threadId: string): Promise<void> {
    const threads = this.threadsSignal().map(t =>
      t.id === threadId ? { ...t, messages: t.messages.slice(0, -1) } : t
    );
    this.threadsSignal.set(threads);
    const thread = threads.find(t => t.id === threadId);
    if (thread) await this.db.saveThread(thread);
  }

  async addMessage(threadId: string, message: ChatMessage): Promise<void> {
    const threads = this.threadsSignal().map(t =>
      t.id === threadId ? { ...t, messages: [...t.messages, message] } : t
    );
    this.threadsSignal.set(threads);
    const updated = threads.find(t => t.id === threadId);
    if (updated) await this.db.saveThread(updated);
  }

  async updateThreadTitle(threadId: string): Promise<void> {
    const threads = this.threadsSignal().map(t =>
      t.id === threadId ? { ...t, title: this.computeTitle(t.messages) } : t
    );
    this.threadsSignal.set(threads);
    const updated = threads.find(t => t.id === threadId);
    if (updated) await this.db.saveThread(updated);
  }

  getThreadTitle(thread: ChatThread): string {
    return this.computeTitle(thread.messages);
  }

  private computeTitle(messages: ChatMessage[]): string {
    const first = messages.find(m => m.role === 'user');
    return first ? first.content.slice(0, 30) : 'Nuova Chat';
  }
}
