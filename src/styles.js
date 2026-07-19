// Extracted verbatim from the original inline <style> block in App.jsx.
// Kept as a template-string export (rather than a .css file) so no
// bundler/import config changes are needed — App.jsx just does
// `<style>{CS_STYLES}</style>` instead of embedding ~400 lines of CSS text.
export const CS_STYLES = `
        *, *::before, *::after { box-sizing: border-box; }
        html, body { overflow-x: hidden; margin: 0; padding: 0; background: #0A0D12; }
        #root { min-height: 100vh; background: #0A0D12; }
        .cs-root {
          --bg: #0A0D12;
          --panel: #12161D;
          --panel-border: #232B35;
          --text-primary: #EDEFF2;
          --text-muted: #7E8896;
          --sig-green: #3FB871;
          --sig-yellow: #E8B93F;
          --sig-amber: #E8833F;
          --sig-red: #D6484A;
          min-height: 100vh;
          width: 100%;
          background: var(--bg);
          background-image: radial-gradient(circle at 50% 0%, rgba(232,179,63,0.05), transparent 55%);
          color: var(--text-primary);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          display: flex;
          justify-content: center;
          padding: max(32px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(32px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
        }
        .cs-shell { width: 100%; max-width: 420px; display: flex; flex-direction: column; min-height: 640px; transition: max-width 200ms ease; }
        @media (min-width: 640px) {
          .cs-shell { max-width: 480px; }
          .cs-h1 { font-size: 31.5px; }
          .cs-card { padding: 34px 30px; }
        }
        @media (min-width: 768px) {
          .cs-shell { max-width: 500px; }
          .cs-shell-home { max-width: 640px; }
        }
        @media (min-width: 1024px) {
          .cs-root { align-items: center; }
          .cs-shell { max-width: 520px; }
          .cs-shell-home { max-width: 760px; }
          .cs-card { padding: 40px 36px; }
          .cs-pct { font-size: 45px; }
        }
        @media (min-width: 1280px) {
          .cs-shell-home { max-width: 860px; }
        }
        .cs-topbar { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 18px; border-bottom: 1px solid var(--panel-border); margin-bottom: 20px; }
        .cs-wordmark { font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif; font-weight: 600; font-size: 17px; letter-spacing: 0.14em; color: var(--text-primary); }
        .cs-wordmark span { color: var(--sig-amber); }
        .cs-clock { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; color: var(--text-muted); letter-spacing: 0.03em; text-align: right; }
        .cs-signout {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 13.5px;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          background: #171C24;
          border: 1px solid var(--panel-border);
          border-radius: 3px;
          cursor: pointer;
          padding: 7px 12px;
          margin-top: 8px;
        }
        .cs-signout:hover { color: var(--text-primary); border-color: var(--text-muted); }
        .cs-tabs { display: flex; gap: 8px; margin-bottom: 20px; }
        .cs-tab { flex: 1; text-align: center; padding: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; letter-spacing: 0.1em; border: 1px solid var(--panel-border); border-radius: 3px; background: transparent; color: var(--text-muted); cursor: pointer; }
        .cs-tab.active { border-color: var(--sig-amber); color: var(--text-primary); background: #171C24; }
        .cs-progress { display: flex; gap: 6px; margin-bottom: 28px; }
        .cs-seg { flex: 1; height: 4px; border-radius: 2px; background: var(--panel-border); overflow: hidden; }
        .cs-seg-fill { height: 100%; width: 0%; background: var(--sig-amber); transition: width 300ms ease; }
        .cs-seg-fill.filled { width: 100%; }
        .cs-body { flex: 1; display: flex; flex-direction: column; }
        .cs-card { background: var(--panel); border: 1px solid var(--panel-border); border-radius: 4px; padding: 28px 24px; flex: 1; display: flex; flex-direction: column; }
        .cs-card-compact { flex: 0 0 auto; }
        .cs-card-compact .cs-begin-btn { margin-top: 10px; }
        .cs-eyebrow { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; letter-spacing: 0.18em; color: var(--sig-amber); margin-bottom: 14px; }
        .cs-h1 { font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif; font-weight: 500; font-size: 29px; line-height: 1.25; margin: 0 0 8px 0; color: var(--text-primary); }
        .cs-sub { color: var(--text-muted); font-size: 15.5px; line-height: 1.5; margin: 0 0 28px 0; }
        .cs-options { display: flex; flex-direction: column; gap: 10px; }
        .cs-opt { text-align: left; background: #171C24; border: 1px solid var(--panel-border); border-radius: 3px; padding: 16px 18px; color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; cursor: pointer; display: flex; flex-direction: column; gap: 2px; transition: border-color 150ms, background 150ms, transform 100ms; }
        .cs-opt:hover { border-color: var(--sig-amber); background: #1C222C; }
        .cs-opt:active { transform: scale(0.99); }
        .cs-opt-label { font-size: 17px; font-weight: 600; }
        .cs-opt-sub { font-size: 14px; color: var(--text-muted); }
        .cs-begin-btn { margin-top: auto; background: var(--sig-amber); color: #14100A; border: none; border-radius: 3px; padding: 16px; font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif; font-weight: 600; font-size: 15.5px; letter-spacing: 0.08em; cursor: pointer; }
        .cs-begin-btn:hover { filter: brightness(1.05); }
        .cs-begin-btn:disabled { opacity: 0.6; cursor: default; }
        .cs-secondary-btn { margin-top: 12px; background: transparent; color: var(--text-muted); border: 1px solid var(--panel-border); border-radius: 3px; padding: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14.5px; cursor: pointer; }
        .cs-secondary-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }
        .gauge-wrap { display: flex; justify-content: center; margin: 6px 0 4px 0; }
        .gauge-svg { width: 100%; max-width: 280px; }
        .cs-readout { text-align: center; margin-top: -46px; margin-bottom: 18px; }
        .cs-pct { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 38px; font-weight: 600; line-height: 1; }
        .cs-pct-label { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--text-muted); letter-spacing: 0.14em; margin-top: 4px; }
        .cs-condition-badge { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13.5px; letter-spacing: 0.12em; padding: 6px 12px; border-radius: 2px; display: inline-block; margin-bottom: 16px; border: 1px solid currentColor; }
        .cs-incident-banner { display: flex; align-items: center; gap: 10px; background: rgba(214, 72, 74, 0.1); border: 1px solid var(--sig-red); border-radius: 3px; padding: 12px 14px; margin-bottom: 20px; }
        .cs-incident-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--sig-red); flex-shrink: 0; }
        .cs-incident-text { font-size: 14px; line-height: 1.4; }
        .cs-incident-text b { display: block; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; letter-spacing: 0.08em; color: var(--sig-red); margin-bottom: 2px; }
        .cs-breakdown { display: flex; flex-direction: column; gap: 8px; margin: 18px 0; padding-top: 18px; border-top: 1px solid var(--panel-border); }
        .cs-breakdown-row { display: flex; justify-content: space-between; font-size: 14px; color: var(--text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
        .cs-breakdown-row b { color: var(--text-primary); font-weight: 500; }
        .cs-footer-note { font-size: 12.5px; color: var(--text-muted); text-align: center; margin-top: 18px; line-height: 1.5; }
        .cs-streak-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
        .cs-streak-num { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 31.5px; font-weight: 600; color: var(--sig-amber); line-height: 1; }
        .cs-streak-label { font-size: 11px; color: var(--text-muted); letter-spacing: 0.1em; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin-top: 4px; }
        .cs-day-chips { display: flex; gap: 6px; }
        .cs-day-chip { width: 24px; height: 24px; border-radius: 3px; border: 1px solid var(--panel-border); }
        .cs-chart-wrap { height: 170px; margin: 4px -6px 22px -6px; }
        .cs-trend-pulse-ring {
          transform-box: fill-box;
          transform-origin: center;
          opacity: 0.55;
          animation: cs-trend-pulse 2.2s ease-out infinite;
        }
        @keyframes cs-trend-pulse {
          0% { transform: scale(1); opacity: 0.55; }
          70% { transform: scale(3.2); opacity: 0; }
          100% { transform: scale(3.2); opacity: 0; }
        }
        .cs-condition-dist { display: flex; gap: 8px; margin-bottom: 16px; }
        .cs-dist-chip { flex: 1; text-align: center; padding: 10px 4px; border-radius: 3px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; letter-spacing: 0.04em; border: 1px solid currentColor; }
        .cs-stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .cs-stat-card { background: #171C24; border: 1px solid var(--panel-border); border-radius: 3px; padding: 12px 6px; text-align: center; }
        .cs-stat-value { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 20px; font-weight: 600; }
        .cs-stat-tier { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; font-weight: 600; letter-spacing: 0.08em; margin-top: 2px; }
        .cs-stat-label { font-size: 10.5px; color: var(--text-muted); letter-spacing: 0.06em; margin-top: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
        .cs-lock-badge {
          position: absolute;
          top: 18px;
          right: 18px;
          display: flex;
          align-items: center;
          gap: 7px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 13.5px;
          padding: 6px 11px;
          border-radius: 20px;
          border: 1px solid currentColor;
          background: #171C24;
          transition: color 1s linear, border-color 1s linear;
        }
        .cs-lock-dot { width: 8px; height: 8px; border-radius: 50%; transition: background 1s linear; }

        .cs-breathe-wrap { display: flex; flex-direction: column; align-items: center; margin: 28px 0; }
        .cs-breathe-circle {
          width: 140px;
          height: 140px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(232,131,63,0.35), rgba(232,131,63,0.08));
          border: 2px solid var(--sig-amber);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 14px;
          letter-spacing: 0.1em;
          color: var(--text-primary);
          transition-property: transform;
          transition-timing-function: ease-in-out;
        }
        .cs-breathe-cycles { margin-top: 18px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; color: var(--text-muted); letter-spacing: 0.06em; }

        .cs-domain-group {
          margin-top: 14px;
          border: 1px solid var(--panel-border);
          border-radius: 3px;
          overflow: hidden;
        }
        .cs-domain-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #171C24;
          border: none;
          padding: 14px 16px;
          cursor: pointer;
          text-align: left;
        }
        .cs-domain-header:hover { background: #1C222C; }
        .cs-domain-label {
          font-family: 'Oswald', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-weight: 600;
          font-size: 15.5px;
          letter-spacing: 0.06em;
          color: var(--text-primary);
        }
        .cs-domain-full {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .cs-domain-caret {
          color: var(--sig-amber);
          font-size: 14px;
          transition: transform 200ms ease;
          transform: rotate(-90deg);
          flex-shrink: 0;
        }
        .cs-domain-caret.open { transform: rotate(0deg); }
        .cs-domain-body { padding: 14px; background: var(--panel); }
        .cs-domain-body .cs-intervention-card:last-child { margin-bottom: 0; }
        .cs-intervention-card {
          width: 100%;
          text-align: left;
          background: #171C24;
          border: 1px solid var(--panel-border);
          border-radius: 3px;
          padding: 14px 16px;
          margin-bottom: 10px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .cs-intervention-card:hover { border-color: var(--sig-amber); }
        .cs-intervention-card-top { display: flex; justify-content: space-between; align-items: baseline; }
        .cs-intervention-title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-weight: 600; font-size: 15.5px; color: var(--text-primary); }
        .cs-intervention-duration { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--text-muted); }
        .cs-intervention-blurb { font-size: 13.5px; color: var(--text-muted); line-height: 1.4; }
        .cs-intervention-modality { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--sig-amber); letter-spacing: 0.04em; margin-top: 2px; }

        .cs-intervention-step-text {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: 17px;
          line-height: 1.6;
          color: var(--text-primary);
          margin: 0 0 28px 0;
        }

        .cs-suggestion-box {
          background: #171C24;
          border: 1px solid var(--panel-border);
          border-radius: 3px;
          padding: 14px 16px;
          margin-bottom: 20px;
        }
        .cs-suggestion-label {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 11px;
          letter-spacing: 0.1em;
          color: var(--sig-amber);
          margin-bottom: 10px;
        }
        .cs-suggestion-item {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: transparent;
          border: none;
          border-top: 1px solid var(--panel-border);
          padding: 10px 0;
          cursor: pointer;
          color: var(--text-primary);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: 14.5px;
          font-weight: 600;
        }
        .cs-suggestion-item:first-of-type { border-top: none; }
        .cs-suggestion-duration { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--text-muted); font-weight: 400; }
        .cs-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .cs-field label { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; letter-spacing: 0.08em; color: var(--text-muted); }
        .cs-field-hint { font-size: 11.5px; color: var(--text-muted); margin-top: 4px; }
        .cs-mfa-qr {
          background: #FFFFFF;
          border-radius: 4px;
          padding: 16px;
          display: flex;
          justify-content: center;
          margin: 8px 0 16px 0;
        }
        .cs-mfa-qr img { width: 100%; max-width: 200px; height: auto; display: block; }
        .cs-mfa-secret {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 12.5px;
          color: var(--text-muted);
          text-align: center;
          line-height: 1.6;
          margin-bottom: 20px;
          word-break: break-all;
        }
        .cs-mfa-secret b { color: var(--text-primary); letter-spacing: 0.04em; }
        .cs-field input, .cs-field select { background: #171C24; border: 1px solid var(--panel-border); border-radius: 3px; padding: 12px 14px; color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15.5px; }
        .cs-field input:focus, .cs-field select:focus { outline: none; border-color: var(--sig-amber); }
        .cs-full-width { width: 100%; }

        .cs-hamburger {
          width: 34px;
          height: 34px;
          background: #171C24;
          border: 1px solid var(--panel-border);
          border-radius: 3px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          cursor: pointer;
        }
        .cs-hamburger span { width: 16px; height: 2px; background: var(--text-primary); border-radius: 1px; }

        .cs-nav-menu {
          display: flex;
          flex-direction: column;
          gap: 4px;
          background: var(--panel);
          border: 1px solid var(--panel-border);
          border-radius: 4px;
          padding: 10px;
          margin-bottom: 20px;
        }
        .cs-nav-item {
          text-align: left;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 13px;
          letter-spacing: 0.04em;
          padding: 12px 10px;
          border-radius: 3px;
          cursor: pointer;
        }
        .cs-nav-item:hover { background: #1C222C; color: var(--sig-amber); }

        .cs-home { display: flex; flex-direction: column; gap: 0; }
        .cs-home-section {
          padding: 30px 0;
          border-bottom: 1px solid var(--panel-border);
        }
        .cs-home-section:last-child { border-bottom: none; }
        .cs-home-hero { padding-top: 8px; }
        .cs-home-h1 {
          font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif;
          font-weight: 500;
          font-size: 32px;
          line-height: 1.2;
          margin: 0 0 16px 0;
          color: var(--text-primary);
        }
        .cs-home-h2 {
          font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif;
          font-weight: 500;
          font-size: 22px;
          line-height: 1.3;
          margin: 0 0 14px 0;
          color: var(--text-primary);
        }
        .cs-home-p {
          color: var(--text-muted);
          font-size: 15.5px;
          line-height: 1.65;
          margin: 0;
          max-width: 640px;
        }
        .cs-home-closing { text-align: center; }
        .cs-home-closing .cs-home-h2 { font-size: 20px; margin-bottom: 20px; }
        .cs-home-cta { display: flex; flex-direction: column; gap: 12px; margin-top: 32px; }
        .cs-cta-primary {
          background: var(--sig-amber);
          color: #14100A;
          border: none;
          border-radius: 3px;
          padding: 16px;
          font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif;
          font-weight: 600;
          font-size: 15.5px;
          letter-spacing: 0.08em;
          cursor: pointer;
        }
        .cs-cta-primary:hover { filter: brightness(1.05); }
        .cs-cta-secondary {
          background: transparent;
          color: var(--text-primary);
          border: 1px solid var(--panel-border);
          border-radius: 3px;
          padding: 16px;
          font-family: 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif;
          font-weight: 600;
          font-size: 15.5px;
          letter-spacing: 0.08em;
          cursor: pointer;
        }
        .cs-cta-secondary:hover { border-color: var(--sig-amber); color: var(--sig-amber); }
        @media (min-width: 640px) {
          .cs-home-h1 { font-size: 38px; }
          .cs-home-h2 { font-size: 25px; }
        }
        @media (min-width: 768px) {
          .cs-home-section { padding: 40px 0; }
          .cs-home-p { font-size: 16.5px; }
          .cs-home-hero { text-align: left; max-width: 640px; margin-left: auto; margin-right: auto; }
        }
        @media (min-width: 1024px) {
          .cs-home-h1 { font-size: 44px; }
          .cs-home-h2 { font-size: 27px; }
          .cs-home-section { padding: 48px 0; }
        }
        .cs-auth-error { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; color: var(--sig-red); margin-bottom: 14px; line-height: 1.5; }
        .cs-auth-notice { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; color: var(--sig-green); margin-bottom: 14px; line-height: 1.5; }
        .cs-auth-toggle { text-align: center; margin-top: 14px; font-size: 14px; color: var(--text-muted); }
        .cs-auth-toggle button { background: none; border: none; color: var(--sig-amber); cursor: pointer; font-size: 14px; text-decoration: underline; padding: 0; }
`;
