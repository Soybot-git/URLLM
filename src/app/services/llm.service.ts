import { Injectable, inject, signal } from '@angular/core';
import {
  CreateWebWorkerMLCEngine,
  MLCEngineInterface,
  InitProgressReport,
  ChatCompletionMessageParam,
} from '@mlc-ai/web-llm';
import { EngineStatus, ChatMessage } from '../models/chat.types';
import { LanguageService } from './language.service';

const MAX_HISTORY_MESSAGES = 8;

/**
 * Singleton che gestisce il lifecycle del motore MLC AI tramite WebWorker.
 * Espone Signals per monitorare caricamento, stato, risposta in tempo reale
 * e il modello attualmente attivo.
 */
@Injectable({ providedIn: 'root' })
export class LlmService {
  private readonly language = inject(LanguageService);

  readonly status = signal<EngineStatus>('idle');
  readonly progress = signal<number>(0);
  readonly statusText = signal<string>('');

  readonly activeModelId = signal<string | null>(null);
  private _generationStopped = false;
  private _generationToken = 0;

  get generationStopped(): boolean {
    return this._generationStopped;
  }

  private engine: MLCEngineInterface | null = null;
  private worker: Worker | null = null;

  async init(modelId: string): Promise<void> {
    this.activeModelId.set(modelId);
    this.dispose();

    this.status.set('checking');
    this.statusText.set(this.language.translate('llm.statusChecking'));

    if (!('gpu' in navigator)) {
      this.status.set('error');
      this.statusText.set(this.language.translate('llm.statusGpuUnsupported'));
      return;
    }

    try {
      const initProgressCallback = (report: InitProgressReport) => {
        this.progress.set(Math.round(report.progress * 100));
        this.statusText.set(this.language.translate('llm.statusDownloading'));
        this.status.set(report.progress < 1 ? 'downloading' : 'ready');
      };

      this.worker = new Worker(
        new URL('../workers/llm.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.engine = await CreateWebWorkerMLCEngine(this.worker, modelId, {
        initProgressCallback,
      });
    } catch (err) {
      this.status.set('error');
      this.statusText.set(this.language.translate('llm.statusLoadError'));
      console.error(err);
    }
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.engine = null;
    this.status.set('idle');
    this.progress.set(0);
    this.statusText.set('');
  }

  stopGeneration(): void {
    this._generationStopped = true;
    this.engine?.interruptGenerate();
  }

  async generateResponse(
    messages: ChatMessage[],
    threadId: string,
    onToken?: (content: string) => void
  ): Promise<string> {
    if (!this.engine) {
      throw new Error('Motore AI non inizializzato');
    }

    this._generationStopped = false;
    const currentToken = ++this._generationToken;

    const recentMessages = messages.slice(-MAX_HISTORY_MESSAGES);

    const history: ChatCompletionMessageParam[] = [
      ...recentMessages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    ];

    const completion = await this.engine.chat.completions.create({
      messages: history,
      stream: true,
      temperature: 0.2,
      top_p: 0.95,
    });

    let fullResponse = '';
    for await (const chunk of completion) {
      if (currentToken !== this._generationToken) break;
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        onToken?.(fullResponse);
      }
    }

    return fullResponse;
  }
}
