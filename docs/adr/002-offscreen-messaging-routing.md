# ADR 002: Offscreen Message Routing and Sandbox Fetch Delegation Fixes

## Status
Accepted

## Context
The architecture dictates a 3-hop message chain for ML execution: `Background <-> Offscreen <-> Sandbox`.
Two major pipeline failures were occurring:
1. **Serialization Loss:** The sandbox was sending the model output (a custom `TokenClassificationOutput` class) over `postMessage`. The structured clone algorithm dropped the class data silently.
2. **Orphaned Responses:** The offscreen document used `sendResponse()` to reply to the background via the original port. However, `background.ts` was listening for a *new message* using `chrome.runtime.onMessage`, leading to all worker responses being silently dropped (and timing out after 30 seconds).
3. **Singleton Race Condition & Fetch Hangs:** In `sandbox.ts`, the eager load and manual load created a race condition causing the model to be instantiated twice. Additionally, the delegated `fetch` had no timeout, meaning if the postMessage to Offscreen failed, the Sandbox hung forever.

## Decision
1. **Explicit Serialization:** `sandbox.ts` explicitly maps the model output into plain JSON-safe object arrays before sending via `postMessage`.
2. **Explicit Routing Channel:** The offscreen script no longer uses `sendResponse()`. It uses `chrome.runtime.sendMessage()` to broadcast the response back to the background script, aligning with `initOffscreenResponseListener`'s expectation.
3. **PipelineSingleton Promise:** The singleton in `sandbox.ts` now stores the `Promise` of the model load, not the result, ensuring all concurrent requests await a single initialization.
4. **Fetch Delegation Timeout:** Added a 120s `setTimeout` on fetch delegation in `sandbox.ts` to prevent infinite hangs.
5. **Disabled WebGPU Probing:** Explicitly set `env.backends.onnx.wasm.proxy = false` in `sandbox.ts` to stop Transformers.js from requesting WebGPU adapters (which causes warnings/crashes in sandboxed iframes).
6. **Relay Logging:** Created a `SANDBOX_LOG` relay to route sandbox console logs to the offscreen console for debugging visibility.

## Consequences
- **Positive:** NER results flow flawlessly back to the background script.
- **Positive:** Complete visibility into the sandbox's state via offscreen logs.
- **Positive:** The pipeline is completely resilient to race conditions and hangs.
