document.title = "SCRIPT RAN";

function showError(msg) {
  document.body.innerHTML =
    '<pre style="white-space:pre-wrap;color:#f66;background:#111;padding:16px;font-family:monospace;font-size:13px;">' +
    String(msg).replace(/</g, '&lt;') +
    '</pre>';
}

window.addEventListener('error', function (e) {
  // Safari's error.stack is just frames — it never includes the message,
  // unlike Chrome. Build the message explicitly so it's never dropped.
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
