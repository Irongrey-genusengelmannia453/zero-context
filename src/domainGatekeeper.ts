import { 
  type DomainConfigState, 
  type DomainEntry, 
  DEFAULT_AI_DOMAINS,
  type AddDomainResult,
  HostnameInputSchema
} from './types/domain';

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
   * Returns a copy of the current domains list.
   */
  getDomains(): DomainEntry[] {
    return [...this.domains];
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

  /**
   * Adds a new custom domain with strict validation and dynamic permission requests.
   */
  async addCustomDomain(hostname: string): Promise<AddDomainResult> {
    const parseResult = HostnameInputSchema.safeParse(hostname);
    if (!parseResult.success) {
      return { status: 'ERROR_INVALID_HOSTNAME', message: parseResult.error.issues[0]?.message || 'Invalid hostname' };
    }

    // Always create a wildcard pattern matching subdomains
    const pattern = `*://*.${hostname}/*`;

    // Check if a domain with this pattern already exists
    // (We also check without * just in case, though we normalize everything to *://*.hostname/*)
    if (this.domains.some(d => d.pattern === pattern || d.pattern === `*://${hostname}/*` || (d.type === 'BUILT_IN' && pattern.includes(d.id)))) {
      return { status: 'ERROR_ALREADY_EXISTS', message: 'Domain already exists in the configuration.' };
    }

    try {
      const granted = await chrome.permissions.request({ origins: [pattern] });
      if (!granted) {
        return { status: 'ERROR_PERMISSION_DENIED', message: 'Permission was denied by the user.' };
      }
    } catch (e: any) {
      return { status: 'ERROR_PERMISSION_DENIED', message: e.message || 'Permissions API error.' };
    }

    const newDomain: DomainEntry = {
      type: 'CUSTOM',
      id: crypto.randomUUID(),
      pattern,
      enabled: true,
      addedAt: Date.now()
    };

    this.domains.push(newDomain);
    await this.saveState();

    return { status: 'SUCCESS', domain: newDomain };
  }

  async removeDomain(id: string): Promise<void> {
    this.domains = this.domains.filter(d => d.id !== id);
    await this.saveState();
  }

  async toggleDomain(id: string, enabled: boolean): Promise<void> {
    const domain = this.domains.find(d => d.id === id);
    if (domain) {
      domain.enabled = enabled;
      await this.saveState();
    }
  }

  async restoreDefaults(): Promise<void> {
    this.domains = [...DEFAULT_AI_DOMAINS];
    await this.saveState();
  }

  private async saveState(): Promise<void> {
    const state: DomainConfigState = {
      version: 1,
      domains: this.domains
    };
    await chrome.storage.sync.set({ domainConfig: state });
    await this.syncDynamicContentScripts();
  }

  private async syncDynamicContentScripts(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.scripting || !chrome.runtime || !chrome.runtime.getManifest) {
      return;
    }

    try {
      const manifest = chrome.runtime.getManifest();
      if (!manifest.content_scripts) return;

      const dynamicDomains = this.domains.filter(d => d.type === 'CUSTOM' && d.enabled).map(d => d.pattern);
      
      const existing = await chrome.scripting.getRegisteredContentScripts();
      if (existing.length > 0) {
        await chrome.scripting.unregisterContentScripts({ ids: existing.map(s => s.id) });
      }

      if (dynamicDomains.length === 0) return;

      interface ManifestCS {
        js?: string[];
        css?: string[];
        world?: string;
        run_at?: string;
      }

      const scriptsToRegister: chrome.scripting.RegisteredContentScript[] = manifest.content_scripts.map((csRaw: unknown, i: number) => {
        const cs = csRaw as ManifestCS;
        return {
          id: `dynamic-cs-${i}`,
          js: cs.js || [],
          css: cs.css || [],
          matches: dynamicDomains,
          world: (cs.world === 'MAIN' ? 'MAIN' : 'ISOLATED') as 'MAIN' | 'ISOLATED',
          runAt: (cs.run_at === 'document_start' ? 'document_start' : 'document_idle') as 'document_start' | 'document_idle'
        };
      });

      await chrome.scripting.registerContentScripts(scriptsToRegister);
    } catch (e) {
      console.warn("[ZeroContext] Failed to sync dynamic content scripts:", e);
    }
  }
}
