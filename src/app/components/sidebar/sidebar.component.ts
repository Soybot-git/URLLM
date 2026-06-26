import { Component, inject, output } from '@angular/core';
import { ChatStateService } from '../../services/chat-state.service';
import { LanguageService } from '../../services/language.service';
import { ChatThread } from '../../models/chat.types';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  private readonly state = inject(ChatStateService);
  readonly language = inject(LanguageService);

  readonly threads = this.state.threads;
  readonly activeThreadId = this.state.activeThreadId;

  clearAllRequest = output<void>();
  resetApp = output<void>();

  t(key: string): string {
    return this.language.translate(key);
  }

  createThread(): void {
    this.state.createThread();
  }

  selectThread(id: string): void {
    this.state.selectThread(id);
  }

  async deleteThread(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    await this.state.deleteThread(id);
  }

  clearAll(): void {
    this.clearAllRequest.emit();
  }

  onResetApp(): void {
    this.resetApp.emit();
  }

  getTitle(thread: ChatThread): string {
    return this.state.getThreadTitle(thread);
  }
}
