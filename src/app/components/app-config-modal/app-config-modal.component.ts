import { Component, OnInit, inject, output, effect, signal, input, computed } from '@angular/core';
import {
  prebuiltAppConfig,
  hasModelInCache,
  deleteModelAllInfoInCache,
  deleteModelInCache,
} from '@mlc-ai/web-llm';
import { LlmService } from '../../services/llm.service';
import { IndexedDbService } from '../../services/indexed-db.service';
import { LanguageService } from '../../services/language.service';
import { SupportedLanguage } from '../../i18n/translations';

type SetupState = 'intro' | 'checking' | 'selecting' | 'downloading' | 'ready' | 'error';

interface ModelOption {
  model_id: string;
  vram_required_MB: number | undefined;
  low_resource_required: boolean | undefined;
  model_lib: string;
  model: string;
}

interface NavigatorExtended extends Navigator {
  deviceMemory?: number;
}

/**
 * Modale di configurazione globale dell'applicazione.
 * Permette di scegliere la lingua e il modello LLM compatibile.
 */
@Component({
  selector: 'app-config-modal',
  standalone: true,
  imports: [],
  templateUrl: './app-config-modal.component.html',
  styleUrl: './app-config-modal.component.scss',
})
export class AppConfigModalComponent implements OnInit {
  setupComplete = output<void>();
  closeModal = output<void>();

  readonly llm = inject(LlmService);
  private readonly db = inject(IndexedDbService);
  readonly language = inject(LanguageService);

  readonly setupState = signal<SetupState>('intro');
  readonly models = signal<ModelOption[]>([]);
  readonly recommended = signal<Array<{ model: ModelOption; labelKey: string }>>([]);
  readonly selectedModelId = signal<string | null>(null);
  readonly selectedLanguage = signal<SupportedLanguage>(this.language.currentLanguage());
  readonly memoryUnknown = signal(false);
  readonly errorText = signal('');
  readonly deviceRamGB = signal<number | null>(null);
  readonly searchQuery = signal<string>('');
  readonly activeAccordion = signal<'recommended' | 'all' | null>('recommended');
  readonly filteredModels = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.models();
    return this.models().filter(m => m.model_id.toLowerCase().includes(q));
  });

  readonly supportedLanguages: SupportedLanguage[] = ['it', 'en', 'fr', 'de'];

  currentModelId = input<string | null>(null);
  readonly isChangeModelFlow = input<boolean>(false);

  constructor() {
    effect(() => {
      const state = this.setupState();
      if (state !== 'downloading') return;

      const engineStatus = this.llm.status();
      if (engineStatus === 'ready') {
        this.setupState.set('ready');
      } else if (engineStatus === 'error') {
        this.setupState.set('error');
        this.errorText.set(this.llm.statusText());
      }
    });
  }

  ngOnInit(): void {
    if (this.isChangeModelFlow()) {
      this.checkEnvironment();
    }
  }

  proceedToSelection(): void {
    this.checkEnvironment();
  }

  t(key: string): string {
    return this.language.translate(key);
  }

  memoryDetectedText(gb: number): string {
    return this.language.translate('modal.memoryDetected').replace('{{gb}}', String(gb));
  }

  private findClosest(models: ModelOption[], targetMB: number, excludeIds: string[]): ModelOption | null {
    let closest: ModelOption | null = null;
    let minDiff = Infinity;
    for (const m of models) {
      if (m.vram_required_MB === undefined || excludeIds.includes(m.model_id)) continue;
      const diff = Math.abs(m.vram_required_MB - targetMB);
      if (diff < minDiff) {
        minDiff = diff;
        closest = m;
      }
    }
    return closest;
  }

  /**
   * Analizza dispositivo e filtra modelli per RAM / WebGPU.
   * Se la RAM non è rilevabile mostra tutto il catalogo con avviso.
   */
  private async checkEnvironment(): Promise<void> {
    try {
      this.setupState.set('checking');

      if (!('gpu' in navigator)) {
        this.errorText.set(this.t('llm.statusGpuUnsupported'));
        this.setupState.set('error');
        return;
      }

      const rawMem = (navigator as NavigatorExtended).deviceMemory;
      let thresholdMB: number | null = null;

      if (typeof rawMem === 'number') {
        this.deviceRamGB.set(rawMem);
        thresholdMB = rawMem * 1024 * 0.7;
      } else {
        this.memoryUnknown.set(true);
      }

      const allModels: ModelOption[] = prebuiltAppConfig.model_list.map((m) => ({
        model_id: m.model_id,
        vram_required_MB: (m as ModelOption).vram_required_MB,
        low_resource_required: (m as ModelOption).low_resource_required,
        model_lib: m.model_lib,
        model: m.model,
      }));

      let filtered: ModelOption[];
      if (thresholdMB !== null) {
        filtered = allModels.filter(
          (m) => m.vram_required_MB !== undefined && m.vram_required_MB <= thresholdMB!
        );
      } else {
        filtered = allModels;
      }

      // Ordina per VRAM decrescente (più performanti in cima)
      filtered.sort((a, b) => {
        const av = a.vram_required_MB ?? 0;
        const bv = b.vram_required_MB ?? 0;
        return bv - av;
      });

      let recommendedList: Array<{ model: ModelOption; labelKey: string }> = [];
      if (!this.memoryUnknown() && typeof rawMem === 'number') {
        const totalRamMB = rawMem * 1024;
        const optimized = filtered.filter((m) => m.low_resource_required);
        if (optimized.length >= 3) {
          const top70 = this.findClosest(optimized, totalRamMB * 0.7, []);
          const mid50 = top70 ? this.findClosest(optimized, totalRamMB * 0.5, [top70.model_id]) : null;
          const low30 = top70 && mid50
            ? this.findClosest(optimized, totalRamMB * 0.3, [top70.model_id, mid50.model_id])
            : null;
          if (top70 && mid50 && low30) {
            recommendedList = [
              { model: top70, labelKey: 'modal.recommendedTopLabel' },
              { model: mid50, labelKey: 'modal.recommendedMidLabel' },
              { model: low30, labelKey: 'modal.recommendedLowLabel' },
            ];
            this.selectedModelId.set(top70.model_id);
          }
        }
      }

      this.models.set(filtered);
      this.recommended.set(recommendedList);
      this.setupState.set('selecting');
    } catch (err) {
      console.error(err);
      this.errorText.set(this.t('modal.titleError'));
      this.setupState.set('error');
    }
  }

  onSelectLanguage(lang: SupportedLanguage): void {
    this.selectedLanguage.set(lang);
    this.language.setLanguage(lang);
  }

  onSelectModel(id: string): void {
    this.selectedModelId.set(id);
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  onSearchClear(): void {
    this.searchQuery.set('');
  }

  toggleAccordion(section: 'recommended' | 'all'): void {
    this.activeAccordion.update(current => current === section ? null : section);
  }

  /**
   * Conferma lingua e modello selezionati, quindi avvia download.
   * Se stiamo cambiando modello, cancella il vecchio dalla cache.
   */
  async confirmConfiguration(): Promise<void> {
    const chosen = this.selectedModelId();
    if (!chosen) return;

    this.llm.dispose();
    this.setupState.set('downloading');

    try {
      const oldModel = this.currentModelId();
      if (oldModel && oldModel !== chosen) {
        await deleteModelAllInfoInCache(oldModel);
        await deleteModelInCache(oldModel);
      }

      await this.db.saveAppConfig({
        key: 'config',
        selectedModelId: chosen,
        selectedLanguage: this.language.currentLanguage(),
      });
      await this.llm.init(chosen);
    } catch (err) {
      console.error(err);
      this.errorText.set(this.t('llm.statusLoadError'));
      this.setupState.set('error');
    }
  }

  enterChat(): void {
    this.setupComplete.emit();
  }

  cancel(): void {
    this.closeModal.emit();
  }

  retry(): void {
    this.errorText.set('');
    this.checkEnvironment();
  }
}
