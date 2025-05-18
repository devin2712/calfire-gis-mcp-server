import { logger } from '../utils/logger.js';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

export class CacheService {
  private static instance: CacheService;
  private cache: Map<string, CacheEntry<any>>;
  private readonly TTL: number = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  private constructor() {
    this.cache = new Map();
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  public set<T>(key: string, value: T): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
    logger.debug({ key }, 'Cache entry set');
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      logger.debug({ key }, 'Cache entry expired');
      return null;
    }

    logger.debug({ key }, 'Cache hit');
    return entry.value as T;
  }

  public clear(): void {
    this.cache.clear();
    logger.debug('Cache cleared');
  }

  public getSize(): number {
    return this.cache.size;
  }
} 