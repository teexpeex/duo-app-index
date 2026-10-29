/* Basic site traffic. No IP addresses, search text, or full referrer URLs are sent. */
(() => {
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  const script = document.currentScript;
  const endpoint = new URL('/api/analytics/collect', script.src).href;
  const visit = crypto.randomUUID();
  let visitor = crypto.randomUUID();
  let expires = Date.now()+30*86400000;
  try {
    const previous = JSON.parse(localStorage.getItem('duo-analytics-browser') || 'null');
    if (previous && previous.expires > Date.now() && /^[a-f0-9-]{36}$/.test(previous.id)) {visitor = previous.id;expires=previous.expires;}
    localStorage.setItem('duo-analytics-browser', JSON.stringify({id:visitor, expires}));
  } catch { /* Storage restrictions leave this visit with its own random ID. */ }
  let source = 'Direct / unknown';
  try {
    const ref = new URL(document.referrer);
    if (ref.hostname !== location.hostname) source = ref.hostname;
  } catch { /* A missing referrer is expected for direct visits. */ }
  const body = {visit, visitor, path:location.pathname, source};
  let registered = false, pending = false;
  async function send() {
    if (document.visibilityState !== 'visible' || pending) return;
    pending = true;
    try {
      const response = await fetch(endpoint, {method:'POST', mode:'cors', credentials:'omit', keepalive:true,
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({...body,type:registered?'ping':'view'})});
      if (response.ok) registered = true;
    } catch { /* Analytics must never interfere with the directory. */ }
    finally { pending = false; }
  }
  send();
  setInterval(send, 60000);
  document.addEventListener('visibilitychange', send);
})();
