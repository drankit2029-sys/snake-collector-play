import * as Phaser from 'phaser';
import portal from './portal/index.js';
import GameScene from './scenes/GameScene.js';

portal.init().catch(() => {
  // Portal ads are additive; they must never block the game from loading.
});

const gameParent = document.getElementById('game');
const initialBounds = gameParent?.getBoundingClientRect();
const DPR = Math.min(window.devicePixelRatio || 1, 2);
window.GAME_DPR = DPR;

const initial = {
  width: Math.max(1, Math.round(initialBounds?.width || window.innerWidth)),
  height: Math.max(1, Math.round(initialBounds?.height || window.innerHeight)),
};

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#070d17',
  input: {
    activePointers: 3,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: initial.width * DPR,
    height: initial.height * DPR,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scene: [GameScene],
};

let game = null;

let lastWidth = 0;
let lastHeight = 0;
let pendingFrame = null;

let pendingForce = false;

const syncGameSize = (force = false) => {
  if (!gameParent || !game?.scale) {
    return;
  }

  const bounds = gameParent.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));

  if (!force && width === lastWidth && height === lastHeight) {
    return;
  }

  lastWidth = width;
  lastHeight = height;
  game.scale.setGameSize(width * DPR, height * DPR);
};

const scheduleSync = (force = false) => {
  pendingForce = pendingForce || force;
  if (pendingFrame) {
    cancelAnimationFrame(pendingFrame);
  }
  pendingFrame = requestAnimationFrame(() => {
    const shouldForce = pendingForce;
    pendingForce = false;
    pendingFrame = null;
    syncGameSize(shouldForce);
  });
};

const syncWithDelay = () => {
  scheduleSync(true);
  window.setTimeout(() => syncGameSize(true), 120);
  window.setTimeout(() => syncGameSize(true), 450);
  window.setTimeout(() => syncGameSize(true), 900);
};

const SILENT_AUDIO =
  'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

let audioPrimed = false;
let htmlAudioPrimed = false;

const primeAudio = () => {
  if (!htmlAudioPrimed) {
    htmlAudioPrimed = true;
    try {
      const silent = document.createElement('audio');
      silent.src = SILENT_AUDIO;
      silent.setAttribute('playsinline', '');
      silent.volume = 0.01;
      silent.style.display = 'none';
      document.body.appendChild(silent);
      const playback = silent.play();
      if (playback?.catch) {
        playback.catch(() => {});
      }
    } catch {
      htmlAudioPrimed = false;
    }
  }

  const sound = game?.sound;
  if (!sound) {
    return;
  }
  const context = sound.context;
  if (!context) {
    try {
      if (typeof sound.unlock === 'function') {
        sound.unlock();
      }
      if (sound.unlocked !== true) {
        sound.unlocked = true;
      }
    } catch {
      // Audio unlock failures must never block game input.
    }
    return;
  }

  const markUnlocked = () => {
    if (sound.unlocked !== true) {
      sound.unlocked = true;
    }
  };

  if (context.state === 'running') {
    markUnlocked();
  } else {
    context.resume().then(markUnlocked).catch(() => {});
  }

  if (!audioPrimed) {
    audioPrimed = true;
    try {
      const frames = Math.max(1, Math.floor(context.sampleRate * 0.1));
      const buffer = context.createBuffer(1, frames, context.sampleRate);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(0);
    } catch {
      audioPrimed = false;
    }
  }
};

['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'keydown'].forEach(
  (eventName) => {
    window.addEventListener(eventName, primeAudio, { capture: true, passive: true });
  },
);

const syncPortalChrome = () => {
  const gate = document.getElementById('orientation-gate');
  if (!gate) {
    return;
  }
  const portalId = document.documentElement.dataset.portal;
  const portrait = window.matchMedia?.('(orientation: portrait)').matches ?? false;
  gate.setAttribute('aria-hidden', portalId === 'poki' && portrait ? 'false' : 'true');
};

const boot = async () => {
  syncPortalChrome();
  window.addEventListener('resize', syncPortalChrome);
  window.addEventListener('orientationchange', syncPortalChrome);
  try {
    await Promise.all([
      document.fonts?.load('400 16px "Chakra Petch"'),
      document.fonts?.load('700 16px "Chakra Petch"'),
    ]);
  } catch {
    // Continue with the fallback font if the bundled font cannot load.
  }

  game = new Phaser.Game(config);
  window.game = game;

  game.events.once('ready', () => {
    syncGameSize(true);
    scheduleSync(true);
  });

  window.addEventListener('resize', () => scheduleSync(true));
  window.addEventListener('orientationchange', syncWithDelay);
  screen.orientation?.addEventListener?.('change', syncWithDelay);
  window.visualViewport?.addEventListener('resize', () => scheduleSync(true));
  window.visualViewport?.addEventListener('scroll', () => scheduleSync(true));

  if (gameParent && window.ResizeObserver) {
    new ResizeObserver(() => scheduleSync(true)).observe(gameParent);
  }

  window.setInterval(() => syncGameSize(false), 500);
  syncGameSize(true);
};

boot();
