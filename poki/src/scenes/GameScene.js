import * as Phaser from 'phaser';
import Sfx from '../audio.js';
import portal from '../portal/index.js';
import Snake from '../entities/Snake.js';
import { POWERUPS, POWERUP_TYPES } from '../powerups.js';

const HUD_MARGIN = 18;
const UI_FONT = 'Chakra Petch, sans-serif';
const POWER_ICONS = {
  phase: 'power-phase',
  magnet: 'power-magnet',
  slow: 'power-slow',
  double: 'power-double',
};
const getUiScale = (width, height) =>
  Phaser.Math.Clamp(Math.min(width, height) / 430, 0.72, 1.35);
const BEST_KEY = 'snake-collector:best';
const SLOW_RADIUS = 280;
const SLOW_FACTOR = 0.45;
const MAGNET_RADIUS = 320;
const PICKUP_RADIUS = 18;
const PICKUP_LIFETIME = 14;
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

const BALL_TYPES = {
  normal: {
    weight: 60,
    texture: 'ball-normal',
    radius: 11,
    speed: 115,
    points: 10,
    growth: 2,
    color: 0xfacc15,
    sound: 'normal',
  },
  fast: {
    weight: 24,
    texture: 'ball-fast',
    radius: 9,
    speed: 235,
    points: 25,
    growth: 2,
    color: 0xfb923c,
    sound: 'fast',
  },
  bonus: {
    weight: 9,
    texture: 'ball-bonus',
    radius: 13,
    speed: 130,
    points: 60,
    growth: 3,
    color: 0xfbbf24,
    sound: 'bonus',
  },
  power: {
    weight: 7,
    texture: 'ball-power',
    radius: 11,
    speed: 105,
    points: 15,
    growth: 2,
    color: 0xa78bfa,
    sound: 'power',
  },
};

const PALETTES = {
  p1: {
    label: 'P1',
    name: 'PLAYER 1',
    color: 0x38bdf8,
    css: '#38bdf8',
    head: 'head-p1',
    body: 'body-p1',
    hover: '#7dd3fc',
  },
  p2: {
    label: 'P2',
    name: 'PLAYER 2',
    color: 0xf472b6,
    css: '#f472b6',
    head: 'head-p2',
    body: 'body-p2',
    hover: '#f9a8d4',
  },
};

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    SOUND_KEYS.forEach((key) => {
      this.load.audio(key, `assets/sounds/${key}.wav`);
    });

    this.load.svg('power-phase', 'assets/icons/phase.svg', { width: 256, height: 256 });
    this.load.svg('power-magnet', 'assets/icons/magnet.svg', { width: 256, height: 256 });
    this.load.svg('power-slow', 'assets/icons/slow.svg', { width: 256, height: 256 });
    this.load.svg('power-double', 'assets/icons/double.svg', { width: 256, height: 256 });
  }

  create() {
    this.state = 'start';
    this.mode = 1;
    this.snakes = [];
    this.pickup = null;
    this.pickupTimer = 5;
    this.roundId = 0;
    this.roundActiveMs = 0;
    this.floatingTexts = [];
    this.best = this.loadBest();
    this.isTouchDevice = this.detectTouchDevice();
    this.hudVisible = false;
    this.adBusy = false;
    this.uiPressed = null;
    this.uiHoveredButton = null;
    this.uiActionTimer = null;
    this.roundAdToken = 0;
    this.renderDpr = Math.min(window.devicePixelRatio || 1, 2);
    this.game.config.resolution = this.renderDpr;
    this.viewWidth = this.scale.width / this.renderDpr;
    this.viewHeight = this.scale.height / this.renderDpr;
    this.uiScale = getUiScale(this.viewWidth, this.viewHeight);
    this.lastWidth = this.viewWidth;
    this.lastHeight = this.viewHeight;

    this.cameras.main.setZoom(this.renderDpr);
    this.cameras.main.centerOn(this.viewWidth / 2, this.viewHeight / 2);

    this.makeTextures();
    this.sfx = new Sfx(this);
    portal.setAdBusyHandler((busy) => this.handleAdBusy(busy));
    portal.setMutedHandler((muted) => this.sfx.setMuted(muted));

    this.physics.world.setBounds(0, 0, this.viewWidth, this.viewHeight);
    this.physics.world.pause();

    this.createArena();
    this.createBallsGroup();
    this.arenaGraphics = this.add.graphics().setDepth(1);
    this.createHud();
    this.createStartScreen();
    this.createPauseScreen();
    this.createGameOverScreen();
    this.createJoysticks();
    this.createParticles();
    this.createConfetti();
    this.setupInput();

    this.layout();
    this.showStartScreen();
    portal.onGameReady();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
      this.clearUiActionTimer();
    });
  }

  createArena() {
    this.arenaDots = this.add.graphics().setDepth(1);
    this.arenaBorder = this.add.graphics().setDepth(3);
  }

  createBallsGroup() {
    this.balls = this.physics.add.group();
    this.physics.add.collider(this.balls, this.balls);
  }

  createHud() {
    this.hudGraphics = this.add.graphics().setDepth(48);

    this.playerLabels = [
      this.add.text(0, 0, 'SCORE', {
        fontFamily: UI_FONT,
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#94a3b8',
      }).setDepth(50),
      this.add.text(0, 0, 'P2', {
        fontFamily: UI_FONT,
        fontSize: '11px',
        fontStyle: 'bold',
        color: PALETTES.p2.css,
      }).setOrigin(1, 0).setDepth(50),
    ];

    this.scoreTexts = [
      this.add.text(0, 0, '0', {
        fontFamily: UI_FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#f8fafc',
      }).setDepth(50),
      this.add.text(0, 0, '0', {
        fontFamily: UI_FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: PALETTES.p2.css,
      }).setOrigin(1, 0).setDepth(50),
    ];

    this.bestText = this.add.text(0, 0, `BEST ${this.best}`, {
      fontFamily: UI_FONT,
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#fbbf24',
    }).setOrigin(1, 0).setDepth(50);

    this.pauseButton = this.createPauseButton();
    this.setPauseButtonVisible(false);

    this.powerupPanels = [this.createPowerupPanel(), this.createPowerupPanel()];

    this.touchHintText = this.add.text(0, 0, '', {
      fontFamily: UI_FONT,
      fontSize: '11px',
      color: '#94a3b8',
      align: 'center',
    }).setOrigin(0.5).setDepth(45).setAlpha(0);
  }

  createStartScreen() {
    this.startScreen = this.add.container(0, 0).setDepth(100);
    this.startBg = this.add.graphics();
    this.startPanel = this.add.graphics();

    this.startTitle = this.add.text(0, 0, 'SNAKE COLLECTOR', {
      fontFamily: UI_FONT,
      fontSize: '46px',
      fontStyle: 'bold',
      color: '#e0f2fe',
    }).setOrigin(0.5);

    this.startSubtitle = this.add.text(
      0,
      0,
      'EAT ORBS  ·  AVOID WALLS, TAILS & RIVALS',
      {
        fontFamily: UI_FONT,
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#94a3b8',
      },
    ).setOrigin(0.5);

    this.startBest = this.add.text(0, 0, `BEST  ${this.best}`, {
      fontFamily: UI_FONT,
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#fbbf24',
    }).setOrigin(0.5);

    this.startPlay1 = this.createButton('1 PLAYER', {
      subtitle: 'SOLO RUN',
      width: 180,
      height: 64,
      fontSize: 18,
      color: PALETTES.p1.css,
    });

    this.startPlay2 = this.createButton('2 PLAYERS', {
      subtitle: 'LOCAL VERSUS',
      width: 180,
      height: 64,
      fontSize: 18,
      color: PALETTES.p2.css,
    });

    this.startLegendChips = POWERUP_TYPES.map((type) => this.createLegendChip(type));

    this.startHint = this.add.text(
      0,
      0,
      this.isTouchDevice ? 'TOUCH · DRAG TO STEER' : 'P1 WASD  ·  P2 ARROWS',
      {
        fontFamily: UI_FONT,
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#64748b',
      },
    ).setOrigin(0.5);

    this.startScreen.add([
      this.startBg,
      this.startPanel,
      this.startTitle,
      this.startSubtitle,
      this.startBest,
      this.startPlay1,
      this.startPlay2,
      ...this.startLegendChips,
      this.startHint,
    ]);
  }

  createLegendChip(type) {
    const definition = POWERUPS[type];
    const container = this.add.container(0, 0);
    const icon = this.add
      .image(0, 0, POWER_ICONS[type])
      .setDisplaySize(16, 16)
      .setTint(definition.color);
    const label = this.add.text(0, 0, definition.label, {
      fontFamily: UI_FONT,
      fontSize: '9px',
      fontStyle: 'bold',
      color: definition.css,
    }).setOrigin(0, 0.5);
    const width = 44 + label.width;
    const bg = this.add.graphics();
    bg.fillStyle(0x0b1626, 0.92);
    bg.fillRoundedRect(-width / 2, -12, width, 24, 10);
    bg.lineStyle(1, definition.color, 0.35);
    bg.strokeRoundedRect(-width / 2, -12, width, 24, 10);
    icon.setPosition(-width / 2 + 16, 0);
    label.setPosition(-width / 2 + 27, 0);
    container.add([bg, icon, label]);
    container.chipWidth = width;
    return container;
  }

  createPauseScreen() {
    this.pauseScreen = this.add.container(0, 0).setDepth(100).setVisible(false);
    this.pauseBg = this.add.graphics();
    this.pausePanel = this.add.graphics();

    this.pauseTitle = this.add.text(0, 0, 'PAUSED', {
      fontFamily: UI_FONT,
      fontSize: '34px',
      fontStyle: 'bold',
      color: '#f8fafc',
    }).setOrigin(0.5);

    this.pauseResumeButton = this.createButton('RESUME', {
      width: 190,
      height: 48,
      fontSize: 17,
      color: PALETTES.p1.css,
    });

    this.pauseRestartButton = this.createButton('NEW GAME', {
      width: 190,
      height: 44,
      fontSize: 14,
      variant: 'secondary',
      color: PALETTES.p1.css,
    });

    this.pauseHint = this.add.text(0, 0, 'P / ESC TO RESUME', {
      fontFamily: UI_FONT,
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#64748b',
    }).setOrigin(0.5);

    this.pauseScreen.add([
      this.pauseBg,
      this.pausePanel,
      this.pauseTitle,
      this.pauseResumeButton,
      this.pauseRestartButton,
      this.pauseHint,
    ]);
  }

  createGameOverScreen() {
    this.gameOverScreen = this.add.container(0, 0).setDepth(100).setVisible(false);
    this.gameOverText = this.add.container(0, 0).setDepth(101).setVisible(false);
    this.gameOverBg = this.add.graphics();
    this.gameOverPanel = this.add.graphics();

    this.gameOverTitle = this.add.text(0, 0, 'GAME OVER', {
      fontFamily: UI_FONT,
      fontSize: '34px',
      fontStyle: 'bold',
      color: '#fb7185',
    }).setOrigin(0.5);

    this.gameOverCause = this.add.text(0, 0, '', {
      fontFamily: UI_FONT,
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#94a3b8',
      align: 'center',
    }).setOrigin(0.5);

    this.newHighScoreText = this.add.text(0, 0, 'NEW HIGH SCORE!', {
      fontFamily: UI_FONT,
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#fbbf24',
    }).setOrigin(0.5).setVisible(false);

    this.gameOverScore = this.add.text(0, 0, 'SCORE  0', {
      fontFamily: UI_FONT,
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#f8fafc',
    }).setOrigin(0.5);

    this.dualScoreP1 = this.add.text(0, 0, 'P1  0', {
      fontFamily: UI_FONT,
      fontSize: '22px',
      fontStyle: 'bold',
      color: PALETTES.p1.css,
    }).setOrigin(1, 0.5).setVisible(false);

    this.dualScoreP2 = this.add.text(0, 0, 'P2  0', {
      fontFamily: UI_FONT,
      fontSize: '22px',
      fontStyle: 'bold',
      color: PALETTES.p2.css,
    }).setOrigin(0, 0.5).setVisible(false);

    this.gameOverBest = this.add.text(0, 0, 'BEST 0', {
      fontFamily: UI_FONT,
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#94a3b8',
    }).setOrigin(0.5);

    this.playAgainButton = this.createButton('PLAY AGAIN', {
      width: 200,
      height: 48,
      fontSize: 16,
      color: PALETTES.p1.css,
    });

    this.menuButton = this.createButton('MENU', {
      width: 150,
      height: 40,
      fontSize: 13,
      variant: 'secondary',
      color: '#94a3b8',
    });

    this.gameOverScreen.add([this.gameOverBg, this.gameOverPanel]);
    this.gameOverText.add([
      this.gameOverTitle,
      this.gameOverCause,
      this.newHighScoreText,
      this.gameOverScore,
      this.dualScoreP1,
      this.dualScoreP2,
      this.gameOverBest,
      this.playAgainButton,
      this.menuButton,
    ]);
  }

  detectTouchDevice() {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    return Boolean(
      coarse ||
        'ontouchstart' in window ||
        (navigator.maxTouchPoints ?? 0) > 0 ||
        this.sys.game.device.input.touch,
    );
  }

  createJoysticks() {
    this.joysticks = [
      this.createJoystick(PALETTES.p1),
      this.createJoystick(PALETTES.p2),
    ];
    this.touchControls = [
      { pointerId: null, startX: 0, startY: 0 },
      { pointerId: null, startX: 0, startY: 0 },
    ];
  }

  createJoystick(palette) {
    const container = this.add.container(0, 0).setDepth(45).setVisible(false);
    const base = this.add
      .image(0, 0, 'joystick-base')
      .setTint(palette.color)
      .setAlpha(0.85)
      .setScale(1 / this.renderDpr);
    const knob = this.add.image(0, 0, 'joystick-knob').setTint(palette.color).setScale(1 / this.renderDpr);
    const label = this.add.text(0, -78, palette.label, {
      fontFamily: UI_FONT,
      fontSize: '11px',
      fontStyle: 'bold',
      color: palette.css,
    }).setOrigin(0.5).setAlpha(0.8);
    container.add([base, knob, label]);
    container.baseScale = 1;
    return { container, knob };
  }

  handleTouchStart(pointer) {
    if (!this.isTouchDevice || this.state !== 'playing' || this.adBusy) {
      return;
    }
    if (this.uiPressed || this.isPointerOnPause(pointer)) {
      return;
    }

    const player =
      this.mode === 2 && pointer.worldX >= this.viewWidth / 2 ? 1 : 0;
    const control = this.touchControls[player];
    if (!control || control.pointerId !== null) {
      return;
    }

    control.pointerId = pointer.id;
    control.startX = pointer.worldX;
    control.startY = pointer.worldY;

    const joystick = this.joysticks[player];
    const baseScale = this.uiScale;
    joystick.container.baseScale = baseScale;
    this.tweens.killTweensOf(joystick.container);
    joystick.container
      .setPosition(pointer.worldX, pointer.worldY)
      .setVisible(true)
      .setAlpha(0.9)
      .setScale(baseScale * 0.8);
    joystick.knob.setPosition(0, 0);
    this.tweens.add({
      targets: joystick.container,
      scale: baseScale,
      alpha: 0.9,
      duration: 120,
      ease: 'Back.easeOut',
    });
  }

  handleTouchMove(pointer) {
    if (!this.isTouchDevice || this.state !== 'playing') {
      return;
    }

    this.touchControls.forEach((control, player) => {
      if (control.pointerId !== pointer.id) {
        return;
      }

      const joystick = this.joysticks[player];
      if (!joystick.container.visible) {
        return;
      }

      const dx = pointer.worldX - control.startX;
      const dy = pointer.worldY - control.startY;
      const distance = Math.hypot(dx, dy);
      const limit = 44;

      if (distance > 0.001) {
        const scale = Math.min(1, (limit * this.uiScale) / distance);
        joystick.knob.setPosition((dx * scale) / this.uiScale, (dy * scale) / this.uiScale);
      } else {
        joystick.knob.setPosition(0, 0);
      }

      const snake = this.snakes[player];
      if (!snake) {
        return;
      }

      const resetZone = 12 * this.uiScale;
      const deadZone = 18 * this.uiScale;

      if (distance < resetZone) {
        snake.steer(null);
        return;
      }
      if (distance < deadZone) {
        return;
      }

      snake.steer(Math.atan2(dy, dx));
    });
  }

  handleTouchEnd(pointer) {
    if (!this.isTouchDevice || !this.touchControls) {
      return;
    }

    this.touchControls.forEach((control, player) => {
      if (control.pointerId !== pointer.id) {
        return;
      }

      control.pointerId = null;
      const snake = this.snakes[player];
      if (snake) {
        snake.steer(null);
      }

      const joystick = this.joysticks[player];
      this.tweens.killTweensOf(joystick.container);
      this.tweens.add({
        targets: joystick.container,
        alpha: 0,
        scale: (joystick.container.baseScale || this.uiScale) * 0.8,
        duration: 100,
        onComplete: () => {
          if (control.pointerId === null) {
            joystick.container.setVisible(false);
          }
        },
      });
    });
  }

  resetJoysticks() {
    if (!this.joysticks) {
      return;
    }

    this.joysticks.forEach((joystick, index) => {
      const control = this.touchControls[index];
      control.pointerId = null;
      this.tweens.killTweensOf(joystick.container);
      joystick.container.setVisible(false).setAlpha(0);
      joystick.knob.setPosition(0, 0);
    });

    this.snakes.forEach((snake) => snake.steer(null));
  }

  isPointerOnPause(pointer) {
    if (!this.pauseButton.visible) {
      return false;
    }
    return this.pauseButton.getBounds().contains(pointer.worldX, pointer.worldY);
  }

  showTouchHint() {
    if (!this.isTouchDevice) {
      return;
    }

    this.touchHintText.setText(
      this.mode === 2
        ? 'P1 LEFT  ·  P2 RIGHT  ·  DRAG TO STEER'
        : 'DRAG ANYWHERE TO STEER',
    );
    this.tweens.killTweensOf(this.touchHintText);
    this.touchHintText.setAlpha(0.85);
    this.tweens.add({
      targets: this.touchHintText,
      alpha: 0,
      delay: 1500,
      duration: 2200,
      ease: 'Quad.easeIn',
    });
  }

  hideTouchHint() {
    if (!this.touchHintText) {
      return;
    }
    this.tweens.killTweensOf(this.touchHintText);
    this.touchHintText.setAlpha(0);
  }

  createParticles() {
    this.burst = this.add.particles(0, 0, 'spark', {
      speed: { min: 50, max: 260 },
      angle: { min: 0, max: 360 },
      gravityY: 180,
      lifespan: { min: 250, max: 650 },
      scale: { start: 0.9 / Math.min(window.devicePixelRatio || 1, 2), end: 0 },
      emitting: false,
      tint: 0xffffff,
    }).setDepth(35);
  }

  createConfetti() {
    this.confetti = this.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 340 },
      angle: { min: 240, max: 300 },
      gravityY: 500,
      lifespan: { min: 900, max: 1800 },
      scale: { start: 1.2 / Math.min(window.devicePixelRatio || 1, 2), end: 0 },
      rotate: { min: -180, max: 180 },
      tint: [0x38bdf8, 0xfacc15, 0xf472b6, 0x4ade80, 0xfb923c],
      emitting: false,
    }).setDepth(120);

    this.gameOverScreen.add(this.confetti);
  }

  celebrateConfetti() {
    const width = this.viewWidth;
    const height = this.viewHeight;
    this.confetti.explode(42, width * 0.12, height * 0.62);
    this.confetti.explode(42, width * 0.88, height * 0.62);
  }

  uiColor(value, fallback = 0x38bdf8) {
    if (typeof value === 'number') {
      return value;
    }
    try {
      return Phaser.Display.Color.HexStringToColor(value).color;
    } catch {
      return fallback;
    }
  }

  shiftUiColor(value, amount) {
    const color = Phaser.Display.Color.IntegerToColor(value);
    return Phaser.Display.Color.GetColor(
      Phaser.Math.Clamp(color.red + amount, 0, 255),
      Phaser.Math.Clamp(color.green + amount, 0, 255),
      Phaser.Math.Clamp(color.blue + amount, 0, 255),
    );
  }

  createButton(label, {
    fontSize = 18,
    color = '#38bdf8',
    variant = 'primary',
    subtitle = '',
    width = null,
    height = null,
    padding = { x: 26, y: 12 },
    onClick,
  } = {}) {
    const base = this.uiColor(color);
    const container = this.add.container(0, 0);
    const bg = this.add.graphics();

    const textColor = variant === 'secondary' ? '#e2e8f0' : '#06121f';
    const labelText = this.add.text(0, 0, label, {
      fontFamily: UI_FONT,
      fontSize: `${fontSize}px`,
      fontStyle: 'bold',
      color: textColor,
    }).setOrigin(0.5);

    const subText = subtitle
      ? this.add.text(0, 0, subtitle, {
        fontFamily: UI_FONT,
        fontSize: `${Math.max(8, Math.round(fontSize * 0.5))}px`,
        fontStyle: 'bold',
        color: variant === 'secondary' ? '#94a3b8' : 'rgba(4, 15, 25, 0.62)',
      }).setOrigin(0.5)
      : null;

    const w = width ?? Math.max(labelText.width + padding.x * 2, 120);
    const h = height ?? Math.max(labelText.height + padding.y * 2, 46);
    const radius = Math.min(16, h / 2);

    labelText.setPosition(0, subText ? -h * 0.14 : 0);
    if (subText) {
      subText.setPosition(0, h * 0.2);
    }

    const draw = (state = 'normal') => {
      const hover = state === 'hover';
      const pressed = state === 'pressed';
      bg.clear();
      if (variant === 'secondary') {
        bg.fillStyle(pressed ? 0x16283f : 0x0b1626, 0.94);
        bg.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
        bg.lineStyle(1.5, pressed ? this.shiftUiColor(base, 70) : hover ? this.shiftUiColor(base, 55) : base, pressed ? 0.95 : hover ? 0.8 : 0.45);
        bg.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
        bg.fillStyle(base, pressed ? 0.14 : hover ? 0.08 : 0.035);
        bg.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, radius);
      } else {
        const fill = pressed
          ? this.shiftUiColor(base, 42)
          : hover
            ? this.shiftUiColor(base, 26)
            : base;
        bg.fillStyle(fill, 1);
        bg.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
        bg.fillStyle(0xffffff, pressed ? 0.28 : hover ? 0.2 : 0.13);
        bg.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h * 0.4, radius);
        bg.lineStyle(1.5, pressed || hover ? 0xffffff : this.shiftUiColor(base, 55), pressed ? 0.85 : hover ? 0.6 : 0.45);
        bg.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
      }
    };

    draw('normal');
    container.add([bg, labelText, ...(subText ? [subText] : [])]);
    container.setSize(w, h);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      Phaser.Geom.Rectangle.Contains,
    );
    if (container.input) {
      container.input.cursor = 'pointer';
    }
    container.baseScale = 1;
    container.buttonVisualState = 'normal';

    container.setVisualState = (state = 'normal') => {
      container.buttonVisualState = state;
      draw(state);
      this.tweens.killTweensOf(container);
      const baseScale = container.baseScale || 1;
      if (state === 'pressed') {
        container.setScale(baseScale * 0.94);
      } else if (state === 'released') {
        this.tweens.add({
          targets: container,
          scale: baseScale * 1.035,
          duration: 70,
          ease: 'Quad.easeOut',
          onComplete: () => {
            this.tweens.add({
              targets: container,
              scale: baseScale,
              duration: 150,
              ease: 'Back.easeOut',
            });
          },
        });
      } else if (state === 'hover') {
        this.tweens.add({
          targets: container,
          scale: baseScale * 1.03,
          duration: 110,
          ease: 'Quad.easeOut',
        });
      } else {
        this.tweens.add({
          targets: container,
          scale: baseScale,
          duration: 110,
          ease: 'Quad.easeOut',
        });
      }
    };

    container.spawnRipple = (pointer) => {
      const localX = Phaser.Math.Clamp(pointer.worldX - container.x, -w / 2, w / 2);
      const localY = Phaser.Math.Clamp(pointer.worldY - container.y, -h / 2, h / 2);
      const ripple = this.add.circle(localX, localY, Math.max(w, h) * 0.32, base, 0.2);
      container.addAt(ripple, 1);
      this.tweens.add({
        targets: ripple,
        scale: 2.4,
        alpha: 0,
        duration: 260,
        ease: 'Cubic.easeOut',
        onComplete: () => ripple.destroy(),
      });
    };

    container.resetButtonVisual = () => {
      this.tweens.killTweensOf(container);
      container.setScale(container.baseScale || 1);
      container.buttonVisualState = 'normal';
      draw('normal');
    };

    container.buttonWidth = w;
    container.buttonHeight = h;
    return container;
  }

  createPauseButton() {
    const container = this.add.container(0, 0).setDepth(50);
    const bg = this.add.graphics();
    const bars = this.add.graphics();
    const size = 40;
    const base = 0x94a3b8;

    const draw = (state = 'normal') => {
      const hover = state === 'hover';
      const pressed = state === 'pressed';
      bg.clear();
      bg.fillStyle(pressed ? 0x16283f : 0x0b1626, 0.94);
      bg.fillRoundedRect(-size / 2, -size / 2, size, size, 12);
      bg.lineStyle(1.5, pressed ? 0xffffff : hover ? 0xcbd5e1 : base, pressed ? 0.9 : hover ? 0.7 : 0.35);
      bg.strokeRoundedRect(-size / 2, -size / 2, size, size, 12);
      bg.fillStyle(0x38bdf8, pressed ? 0.16 : hover ? 0.08 : 0);
      bg.fillRoundedRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4, 10);
      bars.clear();
      bars.fillStyle(0xf8fafc, pressed || hover ? 1 : 0.85);
      bars.fillRoundedRect(-8, -10, 5, 20, 2);
      bars.fillRoundedRect(3, -10, 5, 20, 2);
    };

    draw('normal');
    container.add([bg, bars]);
    container.setSize(size, size);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-size / 2, -size / 2, size, size),
      Phaser.Geom.Rectangle.Contains,
    );
    if (container.input) {
      container.input.cursor = 'pointer';
    }
    container.baseScale = 1;
    container.buttonVisualState = 'normal';
    container.buttonWidth = size;
    container.buttonHeight = size;

    container.setVisualState = (state = 'normal') => {
      container.buttonVisualState = state;
      draw(state);
      this.tweens.killTweensOf(container);
      const baseScale = container.baseScale || 1;
      if (state === 'pressed') {
        container.setScale(baseScale * 0.9);
        return;
      }
      const scale = state === 'hover'
        ? baseScale * 1.08
        : state === 'released'
          ? baseScale * 1.06
          : baseScale;
      this.tweens.add({
        targets: container,
        scale,
        duration: 110,
        ease: state === 'released' ? 'Back.easeOut' : 'Quad.easeOut',
        onComplete: state === 'released'
          ? () => {
              this.tweens.add({
                targets: container,
                scale: baseScale,
                duration: 150,
                ease: 'Back.easeOut',
              });
            }
          : undefined,
      });
    };

    container.spawnRipple = (pointer) => {
      const localX = Phaser.Math.Clamp(pointer.worldX - container.x, -size / 2, size / 2);
      const localY = Phaser.Math.Clamp(pointer.worldY - container.y, -size / 2, size / 2);
      const ripple = this.add.circle(localX, localY, size * 0.42, 0x38bdf8, 0.2);
      container.addAt(ripple, 1);
      this.tweens.add({
        targets: ripple,
        scale: 2.2,
        alpha: 0,
        duration: 240,
        ease: 'Cubic.easeOut',
        onComplete: () => ripple.destroy(),
      });
    };

    container.resetButtonVisual = () => {
      this.tweens.killTweensOf(container);
      container.setScale(container.baseScale || 1);
      container.buttonVisualState = 'normal';
      draw('normal');
    };

    return container;
  }

  createPowerupPanel() {
    const container = this.add.container(0, 0).setDepth(52).setVisible(false);
    const width = 190;
    const height = 34;
    const gap = 5;
    const chips = POWERUP_TYPES.map((type, index) => {
      const chip = this.add.container(0, index * (height + gap));
      const bg = this.add.graphics();
      const icon = this.add.image(17, 16, POWER_ICONS[type])
        .setDisplaySize(18, 18)
        .setTint(POWERUPS[type].color);
      const label = this.add.text(31, 10, '', {
        fontFamily: UI_FONT,
        fontSize: '9.5px',
        fontStyle: 'bold',
        color: POWERUPS[type].css,
      }).setOrigin(0, 0.5);
      const stack = this.add.text(151, 10, '', {
        fontFamily: UI_FONT,
        fontSize: '8px',
        fontStyle: 'bold',
        color: POWERUPS[type].css,
      }).setOrigin(1, 0.5);
      const time = this.add.text(181, 10, '', {
        fontFamily: UI_FONT,
        fontSize: '8.5px',
        fontStyle: 'bold',
        color: '#94a3b8',
      }).setOrigin(1, 0.5);
      const bar = this.add.graphics();

      chip.add([bg, icon, label, stack, time, bar]);
      chip.setVisible(false);
      chip.chipType = null;
      chip.bg = bg;
      chip.icon = icon;
      chip.label = label;
      chip.stack = stack;
      chip.time = time;
      chip.bar = bar;
      chip.rowY = index * (height + gap);

      const drawChip = (definition) => {
        bg.clear();
        bg.fillStyle(0x0b1626, 0.94);
        bg.fillRoundedRect(0, 0, width, height, 10);
        bg.lineStyle(1, definition.color, 0.42);
        bg.strokeRoundedRect(0, 0, width, height, 10);
        bg.fillStyle(definition.color, 0.85);
        bg.fillRoundedRect(0, 8, 3, height - 16, 1.5);
        bg.fillStyle(0xffffff, 0.08);
        bg.fillRoundedRect(31, 25, 147, 4, 2);
      };

      chip.drawChip = drawChip;
      return chip;
    });

    container.add(chips);
    return { container, chips, width, height, gap };
  }

  updatePowerupPanel(panel, powerups = []) {
    if (!panel) {
      return;
    }

    if (!powerups.length) {
      panel.container.setVisible(false);
      panel.chips.forEach((chip) => {
        chip.setVisible(false);
        chip.chipType = null;
      });
      return;
    }

    panel.container.setVisible(true);
    panel.chips.forEach((chip, index) => {
      const powerup = powerups[index];
      if (!powerup) {
        chip.setVisible(false);
        chip.chipType = null;
        return;
      }

      const definition = POWERUPS[powerup.type];
      const isNewType = chip.chipType !== powerup.type;
      if (isNewType) {
        chip.chipType = powerup.type;
        chip.drawChip(definition);
        chip.icon.setTexture(POWER_ICONS[powerup.type]).setTint(definition.color);
        chip.label.setText(definition.label).setColor(definition.css);
        chip.stack.setColor(definition.css);
      }

      chip.stack.setText(powerup.stacks > 1 ? `×${powerup.stacks}` : '');
      chip.time.setText(`${Math.ceil(powerup.remaining)}s`);
      const ratio = Phaser.Math.Clamp(
        powerup.remaining / (powerup.duration || definition.duration),
        0,
        1,
      );
      chip.bar.clear();
      chip.bar.fillStyle(definition.color, 1);
      chip.bar.fillRoundedRect(31, 25, Math.max(2, 147 * ratio), 4, 2);

      if (!chip.visible) {
        chip.setVisible(true);
        chip.setAlpha(0).setScale(0.86);
        this.tweens.add({
          targets: chip,
          alpha: 1,
          scale: 1,
          duration: 180,
          ease: 'Back.easeOut',
        });
      }
    });
  }


  getActiveUiButtons() {
    if (this.adBusy) {
      return [];
    }
    if (this.state === 'start') {
      return [
        { button: this.startPlay1, action: () => this.startGame(1) },
        { button: this.startPlay2, action: () => this.startGame(2) },
      ];
    }
    if (this.state === 'gameover') {
      return [
        { button: this.playAgainButton, action: () => this.handlePlayAgain() },
        { button: this.menuButton, action: () => this.showStartScreen() },
      ];
    }
    if (this.state === 'paused') {
      return [
        { button: this.pauseResumeButton, action: () => this.resumeGame() },
        { button: this.pauseRestartButton, action: () => this.startGame(this.mode) },
      ];
    }
    if (this.state === 'playing' && this.pauseButton?.visible) {
      return [{ button: this.pauseButton, action: () => this.togglePause() }];
    }
    return [];
  }

  findUiButton(pointer) {
    return this.getActiveUiButtons().find(({ button }) => (
      this.isPointerInButton(button, pointer)
    )) ?? null;
  }

  isMousePointer(pointer) {
    const type = pointer.pointerType || pointer.event?.pointerType;
    if (type) {
      return type === 'mouse';
    }
    return !this.isTouchDevice;
  }

  clearUiActionTimer() {
    if (this.uiActionTimer !== null) {
      window.clearTimeout(this.uiActionTimer);
      this.uiActionTimer = null;
    }
  }

  handleUiPointerDown(pointer) {
    if (this.adBusy || this.uiPressed) {
      return;
    }

    const target = this.findUiButton(pointer);
    if (!target) {
      return;
    }

    this.clearUiActionTimer();
    this.uiPressed = {
      ...target,
      pointerId: pointer.id,
      state: this.state,
      at: performance.now(),
    };
    this.uiHoveredButton = target.button;
    target.button.setVisualState?.('pressed');
    target.button.spawnRipple?.(pointer);

    try {
      this.sfx.unlock();
      this.sfx.click();
    } catch {
      // Audio must never block UI actions.
    }
  }

  handleUiPointerUp(pointer) {
    const pressed = this.uiPressed;
    if (!pressed || pressed.pointerId !== pointer.id) {
      return;
    }

    const target = this.findUiButton(pointer);
    const stillPressed =
      target?.button === pressed.button && this.state === pressed.state;
    this.uiPressed = null;

    if (!stillPressed) {
      pressed.button.setVisualState?.(
        this.isMousePointer(pointer) ? 'hover' : 'normal',
      );
      return;
    }

    pressed.button.setVisualState?.('released');
    const delay = Math.max(0, 110 - (performance.now() - pressed.at));
    const expectedState = pressed.state;
    this.clearUiActionTimer();
    this.uiActionTimer = window.setTimeout(() => {
      this.uiActionTimer = null;
      if (this.state !== expectedState || this.adBusy) {
        return;
      }
      pressed.action();
    }, delay);
  }

  handleUiPointerCancel(pointer) {
    const pressed = this.uiPressed;
    if (!pressed || pressed.pointerId !== pointer.id) {
      return;
    }
    this.uiPressed = null;
    this.clearUiActionTimer();
    pressed.button.setVisualState?.('normal');
    if (this.uiHoveredButton === pressed.button) {
      this.uiHoveredButton = null;
    }
  }

  handleUiPointerMove(pointer) {
    if (this.adBusy || this.uiPressed || !this.isMousePointer(pointer)) {
      return;
    }

    const target = this.findUiButton(pointer);
    if (this.uiHoveredButton === target?.button) {
      return;
    }

    if (this.uiHoveredButton) {
      this.uiHoveredButton.setVisualState?.('normal');
    }
    this.uiHoveredButton = target?.button ?? null;
    if (this.uiHoveredButton) {
      this.uiHoveredButton.setVisualState?.('hover');
    }
  }

  isPointerInButton(button, pointer) {
    if (!button || !button.visible || !button.buttonWidth || !button.buttonHeight) {
      return false;
    }
    const scale = Math.abs(button.baseScale || button.scaleX || 1);
    const width = button.buttonWidth * scale;
    const height = button.buttonHeight * scale;
    return (
      Math.abs(pointer.worldX - button.x) <= width / 2 &&
      Math.abs(pointer.worldY - button.y) <= height / 2
    );
  }

  setupInput() {
    this.input.keyboard.on('keydown-P', this.togglePause, this);
    this.input.keyboard.on('keydown-ESC', this.togglePause, this);

    const bindDirection = (key, player, direction) => {
      this.input.keyboard.on(`keydown-${key}`, () => {
        this.turnFromKey(player, direction);
      });
    };

    bindDirection('W', 0, 'up');
    bindDirection('A', 0, 'left');
    bindDirection('S', 0, 'down');
    bindDirection('D', 0, 'right');

    bindDirection('UP', 1, 'up');
    bindDirection('LEFT', 1, 'left');
    bindDirection('DOWN', 1, 'down');
    bindDirection('RIGHT', 1, 'right');

    this.input.on('pointerdown', this.handleUiPointerDown, this);
    this.input.on('pointerdown', this.handleTouchStart, this);
    this.input.on('pointermove', this.handleUiPointerMove, this);
    this.input.on('pointermove', this.handleTouchMove, this);
    this.input.on('pointerup', this.handleUiPointerUp, this);
    this.input.on('pointerup', this.handleTouchEnd, this);
    this.input.on('pointerupoutside', this.handleUiPointerCancel, this);
    this.input.on('pointerupoutside', this.handleTouchEnd, this);
  }

  turnFromKey(player, direction) {
    this.turnSnake(this.mode === 1 ? 0 : player, direction);
  }

  turnSnake(player, direction) {
    if (this.state !== 'playing') {
      return;
    }

    const snake = this.snakes[player];
    const vector = DIRECTIONS[direction];
    if (snake && vector) {
      snake.turn(vector.x, vector.y);
    }
  }

  handleAdBusy(busy) {
    this.adBusy = Boolean(busy);
    if (!this.adBusy) {
      return;
    }
    this.clearUiActionTimer();
    if (this.uiPressed?.button) {
      this.uiPressed.button.setVisualState?.('normal');
    }
    this.uiPressed = null;
    this.uiHoveredButton = null;
  }

  async handleRoundEndAds() {
    const token = ++this.roundAdToken;
    portal.hideBanner();
    portal.onScreen('gameover');
    await portal.showRoundEndInterstitial({ activeMs: this.roundActiveMs });
    if (token !== this.roundAdToken || this.state !== 'gameover') {
      return;
    }
    portal.showBanner('gameover');
    this.layout();
  }

  async handlePlayAgain() {
    if (this.adBusy || this.state !== 'gameover') {
      return;
    }
    portal.hideBanner();
    await portal.showPlayAgainInterstitial({ activeMs: this.roundActiveMs });
    if (this.state !== 'gameover') {
      return;
    }
    this.startGame(this.mode);
  }

  showStartScreen() {
    this.roundAdToken += 1;
    portal.gameplayStop();
    portal.hideBanner();
    portal.onScreen('start');
    this.clearRound();
    this.state = 'start';
    this.time.paused = false;
    this.physics.world.pause();
    this.physics.world.setBounds(0, 0, this.viewWidth, this.viewHeight);

    this.startBest.setText(`BEST  ${this.best}`);
    this.setScreenVisible(this.startScreen, true);
    this.setScreenVisible(this.pauseScreen, false);
    this.setGameOverVisible(false);
    this.setPauseButtonVisible(false);
    this.setHudVisible(false);
    this.resetJoysticks();
    this.hideTouchHint();

    this.tweens.killTweensOf(this.newHighScoreText);
    this.newHighScoreText.setVisible(false).setScale(1);
    this.confetti.killAll();
    this.layout();
    portal.showBanner('start');
  }

  startGame(mode) {
    this.sfx.unlock();
    this.roundAdToken += 1;
    portal.hideBanner();
    portal.onScreen('playing');
    this.clearRound();
    this.mode = mode;
    this.state = 'playing';
    this.roundActiveMs = 0;
    this.time.paused = false;

    this.setScreenVisible(this.startScreen, false);
    this.setScreenVisible(this.pauseScreen, false);
    this.setGameOverVisible(false);

    this.tweens.killTweensOf(this.newHighScoreText);
    this.newHighScoreText.setVisible(false).setScale(1);
    this.confetti.killAll();

    this.physics.world.setBounds(0, 0, this.viewWidth, this.viewHeight);
    this.physics.world.resume();

    this.createSnakes();
    this.configureHudForMode();
    this.setHudVisible(true);
    this.setPauseButtonVisible(true);
    this.resetJoysticks();
    this.updateScores();
    this.clearEffectTexts();

    this.pickup = null;
    this.pickupTimer = 4.5;
    this.spawnInitialBalls();
    this.layout();
    this.showTouchHint();
    portal.gameplayStart();
  }

  createSnakes() {
    const width = this.viewWidth;
    const height = this.viewHeight;
    const isDual = this.mode === 2;

    const p1 = new Snake(this, {
      headTexture: PALETTES.p1.head,
      bodyTexture: PALETTES.p1.body,
      color: PALETTES.p1.color,
      css: PALETTES.p1.css,
      label: PALETTES.p1.label,
      name: PALETTES.p1.name,
      x: isDual ? width * 0.25 : width / 2,
      y: isDual ? height * 0.62 : height * 0.5,
      direction: DIRECTIONS.right,
    });

    this.snakes = [p1];

    if (isDual) {
      const p2 = new Snake(this, {
        headTexture: PALETTES.p2.head,
        bodyTexture: PALETTES.p2.body,
        color: PALETTES.p2.color,
        css: PALETTES.p2.css,
        label: PALETTES.p2.label,
        name: PALETTES.p2.name,
        x: width * 0.75,
        y: height * 0.38,
        direction: DIRECTIONS.left,
      });
      this.snakes.push(p2);
    }
  }

  clearRound() {
    this.time.removeAllEvents();
    this.roundId += 1;

    this.snakes.forEach((snake) => snake.destroy());
    this.snakes = [];

    if (this.balls) {
      this.balls.getChildren().slice().forEach((ball) => {
        this.tweens.killTweensOf(ball);
      });
      this.balls.clear(true, true);
    }

    this.removePickup(true);

    this.floatingTexts.forEach((text) => {
      this.tweens.killTweensOf(text);
      text.destroy();
    });
    this.floatingTexts = [];

    this.confetti?.killAll();
    this.pickup = null;
    this.pickupTimer = 5;
  }

  togglePause() {
    if (this.state === 'playing') {
      this.pauseGame();
    } else if (this.state === 'paused') {
      this.resumeGame();
    }
  }

  pauseGame() {
    portal.gameplayStop();
    portal.hideBanner();
    portal.onScreen('paused');
    this.state = 'paused';
    this.physics.world.pause();
    this.time.paused = true;
    this.setPauseButtonVisible(false);
    this.resetJoysticks();
    this.hideTouchHint();
    this.setScreenVisible(this.pauseScreen, true);
    this.sfx.pause();
  }

  resumeGame() {
    this.sfx.unlock();
    portal.onScreen('playing');
    this.state = 'playing';
    this.setScreenVisible(this.pauseScreen, false);
    this.setHudVisible(true);
    this.setPauseButtonVisible(true);
    this.resetJoysticks();
    this.physics.world.resume();
    this.time.paused = false;
    portal.gameplayStart();
    this.sfx.resume();
  }

  handleDeath(deaths) {
    if (this.state !== 'playing') {
      return;
    }

    portal.gameplayStop();
    portal.hideBanner();
    this.state = 'dying';
    this.physics.world.pause();
    this.setPauseButtonVisible(false);
    this.resetJoysticks();
    this.hideTouchHint();
    this.sfx.death();
    this.cameras.main.shake(240, 0.012);
    this.cameras.main.flash(100, 140, 30, 40);

    deaths.forEach((cause, snake) => {
      snake.alive = false;
      this.burst.setParticleTint(snake.color);
      this.burst.explode(30, snake.head.x, snake.head.y);
      snake.body.forEach((segment, index) => {
        if (index % 2 === 0) {
          this.burst.explode(2, segment.x, segment.y);
        }
      });
      this.ringBurst(snake.head.x, snake.head.y, snake.color, 3, 450);
      this.tweens.add({
        targets: [snake.head, snake.aura, ...snake.body],
        alpha: 0.15,
        duration: 650,
        ease: 'Quad.easeOut',
      });
    });

    const round = this.roundId;
    this.time.delayedCall(900, () => {
      if (this.roundId === round && this.state === 'dying') {
        this.endRound(deaths);
      }
    });
  }

  endRound(deaths) {
    this.state = 'gameover';
    this.setHudVisible(false);
    this.setPauseButtonVisible(false);
    this.resetJoysticks();

    this.tweens.killTweensOf(this.newHighScoreText);
    this.newHighScoreText.setVisible(false).setScale(1);
    this.gameOverScore.setVisible(false);
    this.dualScoreP1.setVisible(false);
    this.dualScoreP2.setVisible(false);
    this.gameOverBest.setVisible(false);

    if (this.mode === 1) {
      const snake = this.snakes[0];
      const score = snake.score;
      const isRecord = score > this.best;

      if (isRecord) {
        this.best = score;
        this.saveBest(score);
        this.startBest.setText(`BEST  ${this.best}`);
      }

      this.gameOverTitle.setText('GAME OVER').setColor('#f87171');
      this.gameOverCause.setText(this.describeCause(deaths.get(snake)));
      this.gameOverScore.setText(`SCORE  ${score}`).setVisible(true);
      this.gameOverBest.setText(`BEST  ${this.best}`).setVisible(true);

      if (isRecord) {
        this.newHighScoreText.setVisible(true).setScale(0.5);
        this.tweens.add({
          targets: this.newHighScoreText,
          scale: 1,
          duration: 350,
          ease: 'Back.easeOut',
        });
        this.celebrateConfetti();
        this.sfx.win();
        portal.happytime();
      }
    } else {
      const deadSnakes = this.snakes.filter((snake) => deaths.has(snake));
      const aliveSnakes = this.snakes.filter((snake) => !deaths.has(snake));

      this.dualScoreP1
        .setText(`P1  ${this.snakes[0].score}`)
        .setVisible(true);
      this.dualScoreP2
        .setText(`P2  ${this.snakes[1].score}`)
        .setVisible(true);

      const [p1, p2] = this.snakes;
      let winner = null;

      if (p1.score > p2.score) {
        winner = p1;
      } else if (p2.score > p1.score) {
        winner = p2;
      } else if (aliveSnakes.length === 1) {
        winner = aliveSnakes[0];
      }

      if (winner) {
        this.gameOverTitle.setText(`${winner.name} WINS`).setColor(winner.css);
        const crash =
          deadSnakes.length === 1
            ? this.describeCause(
                deaths.get(deadSnakes[0]),
                deadSnakes[0],
                winner,
              )
            : 'Head-on collision.';
        const note =
          p1.score === p2.score
            ? 'TIE — SURVIVOR WINS'
            : 'HIGHER SCORE WINS';
        this.gameOverCause.setText(`${crash}\n${note}`);
        this.celebrateConfetti();
        this.sfx.win();
      } else {
        this.gameOverTitle.setText('DRAW').setColor('#e2e8f0');
        this.gameOverCause.setText('Both snakes went down.');
      }
    }

    this.setGameOverVisible(true);
    this.layout();
    this.handleRoundEndAds();
  }

  describeCause(cause, loser = null, other = null) {
    const prefix = loser ? `${loser.label} ` : 'You ';
    switch (cause) {
      case 'wall':
        return `${prefix}hit the wall.`;
      case 'self':
        return loser
          ? `${loser.label} bit its own tail.`
          : 'You bit your own tail.';
      case 'other':
        return other
          ? `${loser.label} crashed into ${other.label}.`
          : `${prefix}crashed into the other snake.`;
      case 'headon':
        return 'Head-on collision.';
      default:
        return '';
    }
  }

  update(time, delta) {
    if (this.state !== 'playing') {
      return;
    }

    this.roundActiveMs += Math.max(0, delta);
    const dt = Math.min(delta, 50) / 1000;

    this.snakes.forEach((snake) => snake.update(dt));
    this.updateBalls(dt);
    this.updatePickupSystem(dt);
    this.updateHudEffects();
    this.checkDeaths();
  }

  updateBalls(dt) {
    const slowedSnakes = this.snakes.filter(
      (snake) => snake.hasPowerup('slow'),
    );
    const magnetSnakes = this.snakes.filter(
      (snake) => snake.hasPowerup('magnet'),
    );

    const balls = this.balls.getChildren().slice();

    for (const ball of balls) {
      if (!ball.active || !ball.body) {
        continue;
      }

      const info = ball.ballInfo;
      let speed = info.speed;

      for (const snake of slowedSnakes) {
        if (
          Phaser.Math.Distance.Between(
            ball.x,
            ball.y,
            snake.head.x,
            snake.head.y,
          ) < SLOW_RADIUS
        ) {
          speed *= SLOW_FACTOR;
          break;
        }
      }

      let magnet = null;
      let magnetDistance = MAGNET_RADIUS;
      for (const snake of magnetSnakes) {
        const distance = Phaser.Math.Distance.Between(
          ball.x,
          ball.y,
          snake.head.x,
          snake.head.y,
        );
        if (distance < magnetDistance) {
          magnetDistance = distance;
          magnet = snake;
        }
      }

      if (magnet) {
        const direction = new Phaser.Math.Vector2(
          magnet.head.x - ball.x,
          magnet.head.y - ball.y,
        );
        if (direction.lengthSq() > 0.01) {
          direction.normalize();
          const current = new Phaser.Math.Vector2(
            ball.body.velocity.x,
            ball.body.velocity.y,
          );
          if (current.lengthSq() < 0.01) {
            current.copy(direction);
          } else {
            current.normalize();
          }
          current.lerp(direction, Math.min(1, 6 * dt)).normalize();
          ball.setVelocity(current.x * speed, current.y * speed);
        }
      } else if (ball.body.velocity.lengthSq() > 0.01) {
        ball.body.velocity.normalize().scale(speed);
      }

      ball.currentSpeed = speed;

      if (info.type === 'bonus' || info.type === 'power') {
        ball.rotation += dt * (info.type === 'bonus' ? 0.9 : 1.6);
      }

      if (this.tryEatBall(ball)) {
        continue;
      }
      this.tryBounceBall(ball);
    }
  }

  tryEatBall(ball) {
    for (const snake of this.snakes) {
      if (!snake.alive) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(
        ball.x,
        ball.y,
        snake.head.x,
        snake.head.y,
      );

      if (distance < snake.headRadius + ball.ballInfo.radius) {
        this.eatBall(ball, snake);
        return true;
      }
    }

    return false;
  }

  tryBounceBall(ball) {
    for (const snake of this.snakes) {
      if (!snake.alive) {
        continue;
      }

      for (const segment of snake.body) {
        const segmentRadius = snake.segmentRadius * (segment.taper ?? 1);
        const minimumDistance = segmentRadius + ball.ballInfo.radius;
        const dx = ball.x - segment.x;
        const dy = ball.y - segment.y;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq >= minimumDistance * minimumDistance) {
          continue;
        }

        let nx = dx;
        let ny = dy;
        let distance = Math.sqrt(distanceSq);

        if (distance < 0.001) {
          const angle = Math.random() * Math.PI * 2;
          nx = Math.cos(angle);
          ny = Math.sin(angle);
          distance = 1;
        }

        nx /= distance;
        ny /= distance;

        const velocity = ball.body.velocity;
        const dot = velocity.x * nx + velocity.y * ny;
        let vx = velocity.x - 2 * dot * nx;
        let vy = velocity.y - 2 * dot * ny;
        const speed = ball.currentSpeed || ball.ballInfo.speed;
        const length = Math.hypot(vx, vy) || 1;

        ball.setPosition(
          segment.x + nx * (minimumDistance + 1),
          segment.y + ny * (minimumDistance + 1),
        );
        ball.setVelocity((vx / length) * speed, (vy / length) * speed);

        this.burst.setParticleTint(0xffffff);
        this.burst.explode(5, ball.x, ball.y);
        this.sfx.bounce();
        return true;
      }
    }

    return false;
  }

  eatBall(ball, snake) {
    const info = ball.ballInfo;
    const index = this.snakes.indexOf(snake);
    const doubled = snake.hasPowerup('double');
    const points = info.points * (doubled ? 2 : 1);

    snake.score += points;
    snake.grow(info.growth);
    snake.chomp();
    this.updateScore(index);

    this.showFloat(ball.x, ball.y - 8, `+${points}`, snake.css, 16);
    this.burst.setParticleTint(info.color);
    this.burst.explode(info.type === 'bonus' ? 26 : 14, ball.x, ball.y);

    if (info.type === 'power') {
      this.grantRandomPowerup(snake, ball.x, ball.y);
    } else {
      this.sfx.eat(info.sound);
    }

    this.tweens.killTweensOf(ball);
    this.balls.remove(ball, true, true);

    const round = this.roundId;
    this.time.delayedCall(450 + Phaser.Math.Between(0, 300), () => {
      if (this.roundId === round && this.state === 'playing') {
        this.spawnBall();
      }
    });
  }

  updatePickupSystem(dt) {
    if (this.pickup) {
      for (const snake of this.snakes) {
        if (!snake.alive) {
          continue;
        }

        const distance = Phaser.Math.Distance.Between(
          snake.head.x,
          snake.head.y,
          this.pickup.container.x,
          this.pickup.container.y,
        );

        if (distance < snake.headRadius + PICKUP_RADIUS) {
          this.collectPickup(snake);
          return;
        }
      }

      this.pickup.lifetime -= dt;
      this.pickup.container.setAlpha(
        Math.max(0.25, Math.min(1, this.pickup.lifetime / 2)),
      );

      if (this.pickup.lifetime <= 0) {
        this.removePickup();
      }
      return;
    }

    this.pickupTimer -= dt;
    if (this.pickupTimer <= 0) {
      this.spawnPickup();
    }
  }

  spawnPickup() {
    if (this.pickup || this.snakes.length === 0) {
      return;
    }

    const type = Phaser.Utils.Array.GetRandom(POWERUP_TYPES);
    const definition = POWERUPS[type];
    const position = this.randomPickupPosition();
    const container = this.add.container(position.x, position.y).setDepth(18);

    const ring = this.add
      .image(0, 0, 'power-ring')
      .setTint(definition.color)
      .setAlpha(0.9)
      .setScale(1 / this.renderDpr);
    const orb = this.add.image(0, 0, 'power-orb').setTint(definition.color).setScale(1 / this.renderDpr);
    const icon = this.add
      .image(0, 0, POWER_ICONS[type])
      .setDisplaySize(30, 30)
      .setTint(0xffffff);

    container.add([ring, orb, icon]);

    this.tweens.add({
      targets: container,
      scale: 1.12,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: ring,
      angle: 360,
      duration: 5000,
      repeat: -1,
    });

    this.pickup = { type, container, lifetime: PICKUP_LIFETIME };
  }

  collectPickup(snake) {
    if (!this.pickup) {
      return;
    }

    const type = this.pickup.type;
    const { x, y } = this.pickup.container;

    this.removePickup(true);
    this.grantPowerup(snake, type, x, y);
    this.pickupTimer = Phaser.Math.FloatBetween(7, 12);
  }

  removePickup(silent = false) {
    if (!this.pickup) {
      return;
    }

    const { container } = this.pickup;
    this.tweens.killTweensOf(container);
    container.list.forEach((child) => this.tweens.killTweensOf(child));
    container.destroy();
    this.pickup = null;

    if (!silent) {
      this.pickupTimer = Phaser.Math.FloatBetween(6, 10);
    }
  }

  grantPowerup(snake, type, x, y) {
    const definition = POWERUPS[type];
    const result = snake.applyPowerup(type);
    this.sfx.powerup();
    this.burst.setParticleTint(definition.color);
    this.burst.explode(result.stacked ? 28 : 20, x, y);
    this.ringBurst(x, y, definition.color, 2, 400);
    this.showFloat(
      x,
      y - 28,
      result.stacked
        ? `${definition.label} ×${result.stacks}`
        : `${definition.label}!`,
      definition.css,
      16,
    );
    this.updateEffectText(this.snakes.indexOf(snake));
  }

  grantRandomPowerup(snake, x, y) {
    const type = Phaser.Utils.Array.GetRandom(POWERUP_TYPES);
    this.grantPowerup(snake, type, x, y);
  }

  spawnInitialBalls() {
    const count = this.mode === 2 ? 10 : 8;
    for (let i = 0; i < count; i += 1) {
      this.spawnBall();
    }
  }

  spawnBall(typeName = null) {
    if (this.state !== 'playing') {
      return null;
    }

    const type = typeName || this.rollBallType();
    const info = BALL_TYPES[type];
    const position = this.randomBallPosition();

    const ball = this.balls.create(position.x, position.y, info.texture);
    ball.setDepth(9);
    ball.ballInfo = { ...info, type };
    ball.currentSpeed = info.speed;

    ball.setBounce(1);
    ball.setCollideWorldBounds(true);
    const S = this.renderDpr;
    ball.body.setCircle(
      info.radius * S,
      ball.width / 2 - info.radius * S,
      ball.height / 2 - info.radius * S,
    );

    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    ball.setVelocity(Math.cos(angle) * info.speed, Math.sin(angle) * info.speed);

    ball.setScale(0.15 / S);
    this.tweens.add({
      targets: ball,
      scale: 1 / S,
      duration: 280,
      ease: 'Back.easeOut',
    });

    this.ringBurst(position.x, position.y, info.color, 1.6, 320);
    return ball;
  }

  rollBallType() {
    const entries = Object.entries(BALL_TYPES);
    const total = entries.reduce((sum, [, info]) => sum + info.weight, 0);
    let roll = Math.random() * total;

    for (const [type, info] of entries) {
      roll -= info.weight;
      if (roll <= 0) {
        return type;
      }
    }

    return 'normal';
  }

  randomBallPosition() {
    const margin = 44;
    const maxX = Math.max(margin + 1, this.viewWidth - margin);
    const maxY = Math.max(margin + 1, this.viewHeight - margin);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const x = Phaser.Math.Between(margin, maxX);
      const y = Phaser.Math.Between(margin, maxY);

      if (!this.isClearOfSnakes(x, y, 100, 60)) {
        continue;
      }
      if (this.pickup) {
        const pickupDistance = Phaser.Math.Distance.Between(
          x,
          y,
          this.pickup.container.x,
          this.pickup.container.y,
        );
        if (pickupDistance < 60) {
          continue;
        }
      }
      if (this.balls.getChildren().some((ball) => (
        Phaser.Math.Distance.Between(x, y, ball.x, ball.y) < 40
      ))) {
        continue;
      }

      return { x, y };
    }

    return {
      x: Phaser.Math.Between(margin, maxX),
      y: Phaser.Math.Between(margin, maxY),
    };
  }

  randomPickupPosition() {
    const margin = 70;
    const maxX = Math.max(margin + 1, this.viewWidth - margin);
    const maxY = Math.max(margin + 1, this.viewHeight - margin);

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const x = Phaser.Math.Between(margin, maxX);
      const y = Phaser.Math.Between(margin, maxY);

      if (!this.isClearOfSnakes(x, y, 130, 70)) {
        continue;
      }
      if (this.isInPadZone(x, y)) {
        continue;
      }
      if (this.balls.getChildren().some((ball) => (
        Phaser.Math.Distance.Between(x, y, ball.x, ball.y) < 40
      ))) {
        continue;
      }

      return { x, y };
    }

    return {
      x: Phaser.Math.Between(margin, maxX),
      y: Phaser.Math.Between(margin, maxY),
    };
  }

  isClearOfSnakes(x, y, headClearance, bodyClearance) {
    for (const snake of this.snakes) {
      if (
        Phaser.Math.Distance.Between(x, y, snake.head.x, snake.head.y) <
        headClearance
      ) {
        return false;
      }

      for (const segment of snake.body) {
        if (
          Phaser.Math.Distance.Between(x, y, segment.x, segment.y) <
          bodyClearance
        ) {
          return false;
        }
      }
    }

    return true;
  }

  isInPadZone(x, y) {
    if (y < this.viewHeight - 175) {
      return false;
    }

    if (this.mode === 2) {
      return x < 175 || x > this.viewWidth - 175;
    }

    return x > this.viewWidth - 175;
  }

  updateScore(index) {
    const snake = this.snakes[index];
    if (!snake || !this.scoreTexts[index]) {
      return;
    }
    this.scoreTexts[index].setText(String(snake.score));
  }

  updateScores() {
    this.snakes.forEach((snake, index) => this.updateScore(index));
  }

  configureHudForMode() {
    if (this.mode === 2) {
      this.playerLabels[0].setText('P1').setColor(PALETTES.p1.css);
      this.playerLabels[1].setText('P2').setColor(PALETTES.p2.css).setVisible(true);
      this.scoreTexts[0].setColor('#f8fafc');
      this.scoreTexts[1].setColor(PALETTES.p2.css).setVisible(true);
      this.bestText.setVisible(false);
      this.powerupPanels[0].container.setVisible(false);
      this.powerupPanels[1].container.setVisible(false);
    } else {
      this.playerLabels[0].setText('SCORE').setColor('#94a3b8');
      this.playerLabels[1].setVisible(false);
      this.scoreTexts[0].setColor('#f8fafc');
      this.scoreTexts[1].setVisible(false);
      this.bestText.setText(`BEST ${this.best}`).setVisible(true);
      this.powerupPanels[1].container.setVisible(false);
    }
  }

  clearEffectTexts() {
    this.powerupPanels.forEach((panel) => {
      panel.container.setVisible(false);
      panel.chips.forEach((chip) => {
        chip.setVisible(false);
        chip.chipType = null;
      });
    });
  }

  updateEffectText(index) {
    const panel = this.powerupPanels[index];
    const snake = this.snakes[index];

    if (
      !panel ||
      !this.hudVisible ||
      (this.mode === 1 && index > 0) ||
      !snake
    ) {
      if (panel) {
        panel.container.setVisible(false);
      }
      return;
    }

    this.updatePowerupPanel(panel, snake.getPowerups());
  }

  updateHudEffects() {
    if (!this.hudVisible) {
      return;
    }
    this.snakes.forEach((snake, index) => this.updateEffectText(index));
    if (this.mode === 1 && this.powerupPanels[1]) {
      this.powerupPanels[1].container.setVisible(false);
    }
  }

  setHudVisible(visible) {
    this.hudVisible = visible;
    this.hudGraphics.setVisible(visible);
    this.playerLabels.forEach((label, index) => {
      label.setVisible(visible && (index === 0 || this.mode === 2));
    });
    this.scoreTexts.forEach((text, index) => {
      text.setVisible(visible && (index === 0 || this.mode === 2));
    });
    this.bestText.setVisible(visible && this.mode === 1);

    if (!visible) {
      this.powerupPanels.forEach((panel) => {
        panel.container.setVisible(false);
      });
      this.setPauseButtonVisible(false);
    }
  }

  setPauseButtonVisible(visible) {
    this.pauseButton.setVisible(visible);
    if (this.pauseButton.input) {
      this.pauseButton.input.enabled = visible;
    }
    if (!visible) {
      this.pauseButton.resetButtonVisual?.();
    }
  }

  setScreenVisible(screen, visible) {
    screen.setVisible(visible);
    screen.list.forEach((child) => {
      if (child.input) {
        child.input.enabled = visible;
      }
      if (!visible) {
        child.resetButtonVisual?.();
      }
    });
  }

  setGameOverVisible(visible) {
    this.setScreenVisible(this.gameOverScreen, visible);
    this.setScreenVisible(this.gameOverText, visible);
  }

  showFloat(x, y, message, color, size = 16) {
    const text = this.add.text(x, y, message, {
      fontFamily: UI_FONT,
      fontSize: `${size}px`,
      color,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(40);

    text.setStroke('#0f172a', 3);
    this.floatingTexts.push(text);

    this.tweens.add({
      targets: text,
      y: y - 34,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.floatingTexts = this.floatingTexts.filter((entry) => entry !== text);
        text.destroy();
      },
    });
  }

  ringBurst(x, y, color, toScale = 1.6, duration = 320) {
    const ring = this.add
      .image(x, y, 'ring')
      .setDepth(34)
      .setTint(color)
      .setAlpha(0.9)
      .setScale(0.25 / this.renderDpr);

    this.tweens.add({
      targets: ring,
      scale: toScale / this.renderDpr,
      alpha: 0,
      duration,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  checkDeaths() {
    const deaths = new Map();
    const width = this.viewWidth;
    const height = this.viewHeight;

    const addDeath = (snake, cause) => {
      if (!deaths.has(snake)) {
        deaths.set(snake, cause);
      }
    };

    for (const snake of this.snakes) {
      if (!snake.alive) {
        continue;
      }

      if (snake.hitsWall(width, height)) {
        addDeath(snake, 'wall');
      }
      if (!snake.isPhased() && snake.hitsOwnBody()) {
        addDeath(snake, 'self');
      }
    }

    if (this.snakes.length === 2) {
      const [a, b] = this.snakes;

      if (a.alive && b.alive && !a.isPhased() && !b.isPhased()) {
        if (a.headHitsHead(b)) {
          addDeath(a, 'headon');
          addDeath(b, 'headon');
        } else {
          if (a.headHitsBody(b)) {
            addDeath(a, 'other');
          }
          if (b.headHitsBody(a)) {
            addDeath(b, 'other');
          }
        }
      }
    }

    if (deaths.size > 0) {
      this.handleDeath(deaths);
    }
  }

  layout() {
    const width = this.viewWidth;
    const height = this.viewHeight;
    const cx = width / 2;
    const cy = height / 2;
    const u = getUiScale(width, height);
    this.uiScale = u;
    const compact = height < 520;
    const horizontal = width > height;
    const margin = Math.max(10, 12 * u);

    if (this.arenaGraphics) {
      const g = this.arenaGraphics;
      g.clear();
      g.fillGradientStyle(0x08111f, 0x08111f, 0x050a12, 0x050a12, 1);
      g.fillRect(0, 0, width, height);
      g.fillStyle(0x38bdf8, 0.035);
      g.fillCircle(cx, cy, Math.max(width, height) * 0.55);
      g.fillStyle(0x1e293b, 0.45);
      const spacing = 34 * u;
      for (let x = spacing / 2; x < width; x += spacing) {
        for (let y = spacing / 2; y < height; y += spacing) {
          g.fillCircle(x, y, 0.9);
        }
      }
      g.lineStyle(1, 0x2a3a50, 0.55);
      g.strokeRoundedRect(5, 5, width - 10, height - 10, 18);
      if (this.mode === 2 && this.isTouchDevice) {
        g.lineStyle(1, 0x475569, 0.35);
        g.lineBetween(cx, 12, cx, height - 12);
      }
    }

    const hudH = 54 * u;
    const panelW = (this.mode === 2 ? 136 : 160) * u;
    const px = margin;
    const py = margin;

    this.hudGraphics.clear();
    this.hudGraphics.fillStyle(0x0b1626, 0.9);
    this.hudGraphics.fillRoundedRect(px, py, panelW, hudH, 14 * u);
    this.hudGraphics.lineStyle(1.2, PALETTES.p1.color, 0.45);
    this.hudGraphics.strokeRoundedRect(px, py, panelW, hudH, 14 * u);
    this.hudGraphics.fillStyle(PALETTES.p1.color, 0.9);
    this.hudGraphics.fillRoundedRect(px + 1.5 * u, py + 10 * u, 3 * u, hudH - 20 * u, 1.5 * u);

    if (this.mode === 2) {
      const p2x = width - margin - panelW;
      this.hudGraphics.fillStyle(0x0b1626, 0.9);
      this.hudGraphics.fillRoundedRect(p2x, py, panelW, hudH, 14 * u);
      this.hudGraphics.lineStyle(1.2, PALETTES.p2.color, 0.45);
      this.hudGraphics.strokeRoundedRect(p2x, py, panelW, hudH, 14 * u);
      this.hudGraphics.fillStyle(PALETTES.p2.color, 0.9);
      this.hudGraphics.fillRoundedRect(p2x + panelW - 4.5 * u, py + 10 * u, 3 * u, hudH - 20 * u, 1.5 * u);
    } else {
      const bestW = 128 * u;
      const bx = width - margin - bestW;
      this.hudGraphics.fillStyle(0x0b1626, 0.82);
      this.hudGraphics.fillRoundedRect(bx, py, bestW, 30 * u, 10 * u);
      this.hudGraphics.lineStyle(1, 0xfbbf24, 0.35);
      this.hudGraphics.strokeRoundedRect(bx, py, bestW, 30 * u, 10 * u);
      this.bestText.setPosition(bx + bestW - 12 * u, py + 10 * u).setFontSize(Math.max(9, 10 * u));
    }

    this.pauseButton.setPosition(cx, py + 20 * u).setScale(u);
    this.pauseButton.baseScale = u;

    this.playerLabels[0]
      .setPosition(px + 13 * u, py + 9 * u)
      .setFontSize(Math.max(8, 9.5 * u));
    this.scoreTexts[0]
      .setPosition(px + 13 * u, py + 22 * u)
      .setFontSize(Math.max(18, 23 * u));

    if (this.mode === 2) {
      const p2x = width - margin - panelW;
      this.playerLabels[1]
        .setPosition(p2x + panelW - 13 * u, py + 9 * u)
        .setFontSize(Math.max(8, 9.5 * u));
      this.scoreTexts[1]
        .setPosition(p2x + panelW - 13 * u, py + 22 * u)
        .setFontSize(Math.max(18, 23 * u));
    }

    this.powerupPanels.forEach((panel, index) => {
      const pw = panel.width * u;
      const x = index === 0 ? margin : width - margin - pw;
      const y = py + hudH + 10 * u;
      panel.container.setPosition(x, y).setScale(u);
    });

    this.touchHintText.setPosition(cx, height - 22 * u).setFontSize(Math.max(9, 10 * u));

    this.startBg.clear();
    this.startBg.fillGradientStyle(0x0b1626, 0x0b1626, 0x050a12, 0x050a12, 1);
    this.startBg.fillRect(0, 0, width, height);
    this.startBg.fillStyle(0x38bdf8, 0.05);
    this.startBg.fillCircle(cx, cy, Math.min(width, height) * 0.72);
    this.startBg.fillStyle(0xf472b6, 0.035);
    this.startBg.fillCircle(width * 0.8, height * 0.16, Math.min(width, height) * 0.4);
    this.startBg.fillStyle(0x1e293b, 0.35);
    const startSpacing = 40 * u;
    for (let x = startSpacing / 2; x < width; x += startSpacing) {
      for (let y = startSpacing / 2; y < height; y += startSpacing) {
        this.startBg.fillCircle(x, y, 0.9);
      }
    }

    const startPanelW = Math.min(width - 24, 560 * u);
    const startPanelH = Math.min(height - 24, 340 * u);
    const startTop = cy - startPanelH / 2;

    this.startPanel.clear();
    this.startPanel.fillStyle(0x0b1626, 0.95);
    this.startPanel.fillRoundedRect(cx - startPanelW / 2, startTop, startPanelW, startPanelH, 24 * u);
    this.startPanel.lineStyle(1.2, 0x38bdf8, 0.28);
    this.startPanel.strokeRoundedRect(cx - startPanelW / 2, startTop, startPanelW, startPanelH, 24 * u);
    this.startPanel.fillStyle(0x38bdf8, 0.5);
    this.startPanel.fillRoundedRect(cx - startPanelW / 2 + 24 * u, startTop + 1.5 * u, startPanelW - 48 * u, 2 * u, 1 * u);

    const titleSize = Math.min(46 * u, (startPanelW - 40) / 9);
    this.startTitle.setFontSize(titleSize).setPosition(cx, startTop + 54 * u);
    this.startSubtitle.setFontSize(Math.max(8, 10.5 * u)).setPosition(cx, startTop + 92 * u);
    this.startBest.setFontSize(Math.max(9, 10.5 * u)).setPosition(cx, startTop + 116 * u);

    const cardW = 180 * u;
    const cardH = 64 * u;
    const cardGap = 14 * u;
    const cardsHorizontal = horizontal && (cardW * 2 + cardGap <= startPanelW - 48 * u);

    this.startPlay1.setScale(u);
    this.startPlay2.setScale(u);
    this.startPlay1.baseScale = u;
    this.startPlay2.baseScale = u;

    if (cardsHorizontal) {
      const cardY = startTop + 166 * u;
      this.startPlay1.setPosition(cx - cardW / 2 - cardGap / 2, cardY);
      this.startPlay2.setPosition(cx + cardW / 2 + cardGap / 2, cardY);
    } else {
      this.startPlay1.setPosition(cx, startTop + 166 * u);
      this.startPlay2.setPosition(cx, startTop + 166 * u + cardH + 10 * u);
    }

    const chipY = cardsHorizontal ? startTop + 232 * u : startTop + 306 * u;
    const chipGap = 6 * u;
    const chipWidths = this.startLegendChips.map((chip) => chip.chipWidth * u);
    const totalChipWidth = chipWidths.reduce((sum, w) => sum + w, 0) + chipGap * (chipWidths.length - 1);
    let chipX = cx - totalChipWidth / 2;
    this.startLegendChips.forEach((chip, index) => {
      chip.setScale(u);
      chip.setPosition(chipX + chipWidths[index] / 2, chipY);
      chipX += chipWidths[index] + chipGap;
    });

    this.startHint.setFontSize(Math.max(8, 10 * u)).setPosition(cx, chipY + 26 * u);

    this.pauseBg.clear();
    this.pauseBg.fillStyle(0x050a12, 0.72);
    this.pauseBg.fillRect(0, 0, width, height);

    const pauseW = Math.min(width - 32, 380 * u);
    const pauseH = Math.min(height - 32, 280 * u);
    this.pausePanel.clear();
    this.pausePanel.fillStyle(0x0b1626, 0.98);
    this.pausePanel.fillRoundedRect(cx - pauseW / 2, cy - pauseH / 2, pauseW, pauseH, 22 * u);
    this.pausePanel.lineStyle(1.2, 0x38bdf8, 0.4);
    this.pausePanel.strokeRoundedRect(cx - pauseW / 2, cy - pauseH / 2, pauseW, pauseH, 22 * u);
    this.pausePanel.fillStyle(0x38bdf8, 0.55);
    this.pausePanel.fillRoundedRect(cx - pauseW / 2 + 22 * u, cy - pauseH / 2 + 1.5 * u, pauseW - 44 * u, 2 * u, 1 * u);

    this.pauseTitle.setPosition(cx, cy - 76 * u).setFontSize(Math.max(22, 30 * u));
    this.pauseResumeButton.setScale(u).setPosition(cx, cy - 12 * u);
    this.pauseResumeButton.baseScale = u;
    this.pauseRestartButton.setScale(u).setPosition(cx, cy + 48 * u);
    this.pauseRestartButton.baseScale = u;
    this.pauseHint.setPosition(cx, cy + 102 * u).setFontSize(Math.max(8, 10 * u));

    this.gameOverBg.clear();
    this.gameOverBg.fillStyle(0x050a12, 0.78);
    this.gameOverBg.fillRect(0, 0, width, height);

    const goW = Math.min(width - 24, 460 * u);
    const goH = Math.min(height - 24, 320 * u);
    const goTop = cy - goH / 2;
    this.gameOverPanel.clear();
    this.gameOverPanel.fillStyle(0x0b1626, 0.98);
    this.gameOverPanel.fillRoundedRect(cx - goW / 2, goTop, goW, goH, 22 * u);
    this.gameOverPanel.lineStyle(1.2, 0x94a3b8, 0.25);
    this.gameOverPanel.strokeRoundedRect(cx - goW / 2, goTop, goW, goH, 22 * u);
    this.gameOverPanel.fillStyle(0x38bdf8, 0.45);
    this.gameOverPanel.fillRoundedRect(cx - goW / 2 + 22 * u, goTop + 1.5 * u, goW - 44 * u, 2 * u, 1 * u);

    const goTitleSize = Math.min(34 * u, (goW - 36) / 8.4);
    this.gameOverTitle.setFontSize(goTitleSize).setPosition(cx, goTop + 44 * u);
    this.gameOverCause.setPosition(cx, goTop + 82 * u).setFontSize(Math.max(8, 10.5 * u));
    this.newHighScoreText.setPosition(cx, goTop + 108 * u).setFontSize(Math.max(12, 16 * u));
    this.gameOverScore.setPosition(cx, goTop + 145 * u).setFontSize(Math.max(18, 24 * u));
    this.dualScoreP1.setPosition(cx - 16 * u, goTop + 148 * u).setFontSize(Math.max(15, 19 * u));
    this.dualScoreP2.setPosition(cx + 16 * u, goTop + 148 * u).setFontSize(Math.max(15, 19 * u));
    this.gameOverBest.setPosition(cx, goTop + 180 * u).setFontSize(Math.max(8, 10.5 * u));

    this.playAgainButton.setScale(u).setPosition(cx, goTop + 220 * u);
    this.playAgainButton.baseScale = u;
    this.menuButton.setScale(u).setPosition(cx, goTop + 274 * u);
    this.menuButton.baseScale = u;

    this.lastWidth = width;
    this.lastHeight = height;
  }


  handleResize() {
    const width = this.scale.width / this.renderDpr;
    const height = this.scale.height / this.renderDpr;
    const oldWidth = this.lastWidth;
    const oldHeight = this.lastHeight;

    if (
      oldWidth > 0 &&
      oldHeight > 0 &&
      (width !== oldWidth || height !== oldHeight) &&
      this.snakes.length > 0
    ) {
      const rx = width / oldWidth;
      const ry = height / oldHeight;

      this.snakes.forEach((snake) => {
        snake.head.setPosition(snake.head.x * rx, snake.head.y * ry);
        snake.aura.setPosition(snake.head.x, snake.head.y);
        snake.body.forEach((segment) => {
          segment.setPosition(segment.x * rx, segment.y * ry);
        });
      });

      this.balls.getChildren().forEach((ball) => {
        ball.setPosition(ball.x * rx, ball.y * ry);
      });

      if (this.pickup) {
        this.pickup.container.setPosition(
          this.pickup.container.x * rx,
          this.pickup.container.y * ry,
        );
      }
    }

    this.viewWidth = width;
    this.viewHeight = height;
    this.uiScale = getUiScale(width, height);
    this.cameras.main.setZoom(this.renderDpr);
    this.cameras.main.centerOn(width / 2, height / 2);
    this.physics.world.setBounds(0, 0, width, height);
    this.resetJoysticks();
    this.layout();
  }

  loadBest() {
    try {
      const value = Number.parseInt(
        window.localStorage.getItem(BEST_KEY) ?? '0',
        10,
      );
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  saveBest(value) {
    try {
      window.localStorage.setItem(BEST_KEY, String(value));
    } catch {
      return;
    }
  }

  makeTextures() {
    if (this.textures.exists('head-p1')) {
      return;
    }

    this.makeHeadTexture('head-p1', 0x38bdf8, 0x0284c7);
    this.makeHeadTexture('head-p2', 0xf472b6, 0xdb2777);
    this.makeBodyTexture('body-p1', 0x38bdf8, 0x0284c7);
    this.makeBodyTexture('body-p2', 0xf472b6, 0xdb2777);
    this.makeBallTextures();
    this.makeUtilityTextures();
  }

  makeHeadTexture(key, color, dark) {
    const S = this.renderDpr;
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    graphics.fillStyle(color, 1);
    graphics.fillCircle(24, 24, 17);
    graphics.lineStyle(3, dark, 1);
    graphics.strokeCircle(24, 24, 17);

    graphics.fillStyle(0xffffff, 0.18);
    graphics.fillCircle(18, 17, 6);

    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(33, 16, 5);
    graphics.fillCircle(33, 32, 5);

    graphics.fillStyle(0x070d17, 1);
    graphics.fillCircle(35, 16, 2.4);
    graphics.fillCircle(35, 32, 2.4);

    graphics.fillStyle(0x070d17, 1);
    graphics.fillTriangle(36, 20, 36, 28, 43, 24);

    graphics.setScale(S);
    graphics.generateTexture(key, 48 * S, 48 * S);
    graphics.destroy();
  }

  makeBodyTexture(key, color, dark) {
    const S = this.renderDpr;
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    graphics.fillStyle(color, 1);
    graphics.fillCircle(16, 16, 11);
    graphics.lineStyle(2, dark, 1);
    graphics.strokeCircle(16, 16, 11);
    graphics.fillStyle(0xffffff, 0.18);
    graphics.fillCircle(12.5, 12.5, 4);

    graphics.setScale(S);
    graphics.generateTexture(key, 32 * S, 32 * S);
    graphics.destroy();
  }

  makeBallTextures() {
    const S = this.renderDpr;
    const normal = this.make.graphics({ x: 0, y: 0, add: false });
    normal.fillStyle(0xfacc15, 1);
    normal.fillCircle(17, 17, 14);
    normal.lineStyle(2, 0xd97706, 1);
    normal.strokeCircle(17, 17, 14);
    normal.fillStyle(0xfef9c3, 0.9);
    normal.fillCircle(12, 12, 4);
    normal.setScale(S);
    normal.generateTexture('ball-normal', 34 * S, 34 * S);
    normal.destroy();

    const fast = this.make.graphics({ x: 0, y: 0, add: false });
    fast.fillStyle(0xfb923c, 1);
    fast.fillCircle(15, 15, 12);
    fast.lineStyle(2, 0xea580c, 1);
    fast.strokeCircle(15, 15, 12);
    fast.lineStyle(3, 0xfff7ed, 0.9);
    fast.lineBetween(9, 20, 20, 9);
    fast.fillStyle(0xfff7ed, 0.8);
    fast.fillCircle(11, 10, 2.5);
    fast.setScale(S);
    fast.generateTexture('ball-fast', 30 * S, 30 * S);
    fast.destroy();

    const bonus = this.make.graphics({ x: 0, y: 0, add: false });
    bonus.fillStyle(0xfbbf24, 1);
    bonus.fillTriangle(20, 3, 37, 20, 3, 20);
    bonus.fillTriangle(3, 20, 37, 20, 20, 37);
    bonus.lineStyle(2, 0xb45309, 1);
    bonus.lineBetween(20, 3, 37, 20);
    bonus.lineBetween(37, 20, 20, 37);
    bonus.lineBetween(20, 37, 3, 20);
    bonus.lineBetween(3, 20, 20, 3);
    bonus.fillStyle(0xfff7dc, 0.92);
    bonus.fillTriangle(20, 9, 23, 20, 17, 20);
    bonus.fillTriangle(17, 20, 23, 20, 20, 31);
    bonus.fillTriangle(9, 20, 20, 17, 20, 23);
    bonus.fillTriangle(20, 17, 31, 20, 20, 23);
    bonus.setScale(S);
    bonus.generateTexture('ball-bonus', 40 * S, 40 * S);
    bonus.destroy();

    const power = this.make.graphics({ x: 0, y: 0, add: false });
    power.fillStyle(0xa78bfa, 1);
    power.fillCircle(18, 18, 15);
    power.lineStyle(2, 0x7c3aed, 1);
    power.strokeCircle(18, 18, 15);
    power.lineStyle(2, 0xf5f3ff, 0.9);
    power.strokeCircle(18, 18, 10);
    power.fillStyle(0xffffff, 1);
    power.fillTriangle(18, 10, 21, 18, 15, 18);
    power.fillTriangle(15, 18, 21, 18, 18, 26);
    power.fillTriangle(10, 18, 18, 15, 18, 21);
    power.fillTriangle(18, 15, 26, 18, 18, 21);
    power.setScale(S);
    power.generateTexture('ball-power', 36 * S, 36 * S);
    power.destroy();
  }

  makeUtilityTextures() {
    const S = this.renderDpr;
    const ring = this.make.graphics({ x: 0, y: 0, add: false });
    ring.lineStyle(3, 0xffffff, 1);
    ring.strokeCircle(32, 32, 28);
    ring.setScale(S);
    ring.generateTexture('ring', 64 * S, 64 * S);
    ring.destroy();

    const aura = this.make.graphics({ x: 0, y: 0, add: false });
    aura.lineStyle(3, 0xffffff, 1);
    aura.strokeCircle(30, 30, 26);
    aura.lineStyle(1, 0xffffff, 0.5);
    aura.strokeCircle(30, 30, 20);
    aura.setScale(S);
    aura.generateTexture('aura', 60 * S, 60 * S);
    aura.destroy();

    const powerOrb = this.make.graphics({ x: 0, y: 0, add: false });
    powerOrb.fillStyle(0xffffff, 1);
    powerOrb.fillCircle(22, 22, 18);
    powerOrb.lineStyle(2, 0xffffff, 0.7);
    powerOrb.strokeCircle(22, 22, 12);
    powerOrb.setScale(S);
    powerOrb.generateTexture('power-orb', 44 * S, 44 * S);
    powerOrb.destroy();

    const powerRing = this.make.graphics({ x: 0, y: 0, add: false });
    powerRing.lineStyle(3, 0xffffff, 1);
    for (let i = 0; i < 4; i += 1) {
      const start = i * (Math.PI / 2) + 0.16;
      const end = start + Math.PI / 2 - 0.32;
      powerRing.beginPath();
      powerRing.arc(42, 42, 34, start, end);
      powerRing.strokePath();
    }
    powerRing.setScale(S);
    powerRing.generateTexture('power-ring', 84 * S, 84 * S);
    powerRing.destroy();

    const spark = this.make.graphics({ x: 0, y: 0, add: false });
    spark.fillStyle(0xffffff, 1);
    spark.fillRect(0, 0, 8, 8);
    spark.setScale(S);
    spark.generateTexture('spark', 8 * S, 8 * S);
    spark.destroy();

    const joystickBase = this.make.graphics({ x: 0, y: 0, add: false });
    joystickBase.fillStyle(0xffffff, 0.08);
    joystickBase.fillCircle(60, 60, 52);
    joystickBase.lineStyle(2, 0xffffff, 0.5);
    joystickBase.strokeCircle(60, 60, 52);
    joystickBase.lineStyle(1, 0xffffff, 0.2);
    joystickBase.strokeCircle(60, 60, 28);
    joystickBase.setScale(S);
    joystickBase.generateTexture('joystick-base', 120 * S, 120 * S);
    joystickBase.destroy();

    const joystickKnob = this.make.graphics({ x: 0, y: 0, add: false });
    joystickKnob.fillStyle(0xffffff, 0.9);
    joystickKnob.fillCircle(26, 26, 24);
    joystickKnob.lineStyle(2, 0xffffff, 1);
    joystickKnob.strokeCircle(26, 26, 24);
    joystickKnob.setScale(S);
    joystickKnob.generateTexture('joystick-knob', 52 * S, 52 * S);
    joystickKnob.destroy();
  }
}
