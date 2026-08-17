# Privacy Policy for ZeroContext

**Effective Date:** August 17, 2026  
**Last Updated:** August 17, 2026

ZeroContext ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy describes how the **ZeroContext** Chrome Extension operates and explains our strict zero-data-collection philosophy.

---

## 1. Summary (Zero-Data-Collection Principle)

- **Zero Data Collected:** ZeroContext does not collect, harvest, transmit, or sell your personal data, clipboard contents, chat history, or browsing activity.
- **100% In-Browser Execution:** All Data Loss Prevention (DLP), token redaction, regex evaluation, and neural machine learning inference happen locally on your computer using WebAssembly (WASM).
- **No Cloud Servers or Telemetry:** We operate zero external backend servers, zero databases, zero telemetry services, and zero analytics trackers.

---

## 2. Information Handled Locally on Your Device

ZeroContext processes certain data strictly within your local browser environment:

### A. Clipboard and Pasted Content
- When you paste text into a supported AI chat input (e.g., ChatGPT, Claude, Gemini), ZeroContext intercepts the paste event in memory, strips or masks sensitive entities (such as names, emails, credit cards, SSNs, phone numbers), and replaces them with semantic tokens.
- When you copy an AI response, ZeroContext unredacts the text in memory before writing it back to your clipboard.
- **At no point is your clipboard or pasted content sent to any external server or saved permanently to disk.**

### B. Ephemeral In-Memory Vaults
- Mappings between original sensitive data and redacted tokens (e.g., `Alice Smith` ➔ `PERSON.el64_1`) are stored temporarily in browser session memory (`chrome.storage.session`) isolated per browser tab.
- This mapping is automatically deleted and permanently purged the moment the tab is closed or navigated away from the AI platform.

### C. Local Extension Preferences
- User-configured settings (e.g., selected engine mode: Standard vs. Smart AI, custom domain lists) are saved using Chrome's native storage (`chrome.storage.sync` / `chrome.storage.local`). This data remains strictly in your personal browser profile.

---

## 3. Chrome Extension Permissions Explained

ZeroContext requests only the minimum permissions necessary to deliver local privacy protection:

| Permission | Purpose & Scope |
| :--- | :--- |
| **`clipboardRead`** | Intercepts paste events inside AI chat textboxes to sanitize sensitive text before it enters the webpage DOM. |
| **`clipboardWrite`** | Restores original unredacted text to your clipboard when copying AI responses (via shortcut or website copy buttons). |
| **`storage` / `unlimitedStorage`** | Saves user preferences and caches the quantized DistilBERT neural model weights locally in browser CacheStorage for offline operation. |
| **`offscreen`** | Creates an isolated background document to run WebAssembly (WASM) neural token classification off the main browser thread without freezing web pages. |
| **`scripting`** | Dynamically activates redaction scripts only when the user explicitly configures custom enterprise AI domains in the extension settings. |
| **`activeTab`** | Detects the active website's URL when you open the popup, allowing a one-click option to add custom AI domains to your protected list. |
| **`alarms`** | Manages memory lifecycle: automatically tears down background WASM models after 5 minutes of inactivity to free system RAM. |
| **`host_permissions`** | Statically limited to designated AI domains (`chatgpt.com`, `claude.ai`, `gemini.google.com`, `perplexity.ai`, `chat.deepseek.com`). ZeroContext explicitly refuses `<all_urls>` permission to ensure it has zero access to your other browsing tabs, emails, or banking websites. |

---

## 4. Third-Party Services and Network Requests

- **Model Download (First Run Only):** Upon initial installation or first run in Smart Mode, the extension downloads static, open-source neural network weight files (DistilBERT ONNX tensors from Hugging Face) into local browser `CacheStorage`. No user data or identifiers are transmitted in this request. Once downloaded, all AI processing runs completely offline.
- **Zero Third-Party APIs:** ZeroContext never connects to analytics platforms, advertising networks, tracking beacons, or third-party servers.

---

## 5. Data Security

Because 100% of text processing is executed client-side on your local machine and mappings are ephemeral, your sensitive data is never exposed in transit or at rest to any external party through ZeroContext.

---

## 6. Children's Privacy

ZeroContext does not collect any personal information from anyone, including children under the age of 13.

---

## 7. Changes to This Privacy Policy

We may update our Privacy Policy from time to time. Any changes will be posted to this repository with an updated revision date.

---

## 8. Contact Us

If you have any questions or feedback regarding this Privacy Policy, please open an issue on GitHub:
- **Repository:** [https://github.com/akshatdodhiya/zero-context](https://github.com/akshatdodhiya/zero-context)
