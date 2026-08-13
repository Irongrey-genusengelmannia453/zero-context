import type { ModelProgressMessage } from '../types/progress';

document.addEventListener('DOMContentLoaded', () => {
    const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
    const dummyText = document.getElementById('dummy-text') as HTMLSpanElement;
    const pasteZone = document.getElementById('paste-zone') as HTMLTextAreaElement;
    const progressContainer = document.getElementById('progress-container') as HTMLDivElement;
    const modelProgress = document.getElementById('model-progress') as HTMLProgressElement;
    const modelStatusText = document.getElementById('model-status-text') as HTMLParagraphElement;

    // Trigger Model Pre-warming in the Background
    chrome.runtime.sendMessage({ action: 'PREWARM_MODEL' }).catch(err => {
        console.error('[ZeroContext] Failed to send PREWARM_MODEL:', err);
    });

    // Listen for model download progress
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'MODEL_PROGRESS') {
            const data = message as ModelProgressMessage;
            
            if (data.status === 'initiate') {
                progressContainer.style.display = 'block';
                modelStatusText.textContent = `Downloading neural engine... (${data.file})`;
            } else if (data.status === 'progress' && data.progress !== undefined) {
                modelProgress.value = data.progress;
                if (data.file) {
                    modelStatusText.textContent = `Downloading neural engine... (${data.file})`;
                }
            } else if (data.status === 'done') {
                modelProgress.value = 100;
                modelStatusText.textContent = `Model ${data.file} loaded successfully.`;
            } else if (data.status === 'ready') {
                modelProgress.value = 100;
                modelStatusText.textContent = `Neural engine fully initialized and ready.`;
                setTimeout(() => {
                    progressContainer.style.opacity = '0.5';
                }, 2000);
            }
        }
    });

    // Copy Button interaction
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(dummyText.textContent ?? '')
            .then(() => {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 1500);
            })
            .catch(err => console.error('Failed to copy text', err));
    });

    // Paste interaction (simulate actual pipeline)
    pasteZone.addEventListener('paste', async (e) => {
        e.preventDefault();
        const pastedText = e.clipboardData?.getData('text');
        if (!pastedText) return;

        pasteZone.value = 'Loading neural engine & redacting...';
        pasteZone.disabled = true;

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'REDACT_TEXT',
                payload: pastedText
            });

            if (response && response.status === 'SUCCESS') {
                pasteZone.value = response.data;
            } else {
                pasteZone.value = `Error: ${response?.data || 'Unknown error'}`;
            }
        } catch (err) {
            pasteZone.value = `Error communicating with proxy: ${err instanceof Error ? err.message : String(err)}`;
        } finally {
            pasteZone.disabled = false;
        }
    });
});
