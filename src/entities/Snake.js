import * as Phaser from 'phaser';
import { POWERUPS } from '../powerups.js';

const HEAD_RADIUS = 15;
const SEGMENT_RADIUS = 11;
const SEGMENT_SPACING = 13;
const SPEED = 165;
const START_SEGMENTS = 6;
const MAX_SEGMENTS = 140;
const TURN_RATE = Math.PI * 4;

export default class Snake {
  constructor(
    scene,
    { headTexture, bodyTexture, color, css, label, name, x, y, direction },
  ) {
    this.scene = scene;
    this.color = color;
    this.css = css;
    this.label = label;
    this.name = name;
    this.headRadius = HEAD_RADIUS;
    this.segmentRadius = SEGMENT_RADIUS;
    this.spacing = SEGMENT_SPACING;
    this.speed = SPEED;
    this.direction = new Phaser.Math.Vector2(direction.x, direction.y);
    this.turnQueue = [];
    this.targetAngle = null;
    this.turnRate = TURN_RATE;
    this.alive = true;
    this.score = 0;
    this.powerups = new Map();
    this.powerupOrder = 0;
    this.body = [];
    this.bodyTexture = bodyTexture;
    this.baseScale = 1 / (scene.renderDpr || 1);

    this.head = scene.add.image(x, y, headTexture).setDepth(20).setScale(this.baseScale);
    this.head.setRotation(Math.atan2(this.direction.y, this.direction.x));

    this.aura = scene.add.image(x, y, 'aura').setDepth(19.5).setVisible(false).setScale(this.baseScale);

    for (let i = 0; i < START_SEGMENTS; i += 1) {
      const segment = scene.add
        .image(
          x - this.direction.x * (i + 1) * SEGMENT_SPACING,
          y - this.direction.y * (i + 1) * SEGMENT_SPACING,
          bodyTexture,
        )
        .setDepth(19 - i * 0.01)
        .setScale(this.baseScale);
      segment.taper = 1;
      this.body.push(segment);
    }
  }

  update(dt) {
    if (!this.alive) {
      return;
    }

    if (this.powerups.size > 0) {
      let expired = false;
      for (const [type, powerup] of this.powerups) {
        powerup.remaining -= dt;
        if (powerup.remaining <= 0) {
          this.powerups.delete(type);
          expired = true;
        }
      }
      if (expired) {
        this.updatePowerupVisuals();
      }
      if (this.powerups.size > 0) {
        this.aura.setAlpha(0.45 + Math.sin(this.scene.time.now / 160) * 0.2);
      }
    }

    if (this.turnQueue.length > 0) {
      this.direction = this.turnQueue.shift();
      this.targetAngle = null;
    } else if (this.targetAngle !== null) {
      const currentAngle = Math.atan2(this.direction.y, this.direction.x);
      const nextAngle = Phaser.Math.Angle.RotateTo(
        currentAngle,
        this.targetAngle,
        this.turnRate * dt,
      );
      this.direction.set(Math.cos(nextAngle), Math.sin(nextAngle));
    }

    this.head.x += this.direction.x * this.speed * dt;
    this.head.y += this.direction.y * this.speed * dt;
    this.head.setRotation(Math.atan2(this.direction.y, this.direction.x));

    let prevX = this.head.x;
    let prevY = this.head.y;
    const count = this.body.length;

    for (let i = 0; i < count; i += 1) {
      const segment = this.body[i];
      let dx = prevX - segment.x;
      let dy = prevY - segment.y;
      const distance = Math.hypot(dx, dy);

      if (distance > 0.0001) {
        dx /= distance;
        dy /= distance;
      } else {
        dx = this.direction.x;
        dy = this.direction.y;
      }

      segment.x = prevX - dx * this.spacing;
      segment.y = prevY - dy * this.spacing;
      prevX = segment.x;
      prevY = segment.y;

      const taper = 1 - (i / Math.max(1, count)) * 0.4;
      segment.taper = taper;
      segment.setScale(this.baseScale * taper);
    }

    this.aura.setPosition(this.head.x, this.head.y);
  }

  turn(x, y) {
    const last =
      this.turnQueue.length > 0
        ? this.turnQueue[this.turnQueue.length - 1]
        : this.direction;

    if ((x === last.x && y === last.y) || (x === -last.x && y === -last.y)) {
      return false;
    }
    if (this.turnQueue.length >= 2) {
      return false;
    }

    this.turnQueue.push(new Phaser.Math.Vector2(x, y));
    this.targetAngle = null;
    return true;
  }

  steer(angle) {
    if (angle === null || angle === undefined) {
      this.targetAngle = null;
      return;
    }
    this.turnQueue.length = 0;
    this.targetAngle = angle;
  }

  grow(amount) {
    for (let i = 0; i < amount; i += 1) {
      if (this.body.length >= MAX_SEGMENTS) {
        return;
      }

      const tail = this.body[this.body.length - 1];
      const segment = this.scene.add
        .image(tail.x, tail.y, this.bodyTexture)
        .setDepth(19 - this.body.length * 0.01)
        .setScale(this.baseScale);
      segment.taper = 1;
      this.body.push(segment);
    }
  }

  chomp() {
    this.scene.tweens.killTweensOf(this.head);
    this.head.setScale(this.baseScale);
    this.scene.tweens.add({
      targets: this.head,
      scale: this.baseScale * 1.15,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  applyPowerup(type) {
    const definition = POWERUPS[type];
    const existing = this.powerups.get(type);
    let stacked = false;

    if (existing) {
      existing.remaining = Math.min(
        definition.duration * 2,
        existing.remaining + definition.duration,
      );
      existing.duration = Math.max(existing.duration, existing.remaining);
      existing.stacks += 1;
      stacked = true;
    } else {
      this.powerups.set(type, {
        type,
        remaining: definition.duration,
        duration: definition.duration,
        stacks: 1,
        order: ++this.powerupOrder,
      });
    }

    this.updatePowerupVisuals();
    const active = this.powerups.get(type);
    return {
      stacked,
      stacks: active.stacks,
      remaining: active.remaining,
    };
  }

  clearPowerups() {
    this.powerups.clear();
    this.updatePowerupVisuals();
  }

  hasPowerup(type) {
    return this.powerups.has(type);
  }

  getPowerup(type) {
    return this.powerups.get(type) ?? null;
  }

  getPowerups() {
    return [...this.powerups.values()].sort((a, b) => a.order - b.order);
  }

  updatePowerupVisuals() {
    if (this.powerups.size === 0) {
      this.aura.setVisible(false).setAlpha(0.55);
      this.head.setAlpha(1);
      this.body.forEach((segment) => segment.setAlpha(1));
      return;
    }

    const active = this.getPowerups();
    const newest = active[active.length - 1];
    const definition = POWERUPS[newest.type];
    const phased = this.hasPowerup('phase');

    this.aura.setVisible(true).setTint(definition.color).setAlpha(0.55);
    this.head.setAlpha(phased ? 0.85 : 1);
    this.body.forEach((segment) => segment.setAlpha(phased ? 0.55 : 1));
  }

  isPhased() {
    return this.hasPowerup('phase');
  }

  hitsWall(width, height) {
    const radius = this.headRadius;
    return (
      this.head.x - radius <= 0 ||
      this.head.x + radius >= width ||
      this.head.y - radius <= 0 ||
      this.head.y + radius >= height
    );
  }

  hitsOwnBody() {
    for (let i = 4; i < this.body.length; i += 1) {
      const segment = this.body[i];
      const radius = this.segmentRadius * (segment.taper ?? 1);
      if (
        Phaser.Math.Distance.Between(
          this.head.x,
          this.head.y,
          segment.x,
          segment.y,
        ) <
        this.headRadius + radius - 4
      ) {
        return true;
      }
    }
    return false;
  }

  headHitsHead(other) {
    return (
      Phaser.Math.Distance.Between(
        this.head.x,
        this.head.y,
        other.head.x,
        other.head.y,
      ) <
      this.headRadius + other.headRadius - 2
    );
  }

  headHitsBody(other) {
    for (const segment of other.body) {
      const radius = other.segmentRadius * (segment.taper ?? 1);
      if (
        Phaser.Math.Distance.Between(
          this.head.x,
          this.head.y,
          segment.x,
          segment.y,
        ) <
        this.headRadius + radius - 2
      ) {
        return true;
      }
    }
    return false;
  }

  destroy() {
    this.scene.tweens.killTweensOf(this.head);
    this.head.destroy();
    this.aura.destroy();
    this.body.forEach((segment) => segment.destroy());
    this.body = [];
  }
}
