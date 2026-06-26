import { Component, inject, signal, output, ViewChild, ElementRef, afterNextRender, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatStateService } from '../../services/chat-state.service';
import { LlmService } from '../../services/llm.service';
import { LanguageService } from '../../services/language.service';
import { stripThinkTags } from '../../models/chat.types';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent {
  private readonly state = inject(ChatStateService);
  private readonly llm = inject(LlmService);
  readonly language = inject(LanguageService);

  readonly messages = this.state.activeMessages;
  readonly status = this.llm.status;
  readonly progress = this.llm.progress;
  readonly statusText = this.llm.statusText;
  readonly currentResponse = this.state.activeStreamingContent;
  readonly activeModelId = this.llm.activeModelId;
  readonly isGenerating = computed(() => this.state.generatingThreadId() !== null);

  readonly isInputDisabled = computed(() => {
    const genId = this.state.generatingThreadId();
    const activeId = this.state.activeThreadId();
    return genId !== null && genId !== activeId;
  });

  readonly isCurrentThreadGenerating = computed(() =>
    this.state.generatingThreadId() === this.state.activeThreadId()
  );

  readonly changeModel = output<void>();

  inputText = signal('');

  onInputChange(text: string): void {
    this.inputText.set(text);
    const threadId = this.state.activeThreadId();
    if (threadId) {
      this.state.saveDraft(threadId, text);
    }
  }

  @ViewChild('messageFeed', { static: false }) private messageFeedRef!: ElementRef<HTMLElement>;

  constructor() {
    afterNextRender(() => {
      this.scrollToBottom();
    });

    effect(() => {
      const threadId = this.state.activeThreadId();
      this.inputText.set(threadId ? this.state.loadDraft(threadId) : '');
    });
  }

  private scrollToBottom(): void {
    const el = this.messageFeedRef?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  exchangeBoundary(idx: number): boolean {
    const msgs = this.messages();
    return idx > 0 && msgs[idx - 1].role === 'assistant' && msgs[idx].role === 'user';
  }

  t(key: string): string {
    return this.language.translate(key);
  }

  async sendMessage(): Promise<void> {
    const text = this.inputText().trim();
    if (!text || this.isGenerating()) return;

    const threadId = this.state.activeThreadId();
    if (!threadId) return;

    const prevGeneratingThread = this.state.generatingThreadId();
    if (prevGeneratingThread && prevGeneratingThread !== threadId) {
      this.llm.stopGeneration();
      this.state.clearStreamingContent(prevGeneratingThread);
    }

    await this.state.addMessage(threadId, { role: 'user', content: text });
    await this.state.updateThreadTitle(threadId);
    this.inputText.set('');
    this.state.saveDraft(threadId, '');

    this.state.setGeneratingThreadId(threadId);

    try {
      const history = this.messages();
      const fullResponse = await this.llm.generateResponse(history, threadId, (content) => {
        this.state.setStreamingContent(threadId, content);
      });

      if (this.llm.generationStopped) return;

      await this.state.addMessage(threadId, { role: 'assistant', content: stripThinkTags(fullResponse) });
      setTimeout(() => this.scrollToBottom(), 50);
    } catch (err) {
      console.error(this.t('chat.errorGenerating'), err);
      await this.state.addMessage(threadId, {
        role: 'assistant',
        content: this.t('chat.errorGenerating'),
      });
    } finally {
      if (this.state.generatingThreadId() === threadId) {
        this.state.setGeneratingThreadId(null);
        this.state.clearStreamingContent(threadId);
      }
      setTimeout(() => this.scrollToBottom(), 50);
    }
  }

  stopGenerating(): void {
    this.llm.stopGeneration();
    const threadId = this.state.generatingThreadId();
    if (threadId) {
      this.state.removeLastMessage(threadId);
      this.state.setGeneratingThreadId(null);
      this.state.clearStreamingContent(threadId);
    }
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}
