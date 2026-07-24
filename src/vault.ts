export interface TabVaultData {
    forward: Record<string, string>; // original -> token e.g., "john@doe.com" -> "[EMAIL_1]"
    reverse: Record<string, string>; // token -> original e.g., "[EMAIL_1]" -> "john@doe.com"
    globalCounter: number; // Single counter for all entities
    sessionSalt: number;
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

    private initTabIfNeeded(tabId: number): void {
        const key = tabId.toString();
        if (!this.cache[key]) {
            this.cache[key] = {
                forward: {},
                reverse: {},
                globalCounter: 0,
                sessionSalt: Math.floor(Math.random() * 90) + 10
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

        // 3. Generate Token
        const rawId = `${tabData.sessionSalt}${tabData.globalCounter}`;
        
        let token = '';
        switch (type) {
            case 'EMAIL':
                token = `user.${rawId}@example.com`;
                break;
            case 'PHONE': {
                const p = rawId.padStart(10, '0');
                token = `(${p.slice(0,3)}) ${p.slice(3,6)}-${p.slice(6)}`;
                break;
            }
            case 'SSN': {
                const ssn = rawId.padStart(9, '0');
                token = `${ssn.slice(0,3)}-${ssn.slice(3,5)}-${ssn.slice(5)}`;
                break;
            }
            case 'SIN': {
                const sin = rawId.padStart(9, '0');
                token = `${sin.slice(0,3)}-${sin.slice(3,6)}-${sin.slice(6)}`;
                break;
            }
            case 'CARD': {
                const c = rawId.padStart(16, '0');
                token = `${c.slice(0,4)}-${c.slice(4,8)}-${c.slice(8,12)}-${c.slice(12)}`;
                break;
            }
            default:
                token = `[${type}_${rawId}]`;
                break;
        }

        // 4. Save to both maps
        tabData.forward[originalText] = token;
        tabData.reverse[token] = originalText;

        // 5. Fire and forget persist
        this.persistTab(tabId).catch(err => console.error("[ZeroContext] Failed to persist vault", err));

        return token;
    }

    public unredactText(tabId: number, text: string): string {
        const key = tabId.toString();
        const tabData = this.cache[key];

        if (!tabData) {
            return text; // Nothing redacted for this tab
        }

        return Object.keys(tabData.reverse).reduce(
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
