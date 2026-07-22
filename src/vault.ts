export interface TabVaultData {
    forward: Record<string, string>; // original -> token e.g., "john@doe.com" -> "[EMAIL_1]"
    reverse: Record<string, string>; // token -> original e.g., "[EMAIL_1]" -> "john@doe.com"
    counters: Record<string, number>; // type -> count e.g., "EMAIL" -> 1
    sessionOffset: number;
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
                sessionOffset: Math.floor(Math.random() * 90000) + 10000
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
        const token = `[${type}_${tabData.sessionOffset + tabData.counters[type]}]`;

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

        // Replace all tokens like [EMAIL_1] with their reverse map value
        // The regex looks for [TYPE_NUMBER] with a 5 or 6 digit number
        return text.replace(/\[([A-Z]+_\d{5,6})\]/g, (match) => {
            const original = tabData.reverse[match];
            return original ? original : match; // fallback to token if not found
        });
    }

    public async clearTab(tabId: number): Promise<void> {
        const key = tabId.toString();
        delete this.cache[key];
        await chrome.storage.session.remove(key);
    }
}
