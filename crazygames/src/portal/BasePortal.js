export default class BasePortal {
  constructor(config = {}) {
    this.config = config;
    this.id = config.id ?? 'generic';
    this.ready = false;
    this.disabled = this.id === 'generic';
    this.gameplayActive = false;
    this.adBusy = false;
    this.adMuted = false;
    this.sdkMuted = false;
    this.adBusyHandler = null;
    this.mutedHandler = null;
    this.screen = 'start';
  }

  async init() {}

  onGameReady() {}

  setAdBusyHandler(handler) {
    this.adBusyHandler = handler ?? null;
    this.adBusyHandler?.(this.adBusy);
  }

  setMutedHandler(handler) {
    this.mutedHandler = handler ?? null;
    this.mutedHandler?.(this.isMuted());
  }

  isMuted() {
    return this.adMuted || this.sdkMuted;
  }

  syncMuted() {
    this.mutedHandler?.(this.isMuted());
  }

  setAdBusy(busy) {
    const next = Boolean(busy);
    if (this.adBusy === next) {
      return;
    }
    this.adBusy = next;
    this.adBusyHandler?.(next);
  }

  setAdMuted(muted) {
    const next = Boolean(muted);
    if (this.adMuted === next) {
      return;
    }
    this.adMuted = next;
    this.syncMuted();
  }

  setSdkMuted(muted) {
    const next = Boolean(muted);
    if (this.sdkMuted === next) {
      return;
    }
    this.sdkMuted = next;
    this.syncMuted();
  }

  gameplayStart() {
    if (!this.ready || this.gameplayActive) {
      return false;
    }
    this.gameplayActive = true;
    return true;
  }

  gameplayStop() {
    if (!this.gameplayActive) {
      return false;
    }
    this.gameplayActive = false;
    return true;
  }

  onScreen(screen) {
    this.screen = screen;
  }

  async showRoundEndInterstitial() {
    return false;
  }

  async showPlayAgainInterstitial() {
    return false;
  }

  showBanner() {}

  hideBanner() {}

  happytime() {}

  static async waitFor(getValue, timeoutMs = 8000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const value = getValue();
        if (value) {
          return value;
        }
      } catch {
        // SDK globals can be temporarily unavailable while their scripts boot.
      }
      await new Promise((resolve) => {
        window.setTimeout(resolve, 50);
      });
    }
    return null;
  }
}
