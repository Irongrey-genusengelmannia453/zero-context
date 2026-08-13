import { type DomainConfigState, type DomainEntry, DEFAULT_AI_DOMAINS } from './types/domain';

export class DomainGatekeeper {
  private domains: DomainEntry[] = [];

  /**
   * Loads the domain configuration from chrome.storage.sync.
   * If it doesn't exist, it seeds the storage with DEFAULT_AI_DOMAINS.
   */
  async initialize(): Promise<void> {
    const data = await chrome.storage.sync.get('domainConfig') as { domainConfig?: DomainConfigState };
    
    if (!data.domainConfig || !Array.isArray(data.domainConfig.domains)) {
      const initialConfig: DomainConfigState = {
        version: 1,
        domains: DEFAULT_AI_DOMAINS,
      };
      await chrome.storage.sync.set({ domainConfig: initialConfig });
      this.domains = [...DEFAULT_AI_DOMAINS];
    } else {
      this.domains = data.domainConfig.domains;
    }
  }

  /**
   * Synchronously checks if a given URL is allowed based on the cached domain configuration.
   * Only returns true if the domain matches a pattern and is strictly enabled.
   */
  isUrlAllowed(url: string): boolean {
    return this.domains.some(domain => {
      if (!domain.enabled) return false;
      return this.matchPattern(url, domain.pattern);
    });
  }

  /**
   * Helper to check if a URL matches a Chrome Match Pattern (e.g., *://*.chatgpt.com/*).
   */
  private matchPattern(url: string, pattern: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const host = parsedUrl.hostname;

      // Extract the host part of the match pattern
      // e.g. "*://*.chatgpt.com/*" -> "*.chatgpt.com"
      const match = pattern.match(/[^:]+:\/\/(.+?)\//);
      if (!match) return false;
      
      const patternHost = match[1];

      if (patternHost.startsWith('*.')) {
        const baseHost = patternHost.slice(2);
        return host === baseHost || host.endsWith('.' + baseHost);
      } else {
        return host === patternHost;
      }
    } catch {
      // Invalid URL or malformed string
      return false;
    }
  }
}
