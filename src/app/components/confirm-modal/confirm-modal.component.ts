import { Component, inject, input, output } from '@angular/core';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [],
  templateUrl: './confirm-modal.component.html',
  styleUrl: './confirm-modal.component.scss',
})
export class ConfirmModalComponent {
  readonly language = inject(LanguageService);

  readonly message = input.required<string>();
  readonly confirm = output<void>();
  readonly cancel = output<void>();

  t(key: string): string {
    return this.language.translate(key);
  }
}
