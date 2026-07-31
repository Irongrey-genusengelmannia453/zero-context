import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig(() => {
    return {
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
                        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
                    }
                }
            }
        ],
    build: {
        target: 'esnext',
        rollupOptions: {
            input: {
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