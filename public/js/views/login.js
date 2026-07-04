import { $app, api } from '../app.js';

export async function loginView() {
  // If auth is disabled or already logged in, skip straight to the library.
  try {
    const s = await fetch('/api/session').then((r) => r.json());
    if (s.loggedIn) { location.hash = '#/'; return; }
  } catch { /* fall through to the form */ }

  $app.innerHTML = `
    <div class="login">
      <h1>🎸 OpenTabs</h1>
      <input type="password" id="pw" placeholder="Password" autocomplete="current-password">
      <button class="btn primary" id="go">Sign in</button>
      <div class="error" id="err"></div>
    </div>`;

  const $pw = document.getElementById('pw');
  const $err = document.getElementById('err');

  async function login() {
    try {
      await api('/login', { method: 'POST', body: { password: $pw.value } });
      location.hash = '#/';
    } catch (err) {
      $err.textContent = err.message === 'unauthorized' ? 'Wrong password' : err.message;
    }
  }
  document.getElementById('go').onclick = login;
  $pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  $pw.focus();
}
