import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DomainGatekeeper } from './domainGatekeeper.ts';
import { DEFAULT_AI_DOMAINS } from './types/domain';

const mockStorageSyncGet = vi.fn();
const mockStorageSyncSet = vi.fn();
const mockPermissionsRequest = vi.fn();

global.chrome = {
  storage: {
    sync: {
      get: mockStorageSyncGet,
      set: mockStorageSyncSet
    }
  },
  permissions: {
    request: mockPermissionsRequest
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

  describe('UI Methods (Add, Remove, Toggle, Restore)', () => {
    describe('addCustomDomain', () => {
      it('returns ERROR_INVALID_HOSTNAME for bad input', async () => {
        await gatekeeper.initialize();
        // @ts-ignore - testing runtime validation
        const result = await gatekeeper.addCustomDomain('https://bad-input.com');
        expect(result.status).toBe('ERROR_INVALID_HOSTNAME');
      });

      it('returns ERROR_PERMISSION_DENIED if chrome.permissions rejects', async () => {
        await gatekeeper.initialize();
        mockPermissionsRequest.mockResolvedValue(false);
        // @ts-ignore
        const result = await gatekeeper.addCustomDomain('new-ai.corp');
        
        expect(mockPermissionsRequest).toHaveBeenCalledWith({
          origins: ['*://*.new-ai.corp/*']
        });
        expect(result.status).toBe('ERROR_PERMISSION_DENIED');
      });

      it('returns SUCCESS, saves, and updates state if permission is granted', async () => {
        await gatekeeper.initialize();
        mockPermissionsRequest.mockResolvedValue(true);
        // @ts-ignore
        const result = await gatekeeper.addCustomDomain('new-ai.corp');
        
        expect(result.status).toBe('SUCCESS');
        if (result.status === 'SUCCESS') {
          expect(result.domain.pattern).toBe('*://*.new-ai.corp/*');
          expect(mockStorageSyncSet).toHaveBeenCalled();
        }
      });
      
      it('returns ERROR_ALREADY_EXISTS if domain is already in the list', async () => {
        mockStorageSyncGet.mockResolvedValue({
          domainConfig: { version: 1, domains: DEFAULT_AI_DOMAINS }
        });
        await gatekeeper.initialize();
        
        // @ts-ignore
        const result = await gatekeeper.addCustomDomain('chatgpt.com');
        expect(result.status).toBe('ERROR_ALREADY_EXISTS');
      });
    });

    describe('removeDomain', () => {
      it('removes a domain by id and saves state', async () => {
        mockStorageSyncGet.mockResolvedValue({
          domainConfig: { version: 1, domains: DEFAULT_AI_DOMAINS }
        });
        await gatekeeper.initialize();
        
        const idToRemove = DEFAULT_AI_DOMAINS[0].id;
        // @ts-ignore
        await gatekeeper.removeDomain(idToRemove);
        
        expect(gatekeeper['domains'].find(d => d.id === idToRemove)).toBeUndefined();
        expect(mockStorageSyncSet).toHaveBeenCalled();
      });
    });

    describe('toggleDomain', () => {
      it('toggles the enabled state of a domain', async () => {
        mockStorageSyncGet.mockResolvedValue({
          domainConfig: { version: 1, domains: DEFAULT_AI_DOMAINS }
        });
        await gatekeeper.initialize();
        
        const idToToggle = DEFAULT_AI_DOMAINS[0].id;
        // @ts-ignore
        await gatekeeper.toggleDomain(idToToggle, false);
        
        const toggled = gatekeeper['domains'].find(d => d.id === idToToggle);
        expect(toggled?.enabled).toBe(false);
        expect(mockStorageSyncSet).toHaveBeenCalled();
      });
    });

    describe('restoreDefaults', () => {
      it('resets domains to DEFAULT_AI_DOMAINS and saves', async () => {
        mockStorageSyncGet.mockResolvedValue({
          domainConfig: { version: 1, domains: [] }
        });
        await gatekeeper.initialize();
        
        // @ts-ignore
        await gatekeeper.restoreDefaults();
        
        expect(gatekeeper['domains'].length).toBe(DEFAULT_AI_DOMAINS.length);
        expect(mockStorageSyncSet).toHaveBeenCalledWith({
          domainConfig: expect.objectContaining({
            domains: DEFAULT_AI_DOMAINS
          })
        });
      });
    });
  });
});
