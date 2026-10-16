const $ = (id) => document.getElementById(id);

function fmtTime(ts) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  return d.toLocaleString("es-MX", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtMs(ms) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderStats({ enabled, skip, count, skipped }) {
  $("toggle").checked = enabled !== false;
  $("skip-toggle").checked = skip !== false;
  $("count").textContent = String(count ?? 0);
  $("skipped").textContent = String(skipped ?? 0);
}

function renderAds(ads = []) {
  const list = Array.isArray(ads) ? ads : [];
  $("ads-count").textContent = String(list.length);
  const ul = $("ads");
  ul.innerHTML = "";
  if (list.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "(aún no hay anuncios capturados)";
    ul.appendChild(li);
    return;
  }
  for (const ad of list.slice(0, 50)) {
    const li = document.createElement("li");
    const advertiser = ad.advertiser || "(anunciante desconocido)";
    const link = ad.advertiserLink || ad.currentVideo;
    li.innerHTML = `
      <div class="ad-row">
        <span class="ad-when">${fmtTime(ad.ts)}</span>
        <span class="ad-mute">muted ${fmtMs(ad.mutedFor)}</span>
      </div>
      <a class="ad-title" href="${escape(link)}" target="_blank" rel="noopener">${escape(advertiser)}</a>
      ${ad.preview ? `<div class="ad-preview">${escape(ad.preview)}</div>` : ""}
    `;
    ul.appendChild(li);
  }
}

chrome.storage.local.get(["enabled", "skip", "count", "skipped", "ads"], (s) => {
  renderStats(s);
  renderAds(s.ads);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.count || changes.skipped || changes.enabled || changes.skip) {
    chrome.storage.local.get(["enabled", "skip", "count", "skipped"], renderStats);
  }
  if (changes.ads) renderAds(changes.ads.newValue);
});

$("toggle").addEventListener("change", (e) => {
  chrome.storage.local.set({ enabled: e.target.checked });
});
$("skip-toggle").addEventListener("change", (e) => {
  chrome.storage.local.set({ skip: e.target.checked });
});
$("reset").addEventListener("click", () => {
  chrome.storage.local.set({ count: 0, skipped: 0 });
});
$("clear-ads").addEventListener("click", () => {
  chrome.storage.local.set({ ads: [] });
});
