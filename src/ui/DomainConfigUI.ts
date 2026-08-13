import { DomainGatekeeper } from '../domainGatekeeper.ts';
import { ZeroContextToast } from './ZeroContextToast';
import { showRefreshBanner } from '../main.ts';

export class DomainConfigUI {
  private gatekeeper: DomainGatekeeper;
  private domainsList: HTMLDivElement;
  private form: HTMLFormElement;
  private input: HTMLInputElement;
  private restoreBtn: HTMLButtonElement;
  private toast: ZeroContextToast;

  constructor(gatekeeper: DomainGatekeeper) {
    this.gatekeeper = gatekeeper;
    this.domainsList = document.getElementById('domains-list') as HTMLDivElement;
    this.form = document.getElementById('add-domain-form') as HTMLFormElement;
    this.input = document.getElementById('domain-input') as HTMLInputElement;
    this.restoreBtn = document.getElementById('restore-defaults-btn') as HTMLButtonElement;
    this.toast = new ZeroContextToast();
  }

  mount() {
    this.render();
    
    this.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hostname = this.input.value.trim();
      if (!hostname) return;

      const result = await this.gatekeeper.addCustomDomain(hostname);
      
      if (result.status === 'SUCCESS') {
        this.input.value = '';
        this.render();
        this.toast.showSuccess(`Successfully protected ${hostname}`);
        showRefreshBanner();
      } else {
        this.toast.showError(result.message);
      }
    });

    this.restoreBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to restore the default AI domains? Custom domains will be lost.')) {
        await this.gatekeeper.restoreDefaults();
        this.render();
        this.toast.showSuccess('Defaults restored.');
      }
    });
  }

  render() {
    this.domainsList.innerHTML = '';

    const cleanPattern = (pattern: string) => {
      // Strips "*://*.hostname/*" -> "hostname"
      return pattern.replace(/^(\*|https?):\/\//, '').replace(/^\*\./, '').replace(/\/.*/, '');
    };
    
    const domains = [...this.gatekeeper.getDomains()].sort((a, b) => {
      const timeA = 'addedAt' in a ? a.addedAt : 0;
      const timeB = 'addedAt' in b ? b.addedAt : 0;
      return timeB - timeA;
    });

    for (const domain of domains) {
      const container = document.createElement('div');
      container.style.display = 'flex';
      container.style.justifyContent = 'space-between';
      container.style.alignItems = 'center';
      container.style.borderBottom = '1px solid var(--pico-muted-border-color)';
      container.style.padding = '0.75rem 0';

      const leftGroup = document.createElement('div');
      leftGroup.style.display = 'flex';
      leftGroup.style.flexDirection = 'column';
      leftGroup.style.gap = '0.25rem';
      
      const nameSpan = document.createElement('span');
      nameSpan.innerHTML = `<strong style="font-size: 1.1rem; display: block; margin-bottom: 0.2rem;">${cleanPattern(domain.pattern)}</strong>
                            <small class="pico-color-muted" style="font-size: 0.75rem;">${domain.type === 'BUILT_IN' ? 'Default Engine' : 'Custom Site'}</small>`;
      nameSpan.style.flex = '1';

      leftGroup.appendChild(nameSpan);

      const rightGroup = document.createElement('div');
      rightGroup.style.display = 'flex';
      rightGroup.style.alignItems = 'center';
      rightGroup.style.gap = '1rem';

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.role = 'switch';
      toggle.checked = domain.enabled;
      toggle.addEventListener('change', async (e) => {
        await this.gatekeeper.toggleDomain(domain.id, (e.target as HTMLInputElement).checked);
        showRefreshBanner();
      });

      const deleteBtn = document.createElement('a');
      deleteBtn.href = '#';
      deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
      deleteBtn.style.color = 'var(--pico-del-color)';
      deleteBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm(`Remove ${cleanPattern(domain.pattern)} from protected domains?`)) {
          await this.gatekeeper.removeDomain(domain.id);
          this.render();
          showRefreshBanner();
        }
      });

      rightGroup.appendChild(toggle);
      rightGroup.appendChild(deleteBtn);

      container.appendChild(leftGroup);
      container.appendChild(rightGroup);
      
      this.domainsList.appendChild(container);
    }
  }
}
