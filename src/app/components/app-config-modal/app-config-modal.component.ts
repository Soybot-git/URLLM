import { Component, OnInit, inject, output, effect, signal, input, computed } from '@angular/core';
import {
  prebuiltAppConfig,
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
  readonly selectedModelId = signal<string | null>(null);
  readonly selectedLanguage = signal<SupportedLanguage>(this.language.currentLanguage());
  readonly memoryUnknown = signal(false);
  readonly errorText = signal('');
  readonly deviceRamGB = signal<number | null>(null);
  readonly searchQuery = signal<string>('');
  readonly showAllModels = signal(false);
  readonly preselectedModel = computed(() => this.findBestModel(this.models(), this.deviceRamGB()));
  readonly filteredModels = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.models();
    return this.models().filter(m => m.model_id.toLowerCase().includes(q));
  });

  readonly supportedLanguages: SupportedLanguage[] = ['it', 'en', 'fr', 'de'];

  currentModelId = input<string | null>(null);
  readonly isChangeModelFlow = input<boolean>(false);

  /**
   * Mappa di priorità basata su benchmark oggettivi (MMLU, GSM8K, HumanEval),
   * efficienza (qualità per GB di VRAM), dimensione comunità e recenza.
   * Fonti: TinyWeights.dev, distil labs, AscentCore, Local AI Master, KDnuggets, HF Hub.
   */
  private readonly MODEL_SCORES: Record<string, number> = {
    // === Tier 1 (100-97) — Best in class ===
    'Qwen3-4B-q4f16_1-MLC': 100,
    'Phi-4-mini-instruct-q4f16_1-MLC': 99,
    'Qwen3-1.7B-q4f16_1-MLC': 97,

    // === Tier 2 (96-91) — Eccellenti ===
    'Qwen3.5-4B-q4f16_1-MLC': 96,
    'Qwen3-4B-q4f32_1-MLC': 95,
    'Qwen2.5-3B-Instruct-q4f16_1-MLC': 94,
    'Phi-4-mini-instruct-q4f32_1-MLC': 93,
    'Gemma-2-2b-it-q4f16_1-MLC': 92,
    'Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC': 91,
    'Ministral-3-3B-Reasoning-2512-q4f16_1-MLC': 91,

    // === Tier 3 (90-86) — Molto buoni ===
    'Qwen3.5-2B-q4f16_1-MLC': 90,
    'Qwen3-1.7B-q4f32_1-MLC': 89,
    'Qwen2.5-3B-Instruct-q4f32_1-MLC': 89,
    'Llama-3.2-3B-Instruct-q4f16_1-MLC': 88,
    'Qwen2.5-1.5B-Instruct-q4f16_1-MLC': 87,
    'Hermes-3-Llama-3.2-3B-q4f16_1-MLC': 86,
    'Gemma-2-2b-it-q4f32_1-MLC': 86,

    // === Tier 4 (85-82) — Solid ===
    'Qwen3-8B-q4f16_1-MLC': 85,
    'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC': 85,
    'Llama-3.2-3B-Instruct-q4f32_1-MLC': 84,
    'Qwen3.5-4B-q4f32_1-MLC': 84,
    'Mistral-7B-Instruct-v0.3-q4f16_1-MLC': 83,
    'Llama-3.1-8B-Instruct-q4f16_1-MLC': 82,
    'Qwen2.5-7B-Instruct-q4f16_1-MLC': 82,
    'Hermes-3-Llama-3.2-3B-q4f32_1-MLC': 82,
    'Gemma-2-2b-it-q4f16_1-MLC-1k': 82,

    // === Tier 5 (81-78) — Buoni ===
    'Qwen3.5-2B-q4f32_1-MLC': 81,
    'Qwen2.5-1.5B-Instruct-q4f32_1-MLC': 81,
    'Hermes-3-Llama-3.1-8B-q4f16_1-MLC': 80,
    'Llama-3.1-8B-Instruct-q4f16_1-MLC-1k': 80,
    'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC': 79,
    'Qwen3-8B-q4f32_1-MLC': 79,
    'DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC': 78,
    'Qwen2.5-Coder-3B-Instruct-q4f32_1-MLC': 78,

    // === Tier 6 (77-70) — Discreti / Legacy moderni ===
    'Mistral-7B-Instruct-v0.3-q4f32_1-MLC': 77,
    'SmolLM2-1.7B-Instruct-q4f16_1-MLC': 76,
    'Llama-3.2-1B-Instruct-q4f16_1-MLC': 75,
    'Qwen2.5-0.5B-Instruct-q4f16_1-MLC': 74,
    'Ministral-3-3B-Base-2512-q4f16_1-MLC': 74,
    'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC': 73,
    'Llama-3.2-1B-Instruct-q4f32_1-MLC': 72,
    'SmolLM2-1.7B-Instruct-q4f32_1-MLC': 71,
    'Qwen3.5-9B-q4f16_1-MLC': 71,

    // === Tier 7 (<70) — Vecchi / Niche ===
    'Gemma-2-9b-it-q4f16_1-MLC': 69,
    'SmolLM2-360M-Instruct-q4f16_1-MLC': 65,
    'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC': 64,
    'OLMo-2-0425-1B-Instruct-q4f16_1-MLC': 63,
    'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC': 62,
    'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC': 61,
    'Llama-3-8B-Instruct-q4f16_1-MLC': 60,
  };

  private getModelPriority(modelId: string): number {
    const direct = this.MODEL_SCORES[modelId];
    if (direct !== undefined) return direct;

    let score = 50;

    if (modelId.includes('q4f16_1')) score += 4;
    else if (modelId.includes('q4f32_1')) score += 0;
    else score -= 5;

    if (modelId.includes('snowflake') || modelId.includes('arctic-embed')) score -= 40;

    if (modelId.startsWith('Llama-2') || modelId.includes('Phi-2') ||
        modelId.includes('phi-2') || modelId.includes('phi-1') ||
        modelId.includes('redpajama') || modelId.includes('stablelm') ||
        modelId.includes('Wizard')) {
      score -= 15;
    }

    if (modelId.includes('Qwen3') || modelId.includes('Qwen2.5') ||
        modelId.includes('Qwen3.5') || modelId.includes('Phi-4')) score += 10;
    if (modelId.includes('Llama-3.2') || modelId.includes('Llama-3.1') ||
        modelId.includes('Hermes-3') || modelId.includes('Ministral')) score += 5;
    if (modelId.includes('Gemma-2') || modelId.includes('Phi-3.5') ||
        modelId.includes('DeepSeek-R1')) score += 2;

    if (modelId.includes('-1k') && !modelId.includes('1k-')) score -= 8;

    return score;
  }

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

  /**
   * Seleziona il miglior modello per il dispositivo in base a:
   * 1. Modelli che rientrano nel 50% della RAM (target fluido)
   * 2. Se nessuno, espande al 60%, poi 70%
   * 3. Ordina per priority score (basato su benchmark oggettivi)
   * 4. A parità di score, favorisce il modello con meno VRAM
   */
  private findBestModel(models: ModelOption[], ramGB: number | null): ModelOption | null {
    if (!ramGB || models.length === 0) return null;

    for (const pct of [0.5, 0.6, 0.7]) {
      const targetMB = ramGB * 1024 * pct;
      const candidates = models.filter(
        m => m.vram_required_MB !== undefined && m.vram_required_MB <= targetMB
      );
      if (candidates.length > 0) {
        candidates.sort((a, b) => {
          const pa = this.getModelPriority(a.model_id);
          const pb = this.getModelPriority(b.model_id);
          if (pb !== pa) return pb - pa;
          return (a.vram_required_MB ?? 0) - (b.vram_required_MB ?? 0);
        });
        return candidates[0];
      }
    }
    return null;
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

      const best = !this.memoryUnknown() && typeof rawMem === 'number'
        ? this.findBestModel(filtered, rawMem)
        : null;
      if (best) {
        this.selectedModelId.set(best.model_id);
      }

      this.models.set(filtered);
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

  toggleModelList(): void {
    this.showAllModels.update(v => !v);
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
