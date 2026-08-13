import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DomainGatekeeper } from './domainGatekeeper';
import { DEFAULT_AI_DOMAINS } from './types/domain';

// Mock chrome storage API
const mockStorageSyncGet = vi.fn();
const mockStorageSyncSet = vi.fn();

global.chrome = {
  storage: {
    sync: {
      get: mockStorageSyncGet,
      set: mockStorageSyncSet
    }
  }
} as any;

describe('DomainGatekeeper (Red Phase)', () => {
  let gatekeeper: DomainGatekeeper;

  beforeEach(() => {
    vi.clearAllMocks();
    gatekeeper = new DomainGatekeeper();
  });

  describe('Initialization', () => {
    it('seeds chrome.storage.sync with DEFAULT_AI_DOMAINS on first install', async () => {
      mockStorageSyncGet.mockResolvedValue({});
      
      await gatekeeper.initialize();
      
      expect(mockStorageSyncSet).toHaveBeenCalledWith({
        domainConfig: {
          version: 1,
          domains: DEFAULT_AI_DOMAINS
        }
      });
    });

    it('does not overwrite storage if domains already exist', async () => {
      mockStorageSyncGet.mockResolvedValue({
        domainConfig: { version: 1, domains: [] }
      });
      
      await gatekeeper.initialize();
      
      expect(mockStorageSyncSet).not.toHaveBeenCalled();
    });
  });

  describe('isUrlAllowed', () => {
    it('returns true for a default allowed domain (e.g., chatgpt.com)', async () => {
      mockStorageSyncGet.mockResolvedValue({
        domainConfig: { version: 1, domains: DEFAULT_AI_DOMAINS }
      });
      await gatekeeper.initialize();
      
      expect(gatekeeper.isUrlAllowed('https://chatgpt.com/c/123')).toBe(true);
      expect(gatekeeper.isUrlAllowed('https://claude.ai/chat/123')).toBe(true);
    });

    it('returns false for an unknown domain', async () => {
      mockStorageSyncGet.mockResolvedValue({
        domainConfig: { version: 1, domains: DEFAULT_AI_DOMAINS }
      });
      await gatekeeper.initialize();
      
      expect(gatekeeper.isUrlAllowed('https://github.com/pulls')).toBe(false);
    });

    it('returns true for a user-added CUSTOM domain', async () => {
      mockStorageSyncGet.mockResolvedValue({
        domainConfig: {
          version: 1,
          domains: [
            ...DEFAULT_AI_DOMAINS,
            {
              type: 'CUSTOM',
              id: '123e4567-e89b-12d3-a456-426614174000',
              pattern: '*://*.custom-ai.corp/*',
              enabled: true,
              addedAt: 1600000000
            }
          ]
        }
      });
      await gatekeeper.initialize();
      
      expect(gatekeeper.isUrlAllowed('https://chat.custom-ai.corp/room/1')).toBe(true);
    });

    it('returns false if an AI domain is explicitly disabled by the user', async () => {
      const disabledChatGPT = { ...DEFAULT_AI_DOMAINS[0], enabled: false };
      const domains = [disabledChatGPT, ...DEFAULT_AI_DOMAINS.slice(1)];
      
      mockStorageSyncGet.mockResolvedValue({
        domainConfig: { version: 1, domains }
      });
      await gatekeeper.initialize();
      
      expect(gatekeeper.isUrlAllowed('https://chatgpt.com/c/123')).toBe(false);
    });
  });
});
