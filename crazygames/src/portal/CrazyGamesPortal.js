import BannerSlot from './bannerSlot.js';
import BasePortal from './BasePortal.js';
import { BANNER_SIZE, ROUND_AD_MIN_MS } from './constants.js';

const AD_TIMEOUT_MS = 45_000;
const BANNER_COOLDOWN_MS = 30_000;

export default class CrazyGamesPortal extends BasePortal {
  constructor(config = {}, { bannerSlot = null } = {}) {
    super(config);
    this.sdk = null;
    this.environment = 'disabled';
    this.bannerSlot = bannerSlot ?? new BannerSlot();
    this.bannerLoaded = false;
    this.bannerWanted = false;
    this.pendingBanner = false;
    this.bannerAttemptAt = 0;
    this.loadingStarted = false;
    this.loadingStopped = false;
    this.settingsListener = null;
  }

  async init() {
    try {
      this.sdk = await BasePortal.waitFor(() => window.CrazyGames?.SDK);
      if (!this.sdk) {
        return;
      }
      await this.sdk.init();
      this.environment = this.sdk.environment ?? 'disabled';
      if (this.environment === 'disabled') {
        this.disabled = true;
        return;
      }

      this.ready = true;
      try {
        this.sdk.game?.loadingStart?.();
        this.loadingStarted = true;
      } catch {
        this.loadingStarted = false;
      }
      this.setupAudioSettings();
      if (this.pendingBanner) {
        this.showBanner(this.pendingBanner);
      }
    } catch {
      this.ready = false;
      this.disabled = true;
    }
  }

  setupAudioSettings() {
    const game = this.sdk?.game;
    if (!game) {
      return;
    }

    this.setSdkMuted(Boolean(game.settings?.muteAudio));
    if (typeof game.addSettingsChangeListener === 'function') {
      this.settingsListener = (settings) => {
        this.setSdkMuted(Boolean(settings?.muteAudio));
      };
      try {
        game.addSettingsChangeListener(this.settingsListener);
      } catch {
        this.settingsListener = null;
      }
    }
  }

  onGameReady() {
    if (!this.ready || !this.sdk) {
      return;
    }
    if (this.loadingStarted && !this.loadingStopped) {
      this.loadingStopped = true;
      try {
        this.sdk.game?.loadingStop?.();
      } catch {
        // Loading metrics are optional for gameplay.
      }
    }
  }

  gameplayStart() {
    if (!this.ready || !this.sdk || !super.gameplayStart()) {
      return;
    }
    this.hideBanner();
    try {
      this.sdk.game?.gameplayStart?.();
    } catch {
      this.gameplayActive = false;
    }
  }

  gameplayStop() {
    if (!this.ready || !this.sdk || !super.gameplayStop()) {
      return;
    }
    try {
      this.sdk.game?.gameplayStop?.();
    } catch {
      // Keep the game running if telemetry is unavailable.
    }
  }

  async showRoundEndInterstitial({ activeMs = 0 } = {}) {
    if (
      !this.ready ||
      !this.sdk ||
      this.adBusy ||
      activeMs <= ROUND_AD_MIN_MS
    ) {
      return false;
    }

    this.bannerWanted = false;
    this.pendingBanner = null;
    this.bannerSlot.hide();
    this.setAdBusy(true);

    return new Promise((resolve) => {
      let settled = false;
      let timeout = null;

      const finish = (shown) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeout !== null) {
          window.clearTimeout(timeout);
        }
        this.setAdMuted(false);
        this.setAdBusy(false);
        resolve(shown);
      };

      timeout = window.setTimeout(() => finish(false), AD_TIMEOUT_MS);

      try {
        this.sdk.ad.requestAd('midgame', {
          adStarted: () => {
            this.setAdMuted(true);
          },
          adFinished: () => finish(true),
          adError: () => finish(false),
        });
      } catch {
        finish(false);
      }
    });
  }

  showBanner() {
    this.pendingBanner = true;
    this.bannerWanted = true;

    if (!this.ready || !this.sdk || this.adBusy) {
      return;
    }

    if (this.bannerLoaded) {
      this.bannerSlot.show();
      return;
    }

    if (!this.sdk.banner?.requestBanner) {
      return;
    }

    const now = performance.now();
    if (this.bannerAttemptAt > 0 && now - this.bannerAttemptAt < BANNER_COOLDOWN_MS) {
      return;
    }
    this.bannerAttemptAt = now;

    if (!this.bannerSlot.show()) {
      return;
    }

    this.sdk.banner
      .requestBanner({
        id: 'banner-ad',
        width: BANNER_SIZE.width,
        height: BANNER_SIZE.height,
      })
      .then(() => {
        this.bannerLoaded = true;
        if (this.bannerWanted && !this.adBusy) {
          this.bannerSlot.show();
        }
      })
      .catch(() => {
        this.bannerLoaded = false;
        this.bannerWanted = false;
        this.bannerSlot.hide();
      });
  }

  hideBanner() {
    this.pendingBanner = null;
    this.bannerWanted = false;
    this.bannerSlot.hide();
  }

  happytime() {
    if (!this.ready || !this.sdk) {
      return;
    }
    try {
      this.sdk.game?.happytime?.();
    } catch {
      // Celebration is purely decorative.
    }
  }
}
