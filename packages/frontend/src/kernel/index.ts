/**
 * Window Mirror - Kernel Exports
 *
 * Minimal barrel: only stable surface for now. The engine modules
 * (SAST/WASM/MITM/LSP/TanStack) are imported directly where used;
 * their APIs are still settling (see MASTER.md Part 7).
 */

export * from './BrowserKernel';
export { createKernel, WindowMirrorKernel } from './KernelBootstrap';
