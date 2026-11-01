export default class BannerSlot {
  constructor() {
    this.slot = typeof document !== 'undefined'
      ? document.getElementById('banner-slot')
      : null;
    this.ad = typeof document !== 'undefined'
      ? document.getElementById('banner-ad')
      : null;
    this.visible = false;
  }

  show() {
    if (!this.slot) {
      return false;
    }
    this.visible = true;
    this.slot.classList.add('is-visible');
    this.slot.setAttribute('aria-hidden', 'false');
    return true;
  }

  hide() {
    if (!this.slot) {
      return;
    }
    this.visible = false;
    this.slot.classList.remove('is-visible');
    this.slot.setAttribute('aria-hidden', 'true');
  }
}
