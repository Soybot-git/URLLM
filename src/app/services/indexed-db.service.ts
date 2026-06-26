import { Injectable } from '@angular/core';
import { ChatThread } from '../models/chat.types';

const DB_NAME = 'LocalLlmChatDb';
const DB_VERSION = 2;
const STORE_THREADS = 'threads';
const STORE_CONFIG = 'appConfig';

export interface AppConfigRecord {
  key: string;
  selectedModelId?: string;
  selectedLanguage?: string;
}

/**
 * Servizio lightweight per IndexedDB nativo.
 * Persiste gli oggetti ChatThread e la configurazione applicazione.
 */
@Injectable({ providedIn: 'root' })
export class IndexedDbService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const database = (event.target as IDBOpenDBRequest).result;
        if (!database.objectStoreNames.contains(STORE_THREADS)) {
          database.createObjectStore(STORE_THREADS, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(STORE_CONFIG)) {
          database.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
        }
      };
    });
  }

  async getAllThreads(): Promise<ChatThread[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_THREADS, 'readonly');
      const store = tx.objectStore(STORE_THREADS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as ChatThread[]);
      request.onerror = () => reject(request.error);
    });
  }

  async saveThread(thread: ChatThread): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_THREADS, 'readwrite');
      const store = tx.objectStore(STORE_THREADS);
      const request = store.put(thread);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteThread(id: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_THREADS, 'readwrite');
      const store = tx.objectStore(STORE_THREADS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllThreads(): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_THREADS, 'readwrite');
      const store = tx.objectStore(STORE_THREADS);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAppConfig(): Promise<AppConfigRecord | undefined> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_CONFIG, 'readonly');
      const store = tx.objectStore(STORE_CONFIG);
      const request = store.get('config');

      request.onsuccess = () => resolve(request.result as AppConfigRecord | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async saveAppConfig(config: AppConfigRecord): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_CONFIG, 'readwrite');
      const store = tx.objectStore(STORE_CONFIG);
      const request = store.put({ ...config, key: 'config' });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteAppConfig(): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_CONFIG, 'readwrite');
      const store = tx.objectStore(STORE_CONFIG);
      const request = store.delete('config');

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async resetDatabase(): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const txThreads = this.db!.transaction(STORE_THREADS, 'readwrite');
      const threadsStore = txThreads.objectStore(STORE_THREADS);
      threadsStore.clear();

      const txConfig = this.db!.transaction(STORE_CONFIG, 'readwrite');
      const configStore = txConfig.objectStore(STORE_CONFIG);
      configStore.clear();

      // Raccoglie errori di qualsiasi transazione
      let completed = 0;
      const checkDone = () => {
        completed++;
        if (completed === 2) resolve();
      };

      txThreads.oncomplete = checkDone;
      txThreads.onerror = () => reject(txThreads.error);
      txConfig.oncomplete = checkDone;
      txConfig.onerror = () => reject(txConfig.error);
    });
  }
}
