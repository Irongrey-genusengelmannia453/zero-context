export interface TabVaultData {
    forward: Record<string, string>; // original -> token e.g., "john@doe.com" -> "user.5811@example.com"
    reverse: Record<string, string>; // token -> original e.g., "user.5811@example.com" -> "john@doe.com"
    globalCounter: number; // Single counter for all entities
    alphaSalt?: string;
    numericSalt?: string;
}

export class VaultManager {
    private cache: Record<string, TabVaultData> = {};
    private hydrationPromise: Promise<void> | null = null;

    constructor() {
        this.hydrationPromise = this.loadFromSession();
    }

    public async ensureHydrated(): Promise<void> {
        if (this.hydrationPromise) {
            await this.hydrationPromise;
        }
    }

    private async loadFromSession(): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.session.get(null, (items) => {
                this.cache = (items as Record<string, TabVaultData>) || {};
                resolve();
            });
        });
    }

    /**
     * Generates deterministic-length salts from a tabId.
     * Normalizes the tabId via modulo 100 to prevent variable-length collisions.
     */
    private generateSalts(tabId: number): { alphaSalt: string; numericSalt: string } {
        const shortTab = String(tabId % 100).padStart(2, '0');
        return {
            alphaSalt: Math.random().toString(36).substring(2, 4) + shortTab,
            numericSalt: String(Math.floor(Math.random() * 9) + 1) + shortTab,
        };
    }

    private initTabIfNeeded(tabId: number): void {
        const key = tabId.toString();
        if (!this.cache[key]) {
            const salts = this.generateSalts(tabId);
            this.cache[key] = {
                forward: {},
                reverse: {},
                globalCounter: 0,
                ...salts,
            };
        }
    }

    private async persistTab(tabId: number): Promise<void> {
        const key = tabId.toString();
        const data = this.cache[key];
        if (data) {
            await chrome.storage.session.set({ [key]: data });
        }
    }

    public redactEntity(tabId: number, type: string, originalText: string): string {
        this.initTabIfNeeded(tabId);
        const key = tabId.toString();
        const tabData = this.cache[key];

        // 1. Check if already tokenized (O(1) deduplication)
        if (tabData.forward[originalText]) {
            return tabData.forward[originalText];
        }

        // 2. Increment counter
        if (tabData.globalCounter === undefined) {
            tabData.globalCounter = 0;
        }
        tabData.globalCounter++;

        // Backwards compatibility: hydrated sessions may lack salts
        if (!tabData.alphaSalt || !tabData.numericSalt) {
            const salts = this.generateSalts(tabId);
            tabData.alphaSalt = tabData.alphaSalt ?? salts.alphaSalt;
            tabData.numericSalt = tabData.numericSalt ?? salts.numericSalt;
        }

        // 3. Generate Token
        let token = '';
        const numericId = `${tabData.numericSalt}${tabData.globalCounter}`;
        const alphaId = `${tabData.alphaSalt}_${tabData.globalCounter}`;

        switch (type) {
            case 'EMAIL':
                token = `user.${numericId}@example.com`;
                break;
            case 'PHONE': {
                const p = numericId.padStart(10, '0');
                token = `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
                break;
            }
            case 'SSN': {
                const ssn = numericId.padStart(9, '0');
                token = `${ssn.slice(0, 3)}-${ssn.slice(3, 5)}-${ssn.slice(5)}`;
                break;
            }
            case 'SIN': {
                const sin = numericId.padStart(9, '0');
                token = `${sin.slice(0, 3)}-${sin.slice(3, 6)}-${sin.slice(6)}`;
                break;
            }
            case 'CARD': {
                const c = numericId.padStart(16, '0');
                token = `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}-${c.slice(12)}`;
                break;
            }
            default:
                token = `${type}.${alphaId}`;
                break;
        }

        // 4. Save to both maps
        tabData.forward[originalText] = token;
        tabData.reverse[token] = originalText;

        // 5. Fire and forget persist
        this.persistTab(tabId).catch(err => console.error("[ZeroContext] Failed to persist vault", err));

        return token;
    }

    public redactAlias(tabId: number, canonicalOriginalText: string, exactMatch: string): string {
        this.initTabIfNeeded(tabId);
        const key = tabId.toString();
        const tabData = this.cache[key];

        if (tabData.forward[exactMatch]) {
            return tabData.forward[exactMatch];
        }

        const canonicalToken = tabData.forward[canonicalOriginalText];
        if (!canonicalToken) {
            return this.redactEntity(tabId, 'PII', exactMatch);
        }

        tabData.globalCounter++;
        const token = `${canonicalToken}_${tabData.globalCounter}`;

        tabData.forward[exactMatch] = token;
        tabData.reverse[token] = exactMatch;

        this.persistTab(tabId).catch(err => console.error("[ZeroContext] Failed to persist vault", err));
        return token;
    }

    public unredactText(tabId: number, text: string): string {
        const key = tabId.toString();
        const tabData = this.cache[key];

        if (!tabData) {
            return text; // Nothing redacted for this tab
        }

        // Sort by length descending to ensure sub-tokens (e.g. PERSON.711.1) 
        // are replaced before their canonical parents (e.g. PERSON.711).
        const tokens = Object.keys(tabData.reverse).sort((a, b) => b.length - a.length);

        return tokens.reduce(
            (acc, token) => acc.replaceAll(token, tabData.reverse[token]),
            text
        );
    }

    public async clearTab(tabId: number): Promise<void> {
        const key = tabId.toString();
        delete this.cache[key];
        await chrome.storage.session.remove(key);
    }
}
