document.title = "SCRIPT RAN";

function showError(msg) {
  document.body.innerHTML =
    '<pre style="white-space:pre-wrap;color:#f66;background:#111;padding:16px;font-family:monospace;font-size:13px;">' +
    String(msg).replace(/</g, '&lt;') +
    '</pre>';
}

window.addEventListener('error', function (e) {
  // Ignore incidental resource 404s (favicon, manifest, etc.) — only treat
  // this as fatal if it's a real JS exception, or the main app script itself
  // failed to load. Wiping the DOM for unrelated resource errors was
  // deleting #root before main.jsx could mount, causing React error #299.
  var isRealException = !!e.error;
  var isMainScriptFailure =
    e.target && e.target.tagName === 'SCRIPT' && /main\.jsx|\/assets\/index-/.test(e.target.src || '');

  if (!isRealException && !isMainScriptFailure) {
    return; // let it go — e.g. a missing favicon, don't nuke the page for it
  }

  var name = (e.error && e.error.name) || 'Error';
  var message = (e.error && e.error.message) || e.message || 'Resource failed to load: ' + (e.target && e.target.src);
  var stack = (e.error && e.error.stack) || '';
  showError(name + ': ' + message + '\n\n' + stack);
}, true);

window.addEventListener('unhandledrejection', function (e) {
  var reason = e.reason;
  var name = (reason && reason.name) || 'UnhandledRejection';
  var message = (reason && reason.message) || String(reason);
  var stack = (reason && reason.stack) || '';
  showError(name + ': ' + message + '\n\n' + stack);
});

setTimeout(function () {
  var root = document.getElementById('root');
  if (root && root.children.length === 0) {
    showError('Timeout: #root is still empty after 3s. main.jsx likely never executed or React rendered nothing.');
  }
}, 3000);
