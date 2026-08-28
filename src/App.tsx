import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  FaceLandmarker,
} from "@mediapipe/tasks-vision";
import SettingsScreen, {
  SettingsTabs,
  loadBattleSettings,
  saveBattleSettings,
  type AppTab,
  type BattleSettings,
} from "./pages/setting/setting";

import "./App.css";

type Point = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
};

type Vector2 = {
  x: number;
  y: number;
};

type PlayerId = "player1" | "player2";

type Fireball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  owner: PlayerId | null;
  attackId: number | null;
};

type HitEffect = {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
  damage: number;
  target: PlayerId;
};

type HealEffect = {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  target: PlayerId;
  amount: number;
};

type LightningEffect = {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  target: PlayerId;
  seed: number;
};

type PunchHandState = {
  previousCenter: Point | null;
  previousSize: number;
  previousTime: number;
  trajectory: Point[];
  charge: number;
  cooldown: number;
  ready: boolean;
};

const FINGER_TIPS = [4, 8, 12, 16, 20];
const OPEN_HAND_TIPS = [8, 12, 16, 20];
const MAX_PUNCH_CHARGE = 1800;
const MIN_PUNCH_CHARGE = 120;
const MIN_FIST_DISTANCE = 0.14;
const MIN_PUNCH_MOVE_SCALE = 0.18;
const MIN_PUNCH_MOVE_DISTANCE = 0.012;
const MIN_PUNCH_STRAIGHTNESS = 0.58;
const PUNCH_COOLDOWN = 520;
const BEAM_DAMAGE_COOLDOWN = 500;
const SHOCKWAVE_DAMAGE_COOLDOWN = 650;
const DAMAGE_FLASH_TIME = 650;
const BEAM_TARGET_RADIUS_MIN = 0.075;
const BEAM_TARGET_RADIUS_SCALE = 0.52;
const FIREBALL_DAMAGE = 12;
const SHOCKWAVE_DAMAGE = 3;
const SHOCKWAVE_HIT_RADIUS = 0.16;
const THUNDER_DAMAGE = 32;
const THUNDER_CHARGE_TIME = 1100;
const THUNDER_COOLDOWN = 5500;
const THUNDER_HAND_DISTANCE = 0.18;
const THUNDER_ABOVE_HEAD_MARGIN = 0.08;
const HEAL_AMOUNT = 16;
const HEAL_CHARGE_TIME = 900;
const HEAL_COOLDOWN = 2800;
const MAX_HP = 300;

type BattleWinner = "PLAYER 1" | "PLAYER 2";

type FaceAttackState = ReturnType<typeof getFaceAttackState>;

type BattlePlayer = {
  id: PlayerId;
  face: Point[];
  center: Point;
  radius: number;
  attack: FaceAttackState;
};

type PlayerMarker = {
  id: PlayerId;
  x: number;
  y: number;
  damaged: boolean;
  attacking: boolean;
  handCount: number;
  chargingThunder: boolean;
  thunderProgress: number;
  chargingHeal: boolean;
  healProgress: number;
};

type HandAssignment = {
  player: BattlePlayer;
  hands: Point[][];
};

type AttackRecord = {
  id: number;
  type: "beam" | "fireball" | "shockwave" | "thunder" | "heal";
  owner: PlayerId;
  target: PlayerId | null;
  startedAt: number;
  lastHitAt: number | null;
};

const POSE_CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
];

// MediaPipe Face Meshの口周辺
const MOUTH_POINTS = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317,
  14, 87, 178, 88, 95,
];

function distance(a: Point, b: Point) {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

function getMidPoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

function getNormalizedDirection(from: Point, to: Point): Vector2 {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const length = Math.sqrt(x * x + y * y);

  if (length < 0.01) {
    return {
      x: 0,
      y: -1,
    };
  }

  return {
    x: x / length,
    y: y / length,
  };
}

function getAveragePoint(points: Point[]): Point {
  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
      z: sum.z + point.z,
    }),
    {
      x: 0,
      y: 0,
      z: 0,
    },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: total.z / points.length,
  };
}

function getPalmCenter(hand: Point[]) {
  const points = [hand[0], hand[5], hand[9], hand[13], hand[17]];

  if (points.some((point) => !point)) {
    return null;
  }

  return getAveragePoint(points as Point[]);
}

function getFingerCenter(hand: Point[]) {
  const points = OPEN_HAND_TIPS.map((index) => hand[index]);

  if (points.some((point) => !point)) {
    return null;
  }

  return getAveragePoint(points as Point[]);
}

function getFistCenter(hand: Point[]) {
  const points = [hand[0], hand[5], hand[9], hand[13], hand[17]];

  if (points.some((point) => !point)) {
    return null;
  }

  return getAveragePoint(points as Point[]);
}

function isFist(hand: Point[]) {
  const palmCenter = getPalmCenter(hand);

  if (!palmCenter) {
    return false;
  }

  const foldedCount = [
    [8, 5],
    [12, 9],
    [16, 13],
    [20, 17],
  ].filter(([tipIndex, baseIndex]) => {
    const tip = hand[tipIndex];
    const base = hand[baseIndex];

    if (!tip || !base) {
      return false;
    }

    return (
      distance(palmCenter, tip) <
      Math.max(0.09, distance(palmCenter, base) * 2.4)
    );
  }).length;

  return foldedCount >= 2;
}

function getFistDistance(hands: Point[][]) {
  if (hands.length < 2) {
    return 0;
  }

  const firstCenter = getFistCenter(hands[0]);

  const secondCenter = getFistCenter(hands[1]);

  if (!firstCenter || !secondCenter) {
    return 0;
  }

  return distance(firstCenter, secondCenter);
}

function getHandSize(hand: Point[]) {
  const palmCenter = getPalmCenter(hand);

  if (!palmCenter) {
    return 0;
  }

  const points = [hand[4], hand[8], hand[12], hand[16], hand[20]];

  return Math.max(
    ...points.map((point) => (point ? distance(palmCenter, point) : 0)),
  );
}

function getTrajectoryStraightness(points: Point[]) {
  if (points.length < 3) {
    return 0;
  }

  const start = points[0];
  const end = points[points.length - 1];

  const directDistance = distance(start, end);

  const pathDistance = points
    .slice(1)
    .reduce((total, point, index) => total + distance(points[index], point), 0);

  if (pathDistance === 0) {
    return 0;
  }

  return directDistance / pathDistance;
}

function isOpenHand(hand: Point[]) {
  const wrist = hand[0];
  const palmCenter = getPalmCenter(hand);

  if (!wrist || !palmCenter) {
    return false;
  }

  const extendedCount = [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ].filter(([tipIndex, pipIndex]) => {
    const tip = hand[tipIndex];
    const pip = hand[pipIndex];

    if (!tip || !pip) {
      return false;
    }

    return (
      distance(wrist, tip) > distance(wrist, pip) * 1.18 &&
      distance(palmCenter, tip) > distance(palmCenter, pip) * 1.08
    );
  }).length;

  return extendedCount >= 3;
}

function isFingerExtended(hand: Point[], tipIndex: number, pipIndex: number) {
  const wrist = hand[0];
  const palmCenter = getPalmCenter(hand);
  const tip = hand[tipIndex];
  const pip = hand[pipIndex];

  if (!wrist || !palmCenter || !tip || !pip) {
    return false;
  }

  return (
    distance(wrist, tip) > distance(wrist, pip) * 1.16 &&
    distance(palmCenter, tip) > distance(palmCenter, pip) * 1.08
  );
}

function isFingerFolded(hand: Point[], tipIndex: number, baseIndex: number) {
  const palmCenter = getPalmCenter(hand);
  const tip = hand[tipIndex];
  const base = hand[baseIndex];

  if (!palmCenter || !tip || !base) {
    return false;
  }

  return (
    distance(palmCenter, tip) <
    Math.max(0.11, distance(palmCenter, base) * 2.25)
  );
}

function isPeaceHand(hand: Point[]) {
  const indexExtended = isFingerExtended(hand, 8, 6);
  const middleExtended = isFingerExtended(hand, 12, 10);
  const ringFolded = isFingerFolded(hand, 16, 13);
  const pinkyFolded = isFingerFolded(hand, 20, 17);
  const indexTip = hand[8];
  const middleTip = hand[12];

  if (!indexTip || !middleTip) {
    return false;
  }

  const tipsSeparated = distance(indexTip, middleTip) > 0.035;

  return (
    indexExtended &&
    middleExtended &&
    ringFolded &&
    pinkyFolded &&
    tipsSeparated
  );
}

function getHandShockwaveData(hands: Point[][]) {
  if (hands.length < 2) {
    return null;
  }

  const firstHand = hands[0];
  const secondHand = hands[1];

  if (!isOpenHand(firstHand) || !isOpenHand(secondHand)) {
    return null;
  }

  const firstPalm = getPalmCenter(firstHand);
  const secondPalm = getPalmCenter(secondHand);
  const firstFingerCenter = getFingerCenter(firstHand);
  const secondFingerCenter = getFingerCenter(secondHand);

  if (!firstPalm || !secondPalm || !firstFingerCenter || !secondFingerCenter) {
    return null;
  }

  const palmDistance = distance(firstPalm, secondPalm);

  if (palmDistance < 0.08 || palmDistance > 0.5) {
    return null;
  }

  const center = getMidPoint(firstPalm, secondPalm);

  const fingerCenter = getMidPoint(firstFingerCenter, secondFingerCenter);

  const direction = getNormalizedDirection(center, fingerCenter);

  return {
    center,
    direction,
    strength: Math.min(1, Math.max(0.45, palmDistance * 2.6)),
  };
}

// 目の開き具合を計算
function getEyeRatio(
  face: Point[],
  upper1: number,
  upper2: number,
  lower1: number,
  lower2: number,
  left: number,
  right: number,
) {
  const a = face[upper1];
  const b = face[upper2];
  const c = face[lower1];
  const d = face[lower2];
  const e = face[left];
  const f = face[right];

  if (!a || !b || !c || !d || !e || !f) {
    return 0;
  }

  const vertical1 = distance(a, c);
  const vertical2 = distance(b, d);
  const horizontal = distance(e, f);

  if (horizontal === 0) {
    return 0;
  }

  return (vertical1 + vertical2) / (2 * horizontal);
}

function drawMouthBeam(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  face: Point[],
  time: number,
  target?: Point,
) {
  const upperLip = face[13];
  const lowerLip = face[14];
  const noseTip = face[1];
  const leftCheek = face[234];
  const rightCheek = face[454];

  if (!upperLip || !lowerLip || !noseTip || !leftCheek || !rightCheek) {
    return;
  }

  const mouthCenter = getMidPoint(upperLip, lowerLip);

  const faceCenter = getMidPoint(leftCheek, rightCheek);

  const direction = target
    ? getNormalizedDirection(mouthCenter, target)
    : getNormalizedDirection(faceCenter, noseTip);

  const startX = mouthCenter.x * canvas.width;

  const startY = mouthCenter.y * canvas.height;

  const beamLength = Math.max(canvas.width, canvas.height) * 1.25;

  const endX = startX + direction.x * beamLength;

  const endY = startY + direction.y * beamLength;

  const pulse = 0.5 + Math.sin(time / 90) * 0.5;

  const outerWidth = 70 + pulse * 35;

  const coreWidth = 18 + pulse * 10;

  const perpX = -direction.y;

  const perpY = direction.x;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const coneGradient = ctx.createLinearGradient(startX, startY, endX, endY);

  coneGradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  coneGradient.addColorStop(0.12, "rgba(204, 92, 255, 0.85)");
  coneGradient.addColorStop(0.55, "rgba(132, 44, 255, 0.5)");
  coneGradient.addColorStop(1, "rgba(68, 0, 128, 0)");

  ctx.fillStyle = coneGradient;
  ctx.shadowColor = "rgba(178, 80, 255, 0.95)";
  ctx.shadowBlur = 35;

  ctx.beginPath();
  ctx.moveTo(startX + perpX * 8, startY + perpY * 8);
  ctx.lineTo(endX + perpX * outerWidth, endY + perpY * outerWidth);
  ctx.lineTo(endX - perpX * outerWidth, endY - perpY * outerWidth);
  ctx.lineTo(startX - perpX * 8, startY - perpY * 8);
  ctx.closePath();
  ctx.fill();

  const beamGradient = ctx.createLinearGradient(startX, startY, endX, endY);

  beamGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  beamGradient.addColorStop(0.2, "rgba(238, 157, 255, 0.95)");
  beamGradient.addColorStop(0.75, "rgba(142, 54, 255, 0.8)");
  beamGradient.addColorStop(1, "rgba(94, 0, 180, 0)");

  ctx.strokeStyle = beamGradient;
  ctx.lineCap = "round";
  ctx.lineWidth = coreWidth;
  ctx.shadowBlur = 45;

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.shadowBlur = 20;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  for (let i = 0; i < 18; i += 1) {
    const progress = (time / 550 + i / 18) % 1;

    const wave = Math.sin(time / 120 + i * 1.7);

    const radius = 4 + (1 - progress) * 8;

    const spread = progress * outerWidth * 0.7 * wave;

    const x = startX + direction.x * beamLength * progress + perpX * spread;

    const y = startY + direction.y * beamLength * progress + perpY * spread;

    ctx.fillStyle =
      i % 2 === 0 ? "rgba(245, 200, 255, 0.8)" : "rgba(156, 72, 255, 0.65)";

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const flare = ctx.createRadialGradient(
    startX,
    startY,
    4,
    startX,
    startY,
    60 + pulse * 25,
  );

  flare.addColorStop(0, "rgba(255, 255, 255, 1)");
  flare.addColorStop(0.35, "rgba(220, 110, 255, 0.9)");
  flare.addColorStop(1, "rgba(106, 0, 255, 0)");

  ctx.fillStyle = flare;
  ctx.beginPath();
  ctx.arc(startX, startY, 60 + pulse * 25, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHandShockwave(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  hands: Point[][],
  time: number,
) {
  const shockwave = getHandShockwaveData(hands);

  if (!shockwave) {
    return;
  }

  const startX = shockwave.center.x * canvas.width;

  const startY = shockwave.center.y * canvas.height;

  const direction = shockwave.direction;

  const perpX = -direction.y;

  const perpY = direction.x;

  const length =
    Math.max(canvas.width, canvas.height) * (0.75 + shockwave.strength * 0.45);

  const endX = startX + direction.x * length;

  const endY = startY + direction.y * length;

  const pulse = 0.5 + Math.sin(time / 80) * 0.5;

  const width = 90 + shockwave.strength * 120 + pulse * 45;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const waveGradient = ctx.createLinearGradient(startX, startY, endX, endY);

  waveGradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  waveGradient.addColorStop(0.18, "rgba(113, 229, 255, 0.82)");
  waveGradient.addColorStop(0.55, "rgba(82, 116, 255, 0.42)");
  waveGradient.addColorStop(1, "rgba(70, 255, 220, 0)");

  ctx.fillStyle = waveGradient;
  ctx.shadowColor = "rgba(90, 221, 255, 0.9)";
  ctx.shadowBlur = 36;

  ctx.beginPath();
  ctx.moveTo(startX + perpX * 18, startY + perpY * 18);
  ctx.lineTo(endX + perpX * width, endY + perpY * width);
  ctx.lineTo(endX - perpX * width, endY - perpY * width);
  ctx.lineTo(startX - perpX * 18, startY - perpY * 18);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 5; i += 1) {
    const progress = (time / 650 + i / 5) % 1;

    const ringX = startX + direction.x * length * progress;

    const ringY = startY + direction.y * length * progress;

    const ringWidth = 28 + width * progress * 0.85;

    const ringHeight = 12 + width * progress * 0.32;

    ctx.save();
    ctx.translate(ringX, ringY);
    ctx.rotate(Math.atan2(direction.y, direction.x));

    ctx.strokeStyle = `rgba(210, 252, 255, ${0.85 * (1 - progress)})`;
    ctx.lineWidth = 6 * (1 - progress) + 2;
    ctx.shadowBlur = 26;

    ctx.beginPath();
    ctx.ellipse(0, 0, ringWidth, ringHeight, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  const coreGradient = ctx.createLinearGradient(startX, startY, endX, endY);

  coreGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  coreGradient.addColorStop(0.35, "rgba(145, 245, 255, 0.9)");
  coreGradient.addColorStop(1, "rgba(60, 130, 255, 0)");

  ctx.strokeStyle = coreGradient;
  ctx.lineCap = "round";
  ctx.lineWidth = 18 + pulse * 10;
  ctx.shadowBlur = 44;

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  const charge = ctx.createRadialGradient(
    startX,
    startY,
    4,
    startX,
    startY,
    80 + pulse * 22,
  );

  charge.addColorStop(0, "rgba(255, 255, 255, 1)");
  charge.addColorStop(0.28, "rgba(120, 238, 255, 0.92)");
  charge.addColorStop(1, "rgba(44, 120, 255, 0)");

  ctx.fillStyle = charge;
  ctx.beginPath();
  ctx.arc(startX, startY, 80 + pulse * 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawFireballs(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  fireballs: Fireball[],
  time: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  fireballs.forEach((fireball, index) => {
    const x = fireball.x * canvas.width;

    const y = fireball.y * canvas.height;

    const radius = fireball.radius * Math.min(canvas.width, canvas.height);

    const fade = Math.max(0, fireball.life / fireball.maxLife);

    const pulse = 0.5 + Math.sin(time / 70 + index) * 0.5;

    const flame = ctx.createRadialGradient(
      x,
      y,
      radius * 0.08,
      x,
      y,
      radius * (1.35 + pulse * 0.25),
    );

    flame.addColorStop(0, `rgba(255, 255, 255, ${fade})`);
    flame.addColorStop(0.18, `rgba(255, 232, 92, ${0.95 * fade})`);
    flame.addColorStop(0.46, `rgba(255, 92, 20, ${0.8 * fade})`);
    flame.addColorStop(0.75, `rgba(190, 18, 0, ${0.45 * fade})`);
    flame.addColorStop(1, "rgba(80, 0, 0, 0)");

    ctx.shadowColor = "rgba(255, 91, 18, 0.95)";
    ctx.shadowBlur = radius * 0.9;
    ctx.fillStyle = flame;

    ctx.beginPath();
    ctx.arc(x, y, radius * 1.35, 0, Math.PI * 2);
    ctx.fill();

    const direction = getNormalizedDirection(
      {
        x: fireball.x - fireball.vx * 80,
        y: fireball.y - fireball.vy * 80,
        z: 0,
      },
      {
        x: fireball.x,
        y: fireball.y,
        z: 0,
      },
    );

    const tailX = x - direction.x * radius * (2.8 + pulse);

    const tailY = y - direction.y * radius * (2.8 + pulse);

    const tail = ctx.createLinearGradient(x, y, tailX, tailY);

    tail.addColorStop(0, `rgba(255, 214, 76, ${0.8 * fade})`);
    tail.addColorStop(0.55, `rgba(255, 78, 0, ${0.45 * fade})`);
    tail.addColorStop(1, "rgba(80, 0, 0, 0)");

    ctx.strokeStyle = tail;
    ctx.lineCap = "round";
    ctx.lineWidth = radius * 1.1;
    ctx.shadowBlur = radius * 0.65;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();

    for (let i = 0; i < 9; i += 1) {
      const sparkAngle = time / 140 + i * 1.9 + index;

      const sparkDistance =
        radius * (0.7 + ((time / 260 + i * 0.17) % 1) * 1.4);

      const sparkX =
        x -
        direction.x * sparkDistance * 0.8 +
        Math.cos(sparkAngle) * radius * 0.55;

      const sparkY =
        y -
        direction.y * sparkDistance * 0.8 +
        Math.sin(sparkAngle) * radius * 0.55;

      ctx.fillStyle = `rgba(255, 190, 55, ${0.75 * fade})`;

      ctx.beginPath();
      ctx.arc(sparkX, sparkY, radius * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.restore();
}

function drawHitEffects(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  effects: HitEffect[],
) {
  effects.forEach((effect) => {
    const alpha = effect.life / effect.maxLife;
    const radius =
      effect.radius *
      Math.min(canvas.width, canvas.height) *
      (0.55 + (1 - alpha) * 1.2);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = effect.color;
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      effect.x * canvas.width,
      effect.y * canvas.height,
      radius,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
}

function drawHealEffects(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  effects: HealEffect[],
) {
  effects.forEach((effect) => {
    const alpha = effect.life / effect.maxLife;
    const x = effect.x * canvas.width;
    const y = effect.y * canvas.height;
    const radius =
      (0.1 + (1 - alpha) * 0.14) * Math.min(canvas.width, canvas.height);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(88, 255, 154, 0.95)";
    ctx.fillStyle = "rgba(88, 255, 154, 0.18)";
    ctx.lineWidth = 6;
    ctx.shadowColor = "rgba(88, 255, 154, 0.95)";
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.font = "700 28px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = "white";
    ctx.fillText(`+${effect.amount}`, x, y - radius * 0.25);
    ctx.restore();
  });
}

function drawLightningEffects(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  effects: LightningEffect[],
) {
  effects.forEach((effect) => {
    const alpha = effect.life / effect.maxLife;
    const targetX = effect.x * canvas.width;
    const targetY = effect.y * canvas.height;
    const startY = 0;
    const segments = 8;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, alpha * 1.4);
    ctx.lineCap = "round";

    for (let bolt = 0; bolt < 3; bolt += 1) {
      ctx.beginPath();
      ctx.moveTo(targetX + Math.sin(effect.seed + bolt) * 34, startY);

      for (let index = 1; index <= segments; index += 1) {
        const progress = index / segments;
        const jag =
          Math.sin(effect.seed * 3 + bolt * 11 + index * 2.7) *
          34 *
          (1 - progress * 0.35);

        ctx.lineTo(targetX + jag, targetY * progress);
      }

      ctx.strokeStyle =
        bolt === 0 ? "rgba(255, 255, 255, 1)" : "rgba(88, 214, 255, 0.82)";
      ctx.lineWidth = bolt === 0 ? 8 : 18;
      ctx.shadowColor = "rgba(100, 220, 255, 1)";
      ctx.shadowBlur = 24;
      ctx.stroke();
    }

    const burst = ctx.createRadialGradient(
      targetX,
      targetY,
      4,
      targetX,
      targetY,
      150 * (1 - alpha + 0.4),
    );

    burst.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    burst.addColorStop(0.35, `rgba(94, 221, 255, ${0.75 * alpha})`);
    burst.addColorStop(1, "rgba(0, 80, 255, 0)");

    ctx.fillStyle = burst;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 150 * (1 - alpha + 0.4), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function getMouthBeamInfo(face: Point[], target?: Point) {
  const upperLip = face[13];
  const lowerLip = face[14];
  const noseTip = face[1];
  const leftCheek = face[234];
  const rightCheek = face[454];

  if (!upperLip || !lowerLip || !noseTip || !leftCheek || !rightCheek) {
    return null;
  }

  const mouthCenter = getMidPoint(upperLip, lowerLip);
  const faceCenter = getMidPoint(leftCheek, rightCheek);
  const direction = target
    ? getNormalizedDirection(mouthCenter, target)
    : getNormalizedDirection(faceCenter, noseTip);

  return {
    start: {
      x: mouthCenter.x,
      y: mouthCenter.y,
      z: 0,
    },
    direction,
    end: {
      x: mouthCenter.x + direction.x * 1.2,
      y: mouthCenter.y + direction.y * 1.2,
      z: 0,
    },
  };
}

function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;

  const lengthSq = vx * vx + vy * vy;

  if (lengthSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lengthSq));

  const cx = ax + t * vx;
  const cy = ay + t * vy;

  return Math.hypot(px - cx, py - cy);
}

function isBeamCollidingWithTarget(
  beamStart: Point,
  beamEnd: Point,
  targetCenter: Point,
  targetRadius: number,
) {
  const distance = pointToSegmentDistance(
    targetCenter.x,
    targetCenter.y,
    beamStart.x,
    beamStart.y,
    beamEnd.x,
    beamEnd.y,
  );

  return distance <= targetRadius;
}

function isCircleCollidingWithTarget(
  circleCenter: Point,
  circleRadius: number,
  targetCenter: Point,
  targetRadius: number,
) {
  return distance(circleCenter, targetCenter) <= circleRadius + targetRadius;
}

function getShockwaveEnd(
  center: Point,
  direction: Vector2,
  strength: number,
): Point {
  const length = 0.75 + strength * 0.45;

  return {
    x: center.x + direction.x * length,
    y: center.y + direction.y * length,
    z: 0,
  };
}

function isShockwaveCollidingWithTarget(
  center: Point,
  direction: Vector2,
  strength: number,
  targetCenter: Point,
  targetRadius: number,
) {
  const end = getShockwaveEnd(center, direction, strength);

  const waveRadius = SHOCKWAVE_HIT_RADIUS * (0.75 + strength * 0.35);

  return isBeamCollidingWithTarget(
    center,
    end,
    targetCenter,
    targetRadius + waveRadius,
  );
}

function getTimerWinner(
  player1Hp: number,
  player2Hp: number,
): BattleWinner | null {
  if (player1Hp <= 0 && player2Hp > 0) {
    return "PLAYER 2";
  }

  if (player2Hp <= 0 && player1Hp > 0) {
    return "PLAYER 1";
  }

  return null;
}

function getFaceAttackState(face: Point[]) {
  const upper = face[13];
  const lower = face[14];
  const left = face[61];
  const right = face[291];

  let mouthRatio = 0;

  if (upper && lower && left && right) {
    const vertical = distance(upper, lower);

    const horizontal = distance(left, right);

    mouthRatio = vertical / horizontal;
  }

  const leftEyeRatio = getEyeRatio(face, 159, 160, 145, 144, 33, 133);

  const rightEyeRatio = getEyeRatio(face, 386, 385, 374, 380, 362, 263);

  const mouthOpen = mouthRatio > 0.22;

  const leftEyeOpen = leftEyeRatio > 0.55;

  const rightEyeOpen = rightEyeRatio > 0.55;

  return {
    mouthRatio,
    leftEyeRatio,
    rightEyeRatio,
    mouthOpen,
    leftEyeOpen,
    rightEyeOpen,
    beamActive: mouthOpen && leftEyeOpen && rightEyeOpen,
  };
}

function getFaceTarget(face: Point[]) {
  const noseTip = face[1];
  const leftCheek = face[234];
  const rightCheek = face[454];
  const upperLip = face[13];
  const lowerLip = face[14];

  if (!noseTip || !leftCheek || !rightCheek || !upperLip || !lowerLip) {
    return null;
  }

  const cheekCenter = getMidPoint(leftCheek, rightCheek);

  const mouthCenter = getMidPoint(upperLip, lowerLip);

  const center = {
    x: (noseTip.x + cheekCenter.x + mouthCenter.x) / 3,
    y: (noseTip.y + cheekCenter.y + mouthCenter.y) / 3,
    z: 0,
  };

  const faceWidth = distance(leftCheek, rightCheek);

  return {
    center,
    radius: Math.max(
      BEAM_TARGET_RADIUS_MIN,
      faceWidth * BEAM_TARGET_RADIUS_SCALE,
    ),
  };
}

function getBattlePlayers(
  faces: Point[][],
  attacks: FaceAttackState[],
): BattlePlayer[] {
  return faces
    .map((face, index) => {
      const target = getFaceTarget(face);

      if (!target) {
        return null;
      }

      return {
        id: index === 0 ? "player1" : "player2",
        face,
        center: target.center,
        radius: target.radius,
        attack: attacks[index],
      };
    })
    .filter((player): player is BattlePlayer => player !== null)
    .sort((a, b) => b.center.x - a.center.x)
    .slice(0, 2)
    .map((player, index) => ({
      ...player,
      id: index === 0 ? "player1" : "player2",
    }));
}

function getOpponent(player: BattlePlayer, players: BattlePlayer[]) {
  return players.find((candidate) => candidate.id !== player.id);
}

function getPlayerLabel(id: PlayerId) {
  return id === "player1" ? "P1" : "P2";
}

function getPlayerColor(id: PlayerId) {
  return id === "player1" ? "#53d4ff" : "#ff6b6b";
}

function getHandAnchor(hand: Point[]) {
  return getPalmCenter(hand) ?? getFistCenter(hand);
}

function isThunderPrayerPose(assignment: HandAssignment) {
  if (assignment.hands.length < 2) {
    return false;
  }

  const firstHand = assignment.hands[0];
  const secondHand = assignment.hands[1];
  const firstPalm = getPalmCenter(firstHand);
  const secondPalm = getPalmCenter(secondHand);
  const firstFingerCenter =
    getFingerCenter(firstHand) ?? getFistCenter(firstHand);
  const secondFingerCenter =
    getFingerCenter(secondHand) ?? getFistCenter(secondHand);

  if (!firstPalm || !secondPalm || !firstFingerCenter || !secondFingerCenter) {
    return false;
  }

  const headLine =
    assignment.player.center.y -
    assignment.player.radius * 0.35 -
    THUNDER_ABOVE_HEAD_MARGIN;

  const palmsAboveHead = firstPalm.y < headLine && secondPalm.y < headLine;

  const fingersAboveHead =
    firstFingerCenter.y < headLine && secondFingerCenter.y < headLine;

  const palmsClose = distance(firstPalm, secondPalm) < THUNDER_HAND_DISTANCE;

  const fingersClose =
    distance(firstFingerCenter, secondFingerCenter) < THUNDER_HAND_DISTANCE;

  const center = getMidPoint(firstPalm, secondPalm);

  const centeredAbovePlayer =
    Math.abs(center.x - assignment.player.center.x) <
    assignment.player.radius * 1.8;

  return (
    palmsAboveHead &&
    fingersAboveHead &&
    (palmsClose || fingersClose) &&
    centeredAbovePlayer
  );
}

function assignHandsToPlayers(
  hands: Point[][],
  players: BattlePlayer[],
): HandAssignment[] {
  const assignments = players.map((player) => ({
    player,
    hands: [] as Point[][],
  }));

  const candidates = hands
    .map((hand, handIndex) => {
      const anchor = getHandAnchor(hand);

      if (!anchor) {
        return [];
      }

      return players.map((player) => ({
        hand,
        handIndex,
        playerId: player.id,
        distance: distance(anchor, player.center),
      }));
    })
    .flat()
    .sort((a, b) => a.distance - b.distance);

  const usedHands = new Set<number>();

  candidates.forEach((candidate) => {
    if (usedHands.has(candidate.handIndex)) {
      return;
    }

    const assignment = assignments.find(
      (item) => item.player.id === candidate.playerId,
    );

    if (!assignment || assignment.hands.length >= 2) {
      return;
    }

    assignment.hands.push(candidate.hand);
    usedHands.add(candidate.handIndex);
  });

  return assignments;
}

function getBattleBeamTarget(
  attacker: BattlePlayer,
  defender: BattlePlayer,
): Point {
  return {
    x: defender.center.x > attacker.center.x ? 1.18 : -0.18,
    y: attacker.center.y,
    z: 0,
  };
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handLandmarkerRef = useRef<HandLandmarker | null>(null);

  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);

  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);

  const streamRef = useRef<MediaStream | null>(null);

  const animationRef = useRef<number | null>(null);

  const lastTimeRef = useRef(-1);

  const punchStatesRef = useRef<PunchHandState[]>([]);

  const fireballsRef = useRef<Fireball[]>([]);

  const hitEffectsRef = useRef<HitEffect[]>([]);

  const healEffectsRef = useRef<HealEffect[]>([]);

  const lightningEffectsRef = useRef<LightningEffect[]>([]);

  const attackRecordsRef = useRef<AttackRecord[]>([]);

  const nextAttackIdRef = useRef(1);

  const battleStartedRef = useRef(false);

  const lastBeamDamageRef = useRef<Record<PlayerId, number>>({
    player1: 0,
    player2: 0,
  });

  const lastShockwaveDamageRef = useRef<Record<PlayerId, number>>({
    player1: 0,
    player2: 0,
  });

  const damageFlashUntilRef = useRef<Record<PlayerId, number>>({
    player1: 0,
    player2: 0,
  });

  const thunderChargeStartedRef = useRef<Record<PlayerId, number | null>>({
    player1: null,
    player2: null,
  });

  const thunderCooldownUntilRef = useRef<Record<PlayerId, number>>({
    player1: 0,
    player2: 0,
  });

  const healChargeStartedRef = useRef<Record<PlayerId, number | null>>({
    player1: null,
    player2: null,
  });

  const healCooldownUntilRef = useRef<Record<PlayerId, number>>({
    player1: 0,
    player2: 0,
  });

  const [playerHP, setPlayerHP] = useState(MAX_HP);

  const [player2HP, setPlayer2HP] = useState(MAX_HP);

  const [battleWinner, setBattleWinner] = useState<BattleWinner | null>(null);

  const [cameraStarted, setCameraStarted] = useState(false);

  const [modelReady, setModelReady] = useState(false);

  const [hands, setHands] = useState(0);

  const [bodyCount, setBodyCount] = useState(0);

  const [faceCount, setFaceCount] = useState(0);

  const [playerMarkers, setPlayerMarkers] = useState<PlayerMarker[]>([]);

  const [mouthOpen, setMouthOpen] = useState(false);

  const [leftEyeOpen, setLeftEyeOpen] = useState(false);

  const [rightEyeOpen, setRightEyeOpen] = useState(false);

  const [leftEyeRatio, setLeftEyeRatio] = useState(0);

  const [rightEyeRatio, setRightEyeRatio] = useState(0);

  const [mouthRatio, setMouthRatio] = useState(0);

  const [activeTab, setActiveTab] = useState<AppTab>("battle");

  const [maxPlayers, setMaxPlayers] = useState(2);

  const [maxHands, setMaxHands] = useState(4);

  const [showJointGuides, setShowJointGuides] = useState(true);

  const [status, setStatus] = useState("カメラを起動してください");

  const applySettings = (nextSettings: BattleSettings) => {
    setMaxPlayers(nextSettings.maxPlayers);
    setMaxHands(nextSettings.maxHands);
    setShowJointGuides(nextSettings.showJointGuides);

    saveBattleSettings(nextSettings);

    if (cameraStarted) {
      initializeModels(nextSettings.maxPlayers, nextSettings.maxHands);
    }
  };

  const resetBattleState = () => {
    setPlayerHP(MAX_HP);
    setPlayer2HP(MAX_HP);
    setBattleWinner(null);
    battleStartedRef.current = false;
    lastBeamDamageRef.current = {
      player1: 0,
      player2: 0,
    };
    lastShockwaveDamageRef.current = {
      player1: 0,
      player2: 0,
    };
    damageFlashUntilRef.current = {
      player1: 0,
      player2: 0,
    };
    attackRecordsRef.current = [];
    nextAttackIdRef.current = 1;
    fireballsRef.current = [];
    hitEffectsRef.current = [];
    healEffectsRef.current = [];
    lightningEffectsRef.current = [];
    thunderChargeStartedRef.current = {
      player1: null,
      player2: null,
    };
    thunderCooldownUntilRef.current = {
      player1: 0,
      player2: 0,
    };
    healChargeStartedRef.current = {
      player1: null,
      player2: null,
    };
    healCooldownUntilRef.current = {
      player1: 0,
      player2: 0,
    };
    setPlayerMarkers([]);
  };

  useEffect(() => {
    const storedSettings = loadBattleSettings();

    setMaxPlayers(storedSettings.maxPlayers);
    setMaxHands(storedSettings.maxHands);
    setShowJointGuides(storedSettings.showJointGuides);
  }, []);

  // --------------------------------
  // カメラ
  // --------------------------------

  const startCamera = async () => {
    try {
      setStatus("カメラを起動中...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: {
            ideal: 1280,
          },
          height: {
            ideal: 720,
          },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      videoRef.current.srcObject = stream;

      await videoRef.current.play();

      setCameraStarted(true);

      setStatus("カメラ起動完了。認識モデルを読み込み中...");

      initializeModels();
    } catch (error) {
      console.error(error);

      setStatus("カメラを起動できませんでした");
    }
  };

  useEffect(() => {
    if (activeTab !== "battle" || !cameraStarted) {
      return;
    }

    const video = videoRef.current;
    const stream = streamRef.current;

    if (!video || !stream) {
      return;
    }

    video.srcObject = stream;
    void video.play().catch((error) => {
      console.error("カメラ映像の再生に失敗しました:", error);
    });
  }, [activeTab, cameraStarted]);

  // --------------------------------
  // MediaPipe
  // --------------------------------

  const initializeModels = async (
    playerLimit = maxPlayers,
    handLimit = maxHands,
  ) => {
    try {
      setModelReady(false);

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }

      handLandmarkerRef.current?.close();
      poseLandmarkerRef.current?.close();
      faceLandmarkerRef.current?.close();

      handLandmarkerRef.current = null;
      poseLandmarkerRef.current = null;
      faceLandmarkerRef.current = null;
      lastTimeRef.current = -1;

      const vision = await FilesetResolver.forVisionTasks("/mediapipe");

      // ----------------------------
      // 手
      // ----------------------------

      setStatus("手・指の認識モデルを読み込み中...");

      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },

        runningMode: "VIDEO",

        numHands: handLimit,

        minHandDetectionConfidence: 0.4,

        minHandPresenceConfidence: 0.4,

        minTrackingConfidence: 0.4,
      });

      handLandmarkerRef.current = handLandmarker;

      // ----------------------------
      // 全身
      // ----------------------------

      setStatus("全身認識モデルを読み込み中...");

      const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },

        runningMode: "VIDEO",

        numPoses: playerLimit,

        minPoseDetectionConfidence: 0.4,

        minPosePresenceConfidence: 0.4,

        minTrackingConfidence: 0.4,
      });

      poseLandmarkerRef.current = poseLandmarker;

      // ----------------------------
      // 顔
      // ----------------------------

      setStatus("顔・口の認識モデルを読み込み中...");

      const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/models/face_landmarker.task",
          delegate: "GPU",
        },

        runningMode: "VIDEO",

        numFaces: playerLimit,

        minFaceDetectionConfidence: 0.4,

        minFacePresenceConfidence: 0.4,

        minTrackingConfidence: 0.4,

        outputFaceBlendshapes: true,
      });

      faceLandmarkerRef.current = faceLandmarker;

      setModelReady(true);

      setStatus("SYSTEM READY");

      startDetection();
    } catch (error) {
      console.error(error);

      setStatus("MediaPipeの読み込みに失敗しました");
    }
  };

  // --------------------------------
  // 認識ループ
  // --------------------------------

  const startDetection = () => {
    animationRef.current = requestAnimationFrame(detect);
  };

  const spawnHitEffect = (
    x: number,
    y: number,
    color: string,
    damage: number,
    target: PlayerId,
  ) => {
    hitEffectsRef.current = [
      ...hitEffectsRef.current,
      {
        x,
        y,
        life: 600,
        maxLife: 600,
        radius: 0.08,
        color,
        damage,
        target,
      },
    ].slice(-12);
  };

  const spawnLightningEffect = (target: BattlePlayer) => {
    lightningEffectsRef.current = [
      ...lightningEffectsRef.current,
      {
        x: target.center.x,
        y: target.center.y,
        life: 760,
        maxLife: 760,
        target: target.id,
        seed: Math.random() * 1000,
      },
    ].slice(-6);
  };

  const spawnHealEffect = (target: BattlePlayer, amount: number) => {
    healEffectsRef.current = [
      ...healEffectsRef.current,
      {
        x: target.center.x,
        y: target.center.y,
        life: 760,
        maxLife: 760,
        target: target.id,
        amount,
      },
    ].slice(-6);
  };

  const recordAttack = (
    type: AttackRecord["type"],
    owner: PlayerId,
    target: PlayerId | null,
    time: number,
  ) => {
    const recent = attackRecordsRef.current.findLast(
      (attack) =>
        attack.type === type &&
        attack.owner === owner &&
        attack.target === target &&
        time - attack.startedAt < 700,
    );

    if (recent) {
      return recent;
    }

    const attack = {
      id: nextAttackIdRef.current,
      type,
      owner,
      target,
      startedAt: time,
      lastHitAt: null,
    };

    nextAttackIdRef.current += 1;
    attackRecordsRef.current = [...attackRecordsRef.current, attack].slice(-50);

    return attack;
  };

  const markAttackHit = (attackId: number, time: number) => {
    attackRecordsRef.current = attackRecordsRef.current.map((attack) =>
      attack.id === attackId
        ? {
            ...attack,
            lastHitAt: time,
          }
        : attack,
    );
  };

  const triggerThunderAttack = (
    attacker: BattlePlayer,
    defender: BattlePlayer,
    time: number,
  ) => {
    const attack = recordAttack("thunder", attacker.id, defender.id, time);

    markAttackHit(attack.id, time);

    spawnLightningEffect(defender);

    applyBattleDamage(
      defender.id,
      THUNDER_DAMAGE,
      defender.center.x,
      defender.center.y,
      "#f8fbff",
    );

    thunderCooldownUntilRef.current[attacker.id] = time + THUNDER_COOLDOWN;
    thunderChargeStartedRef.current[attacker.id] = null;
  };

  const applyHeal = (player: BattlePlayer, amount: number) => {
    if (battleWinner) {
      return;
    }

    if (player.id === "player1") {
      setPlayerHP((current) => Math.min(MAX_HP, current + amount));
    } else {
      setPlayer2HP((current) => Math.min(MAX_HP, current + amount));
    }

    spawnHealEffect(player, amount);
  };

  const triggerHeal = (player: BattlePlayer, time: number) => {
    const attack = recordAttack("heal", player.id, player.id, time);

    markAttackHit(attack.id, time);

    applyHeal(player, HEAL_AMOUNT);

    healCooldownUntilRef.current[player.id] = time + HEAL_COOLDOWN;
    healChargeStartedRef.current[player.id] = null;
  };

  const applyBattleDamage = (
    target: PlayerId,
    amount: number,
    hitX?: number,
    hitY?: number,
    hitColor?: string,
  ) => {
    if (battleWinner) {
      return;
    }

    battleStartedRef.current = true;

    if (target === "player2") {
      setPlayer2HP((current) => {
        const next = Math.max(0, current - amount);

        if (hitX !== undefined && hitY !== undefined) {
          spawnHitEffect(hitX, hitY, hitColor ?? "#ff6b6b", amount, target);
        }

        damageFlashUntilRef.current[target] =
          performance.now() + DAMAGE_FLASH_TIME;

        const winner = getTimerWinner(playerHP, next);

        if (winner) {
          setBattleWinner(winner);
        }

        return next;
      });
      return;
    }

    setPlayerHP((current) => {
      const next = Math.max(0, current - amount);

      if (hitX !== undefined && hitY !== undefined) {
        spawnHitEffect(hitX, hitY, hitColor ?? "#53d4ff", amount, target);
      }

      damageFlashUntilRef.current[target] =
        performance.now() + DAMAGE_FLASH_TIME;

      const winner = getTimerWinner(next, player2HP);

      if (winner) {
        setBattleWinner(winner);
      }

      return next;
    });
  };

  const updatePunchFireballs = (
    time: number,
    handAssignments: HandAssignment[],
    battlePlayers: BattlePlayer[],
  ) => {
    const punchStates = punchStatesRef.current;

    let trackedHandEntries = handAssignments.flatMap((assignment) =>
      assignment.hands.map((hand) => ({
        hand,
        owner: assignment.player.id,
      })),
    );

    const previousFrameTime = punchStates.reduce(
      (latest, state) => Math.max(latest, state.previousTime),
      0,
    );

    const frameDelta =
      previousFrameTime > 0 ? Math.min(50, time - previousFrameTime) : 16;

    let trackedHands = trackedHandEntries.map((entry) => entry.hand);

    if (
      trackedHands.length === 2 &&
      punchStates[0]?.previousCenter &&
      punchStates[1]?.previousCenter
    ) {
      const firstCenter = getFistCenter(trackedHands[0]);

      const secondCenter = getFistCenter(trackedHands[1]);

      if (firstCenter && secondCenter) {
        const sameOrderDistance =
          distance(punchStates[0].previousCenter, firstCenter) +
          distance(punchStates[1].previousCenter, secondCenter);

        const swappedOrderDistance =
          distance(punchStates[0].previousCenter, secondCenter) +
          distance(punchStates[1].previousCenter, firstCenter);

        if (swappedOrderDistance < sameOrderDistance) {
          trackedHandEntries = [trackedHandEntries[1], trackedHandEntries[0]];
          trackedHands = trackedHandEntries.map((entry) => entry.hand);
        }
      }
    }

    const fistDistance = getFistDistance(trackedHands);

    const fistsAreSeparated =
      trackedHands.length < 2 || fistDistance > MIN_FIST_DISTANCE;

    fireballsRef.current = fireballsRef.current
      .map((fireball) => ({
        ...fireball,
        x: fireball.x + fireball.vx * frameDelta,
        y: fireball.y + fireball.vy * frameDelta,
        life: fireball.life - frameDelta,
      }))
      .filter(
        (fireball) =>
          fireball.life > 0 &&
          fireball.x > -0.35 &&
          fireball.x < 1.35 &&
          fireball.y > -0.35 &&
          fireball.y < 1.35,
      );

    const hitFireballs = new Set<number>();

    fireballsRef.current.forEach((fireball, fireballIndex) => {
      if (!fireball.owner) {
        return;
      }

      const defender = battlePlayers.find(
        (player) => player.id !== fireball.owner,
      );

      if (!defender) {
        return;
      }

      const hit = isCircleCollidingWithTarget(
        {
          x: fireball.x,
          y: fireball.y,
          z: 0,
        },
        fireball.radius,
        defender.center,
        defender.radius,
      );

      if (!hit) {
        return;
      }

      hitFireballs.add(fireballIndex);

      if (fireball.attackId) {
        markAttackHit(fireball.attackId, time);
      }

      applyBattleDamage(
        defender.id,
        FIREBALL_DAMAGE,
        defender.center.x,
        defender.center.y,
        getPlayerColor(defender.id),
      );
    });

    if (hitFireballs.size > 0) {
      fireballsRef.current = fireballsRef.current.filter(
        (_, index) => !hitFireballs.has(index),
      );
    }

    trackedHands.forEach((hand, handIndex) => {
      const owner = trackedHandEntries[handIndex]?.owner ?? null;

      const center = getFistCenter(hand);

      const isPunchReady = isFist(hand) && fistsAreSeparated && center;

      if (!punchStates[handIndex]) {
        punchStates[handIndex] = {
          previousCenter: null,
          previousSize: 0,
          previousTime: time,
          trajectory: [],
          charge: 0,
          cooldown: 0,
          ready: false,
        };
      }

      const state = punchStates[handIndex];

      const handSize = getHandSize(hand);

      state.cooldown = Math.max(0, state.cooldown - frameDelta);

      if (!center || !isPunchReady) {
        state.previousCenter = center;
        state.previousSize = handSize;
        state.previousTime = time;
        state.trajectory = center ? [center] : [];
        state.charge = fistsAreSeparated ? state.charge : 0;
        state.ready = false;
        return;
      }

      const deltaTime = Math.max(1, time - state.previousTime);

      const velocity = state.previousCenter
        ? {
            x: (center.x - state.previousCenter.x) / deltaTime,
            y: (center.y - state.previousCenter.y) / deltaTime,
          }
        : {
            x: 0,
            y: 0,
          };

      const speed = Math.sqrt(
        velocity.x * velocity.x + velocity.y * velocity.y,
      );

      const movementDistance = state.previousCenter
        ? distance(state.previousCenter, center)
        : 0;

      const minPunchMoveDistance = Math.max(
        MIN_PUNCH_MOVE_DISTANCE,
        handSize * MIN_PUNCH_MOVE_SCALE,
      );

      const lastTrajectoryPoint = state.trajectory[state.trajectory.length - 1];

      const trajectoryStep = Math.max(0.008, handSize * 0.08);

      if (
        !lastTrajectoryPoint ||
        distance(lastTrajectoryPoint, center) > trajectoryStep
      ) {
        state.trajectory = [...state.trajectory, center].slice(-7);
      }

      const trajectoryStraightness = getTrajectoryStraightness(
        state.trajectory,
      );

      const growthSpeed =
        state.previousSize > 0
          ? (handSize - state.previousSize) / deltaTime
          : 0;

      state.charge = Math.min(MAX_PUNCH_CHARGE, state.charge + deltaTime);

      state.ready = true;

      if (
        (speed > 0.00065 || growthSpeed > 0.00018) &&
        movementDistance > minPunchMoveDistance &&
        trajectoryStraightness > MIN_PUNCH_STRAIGHTNESS &&
        state.charge > MIN_PUNCH_CHARGE &&
        state.cooldown === 0
      ) {
        const direction = getNormalizedDirection(
          state.previousCenter ?? center,
          center,
        );

        const chargeRatio = Math.min(1, state.charge / MAX_PUNCH_CHARGE);

        const fireballSpeed = Math.min(0.0024, Math.max(0.0009, speed * 0.55));

        const attack = owner
          ? recordAttack("fireball", owner, null, time)
          : null;

        fireballsRef.current = [
          ...fireballsRef.current,
          {
            x: center.x,
            y: center.y,
            vx: direction.x * fireballSpeed,
            vy: direction.y * fireballSpeed,
            radius: 0.035 + chargeRatio * 0.075,
            life: 1700,
            maxLife: 1700,
            owner,
            attackId: attack?.id ?? null,
          },
        ].slice(-8);

        state.charge = 0;
        state.cooldown = PUNCH_COOLDOWN;
        state.trajectory = [center];
      }

      state.previousCenter = center;
      state.previousSize = handSize;
      state.previousTime = time;
    });
  };

  const detect = () => {
    if (battleWinner) {
      return;
    }

    const video = videoRef.current;

    const handLandmarker = handLandmarkerRef.current;

    const poseLandmarker = poseLandmarkerRef.current;

    const faceLandmarker = faceLandmarkerRef.current;

    if (!video || !handLandmarker || !poseLandmarker || !faceLandmarker) {
      animationRef.current = requestAnimationFrame(detect);

      return;
    }

    if (video.readyState >= 2 && video.currentTime !== lastTimeRef.current) {
      lastTimeRef.current = video.currentTime;

      // eslint-disable-next-line react-hooks/purity
      const now = performance.now();

      // 手
      const handResult = handLandmarker.detectForVideo(video, now);

      // 全身
      const poseResult = poseLandmarker.detectForVideo(video, now);

      // 顔
      const faceResult = faceLandmarker.detectForVideo(video, now);

      setHands(handResult.landmarks.length);

      setBodyCount(poseResult.landmarks.length);

      setFaceCount(faceResult.faceLandmarks.length);

      const faceAttackStates = faceResult.faceLandmarks.map(getFaceAttackState);

      const battlePlayers = getBattlePlayers(
        faceResult.faceLandmarks,
        faceAttackStates,
      );

      const handAssignments = assignHandsToPlayers(
        handResult.landmarks,
        battlePlayers,
      );

      updatePunchFireballs(now, handAssignments, battlePlayers);

      const thunderChargingPlayers = new Set<PlayerId>();
      const healChargingPlayers = new Set<PlayerId>();

      handAssignments.forEach((assignment) => {
        const healing = assignment.hands.some(isPeaceHand);

        if (
          !healing ||
          now < healCooldownUntilRef.current[assignment.player.id]
        ) {
          healChargeStartedRef.current[assignment.player.id] = null;
        } else {
          healChargingPlayers.add(assignment.player.id);

          if (healChargeStartedRef.current[assignment.player.id] === null) {
            healChargeStartedRef.current[assignment.player.id] = now;
          }

          const healStarted =
            healChargeStartedRef.current[assignment.player.id];

          if (healStarted !== null && now - healStarted >= HEAL_CHARGE_TIME) {
            triggerHeal(assignment.player, now);
            healChargingPlayers.delete(assignment.player.id);
          }
        }

        const charging = isThunderPrayerPose(assignment);

        if (
          !charging ||
          now < thunderCooldownUntilRef.current[assignment.player.id]
        ) {
          thunderChargeStartedRef.current[assignment.player.id] = null;
          return;
        }

        thunderChargingPlayers.add(assignment.player.id);

        if (thunderChargeStartedRef.current[assignment.player.id] === null) {
          thunderChargeStartedRef.current[assignment.player.id] = now;
        }

        const defender = getOpponent(assignment.player, battlePlayers);

        if (!defender) {
          return;
        }

        const chargeStarted =
          thunderChargeStartedRef.current[assignment.player.id];

        if (
          chargeStarted !== null &&
          now - chargeStarted >= THUNDER_CHARGE_TIME
        ) {
          triggerThunderAttack(assignment.player, defender, now);
          thunderChargingPlayers.delete(assignment.player.id);
        }
      });

      const activePlayer = battlePlayers.find(
        (player) => player.attack.beamActive,
      );

      const displayFaceState = activePlayer?.attack ?? faceAttackStates[0];

      setPlayerMarkers(
        battlePlayers.map((player) => {
          const thunderStarted = thunderChargeStartedRef.current[player.id];
          const healStarted = healChargeStartedRef.current[player.id];

          return {
            handCount:
              handAssignments.find(
                (assignment) => assignment.player.id === player.id,
              )?.hands.length ?? 0,
            id: player.id,
            x: 1 - player.center.x,
            y: Math.max(0.08, player.center.y - player.radius),
            damaged: now < damageFlashUntilRef.current[player.id],
            attacking:
              player.attack.beamActive ||
              thunderChargingPlayers.has(player.id) ||
              healChargingPlayers.has(player.id),
            chargingThunder: thunderChargingPlayers.has(player.id),
            thunderProgress:
              thunderStarted === null
                ? 0
                : Math.min(1, (now - thunderStarted) / THUNDER_CHARGE_TIME),
            chargingHeal: healChargingPlayers.has(player.id),
            healProgress:
              healStarted === null
                ? 0
                : Math.min(1, (now - healStarted) / HEAL_CHARGE_TIME),
          };
        }),
      );

      setMouthRatio(displayFaceState?.mouthRatio ?? 0);
      setLeftEyeRatio(displayFaceState?.leftEyeRatio ?? 0);
      setRightEyeRatio(displayFaceState?.rightEyeRatio ?? 0);
      setMouthOpen(displayFaceState?.mouthOpen ?? false);
      setLeftEyeOpen(displayFaceState?.leftEyeOpen ?? false);
      setRightEyeOpen(displayFaceState?.rightEyeOpen ?? false);

      hitEffectsRef.current = hitEffectsRef.current
        .map((effect) => ({
          ...effect,
          life: effect.life - 16,
        }))
        .filter((effect) => effect.life > 0);

      lightningEffectsRef.current = lightningEffectsRef.current
        .map((effect) => ({
          ...effect,
          life: effect.life - 16,
        }))
        .filter((effect) => effect.life > 0);

      healEffectsRef.current = healEffectsRef.current
        .map((effect) => ({
          ...effect,
          life: effect.life - 16,
        }))
        .filter((effect) => effect.life > 0);

      handAssignments.forEach((assignment) => {
        const shockwave = getHandShockwaveData(assignment.hands);

        if (!shockwave) {
          return;
        }

        const defender = getOpponent(assignment.player, battlePlayers);

        if (!defender) {
          return;
        }

        const attack = recordAttack(
          "shockwave",
          assignment.player.id,
          defender.id,
          now,
        );

        const hit = isShockwaveCollidingWithTarget(
          shockwave.center,
          shockwave.direction,
          shockwave.strength,
          defender.center,
          defender.radius,
        );

        if (
          hit &&
          now - lastShockwaveDamageRef.current[defender.id] >=
            SHOCKWAVE_DAMAGE_COOLDOWN
        ) {
          lastShockwaveDamageRef.current[defender.id] = now;
          markAttackHit(attack.id, now);

          applyBattleDamage(
            defender.id,
            SHOCKWAVE_DAMAGE,
            defender.center.x,
            defender.center.y,
            getPlayerColor(defender.id),
          );
        }
      });

      battlePlayers.forEach((attacker) => {
        if (!attacker.attack.beamActive) {
          return;
        }

        const defender = getOpponent(attacker, battlePlayers);

        if (!defender) {
          return;
        }

        const attack = recordAttack("beam", attacker.id, defender.id, now);

        const beamInfo = getMouthBeamInfo(
          attacker.face,
          getBattleBeamTarget(attacker, defender),
        );

        if (beamInfo) {
          const hit = isBeamCollidingWithTarget(
            beamInfo.start,
            beamInfo.end,
            defender.center,
            defender.radius,
          );

          if (
            hit &&
            now - lastBeamDamageRef.current[defender.id] >= BEAM_DAMAGE_COOLDOWN
          ) {
            lastBeamDamageRef.current[defender.id] = now;
            markAttackHit(attack.id, now);

            applyBattleDamage(
              defender.id,
              8,
              defender.center.x,
              defender.center.y,
              getPlayerColor(defender.id),
            );
          }
        }
      });

      draw(
        handResult.landmarks,
        poseResult.landmarks,
        faceResult.faceLandmarks,
        faceAttackStates,
        handAssignments,
        battlePlayers,
        fireballsRef.current,
        now,
        showJointGuides,
      );
    }

    animationRef.current = requestAnimationFrame(detect);
  };

  // --------------------------------
  // 描画
  // --------------------------------

  const draw = (
    hands: Point[][],
    poses: Point[][],
    faces: Point[][],
    faceAttackStates: FaceAttackState[],
    handAssignments: HandAssignment[],
    battlePlayers: BattlePlayer[],
    fireballs: Fireball[],
    time: number,
    showGuides: boolean,
  ) => {
    const canvas = canvasRef.current;

    const video = videoRef.current;

    if (!canvas || !video) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    canvas.width = video.videoWidth;

    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (showGuides) {
      // ----------------------------
      // 全身
      // ----------------------------

      poses.forEach((pose) => {
        ctx.strokeStyle = "#00aaff";

        ctx.fillStyle = "#00aaff";

        ctx.lineWidth = 5;

        for (const [a, b] of POSE_CONNECTIONS) {
          const p1 = pose[a];

          const p2 = pose[b];

          if (!p1 || !p2) {
            continue;
          }

          if (p1.visibility !== undefined && p1.visibility < 0.3) {
            continue;
          }

          if (p2.visibility !== undefined && p2.visibility < 0.3) {
            continue;
          }

          ctx.beginPath();

          ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);

          ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);

          ctx.stroke();
        }

        pose.forEach((point) => {
          if (point.visibility !== undefined && point.visibility < 0.3) {
            return;
          }

          ctx.beginPath();

          ctx.arc(
            point.x * canvas.width,
            point.y * canvas.height,
            7,
            0,
            Math.PI * 2,
          );

          ctx.fill();
        });
      });
    }

    // ----------------------------
    // 手・指
    // ----------------------------

    handAssignments.forEach((assignment) =>
      drawHandShockwave(ctx, canvas, assignment.hands, time),
    );

    drawFireballs(ctx, canvas, fireballs, time);

    drawHitEffects(ctx, canvas, hitEffectsRef.current);

    drawHealEffects(ctx, canvas, healEffectsRef.current);

    drawLightningEffects(ctx, canvas, lightningEffectsRef.current);

    const HAND_CONNECTIONS = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],

      [0, 5],
      [5, 6],
      [6, 7],
      [7, 8],

      [0, 9],
      [9, 10],
      [10, 11],
      [11, 12],

      [0, 13],
      [13, 14],
      [14, 15],
      [15, 16],

      [0, 17],
      [17, 18],
      [18, 19],
      [19, 20],

      [5, 9],
      [9, 13],
      [13, 17],
    ];

    if (showGuides) {
      hands.forEach((hand, handIndex) => {
        const color = handIndex === 0 ? "#00ff88" : "#ff00ff";

        ctx.strokeStyle = color;

        ctx.fillStyle = color;

        ctx.lineWidth = 4;

        for (const [a, b] of HAND_CONNECTIONS) {
          const p1 = hand[a];

          const p2 = hand[b];

          if (!p1 || !p2) {
            continue;
          }

          ctx.beginPath();

          ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);

          ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);

          ctx.stroke();
        }

        hand.forEach((point, index) => {
          const isTip = FINGER_TIPS.includes(index);

          ctx.beginPath();

          ctx.arc(
            point.x * canvas.width,
            point.y * canvas.height,
            isTip ? 12 : 5,
            0,
            Math.PI * 2,
          );

          ctx.fill();
        });
      });
    }

    // ----------------------------
    // 顔・口
    // ----------------------------

    faces.forEach((face, faceIndex) => {
      const battlePlayer = battlePlayers.find((player) => player.face === face);

      const opponent = battlePlayer
        ? getOpponent(battlePlayer, battlePlayers)
        : undefined;

      const attackState = battlePlayer?.attack ?? faceAttackStates[faceIndex];

      if (attackState?.beamActive) {
        drawMouthBeam(
          ctx,
          canvas,
          face,
          time,
          battlePlayer && opponent
            ? getBattleBeamTarget(battlePlayer, opponent)
            : undefined,
        );
      }

      if (showGuides) {
        ctx.fillStyle = "#ffff00";

        MOUTH_POINTS.forEach((index) => {
          const point = face[index];

          if (!point) {
            return;
          }

          ctx.beginPath();

          ctx.arc(
            point.x * canvas.width,
            point.y * canvas.height,
            3,
            0,
            Math.PI * 2,
          );

          ctx.fill();
        });
      }
    });
  };

  // --------------------------------
  // 終了処理
  // --------------------------------

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());

      handLandmarkerRef.current?.close();

      poseLandmarkerRef.current?.close();

      faceLandmarkerRef.current?.close();
    };
  }, []);

  return (
    <div className="app">
      <SettingsTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "settings" ? (
        <SettingsScreen
          settings={{
            maxPlayers,
            maxHands,
            showJointGuides,
          }}
          onApply={applySettings}
        />
      ) : (
        <>
          {battleWinner && (
            <div className="battle-result-screen">
              <div className="battle-result-card">
                <div className="battle-result-title">決着</div>
                <div className="battle-result-winner">{battleWinner} WIN</div>
                <div className="battle-result-sub">HPが残っている方の勝ち</div>
                <button
                  type="button"
                  className="rematch-button"
                  onClick={() => {
                    resetBattleState();
                    setStatus("再戦開始");
                  }}
                >
                  ↻ 再戦
                </button>
              </div>
            </div>
          )}

          <h1>必殺技ジェネレーター</h1>

          <p className="subtitle">ULTIMATE ATTACK SYSTEM</p>

          <div className="status-row">
            <div className="tiny-panel">
              <span>PLAYER 1 HP</span>
              <strong>{playerHP}</strong>
            </div>
            <div className="tiny-panel player2-panel">
              <span>PLAYER 2 HP</span>
              <strong>{player2HP}</strong>
            </div>
          </div>

          <div className="camera">
            {!cameraStarted && (
              <div className="start">
                <h2>全身を構えろ</h2>

                <p>手・指・顔・全身を認識</p>

                <button onClick={startCamera}>カメラを起動</button>
              </div>
            )}

            <video ref={videoRef} autoPlay playsInline muted />

            <canvas ref={canvasRef} />

            <div className="status">{status}</div>

            {playerMarkers.map((marker) => (
              <div
                key={marker.id}
                className={[
                  "player-marker",
                  marker.id,
                  marker.damaged ? "damaged" : "",
                  marker.attacking ? "attacking" : "",
                ].join(" ")}
                style={{
                  left: `${marker.x * 100}%`,
                  top: `${marker.y * 100}%`,
                }}
              >
                <span>{getPlayerLabel(marker.id)}</span>
                <small>
                  {marker.chargingHeal
                    ? "HEAL"
                    : marker.chargingThunder
                      ? "THUNDER"
                      : `${marker.handCount} HANDS`}
                </small>
                {(marker.chargingThunder || marker.chargingHeal) && (
                  <div
                    className={
                      marker.chargingHeal ? "heal-charge" : "thunder-charge"
                    }
                  >
                    <b
                      style={{
                        width: `${
                          (marker.chargingHeal
                            ? marker.healProgress
                            : marker.thunderProgress) * 100
                        }%`,
                      }}
                    />
                  </div>
                )}
              </div>
            ))}

            {modelReady && (
              <div className={`mouth-status ${mouthOpen ? "open" : "closed"}`}>
                {mouthOpen ? "OPEN" : "CLOSED"}
              </div>
            )}
          </div>

          <div className="info">
            <div>
              <span>HANDS</span>

              <strong>
                {hands} / {maxHands}
              </strong>
            </div>

            <div>
              <span>FULL BODY</span>

              <strong>
                {bodyCount} / {maxPlayers}
              </strong>
            </div>

            <div>
              <span>FACES</span>

              <strong>
                {faceCount} / {maxPlayers}
              </strong>
            </div>

            <div>
              <span>MOUTH</span>

              <strong>{mouthOpen ? "OPEN" : "CLOSED"}</strong>
            </div>
          </div>

          <div className="mouth-debug">
            MOUTH RATIO: {mouthRatio.toFixed(3)}
          </div>

          <div className="eye-status">
            <strong>LEFT EYE: {leftEyeOpen ? "OPEN" : "CLOSED"}</strong>
            <span></span>
            <strong>RIGHT EYE: {rightEyeOpen ? "OPEN" : "CLOSED"}</strong>
          </div>

          <div className="eye-debug">
            LEFT: {leftEyeRatio.toFixed(3)}
            <span></span>
            RIGHT: {rightEyeRatio.toFixed(3)}
          </div>

          <div className="instruction">
            手・指・顔・全身
            <br />
            <strong>全部使って必殺技を放て。</strong>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
