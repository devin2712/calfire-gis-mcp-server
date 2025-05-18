import { describe, test, expect, beforeEach } from "bun:test";
import { CacheService } from '../src/services/cache.service';

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    // Get a fresh instance and clear it before each test
    cacheService = CacheService.getInstance();
    cacheService.clear();
  });

  test('should be a singleton', () => {
    const instance1 = CacheService.getInstance();
    const instance2 = CacheService.getInstance();
    expect(instance1).toBe(instance2);
  });

  test('should set and get values', () => {
    const key = 'test-key';
    const value = { test: 'value' };
    
    cacheService.set<typeof value>(key, value);
    const retrieved = cacheService.get<typeof value>(key);
    
    expect(retrieved).toEqual(value);
  });

  test('should return null for non-existent keys', () => {
    const retrieved = cacheService.get<string>('non-existent');
    expect(retrieved).toBeNull();
  });

  test('should handle different types', () => {
    // Test with string
    cacheService.set<string>('string-key', 'test-value');
    expect(cacheService.get<string>('string-key')).toBe('test-value');

    // Test with number
    cacheService.set<number>('number-key', 42);
    expect(cacheService.get<number>('number-key')).toBe(42);

    // Test with object
    const obj = { name: 'test', value: 123 };
    cacheService.set<typeof obj>('object-key', obj);
    expect(cacheService.get<typeof obj>('object-key')).toEqual(obj);

    // Test with array
    const arr = [1, 2, 3];
    cacheService.set<typeof arr>('array-key', arr);
    expect(cacheService.get<typeof arr>('array-key')).toEqual(arr);
  });

  test('should clear all entries', () => {
    cacheService.set<string>('key1', 'value1');
    cacheService.set<string>('key2', 'value2');
    
    expect(cacheService.getSize()).toBe(2);
    
    cacheService.clear();
    
    expect(cacheService.getSize()).toBe(0);
    expect(cacheService.get<string>('key1')).toBeNull();
    expect(cacheService.get<string>('key2')).toBeNull();
  });

  test('should track cache size correctly', () => {
    expect(cacheService.getSize()).toBe(0);
    
    cacheService.set<string>('key1', 'value1');
    expect(cacheService.getSize()).toBe(1);
    
    cacheService.set<string>('key2', 'value2');
    expect(cacheService.getSize()).toBe(2);
    
    cacheService.clear();
    expect(cacheService.getSize()).toBe(0);
  });

  test('should handle expired entries', () => {
    const key = 'test-key';
    const value = 'test-value';
    
    // Set the value
    cacheService.set<string>(key, value);
    expect(cacheService.get<string>(key)).toBe(value);
    
    // Mock Date.now to simulate time passing
    const originalDateNow = Date.now;
    const mockDateNow = () => originalDateNow() + (25 * 60 * 60 * 1000); // 25 hours later
    Date.now = mockDateNow;
    
    // Entry should be expired
    expect(cacheService.get<string>(key)).toBeNull();
    
    // Restore original Date.now
    Date.now = originalDateNow;
  });

  test('should handle overwriting existing entries', () => {
    const key = 'test-key';
    
    // Set initial value
    cacheService.set<string>(key, 'initial-value');
    expect(cacheService.get<string>(key)).toBe('initial-value');
    
    // Overwrite with new value
    cacheService.set<string>(key, 'new-value');
    expect(cacheService.get<string>(key)).toBe('new-value');
    
    // Size should still be 1
    expect(cacheService.getSize()).toBe(1);
  });
}); 