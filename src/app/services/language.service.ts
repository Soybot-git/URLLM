import { Injectable, inject, signal } from '@angular/core';
import { IndexedDbService } from './indexed-db.service';
import { SupportedLanguage, TRANSLATIONS } from '../i18n/translations';

const DEFAULT_LANGUAGE: SupportedLanguage = 'it';

const LANGUAGE_CODES: Record<SupportedLanguage, string> = {
  it: 'Italian',
  en: 'English',
  fr: 'French',
  de: 'German',
};

/**
 * Gestisce la lingua corrente dell'applicazione e fornisce traduzioni.
 * Persiste la preferenza su IndexedDB.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly db = inject(IndexedDbService);
  readonly currentLanguage = signal<SupportedLanguage>(DEFAULT_LANGUAGE);

  constructor() {
    this.loadLanguage();
  }

  private async loadLanguage(): Promise<void> {
    const config = await this.db.getAppConfig();
    if (config?.selectedLanguage) {
      this.currentLanguage.set(config.selectedLanguage as SupportedLanguage);
    }
  }

  setLanguage(lang: SupportedLanguage): void {
    this.currentLanguage.set(lang);
  }

  translate(key: string): string {
    const lang = this.currentLanguage();
    return TRANSLATIONS[lang][key] ?? TRANSLATIONS[DEFAULT_LANGUAGE][key] ?? key;
  }

  getLlmLanguageName(): string {
    return LANGUAGE_CODES[this.currentLanguage()];
  }
}
