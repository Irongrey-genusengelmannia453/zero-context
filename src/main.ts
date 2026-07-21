console.log("[ZeroContext] Popup initialized.");

// DOM Elements
const masterToggle = document.getElementById("master-toggle") as HTMLInputElement;
const engineRadios = document.querySelectorAll('input[name="engine-mode"]') as NodeListOf<HTMLInputElement>;
const statusText = document.getElementById("status-text") as HTMLElement;
const engineFieldset = document.getElementById("engine-fieldset") as HTMLFieldSetElement;

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