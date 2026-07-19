document.title = "SCRIPT RAN";

function showError(msg) {
  document.body.innerHTML =
    '<pre style="white-space:pre-wrap;color:#f66;background:#111;padding:16px;font-family:monospace;font-size:13px;">' +
    String(msg).replace(/</g, '&lt;') +
    '</pre>';
}

window.addEventListener('error', function (e) {
  showError((e.error && e.error.stack) || e.message || 'Resource failed to load: ' + (e.target && e.target.src));
}, true);

window.addEventListener('unhandledrejection', function (e) {
  showError((e.reason && e.reason.stack) || String(e.reason));
});

setTimeout(function () {
  var root = document.getElementById('root');
  if (root && root.children.length === 0) {
    showError('Timeout: #root is still empty after 3s. main.jsx likely never executed or React rendered nothing.');
  }
}, 3000);
