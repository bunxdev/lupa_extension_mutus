// mutus — service worker. Inicializa storage en la primera instalación.
chrome.runtime.onInstalled.addListener((details) => {
  chrome.storage.local.get(["enabled", "skip", "count", "skipped", "ads"], (s) => {
    const seed = {
      enabled: s.enabled !== false,
      skip: s.skip !== false,
      count: s.count ?? 0,
      skipped: s.skipped ?? 0,
      ads: Array.isArray(s.ads) ? s.ads : [],
    };
    chrome.storage.local.set(seed);
  });
});
