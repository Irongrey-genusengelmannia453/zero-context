export interface TabVaultData {
    forward: Record<string, string>; // original -> token e.g., "john@doe.com" -> "[EMAIL_1]"
    reverse: Record<string, string>; // token -> original e.g., "[EMAIL_1]" -> "john@doe.com"
    counters: Record<string, number>; // type -> count e.g., "EMAIL" -> 1
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
                counters: {},
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
        if (!tabData.counters[type]) {
            tabData.counters[type] = 0;
        }
        tabData.counters[type]++;

        // 3. Generate Token
        const paddedCount = tabData.counters[type].toString().padStart(2, '0');
        const pin = `${tabData.sessionSalt}${paddedCount}`;
        
        let token = '';
        switch (type) {
            case 'EMAIL': token = `user.${pin}@example.com`; break;
            case 'PHONE': token = `(000) 000-${pin}`; break;
            case 'SSN': token = `000-00-${pin}`; break;
            case 'SIN': token = `000-000-${pin}`; break;
            case 'CARD': token = `0000-0000-0000-${pin}`; break;
            default: token = `[${type}_${pin}]`; break;
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
