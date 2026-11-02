export const STUDIO_CSS_STYLES = `
  * {
    box-sizing: border-box;
  }

  .studio,
  .studio * {
    scrollbar-width: thin !important;
    -ms-overflow-style: auto !important;
    scrollbar-color: rgba(148, 163, 184, 0.5) transparent !important;
  }

  .studio.dark,
  .studio.dark * {
    scrollbar-color: rgba(113, 113, 122, 0.6) transparent !important;
  }

  .studio::-webkit-scrollbar,
  .studio *::-webkit-scrollbar {
    display: block !important;
    width: 6px !important;
    height: 6px !important;
  }

  .studio::-webkit-scrollbar-track,
  .studio *::-webkit-scrollbar-track {
    background: transparent !important;
  }

  .studio::-webkit-scrollbar-thumb,
  .studio *::-webkit-scrollbar-thumb {
    background-color: rgba(148, 163, 184, 0.5) !important;
    border-radius: 9999px !important;
    border: 1.5px solid transparent !important;
    background-clip: content-box !important;
  }

  .studio::-webkit-scrollbar-thumb:hover,
  .studio *::-webkit-scrollbar-thumb:hover {
    background-color: rgba(100, 116, 139, 0.8) !important;
  }

  .studio.dark::-webkit-scrollbar-thumb,
  .studio.dark *::-webkit-scrollbar-thumb {
    background-color: rgba(113, 113, 122, 0.6) !important;
  }

  .studio.dark::-webkit-scrollbar-thumb:hover,
  .studio.dark *::-webkit-scrollbar-thumb:hover {
    background-color: rgba(161, 161, 170, 0.9) !important;
  }

  .studio.is-home-view,
  .studio.is-home-view * {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }

  .studio.is-home-view::-webkit-scrollbar,
  .studio.is-home-view *::-webkit-scrollbar {
    display: none !important;
    width: 0px !important;
    height: 0px !important;
  }

  .studio {
    --bg: #ffffff;
    --panel: #ffffff;
    --text: #0f172a;
    --muted: #475569;
    --line: #cbd5e1;

    min-height: 100vh;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    color: #0f172a;
    overflow: hidden;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .studio style {
    display: none !important;
  }

  .studio.dark {
    --bg: #0b0c10;
    --panel: #0b0c10;
    --text: #e8eaed;
    --muted: #9aa0a6;
    --line: #2c313d;
    background: #0b0c10;
  }

  /* HTML Notes Home Page: Matches Test List Home Page with identical plain #e5e9f0 body and header */
  .studio.is-home-view {
    --bg: #e5e9f0;
    --panel: #e5e9f0;
    background: #e5e9f0 !important;
  }

  .studio.dark.is-home-view {
    --bg: #0b0c10;
    --panel: #0b0c10;
    background: #0b0c10 !important;
  }

  .studio.is-home-view .topbar {
    background: #e5e9f0 !important;
    border-bottom: 0 !important;
    box-shadow: none !important;
  }

  .studio.dark.is-home-view .topbar {
    background: #0b0c10 !important;
    border-bottom: 0 !important;
    box-shadow: none !important;
  }

  /* ==========================================================================
     Google Material 3 (M3) Motion Tokens & GPU-Optimized Motion System
     ========================================================================== */
  :root {
    --m3-motion-emphasized: cubic-bezier(0.2, 0.0, 0, 1.0);
    --m3-motion-emphasized-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1.0);
    --m3-motion-emphasized-accelerate: cubic-bezier(0.3, 0.0, 0.8, 0.15);
    --m3-motion-standard: cubic-bezier(0.2, 0.0, 0, 1.0);
    --m3-motion-standard-decelerate: cubic-bezier(0, 0, 0.2, 1);
    --m3-motion-duration-short: 150ms;
    --m3-motion-duration-medium: 220ms;
    --m3-motion-duration-long: 280ms;
  }

  @keyframes m3-fade-through {
    0% {
      opacity: 0;
      transform: scale(0.988) translateY(4px) translateZ(0);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0) translateZ(0);
    }
  }

  @keyframes m3-fade-in {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }

  @keyframes m3-dialog-in {
    0% {
      opacity: 0;
      transform: scale(0.92) translateZ(0);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateZ(0);
    }
  }

  @keyframes m3-slide-right-in {
    0% {
      transform: translateX(100%) translateZ(0);
    }
    100% {
      transform: translateX(0) translateZ(0);
    }
  }

  @keyframes m3-slide-left-in {
    0% {
      transform: translateX(-100%) translateZ(0);
    }
    100% {
      transform: translateX(0) translateZ(0);
    }
  }

  @keyframes m3-slide-down-in {
    0% {
      opacity: 0;
      transform: translateY(-8px) translateZ(0);
    }
    100% {
      opacity: 1;
      transform: translateY(0) translateZ(0);
    }
  }

  @keyframes m3-popover-in {
    0% {
      opacity: 0;
      transform: scale(0.94) translateZ(0);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateZ(0);
    }
  }

  /* Material 3 Motion Helper Classes */
  .m3-fade-through {
    animation: m3-fade-through 240ms cubic-bezier(0.05, 0.7, 0.1, 1.0) both;
    will-change: transform, opacity;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }

  .m3-fade-in {
    animation: m3-fade-in 180ms cubic-bezier(0, 0, 0.2, 1) both;
  }

  .m3-dialog-in {
    animation: m3-dialog-in 240ms cubic-bezier(0.05, 0.7, 0.1, 1.0) both;
    will-change: transform, opacity;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }

  .m3-slide-right-in {
    animation: m3-slide-right-in 260ms cubic-bezier(0.05, 0.7, 0.1, 1.0) both;
    will-change: transform;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }

  .m3-slide-left-in {
    animation: m3-slide-left-in 260ms cubic-bezier(0.05, 0.7, 0.1, 1.0) both;
    will-change: transform;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }

  .m3-slide-down-in {
    animation: m3-slide-down-in 200ms cubic-bezier(0.05, 0.7, 0.1, 1.0) both;
    will-change: transform, opacity;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }

  .m3-popover-in {
    animation: m3-popover-in 170ms cubic-bezier(0.05, 0.7, 0.1, 1.0) both;
    will-change: transform, opacity;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }

  /* Targeted hardware-friendly tactile motion feedback (no blanket translateZ on all buttons) */
  .studio-rail-btn, 
  .mode-switch button, 
  .tabs button,
  .topbar button,
  .sidebar-drawer button,
  .btn {
    transition: transform 0.15s cubic-bezier(0.2, 0, 0, 1), background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  }

  .studio-rail-btn:active, 
  .mode-switch button:active, 
  .tabs button:active,
  .topbar button:active,
  .sidebar-drawer button:active,
  .btn:active {
    transform: scale(0.96);
  }

  .sidebar-drawer {
    transition: transform 0.22s cubic-bezier(0.05, 0.7, 0.1, 1.0), opacity 0.2s ease;
  }

  /* Accessibility & Low-Power Lean Mode Overrides */
  @media (prefers-reduced-motion: reduce) {
    .m3-fade-through,
    .m3-fade-in,
    .m3-dialog-in,
    .m3-slide-right-in,
    .m3-slide-left-in,
    .m3-slide-down-in,
    .m3-popover-in {
      animation: none !important;
      transform: none !important;
    }
  }

  /* Global Medium Font Weight Enforcement across Notes Studio */
  .studio, 
  .studio input, 
  .studio textarea, 
  .studio button, 
  .code-editor, 
  .line-numbers,
  .sidebar-drawer,
  .sidebar-rail,
  .topbar {
    font-weight: 500;
  }

  .topbar {
    min-height: 48px;
    height: auto;
    padding: calc(env(safe-area-inset-top, 0px) + 0.6rem) 16px 0.6rem 16px;
    margin: 0 !important;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: #ffffff;
    border-bottom: 0 !important;
    border: 0 !important;
    flex-shrink: 0;
    z-index: 20;
    width: 100%;
    box-sizing: border-box;
  }

  .studio.dark .topbar {
    background: #0b0c10;
  }

  .brand {
    font-weight: 800;
    letter-spacing: -0.03em;
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    font-size: 17px;
    white-space: nowrap;
    flex-shrink: 0;
    color: #0f172a;
  }

  .studio.dark .brand {
    color: #e3e3e3;
  }

  .brand span {
    color: #0b57d0;
  }

  .studio.dark .brand span {
    color: #a8c7fa;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .btn {
    border-radius: 9999px;
    border: 0 !important;
    padding: 5px 12px;
    font-size: 11px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    background: #eff2f6;
    color: #334155;
    transition: all 0.15s ease;
    white-space: nowrap;
    box-shadow: none !important;
  }

  .studio.dark .btn {
    background: #232732;
    color: #cbd5e1;
    border: 0 !important;
  }

  .btn:hover {
    background: #e2e8f0;
    color: #0b57d0;
  }

  .studio.dark .btn:hover {
    background: #2d3340;
    color: #a8c7fa;
  }

  .btn-primary {
    background: #0b57d0;
    color: #ffffff !important;
  }

  .btn-primary:hover {
    background: #0842a0;
  }

  .mode-switch {
    display: flex;
    align-items: center;
    background: #eff2f6;
    padding: 2px;
    border-radius: 9999px;
    border: 0 !important;
  }

  .studio.dark .mode-switch {
    background: #232732;
    border: 0 !important;
  }

  .mode-switch button {
    border: 0 !important;
    background: transparent;
    color: #64748b;
    border-radius: 9999px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s ease;
  }

  .studio.dark .mode-switch button {
    color: #94a3b8;
  }

  .mode-switch button.active {
    background: #0b57d0;
    color: #ffffff;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }

  .studio.dark .mode-switch button.active {
    background: #0b57d0;
    color: #ffffff;
  }

  .tabs {
    min-height: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px;
    border-bottom: 0 !important;
    background: #f8fafc;
    flex-shrink: 0;
    overflow-x: auto;
  }

  .studio.dark .tabs {
    background: #1b1e27;
  }

  .tabs::-webkit-scrollbar {
    display: none;
  }

  .tabs button {
    white-space: nowrap;
    border-radius: 9999px;
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 600;
    border: 0 !important;
    background: #f1f5f9;
    color: #334155;
    box-shadow: none !important;
  }

  .studio.dark .tabs button {
    background: #232732;
    color: #cbd5e1;
    border: 0 !important;
  }

  .tabs button:hover {
    background: #e2e8f0;
    border: 0 !important;
    color: #0b57d0;
  }

  .tabs .active-tab {
    border: 0 !important;
    color: #0b57d0 !important;
    background: #eff6ff !important;
    font-weight: 800;
    box-shadow: none !important;
  }

  .studio.dark .tabs .active-tab {
    border: 0 !important;
    color: #a8c7fa !important;
    background: #1e293b !important;
  }

  .workspace {
    min-height: 0;
    flex: 1;
    display: flex;
    gap: 0;
    background: var(--panel);
    overflow: hidden;
    position: relative;
  }

  .split-workspace-container {
    flex: 1 1 0%;
    min-width: 0;
    height: 100%;
    display: flex;
    position: relative;
    overflow: hidden;
    background: var(--panel);
  }

  .pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    position: relative;
    background: var(--panel);
  }

  .editor-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    position: relative;
    background: var(--panel);
  }

  .preview-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden !important;
    position: relative;
    background: var(--panel);
  }

  .editor-container {
    display: flex;
    flex: 1 1 0%;
    min-height: 0;
    min-width: 0;
    height: 100%;
    width: 100%;
    position: relative;
    overflow: hidden;
  }

  .line-numbers {
    background: rgba(241, 245, 249, 0.7);
    color: #94a3b8;
    border-right: 1px solid rgba(226, 232, 240, 0.9);
  }

  .studio.dark .line-numbers {
    background: #0d1117 !important;
    color: #64748b !important;
    border-right: 1px solid #1e293b !important;
  }

  .code-editor {
    background: #ffffff;
    color: #0f172a;
    caret-color: #2563eb;
  }

  .studio.dark .code-editor {
    background: #0d1117 !important;
    color: #e2e8f0 !important;
    caret-color: #38bdf8 !important;
  }

  .studio.dark .code-editor::selection {
    background: #1e3a8a !important;
    color: #ffffff !important;
  }

  .section-code-blink-banner {
    position: absolute;
    left: 46px;
    right: 0;
    height: 22px;
    background: rgba(37, 99, 235, 0.15);
    border-left: 3px solid #2563eb;
    pointer-events: none;
    z-index: 10;
    display: flex;
    align-items: center;
    padding-left: 8px;
    font-size: 11px;
    color: #1d4ed8;
    font-weight: 600;
  }

  .studio.dark .section-code-blink-banner {
    background: rgba(56, 189, 248, 0.2) !important;
    border-left: 3px solid #38bdf8 !important;
    color: #a5f3fc !important;
  }

  /* Resizable Divider */
  .split-divider {
    width: 8px;
    cursor: col-resize;
    background: var(--line);
    position: relative;
    z-index: 30;
    transition: background 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
  }

  .split-divider:hover,
  .split-divider.active {
    background: #3b82f6;
  }

  .split-divider-handle {
    width: 2px;
    height: 24px;
    background: var(--muted);
    border-radius: 9999px;
  }

  /* Resizing Shield State (Prevents iframe from swallowing mouse/touch events & eliminates layout lag) */
  .is-resizing,
  .is-resizing * {
    user-select: none !important;
    -webkit-user-select: none !important;
    cursor: col-resize !important;
    transition: none !important;
  }
  .is-resizing iframe {
    pointer-events: none !important;
  }

  /* Left Activity Rail (Desktop Only) */
  .sidebar-rail {
    width: 42px;
    flex-shrink: 0;
    background: var(--panel);
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    z-index: 25;
  }

  .sidebar-rail-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .sidebar-rail-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--muted);
    transition: all 0.15s ease;
  }

  .sidebar-rail-btn:hover {
    color: #0b57d0;
    background: #eff6ff;
  }

  .sidebar-rail-btn.active {
    color: #0b57d0;
    background: #dbeafe;
  }

  .studio.dark .sidebar-rail-btn:hover {
    color: #a8c7fa;
    background: #1e293b;
  }

  .studio.dark .sidebar-rail-btn.active {
    color: #a8c7fa;
    background: #232732;
  }

  .sidebar-drawer {
    width: 240px;
    flex-shrink: 0;
    border-right: 1px solid var(--line);
    background: var(--panel);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 20;
  }

  .sidebar-drawer-header {
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    border-bottom: 1px solid var(--line);
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
  }

  .tree-node {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 11px;
    cursor: pointer;
    user-select: none;
    color: var(--text);
    transition: background 0.1s;
  }

  .tree-node:hover {
    background: #f1f5f9;
  }

  .studio.dark .tree-node:hover {
    background: #1e293b;
  }

  .tree-node.active {
    background: #eff6ff;
    color: #0b57d0;
    font-weight: 600;
  }

  .studio.dark .tree-node.active {
    background: #1e293b;
    color: #a8c7fa;
  }

  /* HTML Preview Canvas - Full Background Mode & Sheet Options */
  .preview-canvas-wrapper {
    flex: 1;
    overflow: hidden !important;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #ffffff;
    padding: 0 !important;
    margin: 0 !important;
    width: 100%;
    height: 100%;
  }

  .studio.dark .preview-canvas-wrapper {
    background: #0b0c10;
  }

  .preview-canvas-wrapper.is-a4-mode,
  .is-preview-active .preview-pane .preview-canvas-wrapper.is-a4-mode {
    display: block !important;
    overflow: hidden !important;
    padding: 0 !important;
    margin: 0 !important;
    background: transparent !important;
  }

  .studio.dark .preview-canvas-wrapper.is-a4-mode,
  .studio.dark.is-preview-active .preview-pane .preview-canvas-wrapper.is-a4-mode {
    background: #14161d !important;
  }

  /* Full Background Mode in HTML Preview (both split view and preview view modes) */
  .preview-canvas-wrapper.is-full-background,
  .preview-pane .preview-canvas-wrapper:not(.is-a4-mode),
  .is-preview-active .preview-pane .preview-canvas-wrapper:not(.is-a4-mode) {
    padding: 0 !important;
    margin: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: #ffffff !important;
    display: block !important;
    border: 0 !important;
    border-radius: 0 !important;
  }

  .studio.dark .preview-canvas-wrapper.is-full-background,
  .studio.dark .preview-pane .preview-canvas-wrapper:not(.is-a4-mode),
  .studio.dark.is-preview-active .preview-pane .preview-canvas-wrapper:not(.is-a4-mode) {
    background: #14161d !important;
  }

  .preview-sheet-card {
    background: #ffffff;
    width: 100%;
    max-width: 1000px;
    height: 100%;
    min-height: 100%;
    margin: 0 auto;
    padding: 0;
    border: 0 !important;
    border-radius: 24px !important;
    box-shadow: 0 2px 6px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05);
    overflow: hidden;
  }

  .preview-sheet-card.is-full-background,
  .preview-pane .preview-sheet-card:not(.is-a4-paper),
  .is-preview-active .preview-pane .preview-sheet-card:not(.is-a4-paper) {
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
  }

  .studio.dark .preview-sheet-card {
    background: #1b1e27 !important;
    border: 0 !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35) !important;
  }

  .studio.dark .preview-sheet-card.is-a4-paper {
    background: #161b22 !important;
    border: 1px solid #30363d !important;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1) !important;
  }

  .preview-sheet-card.is-a4-paper {
    display: block !important;
    position: absolute !important;
    top: 0 !important;
    left: 50% !important;
    margin: 0 !important;
    margin-left: -397px !important;
    transform-origin: top center !important;
    width: 794px !important;
    border-radius: 8px !important;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.1) !important;
    background: #ffffff !important;
    text-align: left !important;
    vertical-align: top !important;
    overflow: hidden !important;
    flex-shrink: 0 !important;
  }

  .preview-frame {
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    border: 0 !important;
    margin: 0 !important;
    background: #fff;
    display: block;
  }

  .status {
    min-height: 24px;
    height: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border-top: 1px solid var(--line);
    background: var(--panel);
    color: var(--muted);
    font-size: 10px;
    flex-shrink: 0;
  }

  .hidden-input {
    display: none;
  }

  .studio-preview-editable {
    cursor: text;
  }
  .studio-preview-editable [contenteditable="true"] {
    outline: none !important;
    caret-color: #2563eb !important;
  }
  .studio-preview-editable [contenteditable="true"]:focus {
    outline: 1.5px dashed rgba(37,99,235,0.35) !important;
    outline-offset: 2px !important;
  }

  .studio-img-wrapper {
    position: relative;
    display: inline-block;
    max-width: 100%;
    user-select: none;
    vertical-align: middle;
    box-sizing: border-box;
    margin: 12px 0;
  }

  .studio-img-wrapper img {
    display: block;
    width: 100%;
    height: auto;
    max-width: 100%;
    border-radius: 8px;
    cursor: pointer;
  }

  /* Direct DOM Preview Canvas & Smart Image Widget Styles (From Reference App.jsx) */
  .preview-scroll-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    flex: 1 1 0%;
    min-height: 0;
    overflow-y: auto !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
  }

  .preview-scroll-wrapper,
  .preview-canvas,
  #preview-canvas,
  .a4-sheet {
    container-type: inline-size;
  }

  .preview-canvas {
    display: flow-root;
    box-sizing: border-box;
    line-height: 1.6;
    word-break: break-word;
    outline: none;
    transition: background-color 0.2s, color 0.2s;
  }

  /* Responsive Fluid Flow (Desktop 2-Col -> Mobile 1-Col Stacked in fluid preview) */
  @container (max-width: 600px) {
    .preview-canvas:not(.a4-paper-sheet) .notes-layout {
      grid-template-columns: 1fr !important;
      gap: 1rem !important;
    }
    .preview-canvas:not(.a4-paper-sheet) .notes-layout > .full-width,
    .preview-canvas:not(.a4-paper-sheet) .full-width {
      grid-column: span 1 !important;
    }
    .preview-canvas:not(.a4-paper-sheet) .section-card {
      width: 100% !important;
      margin-right: 0 !important;
    }
    .preview-canvas:not(.a4-paper-sheet) .grid-2,
    .preview-canvas:not(.a4-paper-sheet) .grid-3 {
      grid-template-columns: 1fr !important;
      gap: 0.75rem !important;
    }
  }

  /* Class-based fallback: strictly limited to narrow screen preview, NEVER applied to A4 Paper sheets */
  .preview-canvas.is-compact-preview:not(.a4-paper-sheet) .notes-layout,
  .preview-canvas.is-mobile-preview:not(.a4-paper-sheet) .notes-layout,
  #preview-canvas.is-compact-preview:not(.a4-paper-sheet) .notes-layout,
  #preview-canvas.is-mobile-preview:not(.a4-paper-sheet) .notes-layout {
    grid-template-columns: 1fr !important;
    gap: 1rem !important;
  }

  .preview-canvas.is-compact-preview:not(.a4-paper-sheet) .full-width,
  .preview-canvas.is-mobile-preview:not(.a4-paper-sheet) .full-width,
  #preview-canvas.is-compact-preview:not(.a4-paper-sheet) .full-width,
  #preview-canvas.is-mobile-preview:not(.a4-paper-sheet) .full-width {
    grid-column: span 1 !important;
  }

  .preview-canvas.is-compact-preview:not(.a4-paper-sheet) .section-card,
  .preview-canvas.is-mobile-preview:not(.a4-paper-sheet) .section-card,
  #preview-canvas.is-compact-preview:not(.a4-paper-sheet) .section-card,
  #preview-canvas.is-mobile-preview:not(.a4-paper-sheet) .section-card {
    width: 100% !important;
    margin-right: 0 !important;
  }

  .preview-canvas.is-compact-preview:not(.a4-paper-sheet) .grid-2,
  .preview-canvas.is-compact-preview:not(.a4-paper-sheet) .grid-3,
  .preview-canvas.is-mobile-preview:not(.a4-paper-sheet) .grid-2,
  .preview-canvas.is-mobile-preview:not(.a4-paper-sheet) .grid-3,
  #preview-canvas.is-compact-preview:not(.a4-paper-sheet) .grid-2,
  #preview-canvas.is-compact-preview:not(.a4-paper-sheet) .grid-3,
  #preview-canvas.is-mobile-preview:not(.a4-paper-sheet) .grid-2,
  #preview-canvas.is-mobile-preview:not(.a4-paper-sheet) .grid-3 {
    grid-template-columns: 1fr !important;
    gap: 0.75rem !important;
  }

  /* A4 Paper Sheets & Print ALWAYS preserve authentic 2-Column layout for side-by-side sections */
  .preview-canvas .a4-sheet .notes-layout,
  .a4-sheet .notes-layout {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 1rem !important;
    width: 100% !important;
  }

  .preview-canvas .a4-sheet .notes-layout > .full-width,
  .preview-canvas .a4-sheet .full-width,
  .a4-sheet .full-width {
    grid-column: span 2 !important;
    width: 100% !important;
  }

  .preview-canvas .a4-sheet .section-card:not(.full-width),
  .a4-sheet .section-card:not(.full-width) {
    grid-column: span 1 !important;
    width: 100% !important;
    margin: 0 !important;
  }

  .a4-sheet > .section-card:not(.full-width) {
    display: inline-block !important;
    width: calc(50% - 6px) !important;
    vertical-align: top !important;
    margin-right: 8px !important;
    box-sizing: border-box !important;
  }
  .a4-sheet > .section-card:not(.full-width):nth-of-type(even) {
    margin-right: 0 !important;
  }

  .preview-canvas.preview-editing {
    cursor: text;
  }

  .preview-canvas.preview-editing p:hover,
  .preview-canvas.preview-editing h1:hover,
  .preview-canvas.preview-editing h2:hover,
  .preview-canvas.preview-editing h3:hover,
  .preview-canvas.preview-editing h4:hover,
  .preview-canvas.preview-editing li:hover,
  .preview-canvas.preview-editing blockquote:hover,
  .preview-canvas.preview-editing .def-box:hover,
  .preview-canvas.preview-editing .panel:hover {
    outline: 1.5px dashed rgba(37, 99, 235, 0.5) !important;
    outline-offset: 3px !important;
  }

  /* A4 Paper Sheet Preview Architecture */
  .preview-canvas.a4-paper-sheet {
    box-sizing: border-box !important;
    position: relative !important;
    width: 210mm !important;
    min-width: 210mm !important;
    max-width: none !important;
    min-height: 297mm !important;
    background: transparent !important;
    color: #0f172a !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
  }

  /* Authentic Multi-Page A4 Sheet Cards */
  .preview-canvas .a4-sheet {
    box-sizing: border-box !important;
    position: relative !important;
    width: 210mm !important;
    min-width: 210mm !important;
    max-width: 210mm !important;
    height: 297mm !important;
    min-height: 297mm !important;
    max-height: 297mm !important;
    container-type: inline-size !important;
    background: #ffffff !important;
    color: #0f172a !important;
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.45;
    text-rendering: optimizeLegibility !important;
    -webkit-font-smoothing: antialiased !important;
    border-radius: 2px !important;
    border: 1px solid #cbd5e1 !important;
    box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.12), 0 2px 6px -1px rgba(0, 0, 0, 0.08) !important;
    margin: 0 auto 28px auto !important;
    overflow: hidden !important;
    page-break-after: always !important;
    break-after: page !important;
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }

  /* Discard top margin on the first element of any A4 sheet to match native print behavior */
  .preview-canvas .a4-sheet > :first-child {
    margin-top: 0 !important;
  }

  .preview-canvas .a4-sheet h1:first-child {
    margin-top: 0 !important;
  }

  .studio.dark .preview-canvas .a4-sheet {
    background: #ffffff !important;
    color: #0f172a !important;
    border-color: #475569 !important;
    box-shadow: 0 12px 36px -4px rgba(0, 0, 0, 0.45), 0 4px 14px -2px rgba(0, 0, 0, 0.25) !important;
  }

  .preview-canvas .a4-sheet:last-child {
    margin-bottom: 0 !important;
    page-break-after: auto !important;
    break-after: auto !important;
  }

  /* Production-Grade Notes Components for Direct DOM Preview Canvas & A4 Sheets */
  .preview-canvas .panel,
  .preview-canvas .def-box,
  .preview-canvas .callout {
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    margin: 8px 0;
    padding: 10px 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 4px solid #2563eb;
    border-radius: 8px;
    display: flow-root;
    overflow-wrap: break-word;
    word-break: break-word;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .preview-canvas .panel-info {
    background: #eff6ff;
    border-color: #bfdbfe;
    border-left-color: #3b82f6;
  }

  .preview-canvas .panel-success {
    background: #f0fdf4;
    border-color: #bbf7d0;
    border-left-color: #10b981;
  }

  .preview-canvas .panel-warning {
    background: #fffbeb;
    border-color: #fde68a;
    border-left-color: #f59e0b;
  }

  .preview-canvas .panel-danger {
    background: #fef2f2;
    border-color: #fecaca;
    border-left-color: #ef4444;
  }

  .preview-canvas .card,
  .preview-canvas .metric-card {
    box-sizing: border-box;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 10px 12px;
    margin: 8px 0;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  }

  .preview-canvas .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    box-sizing: border-box;
    width: 100%;
  }

  .preview-canvas .grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    box-sizing: border-box;
    width: 100%;
  }

  .preview-canvas table {
    width: 100%;
    box-sizing: border-box;
    border-collapse: collapse;
  }

  .preview-canvas th,
  .preview-canvas td {
    border: 1px solid #e2e8f0;
  }

  .preview-canvas details,
  .preview-canvas .dropdown-box {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 14px;
    margin: 10px 0;
    background: #f8fafc;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
  }

  .preview-canvas details[open],
  .preview-canvas .dropdown-box[open] {
    background: #ffffff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }

  /* Page Indicator Badge */
  .preview-canvas .a4-page-badge {
    position: absolute !important;
    bottom: 6px !important;
    right: 14px !important;
    font-size: 10px !important;
    font-weight: 600 !important;
    color: #94a3b8 !important;
    user-select: none !important;
    pointer-events: none !important;
    letter-spacing: 0.02em !important;
    z-index: 10 !important;
    font-family: inherit !important;
  }

  .preview-scroll-wrapper.is-a4-mode {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    overflow-y: auto !important;
    overflow-x: auto !important;
  }

  .studio-img-widget {
    display: inline-block;
    max-width: 100%;
    position: relative;
    margin: 8px 0;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    transition: box-shadow 0.15s ease;
  }

  .preview-editing .studio-img-widget:hover {
    outline: 1.5px dashed rgba(2, 132, 199, 0.6) !important;
    outline-offset: 2px !important;
  }

  .studio-img-widget.wrap-left {
    display: block !important;
    margin: 12px auto 12px 0 !important;
    float: none !important;
    clear: both !important;
    max-width: 100% !important;
  }

  .studio-img-widget.wrap-center,
  .studio-img-widget.wrap-none {
    display: block !important;
    margin: 16px auto !important;
    float: none !important;
    clear: both !important;
    text-align: center;
    max-width: 100% !important;
  }

  .studio-img-widget.wrap-right {
    display: block !important;
    margin: 12px 0 12px auto !important;
    float: none !important;
    clear: both !important;
    max-width: 100% !important;
  }

  .studio-img-widget.wrap-full {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 20px 0 !important;
    float: none !important;
    clear: both !important;
  }

  .studio-img-widget img {
    width: 100%;
    height: auto;
    object-fit: contain;
    border-radius: 8px;
    display: block;
    pointer-events: none;
  }

  .studio-img-widget[style*="height"] {
    overflow: hidden !important;
  }

  .studio-img-widget[style*="height"] img {
    height: 100% !important;
    max-height: 100% !important;
    object-fit: fill !important;
  }

  .preview-editing .studio-img-widget.studio-selected-img {
    outline: 2.5px solid #0284c7 !important;
    outline-offset: 3px !important;
    box-shadow: 0 6px 22px rgba(2, 132, 199, 0.4) !important;
  }

  /* Handles are strictly hidden unless in Edit Mode */
  .studio-img-widget .studio-resize-handle {
    display: none !important;
  }

  .preview-editing .studio-img-widget.studio-selected-img .studio-resize-handle,
  .preview-editing .studio-img-widget:hover .studio-resize-handle {
    display: block !important;
  }

  .studio-resize-handle {
    position: absolute;
    width: 14px;
    height: 14px;
    background: #ffffff !important;
    border: 2.5px solid #0284c7 !important;
    border-radius: 4px;
    z-index: 99;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
    touch-action: none;
    pointer-events: auto !important;
    box-sizing: border-box;
    user-select: none !important;
    -webkit-user-select: none !important;
    transition: transform 0.1s ease, background 0.1s ease;
  }

  .studio-resize-handle:hover {
    transform: scale(1.4) !important;
    background: #0284c7 !important;
    border-color: #ffffff !important;
  }

  .studio-resize-handle.handle-nw { top: -7px; left: -7px; cursor: nwse-resize; }
  .studio-resize-handle.handle-nw:hover { transform: scale(1.4) !important; }

  .studio-resize-handle.handle-ne { top: -7px; right: -7px; cursor: nesw-resize; }
  .studio-resize-handle.handle-ne:hover { transform: scale(1.4) !important; }

  .studio-resize-handle.handle-se { bottom: -7px; right: -7px; cursor: nwse-resize; }
  .studio-resize-handle.handle-se:hover { transform: scale(1.4) !important; }

  .studio-resize-handle.handle-sw { bottom: -7px; left: -7px; cursor: nesw-resize; }
  .studio-resize-handle.handle-sw:hover { transform: scale(1.4) !important; }

  .studio-resize-handle.handle-n { top: -7px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
  .studio-resize-handle.handle-n:hover { transform: translateX(-50%) scale(1.4) !important; }

  .studio-resize-handle.handle-s { bottom: -7px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
  .studio-resize-handle.handle-s:hover { transform: translateX(-50%) scale(1.4) !important; }

  .studio-resize-handle.handle-e { right: -7px; top: 50%; transform: translateY(-50%); cursor: ew-resize; }
  .studio-resize-handle.handle-e:hover { transform: translateY(-50%) scale(1.4) !important; }

  .studio-resize-handle.handle-w { left: -7px; top: 50%; transform: translateY(-50%); cursor: ew-resize; }
  .studio-resize-handle.handle-w:hover { transform: translateY(-50%) scale(1.4) !important; }

  .studio-resize-badge {
    position: absolute;
    top: -28px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.92);
    color: #38bdf8;
    font-size: 11px;
    font-weight: 700;
    font-family: monospace;
    padding: 2px 8px;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    pointer-events: none;
    z-index: 40;
    white-space: nowrap;
    letter-spacing: 0.03em;
  }

  /* Glowing drop indicator insertion line (●──────────●) */
  .studio-drop-indicator-line {
    position: absolute;
    left: 12px;
    right: 12px;
    height: 3px;
    background: linear-gradient(90deg, #0284c7, #38bdf8, #0284c7);
    border-radius: 9999px;
    box-shadow: 0 0 10px rgba(2, 132, 199, 0.7);
    pointer-events: none;
    z-index: 70;
    transition: top 0.05s ease-out;
  }

  .studio-drop-indicator-line::before,
  .studio-drop-indicator-line::after {
    content: '';
    position: absolute;
    top: -3.5px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #0284c7;
    border: 1.5px solid #ffffff;
    box-shadow: 0 0 6px rgba(2, 132, 199, 0.9);
  }

  .studio-drop-indicator-line::before {
    left: 0;
  }

  .studio-drop-indicator-line::after {
    right: 0;
  }

  .studio-drop-target {
    outline: 2px dashed #0284c7 !important;
    outline-offset: 4px !important;
    background: rgba(2, 132, 199, 0.06) !important;
    border-radius: 6px !important;
  }

  .image-context-toolbar {
    position: absolute;
    z-index: 80;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    background: rgba(15, 23, 42, 0.96);
    backdrop-filter: blur(12px);
    color: #ffffff;
    border-radius: 9999px;
    box-shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.45), 0 4px 8px -2px rgba(0, 0, 0, 0.25);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    animation: fadeInScale 0.15s ease-out;
    pointer-events: auto;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  @keyframes fadeInScale {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }

  .image-context-toolbar button {
    background: rgba(255, 255, 255, 0.15);
    border: none;
    color: #ffffff;
    padding: 3px 8px;
    border-radius: 9999px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    transition: background 0.15s, transform 0.1s;
  }

  .image-context-toolbar button:hover {
    background: #2563eb;
  }

  .image-context-toolbar button:active {
    transform: scale(0.94);
  }

  .image-context-toolbar button.active {
    background: #2563eb;
    box-shadow: 0 0 0 1.5px #60a5fa;
  }

  .image-context-toolbar .toolbar-divider {
    width: 1px;
    height: 14px;
    background: rgba(255, 255, 255, 0.25);
    margin: 0 2px;
  }

  /* PEN & MARKING MODE: Enforces plain, static preview canvas with ZERO text selection or popovers */
  .pen-mode-active,
  .pen-mode-active * {
    user-select: none !important;
    -webkit-user-select: none !important;
    -moz-user-select: none !important;
    -ms-user-select: none !important;
    -webkit-touch-callout: none !important;
  }

  .pen-mode-active .studio-img-widget {
    pointer-events: none !important;
    user-select: none !important;
  }

  .pen-mode-active .studio-resize-handle,
  .pen-mode-active .studio-resize-badge,
  .pen-mode-active .studio-drop-indicator-line,
  .pen-mode-active #image-context-toolbar {
    display: none !important;
    pointer-events: none !important;
  }

  .studio-ink-layer {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    overflow: visible !important;
    z-index: 99 !important;
    touch-action: none !important;
    pointer-events: none !important;
    cursor: default !important;
  }

  .pen-mode-active .studio-ink-layer {
    pointer-events: auto !important;
  }

  .studio-ink-stroke {
    pointer-events: none !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }

  .pen-mode-active .studio-ink-stroke {
    pointer-events: auto !important;
  }

  .studio-ink-stroke.is-highlighter {
    mix-blend-mode: multiply !important;
  }

  /* MOBILE OPTIMIZATIONS (Strictly hides Split view & cleans top header) */
  @media (max-width: 768px) {
    .preview-canvas-wrapper,
    .preview-canvas-wrapper.is-a4-mode,
    .is-preview-active .preview-pane .preview-canvas-wrapper.is-a4-mode {
      padding: 0 !important;
    }

    .preview-sheet-card:not(.is-a4-paper) {
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    .desktop-only,
    .hidden-mobile {
      display: none !important;
    }

    .sidebar-rail {
      display: none !important;
    }

    .mode-switch button[title*="Split"],
    .mode-switch button:nth-child(2) {
      display: none !important;
    }

    .sidebar-drawer.mobile-sheet {
      position: absolute !important;
      top: 0;
      left: 0;
      bottom: 0;
      width: 85% !important;
      max-width: 320px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3);
      border-right: 1px solid var(--line);
      z-index: 50 !important;
    }

    .mobile-drawer-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 45;
    }
  }
`;
