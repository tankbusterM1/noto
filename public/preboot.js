// Paint the correct paper/ink background before React mounts — no white flash
// when the installed app launches (reads the persisted theme). Kept as an
// external file (not an inline <script>) so the Content-Security-Policy can be
// a strict `script-src 'self'` with no inline allowance.
try {
  var st = (JSON.parse(localStorage.getItem('noto-ui') || '{}').state) || {}
  document.documentElement.style.backgroundColor = st.dark ? '#14110c' : '#f4f1e9'
} catch (e) {}
