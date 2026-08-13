/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig(() => {
    return {
        test: {
            exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', 'tests/e2e/**'],
        },
        plugins: [
            crx({ manifest }),
            {
                name: 'inject-sandbox-csp',
                async closeBundle() {
                    const fs = await import('fs');
                    const path = await import('path');
                    const manifestPath = path.resolve(__dirname, 'dist/manifest.json');
                    if (fs.existsSync(manifestPath)) {
                        const manifestStr = fs.readFileSync(manifestPath, 'utf-8');
                        const manifest = JSON.parse(manifestStr);
                        if (!manifest.content_security_policy) {
                            manifest.content_security_policy = {};
                        }
                        manifest.content_security_policy.sandbox = "sandbox allow-scripts allow-forms allow-popups allow-modals; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; child-src 'self' blob:;";

                        // CRXJS scopes web_accessible_resources to manifest content_scripts matches by default.
                        // We must open this up to <all_urls> so that dynamically registered content scripts
                        // on custom domains can load their chunked dependencies.
                        if (manifest.web_accessible_resources) {
                            for (const resource of manifest.web_accessible_resources) {
                                resource.matches = ["<all_urls>"];
                            }
                        }

                        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
                    }
                }
            }
        ],
        build: {
            modulePreload: false,
            target: 'esnext',
            rollupOptions: {
                input: {
                    'onboarding': 'onboarding.html',
                    'src/offscreen/offscreen': 'src/offscreen/offscreen.html',
                    'src/sandbox/sandbox': 'src/sandbox/sandbox.html',
                }
            }
        },
        worker: {
            format: 'es'
        }
    };
});
