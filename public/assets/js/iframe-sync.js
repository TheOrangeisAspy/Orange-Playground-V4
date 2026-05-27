(function(){
  function isFrameVisible(frame) {
    if (!frame) return false;
    if (frame.classList.contains('dnone')) return false;
    if (frame.style && (frame.style.display === 'none' || frame.style.visibility === 'hidden')) return false;
    const rect = frame.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getIframe() {
    const frame = document.getElementById('frame');
    const sjFrame = document.getElementById('sj-frame');
    if (sjFrame && isFrameVisible(sjFrame)) return sjFrame;
    if (frame && isFrameVisible(frame)) return frame;
    return sjFrame || frame;
  }

  function updateInputs(url){
    const value = url || '';
    try {
      if (typeof window.setCurrentSearchUrl === 'function') {
        window.setCurrentSearchUrl(value);
      } else {
        window.currentSearchUrl = value;
      }
    } catch (e) {}
    const main = document.getElementById('address');
    const nav = document.getElementById('nav-address');
    if (main) main.value = value;
    if (nav) nav.value = value;
    if (typeof window.updateSearchPlaceholders === 'function') {
      window.updateSearchPlaceholders();
    }
  }

  function decodeProxyUrl(src, iframe) {
    if (!src) return '';
    if (iframe?.dataset && (iframe.dataset.originalUrl || iframe.dataset.targetUrl)) {
      return iframe.dataset.originalUrl || iframe.dataset.targetUrl;
    }

    let normalized = src;
    let encodedPath = src;
    try {
      const parsed = new URL(src, window.location.href);
      normalized = parsed.pathname;
      encodedPath = parsed.pathname;
    } catch (e) {
      normalized = src;
      encodedPath = src;
    }

    // Try Ultraviolet decoding
    if (typeof __uv$config !== 'undefined' && __uv$config?.prefix && typeof __uv$config.decodeUrl === 'function') {
      const prefix = __uv$config.prefix;
      const pos = normalized.indexOf(prefix);
      if (pos !== -1) {
        const enc = encodedPath.slice(pos + prefix.length);
        try { 
          const decoded = __uv$config.decodeUrl(enc);
          if (decoded && decoded !== src && decoded !== normalized) {
            return decoded;
          }
        } catch (e) { }
      }
    }

    // Try Scramjet decoding
    const scramPrefix = '/scramjet/';
    const scramPos = normalized.indexOf(scramPrefix);
    if (scramPos !== -1) {
      const enc = normalized.slice(scramPos + scramPrefix.length);
      try {
        const decoded = decodeURIComponent(enc);
        if (decoded && decoded !== src && decoded !== normalized) {
          return decoded;
        }
      } catch (e) {
        return src;
      }
    }

    if (src && /^https?:\/\//.test(src)) {
      return src;
    }

    try {
      const iframeHref = iframe.contentWindow.location.href;
      if (iframeHref && iframeHref !== 'about:blank' && iframeHref !== src && /^https?:\/\//.test(iframeHref)) {
        return iframeHref;
      }
    } catch (e) {
      // CORS or other errors
    }

    return src;
  }

  function isIframeVisible(iframe) {
    if (!iframe) return false;
    if (iframe.classList.contains('dnone')) return false;
    if (iframe.style && (iframe.style.display === 'none' || iframe.style.visibility === 'hidden')) return false;
    const rect = iframe.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function patchScramjetNavigation() {
    try {
      const loader = typeof window.$scramjetLoadController === 'function' ? window.$scramjetLoadController() : null;
      const Controller = loader?.ScramjetController || window.ScramjetController;
      if (!Controller || Controller.__iframeSyncPatched) return false;
      const originalCreateFrame = Controller.prototype.createFrame;
      if (typeof originalCreateFrame !== 'function') return false;
      Controller.prototype.createFrame = function (...args) {
        const frameObj = originalCreateFrame.apply(this, args);
        if (frameObj && typeof frameObj.go === 'function') {
          const originalGo = frameObj.go.bind(frameObj);
          frameObj.go = function (url, ...rest) {
            if (typeof url === 'string' && url) {
              try { window.setCurrentSearchUrl?.(url); } catch (e) {}
            }
            return originalGo(url, ...rest);
          };
        }
        return frameObj;
      };
      Controller.__iframeSyncPatched = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  function patchUltravioletNavigation() {
    try {
      if (typeof window.Ultraviolet === 'undefined' || window.Ultraviolet.__iframeSyncPatched) {
        return false;
      }
      
      // Hook into Ultraviolet's frame element to monitor src changes
      // Also try to detect navigation through the Ultraviolet API
      const uv = window.Ultraviolet;
      
      // Try to patch Ultraviolet's rewrite/proxy methods if available
      if (uv.rewrite && typeof uv.rewrite === 'function') {
        const originalRewrite = uv.rewrite.bind(uv);
        uv.rewrite = function(url, ...args) {
          if (typeof url === 'string' && url && !/^about:|blob:|data:|javascript:/.test(url)) {
            try { window.setCurrentSearchUrl?.(url); } catch (e) {}
          }
          return originalRewrite(url, ...args);
        };
      }
      
      window.Ultraviolet.__iframeSyncPatched = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  let lastTargetUrl = '';

  function getIframeUrl(iframe) {
    if (!iframe) return '';
    const src = iframe.src || iframe.getAttribute('src') || '';
    let href = '';
    try {
      href = iframe.contentWindow?.location?.href || '';
    } catch (e) {
      href = '';
    }
    if (href && href !== 'about:blank') {
      const decoded = decodeProxyUrl(href, iframe);
      return decoded || href;
    }
    const decoded = decodeProxyUrl(src, iframe);
    // For Ultraviolet, if the decoded URL matches the src, try to extract from contentWindow location
    if (!decoded || decoded === src) {
      try {
        const uvHref = iframe.contentWindow?.location?.href;
        if (uvHref && uvHref !== 'about:blank' && uvHref !== src) {
          return uvHref;
        }
      } catch (e) {}
    }
    return decoded;
  }

  function syncIframe() {
    const iframe = getIframe();
    if (!iframe || !isIframeVisible(iframe)) return;
    const target = getIframeUrl(iframe);
    if (!target || target === lastTargetUrl) return;
    lastTargetUrl = target;
    updateInputs(target);
  }

  function observeIframe(iframe) {
    if (!iframe || iframe.__iframeSyncObserved) return;
    iframe.__iframeSyncObserved = true;

    iframe.addEventListener('load', () => {
      syncIframe();
      // For Ultraviolet, try syncing again after a brief delay to catch decoded URLs
      setTimeout(syncIframe, 100);
    });

    // Track src attribute specifically for Ultraviolet URL changes
    let lastSrc = iframe.src || iframe.getAttribute('src');
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && ['src', 'class', 'style'].includes(record.attributeName)) {
          const currentSrc = iframe.src || iframe.getAttribute('src');
          if (currentSrc !== lastSrc) {
            lastSrc = currentSrc;
            // Immediate sync for src changes
            syncIframe();
            // Additional sync for Ultraviolet delayed decoding
            setTimeout(syncIframe, 50);
          } else {
            syncIframe();
          }
        }
      }
    });

    observer.observe(iframe, { attributes: true, attributeFilter: ['src', 'class', 'style'] });
  }

  function containsIframe(node) {
    if (!node) return false;
    if (node.id === 'frame' || node.id === 'sj-frame') return true;
    if (node.querySelector) {
      return !!node.querySelector('#frame, #sj-frame');
    }
    return false;
  }

  function watchIframeChanges() {
    const iframe = getIframe();
    if (iframe) {
      observeIframe(iframe);
      syncIframe();
    }

    // Direct listener for iframe src changes (especially for Ultraviolet)
    const iframeAccessor = {
      get src() {
        const frame = getIframe();
        return frame?.getAttribute('src') || '';
      },
      set src(value) {
        const frame = getIframe();
        if (frame) {
          frame.setAttribute('src', value);
          // Immediate sync for Ultraviolet src changes
          syncIframe();
          setTimeout(syncIframe, 100);
        }
      }
    };

    const documentObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (containsIframe(node)) {
            const iframe = getIframe();
            observeIframe(iframe);
            syncIframe();
            return;
          }
        }
      }
    });

    documentObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });

    // More frequent syncing for Ultraviolet URL changes
    setInterval(() => {
      const iframe = getIframe();
      if (iframe && isIframeVisible(iframe)) {
        syncIframe();
      }
    }, 500);  // Changed from 1000ms to 500ms for better responsiveness
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      watchIframeChanges();
      const patchInterval = setInterval(() => {
        let patched = patchScramjetNavigation();
        patched = patchUltravioletNavigation() || patched;
        if (patched) clearInterval(patchInterval);
      }, 500);
    });
  } else {
    watchIframeChanges();
    const patchInterval = setInterval(() => {
      let patched = patchScramjetNavigation();
      patched = patchUltravioletNavigation() || patched;
      if (patched) clearInterval(patchInterval);
    }, 500);
  }
})();
