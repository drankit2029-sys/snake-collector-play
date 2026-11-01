import BasePortal from './BasePortal.js';

export default class PokiPortal extends BasePortal {
  constructor(config = {}) {
    super(config);
    this.sdk = null;
    this.pendingGameReady = false;
    this.loadingFinished = false;
    this.commercialActive = false;
  }

  async init() {
    try {
      this.sdk = await BasePortal.waitFor(() => window.PokiSDK);
      if (!this.sdk) {
        return;
      }
      await this.sdk.init();
      this.ready = true;
      if (this.pendingGameReady) {
        this.onGameReady();
      }
    } catch {
      this.ready = false;
    }
  }

  onGameReady() {
    this.pendingGameReady = true;
    if (!this.ready || this.loadingFinished || !this.sdk) {
      return;
    }
    this.pendingGameReady = false;
    this.loadingFinished = true;
    try {
      this.sdk.gameLoadingFinished();
    } catch {
      // The game remains playable if the SDK fails here.
    }
  }

  gameplayStart() {
    if (!this.ready || !this.sdk || !super.gameplayStart()) {
      return;
    }
    try {
      this.sdk.gameplayStart();
    } catch {
      this.gameplayActive = false;
    }
  }

  gameplayStop() {
    if (!this.ready || !this.sdk || !super.gameplayStop()) {
      return;
    }
    try {
      this.sdk.gameplayStop();
    } catch {
      // Ad and SDK failures must never stop the game loop.
    }
  }

  async showPlayAgainInterstitial() {
    if (!this.ready || !this.sdk || this.adBusy || this.commercialActive) {
      return false;
    }

    this.commercialActive = true;
    this.setAdBusy(true);
    this.setAdMuted(true);
    try {
      await this.sdk.commercialBreak(() => {
        this.setAdMuted(true);
      });
      return true;
    } catch {
      return false;
    } finally {
      this.setAdMuted(false);
      this.setAdBusy(false);
      this.commercialActive = false;
    }
  }

  showBanner() {}

  hideBanner() {}
}
