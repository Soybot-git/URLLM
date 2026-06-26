import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ChatComponent } from './components/chat/chat.component';
import { AppConfigModalComponent } from './components/app-config-modal/app-config-modal.component';
import { ConfirmModalComponent } from './components/confirm-modal/confirm-modal.component';
import { ChatStateService } from './services/chat-state.service';
import { LlmService } from './services/llm.service';
import { LanguageService } from './services/language.service';
import { IndexedDbService } from './services/indexed-db.service';
import {
  hasModelInCache,
  deleteModelAllInfoInCache,
  deleteModelInCache,
} from '@mlc-ai/web-llm';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [SidebarComponent, ChatComponent, AppConfigModalComponent, ConfirmModalComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly state = inject(ChatStateService);
  readonly llm = inject(LlmService);
  private readonly db = inject(IndexedDbService);
  readonly language = inject(LanguageService);

  readonly showSetupModal = signal(false);
  readonly isChangeModelFlow = signal(false);

  readonly showConfirmModal = signal(false);
  readonly confirmMessage = signal('');
  private confirmAction: (() => Promise<void>) | null = null;

  constructor() {
    effect(() => {
      document.documentElement.lang = this.language.currentLanguage();
    });
  }

  async ngOnInit(): Promise<void> {
    this.state.loadFromDb();
    await this.resolveStartup();
  }

  private async resolveStartup(): Promise<void> {
    const config = await this.db.getAppConfig();
    const hasLang = !!config?.selectedLanguage;
    const hasModel = !!config?.selectedModelId;

    if (hasLang && hasModel) {
      try {
        const cached = await hasModelInCache(config!.selectedModelId!);
        if (cached) {
          await this.llm.init(config!.selectedModelId!);
          this.showSetupModal.set(false);
          return;
        }
      } catch {
        // In caso di errore nella verifica cache, richiede setup
      }
    }

    this.showSetupModal.set(true);
  }

  onSetupComplete(): void {
    this.isChangeModelFlow.set(false);
    this.showSetupModal.set(false);
  }

  onRequestChangeModel(): void {
    this.isChangeModelFlow.set(true);
    this.showSetupModal.set(true);
  }

  onCloseChangeModel(): void {
    this.isChangeModelFlow.set(false);
    this.showSetupModal.set(false);
  }

  private openConfirmModal(message: string, action: () => Promise<void>): void {
    this.confirmMessage.set(message);
    this.confirmAction = action;
    this.showConfirmModal.set(true);
  }

  async onConfirmModal(): Promise<void> {
    this.showConfirmModal.set(false);
    const action = this.confirmAction;
    this.confirmAction = null;
    if (action) {
      try {
        await action();
      } catch (e) {
        console.error('Confirm action failed', e);
      }
    }
  }

  onCancelModal(): void {
    this.showConfirmModal.set(false);
    this.confirmAction = null;
  }

  onClearAllRequest(): void {
    this.openConfirmModal(
      this.language.translate('sidebar.clearAllConfirm'),
      () => this.state.clearAllData(),
    );
  }

  onResetApp(): void {
    this.openConfirmModal(
      this.language.translate('app.resetConfirm'),
      async () => {
        const currentModel = this.llm.activeModelId();
        this.llm.dispose();
        await this.db.resetDatabase();

        if (currentModel) {
          try {
            await deleteModelAllInfoInCache(currentModel);
            await deleteModelInCache(currentModel);
          } catch (e) {
            console.warn('Error cleaning model cache', e);
          }
        }

        window.location.reload();
      },
    );
  }
}
