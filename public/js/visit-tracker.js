// Client-side visit tracker
(function(){
  try {
    if (sessionStorage.getItem('visit_tracked')) return;
    const payload = {
      user_agent: navigator.userAgent,
      page: location.pathname + location.search,
      referrer: document.referrer || ''
    };

    const url = '/api/track-visit';
    const body = JSON.stringify(payload);

    // Preferisci sendBeacon quando possibile (non blocca unload)
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      sessionStorage.setItem('visit_tracked', '1');
    } else {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
        .then(()=> sessionStorage.setItem('visit_tracked', '1'))
        .catch(()=>{});
    }
  } catch (e) {
    console.warn('Visit tracker error', e);
  }
})();