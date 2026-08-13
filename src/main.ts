console.log("[ZeroContext] Popup initialized.");
import { DomainGatekeeper } from './domainGatekeeper.ts';
import { DomainConfigUI } from './ui/DomainConfigUI.ts';

// DOM Elements
const masterToggle = document.getElementById("master-toggle") as HTMLInputElement;
const engineRadios = document.querySelectorAll('input[name="engine-mode"]') as NodeListOf<HTMLInputElement>;
const statusText = document.getElementById("status-text") as HTMLElement;
const engineFieldset = document.getElementById("engine-fieldset") as HTMLFieldSetElement;

const openSettingsBtn = document.getElementById("open-settings-btn") as HTMLAnchorElement;
const backToHomeBtn = document.getElementById("back-to-home-btn") as HTMLAnchorElement;
const homeView = document.getElementById("home-view") as HTMLElement;
const settingsView = document.getElementById("settings-view") as HTMLElement;

const contextAddContainer = document.getElementById("context-add-container") as HTMLDivElement;
const addCurrentSiteBtn = document.getElementById("add-current-site-btn") as HTMLButtonElement;
const currentHostnameSpan = document.getElementById("current-hostname") as HTMLSpanElement;

const refreshBanner = document.getElementById("refresh-banner") as HTMLDivElement;
const refreshPageBtn = document.getElementById("refresh-page-btn") as HTMLButtonElement;

export function showRefreshBanner() {
    refreshBanner.style.display = 'block';
}

refreshPageBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
        chrome.tabs.reload(tab.id);
        window.close();
    }
});

// Handle view swapping
openSettingsBtn.addEventListener("click", (e) => {
    e.preventDefault();
    homeView.style.display = "none";
    settingsView.style.display = "block";
});

backToHomeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    settingsView.style.display = "none";
    homeView.style.display = "block";
});

// Load Domain Config for Contextual Add and Settings UI
async function initializeGatekeeper() {
    const gatekeeper = new DomainGatekeeper();
    await gatekeeper.initialize();

    // Mount Settings UI
    const configUI = new DomainConfigUI(gatekeeper);
    configUI.mount();

    // Contextual Add Logic
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:') || tab.url.startsWith('file://')) {
        currentHostnameSpan.textContent = "Internal Page";
        contextAddContainer.style.display = 'block';
        addCurrentSiteBtn.disabled = true;
        addCurrentSiteBtn.textContent = "Cannot protect internal browser pages.";
        return;
    }

    if (!tab.url.startsWith('http')) return;

    try {
        const url = new URL(tab.url);
        const hostname = url.hostname;

        if (!gatekeeper.isUrlAllowed(tab.url)) {
            // Not protected yet
            currentHostnameSpan.textContent = hostname;
            contextAddContainer.style.display = 'block';

            addCurrentSiteBtn.addEventListener("click", async () => {
                const originalText = addCurrentSiteBtn.innerHTML;
                addCurrentSiteBtn.textContent = "Requesting Permission...";
                addCurrentSiteBtn.disabled = true;

                const result = await gatekeeper.addCustomDomain(hostname);
                if (result.status === 'SUCCESS') {
                    addCurrentSiteBtn.textContent = "Protected!";
                    addCurrentSiteBtn.classList.remove('outline');
                    showRefreshBanner();
                    setTimeout(() => {
                        contextAddContainer.style.display = 'none';
                    }, 1500);
                    configUI.render(); // Re-render list
                } else {
                    addCurrentSiteBtn.innerHTML = originalText;
                    addCurrentSiteBtn.disabled = false;
                    alert(result.message); // simple alert for popup
                }
            });
        }
    } catch {
        // invalid URL, ignore
    }
}
initializeGatekeeper();

// Load saved state from Chrome Storage
chrome.storage.local.get(["isRedactionEnabled", "engineMode"], (result) => {
    masterToggle.checked = (result.isRedactionEnabled as boolean) ?? true;
    const savedMode = (result.engineMode as string) ?? "deep";

    engineRadios.forEach(radio => {
        if (radio.value === savedMode) {
            radio.checked = true;
        }
    });

    updateStatusUI(masterToggle.checked);
});

// Listen for Master Toggle changes
masterToggle.addEventListener("change", (e) => {
    const isEnabled = (e.target as HTMLInputElement).checked;
    chrome.storage.local.set({ isRedactionEnabled: isEnabled });
    updateStatusUI(isEnabled);
    showRefreshBanner();
});

// Listen for Engine Mode changes
engineRadios.forEach(radio => {
    radio.addEventListener("change", (e) => {
        if ((e.target as HTMLInputElement).checked) {
            chrome.storage.local.set({ engineMode: (e.target as HTMLInputElement).value });
        }
    });
});

// Helper to update visual text and UX active/disabled states
function updateStatusUI(isEnabled: boolean) {
    if (isEnabled) {
        statusText.textContent = "Status: Active & Shielded";
        statusText.style.color = "var(--pico-ins-color)"; // Greenish
        engineFieldset.disabled = false; // Enable sub-options
    } else {
        statusText.textContent = "Status: Disabled";
        statusText.style.color = "var(--pico-del-color)"; // Reddish
        engineFieldset.disabled = true; // Disable sub-options
    }
}