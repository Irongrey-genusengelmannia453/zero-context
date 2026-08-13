import type { ToastState } from '../types/progress';

const TOAST_CSS = `
  :host {
    position: fixed;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    z-index: 2147483647; /* Max z-index to stay above everything */
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  
  :host(.visible) {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(0);
  }

  .pill {
    background: rgba(28, 28, 30, 0.9);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    border-radius: 9999px;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    color: #ffffff;
    font-size: 14px;
    font-weight: 500;
    min-width: 250px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .pulse {
    width: 12px;
    height: 12px;
    background-color: #ffffff;
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .progress-container {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .text-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .bar-bg {
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: #ffffff;
    border-radius: 2px;
    transition: width 0.2s ease-out;
  }

  .sub-text {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1); }
  }
`;

export class ZeroContextToast {
    public state: ToastState = { state: 'IDLE' };
    public showTimestamp: number = 0;
    
    private hideTimeout: ReturnType<typeof setTimeout> | null = null;
    private container: HTMLElement | null = null;
    private shadow: ShadowRoot | null = null;

    constructor() {
        this.initDOM();
    }

    private initDOM(): void {
        if (typeof document === 'undefined') return; // For headless Vitest runs
        
        this.container = document.createElement('div');
        this.shadow = this.container.attachShadow({ mode: 'closed' });
        
        this.shadow.innerHTML = '<style>' + TOAST_CSS + '</style>' +
            '<div class="pill">' +
                '<div id="icon"></div>' +
                '<div class="progress-container">' +
                    '<div class="text-row">' +
                        '<span id="title"></span>' +
                        '<span id="percentage"></span>' +
                    '</div>' +
                    '<div id="bar-track" class="bar-bg">' +
                        '<div id="bar-fill" class="bar-fill"></div>' +
                    '</div>' +
                    '<div id="sub-text" class="sub-text"></div>' +
                '</div>' +
            '</div>';
        
        // We only append to body if we are in a real DOM environment
        if (document.body) {
            document.body.appendChild(this.container);
        }
    }

    private ensureVisible(): void {
        if (this.state.state === 'IDLE') {
            this.showTimestamp = Date.now();
        }
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
    }

    public showIndeterminateRedacting(): void {
        this.ensureVisible();
        
        this.state = {
            state: 'REDACTING'
        };
        this.render();
    }

    public showError(message: string): void {
        this.ensureVisible();
        this.state = {
            state: 'ERROR',
            message
        };
        this.render();
    }

    public showSuccess(message: string): void {
        this.ensureVisible();
        this.state = {
            state: 'SUCCESS',
            message
        };
        this.render();
        
        // Auto-hide success after 2.5 seconds
        if (this.hideTimeout) clearTimeout(this.hideTimeout);
        this.hideTimeout = setTimeout(() => this.executeHide(), 2500);
    }

    public updateDownloadProgress(loadedBytes: number, totalBytes: number): void {
        this.ensureVisible();
        const percent = totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0;
        
        this.state = {
            state: 'DOWNLOADING_MODEL',
            loadedBytes,
            totalBytes,
            progressPercent: percent
        };
        this.render();
    }

    public hide(): void {
        if (this.state.state === 'IDLE') return;

        const elapsed = Date.now() - this.showTimestamp;
        
        // If the state is ERROR, enforce a strict 8000ms display time
        const minimumDisplayMs = this.state.state === 'ERROR' ? 8000 : 750;
        const remaining = Math.max(0, minimumDisplayMs - elapsed);

        if (remaining > 0) {
            if (this.hideTimeout) clearTimeout(this.hideTimeout);
            this.hideTimeout = setTimeout(() => this.executeHide(), remaining);
        } else {
            this.executeHide();
        }
    }

    private executeHide(): void {
        this.state = { state: 'IDLE' };
        this.hideTimeout = null;
        this.render();
    }

    private render(): void {
        if (!this.shadow || !this.container) return;

        if (this.state.state === 'IDLE') {
            this.container.classList.remove('visible');
            return;
        }

        this.container.classList.add('visible');

        const icon = this.shadow.getElementById('icon');
        const title = this.shadow.getElementById('title');
        const percentage = this.shadow.getElementById('percentage');
        const barTrack = this.shadow.getElementById('bar-track');
        const barFill = this.shadow.getElementById('bar-fill');
        const subText = this.shadow.getElementById('sub-text');

        if (!icon || !title || !percentage || !barTrack || !barFill || !subText) return;

        // Reset styles
        title.style.color = '#ffffff';

        if (this.state.state === 'DOWNLOADING_MODEL') {
            icon.className = 'spinner';
            title.textContent = 'Downloading Privacy Engine...';
            percentage.textContent = `${this.state.progressPercent}%`;
            barTrack.style.display = 'block';
            barFill.style.width = `${this.state.progressPercent}%`;
            
            const mbLoaded = (this.state.loadedBytes / 1024 / 1024).toFixed(1);
            const mbTotal = (this.state.totalBytes / 1024 / 1024).toFixed(1);
            subText.textContent = `${mbLoaded}MB / ${mbTotal}MB`;
            subText.style.display = 'block';
        } else if (this.state.state === 'REDACTING') {
            title.textContent = 'Securing Data...';
            subText.style.display = 'none';

            icon.className = 'pulse';
            percentage.textContent = '';
            barTrack.style.display = 'none';
        } else if (this.state.state === 'ERROR') {
            title.textContent = this.state.message;
            title.style.color = '#ff4b4b'; // Red color for error text
            subText.style.display = 'none';

            icon.className = 'error';
            icon.style.backgroundColor = '#ff4b4b';
            icon.style.boxShadow = '0 0 8px rgba(255, 75, 75, 0.4)';
            
            percentage.textContent = '';
            barTrack.style.display = 'none';
        } else if (this.state.state === 'SUCCESS') {
            title.textContent = this.state.message;
            title.style.color = '#34d399'; // Greenish color for success
            subText.style.display = 'none';

            icon.className = 'success';
            icon.style.backgroundColor = '#34d399';
            icon.style.boxShadow = '0 0 8px rgba(52, 211, 153, 0.4)';
            
            percentage.textContent = '';
            barTrack.style.display = 'none';
        }
    }
}
