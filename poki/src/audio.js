const SOUND_KEYS = [
  'eat',
  'eat-fast',
  'bonus',
  'powerup',
  'bounce',
  'death',
  'win',
  'click',
  'pause',
  'resume',
];

const MASTER_VOLUME = 0.42;

export default class Sfx {
  constructor(scene) {
    this.scene = scene;
    this.lastBounceAt = 0;
    this.isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.iosSounds = null;
    this.activeIos = new Set();
    this.muted = false;

    if (this.isIOS) {
      this.iosSounds = {};
      for (const key of SOUND_KEYS) {
        const audio = new Audio(`assets/sounds/${key}.wav`);
        audio.preload = 'auto';
        audio.setAttribute('playsinline', '');
        this.iosSounds[key] = audio;
      }
    }
  }

  unlock() {
    try {
      const context = this.scene.sound.context;
      if (context && context.state !== 'running') {
        context.resume();
      }
    } catch {
      // Ignore audio unlock failures.
    }
  }

  setMuted(muted) {
    const next = Boolean(muted);
    if (this.muted === next) {
      return;
    }
    this.muted = next;

    if (next) {
      this.activeIos.forEach((audio) => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          // Ignore HTML5 audio teardown failures.
        }
      });
      this.activeIos.clear();
    }

    try {
      this.scene.sound.mute = next;
    } catch {
      // iOS uses the HTML5 layer above; Phaser's manager is optional.
    }
  }

  play(key, config = {}) {
    if (this.muted) {
      return;
    }
    const volume = Math.min(1, (config.volume ?? 0.5) * MASTER_VOLUME);
    const playbackConfig = { ...config, volume };

    if (this.iosSounds) {
      const source = this.iosSounds[key];
      if (!source) {
        return;
      }
      const audio = source.cloneNode(true);
      audio.volume = volume;
      audio.playbackRate = config.rate ?? 1;
      const cleanup = () => this.activeIos.delete(audio);
      audio.addEventListener('ended', cleanup, { once: true });
      audio.addEventListener('error', cleanup, { once: true });
      this.activeIos.add(audio);
      const playback = audio.play();
      if (playback?.catch) {
        playback.catch(() => {
          cleanup();
        });
      }
      return;
    }

    try {
      this.scene.sound.play(key, playbackConfig);
    } catch {
      // Ignore playback failures; game input must keep working.
    }
  }

  click() {
    this.play('click', { volume: 0.7 });
  }

  eat(type) {
    const key = type === 'fast' ? 'eat-fast' : type === 'bonus' ? 'bonus' : 'eat';
    this.play(key, {
      volume: type === 'bonus' ? 0.95 : 0.85,
      rate: key === 'eat' ? 1 + (Math.random() - 0.5) * 0.1 : 1,
    });
  }

  powerup() {
    this.play('powerup', { volume: 0.95 });
  }

  bounce() {
    const now = this.scene.time.now;
    if (now - this.lastBounceAt < 140) {
      return;
    }
    this.lastBounceAt = now;
    this.play('bounce', { volume: 0.45, rate: 0.9 + Math.random() * 0.2 });
  }

  death() {
    this.play('death', { volume: 0.9 });
  }

  win() {
    this.play('win', { volume: 0.85 });
  }

  pause() {
    this.play('pause', { volume: 0.6 });
  }

  resume() {
    this.play('resume', { volume: 0.6 });
  }
}
