// mutus — content script.
// Detecta anuncios en YouTube, mutea el video, intenta saltarlo, y registra
// metadatos del anuncio para revisarlos después en el popup.

(() => {
  const STATE = {
    enabled: true,
    skip: true,
    muteFor: null,            // { prevMuted, since, meta }
    pendingRestoreTimer: null,
    count: 0,
    skipped: 0,
    ads: [],
  };

  const HOLD_MS = 600;          // histéresis para back-to-back ads
  const MAX_AD_HISTORY = 200;
  const POLL_MS = 250;          // 4Hz de red de seguridad — vs el 1Hz de v0.1.0

  // -- storage ---------------------------------------------------------------

  chrome.storage.local.get(["enabled", "skip", "count", "skipped", "ads"], (s) => {
    STATE.enabled = s.enabled !== false;
    STATE.skip = s.skip !== false;
    STATE.count = s.count ?? 0;
    STATE.skipped = s.skipped ?? 0;
    STATE.ads = Array.isArray(s.ads) ? s.ads : [];
  });

  chrome.storage.onChanged.addListener((c) => {
    if (c.enabled) STATE.enabled = c.enabled.newValue !== false;
    if (c.skip) STATE.skip = c.skip.newValue !== false;
    if (c.ads) STATE.ads = Array.isArray(c.ads.newValue) ? c.ads.newValue : [];
  });

  // -- DOM lookups -----------------------------------------------------------

  function getPlayer() {
    return document.querySelector("#movie_player, .html5-video-player");
  }

  function getVideo() {
    const player = getPlayer();
    if (player) {
      const v = player.querySelector("video");
      if (v) return v;
    }
    return document.querySelector("video.html5-main-video, video");
  }

  function isAd(player) {
    if (!player) return false;
    if (player.classList.contains("ad-showing")) return true;
    if (player.classList.contains("ad-interrupting")) return true;
    const overlay = document.querySelector(
      ".ytp-ad-player-overlay, .ytp-ad-player-overlay-instream-info, .ytp-ad-text"
    );
    if (overlay && overlay.offsetParent !== null) return true;
    if (document.querySelector(".video-ads .ad-showing")) return true;
    const adImg = document.querySelector(".ytp-ad-image, .ytp-ad-overlay-image");
    if (adImg && adImg.offsetParent !== null) return true;
    return false;
  }

  function readAdMeta() {
    const advertiserNode =
      document.querySelector(".ytp-ad-button-text, .ytp-ad-visit-advertiser-button-link") ||
      document.querySelector(".ytp-ad-button-icon-text, .ytp-ad-overlay-title");
    const advertiser = advertiserNode ? (advertiserNode.textContent || "").trim().slice(0, 120) : null;

    const previewNode = document.querySelector(".ytp-ad-preview-text, .ytp-ad-text");
    const preview = previewNode ? (previewNode.textContent || "").trim().slice(0, 120) : null;

    const advertiserLink =
      document.querySelector("a.ytp-ad-visit-advertiser-button-link, a.ytp-ad-clickable")?.href || null;

    return { advertiser, preview, advertiserLink, currentVideo: location.href, ts: Date.now() };
  }

  // -- mute / restore --------------------------------------------------------

  function muteForAd() {
    const video = getVideo();
    if (!video || STATE.muteFor) return;
    STATE.muteFor = {
      prevMuted: video.muted,
      since: Date.now(),
      meta: readAdMeta(),
      skipAttempted: false,
    };
    video.muted = true;
    STATE.count += 1;
    chrome.storage.local.set({ count: STATE.count });
  }

  function refreshAdMeta() {
    if (!STATE.muteFor) return;
    const m = readAdMeta();
    if (
      (m.advertiser && !STATE.muteFor.meta.advertiser) ||
      (m.advertiserLink && !STATE.muteFor.meta.advertiserLink) ||
      (m.preview && !STATE.muteFor.meta.preview)
    ) {
      STATE.muteFor.meta = { ...STATE.muteFor.meta, ...m };
    }
  }

  function persistAd(record) {
    STATE.ads = [record, ...STATE.ads].slice(0, MAX_AD_HISTORY);
    chrome.storage.local.set({ ads: STATE.ads });
  }

  function restore() {
    if (!STATE.muteFor) return;
    const video = getVideo();
    if (video) video.muted = STATE.muteFor.prevMuted ?? false;
    const dur = Date.now() - STATE.muteFor.since;
    // Sólo contamos "saltado" si realmente había un botón skip clickeable
    // (trySkip lo marca) y el ad terminó rápido tras el click (<1.5s). Sin
    // esto el contador subía 4Hz durante todo el ad por culpa del polling.
    const wasSkipped = STATE.muteFor.skipAttempted && dur < 1500;
    if (wasSkipped) {
      STATE.skipped += 1;
      chrome.storage.local.set({ skipped: STATE.skipped });
    }
    persistAd({
      ...STATE.muteFor.meta,
      mutedFor: dur,
      skipped: wasSkipped,
      ended: Date.now(),
    });
    STATE.muteFor = null;
  }

  // -- skip ------------------------------------------------------------------

  const SKIP_SEL =
    ".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, button[class*='ytp-ad-skip']";

  // Ejecuta `code` en main world inyectando un <script>. El click desde el
  // isolated world del content script no dispara handlers de Polymer.
  function injectMainWorld(code) {
    try {
      const s = document.createElement("script");
      s.textContent = code;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
      return true;
    } catch { return false; }
  }

  function trySkip() {
    if (!STATE.skip) return false;
    let acted = false;

    // 1) Si hay botón skip visible, intentar el click via main world.
    const btn = document.querySelector(SKIP_SEL);
    if (btn && btn.offsetParent !== null && !btn.disabled) {
      const sel = JSON.stringify(SKIP_SEL);
      injectMainWorld(
        `(()=>{const b=document.querySelector(${sel});` +
        `if(b&&b.offsetParent!==null&&!b.disabled){` +
        `try{b.click();}catch(e){}` +
        `}})();`
      );
      acted = true;
    }

    // 2) Fallback: avanzar el video del ad al final. Funciona desde el
    //    isolated world (es property del DOM, no un evento), cubre ads
    //    non-skippable y ads donde el botón aún no es clickeable.
    const video = getVideo();
    if (video && isFinite(video.duration) && video.duration > 0) {
      const target = video.duration - 0.1;
      if (target > video.currentTime) {
        try { video.currentTime = target; acted = true; } catch { /* ignore */ }
      }
    }

    if (acted && STATE.muteFor) STATE.muteFor.skipAttempted = true;
    return acted;
  }

  // -- main loop -------------------------------------------------------------

  function exposeStats() {
    document.documentElement.dataset.mutusStats = JSON.stringify({
      count: STATE.count,
      skipped: STATE.skipped,
      muting: !!STATE.muteFor,
    });
  }

  function tick() {
    exposeStats();
    if (!STATE.enabled) {
      if (STATE.muteFor) restore();
      return;
    }
    const player = getPlayer();
    const video = getVideo();
    if (!player || !video) return;
    const adNow = isAd(player);

    if (adNow) {
      if (STATE.pendingRestoreTimer) {
        clearTimeout(STATE.pendingRestoreTimer);
        STATE.pendingRestoreTimer = null;
      }
      if (!STATE.muteFor) muteForAd();
      else refreshAdMeta();
      trySkip();
    } else if (STATE.muteFor) {
      // Histéresis: back-to-back ads frecuentemente quitan/ponen la clase entre ellos.
      if (!STATE.pendingRestoreTimer) {
        STATE.pendingRestoreTimer = setTimeout(() => {
          STATE.pendingRestoreTimer = null;
          if (!isAd(getPlayer())) restore();
        }, HOLD_MS);
      }
    }
  }

  // -- observe + poll --------------------------------------------------------

  const obs = new MutationObserver(() => tick());

  function attach() {
    const player = getPlayer();
    if (player && !player.dataset.mutusAttached) {
      obs.observe(player, {
        attributes: true,
        attributeFilter: ["class"],
        subtree: true,
        childList: true,
      });
      player.dataset.mutusAttached = "1";
    }
    if (!document.body.dataset.mutusBodyAttached) {
      obs.observe(document.body, { childList: true, subtree: false });
      document.body.dataset.mutusBodyAttached = "1";
    }
  }

  attach();
  tick();
  setInterval(() => {
    attach();
    tick();
  }, POLL_MS);

  document.addEventListener("yt-navigate-finish", () => {
    if (STATE.muteFor) restore();
    setTimeout(() => {
      attach();
      tick();
    }, 300);
  });
})();
