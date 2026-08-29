import { useCallback, useEffect, useRef, useState } from "react";
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

const PLAYER_IDS = ["player1", "player2", "player3", "player4"] as const;

type PlayerId = (typeof PLAYER_IDS)[number];

type PlayerHp = Record<PlayerId, number>;

type Fireball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  chargeLevel: number;
  life: number;
  maxLife: number;
  owner: PlayerId | null;
  attackId: number | null;
};

type VoiceTextAttack = {
  text: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  fontSize: number;
  radius: number;
  damage: number;
  delay: number;
  seed: number;
  life: number;
  maxLife: number;
  owner: PlayerId;
  target: PlayerId;
  attackId: number;
  color: string;
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

type DefenseEffect = {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  target: PlayerId;
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
  chargeAnchor: Point | null;
  punchReadyUntil: number;
  trajectory: Point[];
  charge: number;
  cooldown: number;
  ready: boolean;
};

const FINGER_TIPS = [4, 8, 12, 16, 20];
const OPEN_HAND_TIPS = [8, 12, 16, 20];
const MAX_PUNCH_CHARGE = 3000;
const MIN_PUNCH_CHARGE = 500;
const FIREBALL_CHARGE_STAGE_TIME = 500;
const FIREBALL_LEVELS = [
  { radius: 0.04, damage: 8 },
  { radius: 0.055, damage: 12 },
  { radius: 0.072, damage: 17 },
  { radius: 0.09, damage: 23 },
  { radius: 0.112, damage: 30 },
] as const;
const MIN_FIST_DISTANCE = 0.14;
const MIN_PUNCH_MOVE_SCALE = 0.32;
const MIN_PUNCH_MOVE_DISTANCE = 0.04;
const PUNCH_STILL_MOVE_BUFFER = 0.018;
const PUNCH_READY_BUFFER_TIME = 480;
const MIN_PUNCH_STRAIGHTNESS = 0.58;
const PUNCH_COOLDOWN = 520;
const BEAM_DAMAGE = 6;
const BEAM_DAMAGE_COOLDOWN = 500;
const SHOCKWAVE_DAMAGE_COOLDOWN = 650;
const DAMAGE_FLASH_TIME = 650;
const BEAM_TARGET_RADIUS_MIN = 0.075;
const BEAM_TARGET_RADIUS_SCALE = 0.52;
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
const VOICE_CHARACTER_DAMAGE = 2;
const VOICE_ATTACK_COOLDOWN = 260;
const VOICE_ATTACK_LIFE = 1800;
const VOICE_SOUND_START_LEVEL = 7;
const VOICE_SOUND_END_LEVEL = 3;
const VOICE_SILENCE_RESET_TIME = 720;
const VOICE_MOUTH_ACTIVITY_DECAY = 0.9;
const VOICE_MOUTH_ACTIVITY_WEIGHT = 18;
const DEFENSE_DAMAGE = 1;
const DEFENSE_MIN_HAND_SIZE = 0.045;
const DEFENSE_MAX_PALM_Z_SPREAD = 0.09;
const FACE_TRACK_MAX_DISTANCE = 0.28;
const FACE_MISSING_DAMAGE = 5;
const FACE_MISSING_DAMAGE_INTERVAL = 1500;
const MAX_HP = 300;

type BattleWinner = PlayerId;

const PLAYER_COLORS: Record<PlayerId, string> = {
  player1: "#53d4ff",
  player2: "#ff6b6b",
  player3: "#58ff9a",
  player4: "#ffcc66",
};

const WAZA_LABELS: Record<DamageAttackType, string> = {
  beam: "レーザー",
  fireball: "火球",
  shockwave: "衝撃波",
  thunder: "雷撃",
  voice: "VOICE",
};

function getActivePlayerIds(maxPlayers: number) {
  return PLAYER_IDS.slice(0, maxPlayers);
}

function createPlayerHp(): PlayerHp {
  return PLAYER_IDS.reduce(
    (hp, playerId) => ({
      ...hp,
      [playerId]: MAX_HP,
    }),
    {} as PlayerHp,
  );
}

function createPlayerNumberRecord(value: number): Record<PlayerId, number> {
  return PLAYER_IDS.reduce(
    (record, playerId) => ({
      ...record,
      [playerId]: value,
    }),
    {} as Record<PlayerId, number>,
  );
}

function createPlayerNullableNumberRecord(
  value: number | null,
): Record<PlayerId, number | null> {
  return PLAYER_IDS.reduce(
    (record, playerId) => ({
      ...record,
      [playerId]: value,
    }),
    {} as Record<PlayerId, number | null>,
  );
}

function createPlayerStringRecord(value: string): Record<PlayerId, string> {
  return PLAYER_IDS.reduce(
    (record, playerId) => ({
      ...record,
      [playerId]: value,
    }),
    {} as Record<PlayerId, string>,
  );
}

function createTrackedPlayerSlots(): Record<PlayerId, TrackedPlayerSlot> {
  return PLAYER_IDS.reduce(
    (slots, playerId) => ({
      ...slots,
      [playerId]: {
        id: playerId,
        face: null,
        center: null,
        radius: BEAM_TARGET_RADIUS_MIN,
        attack: null,
        registered: false,
        visible: false,
        lastSeenAt: 0,
      },
    }),
    {} as Record<PlayerId, TrackedPlayerSlot>,
  );
}

function getBattleWinner(
  playerHp: PlayerHp,
  activePlayerIds: PlayerId[],
): BattleWinner | null {
  if (activePlayerIds.length < 2) {
    return null;
  }

  const alivePlayers = activePlayerIds.filter(
    (playerId) => playerHp[playerId] > 0,
  );

  return alivePlayers.length === 1 ? alivePlayers[0] : null;
}

function getRegisteredPlayerIds(
  slots: Record<PlayerId, TrackedPlayerSlot>,
  maxPlayers: number,
) {
  return getActivePlayerIds(maxPlayers).filter(
    (playerId) => slots[playerId].registered,
  );
}

function getFireballChargeLevel(chargeTime: number) {
  const extraChargeTime = Math.max(0, chargeTime - MIN_PUNCH_CHARGE);

  return Math.min(
    FIREBALL_LEVELS.length,
    Math.floor(extraChargeTime / FIREBALL_CHARGE_STAGE_TIME) + 1,
  );
}

function getFireballLevelStats(chargeTime: number) {
  return FIREBALL_LEVELS[getFireballChargeLevel(chargeTime) - 1];
}

function getFireballChargeProgress(chargeTime: number) {
  return Math.min(1, Math.max(0, chargeTime / MAX_PUNCH_CHARGE));
}

function isDamageAttackType(
  type: AttackRecord["type"],
): type is DamageAttackType {
  return type !== "heal";
}

type FaceAttackState = ReturnType<typeof getFaceAttackState>;

type BattlePlayer = {
  id: PlayerId;
  face: Point[];
  center: Point;
  radius: number;
  attack: FaceAttackState;
};

type TrackedPlayerSlot = {
  id: PlayerId;
  face: Point[] | null;
  center: Point | null;
  radius: number;
  attack: FaceAttackState | null;
  registered: boolean;
  visible: boolean;
  lastSeenAt: number;
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
  defending: boolean;
  missing: boolean;
  fireballChargeLevel: number;
  fireballChargeProgress: number;
};

type HandAssignment = {
  player: BattlePlayer;
  hands: Point[][];
};

type DefenseState = {
  playerId: PlayerId;
  center: Point;
  radius: number;
};

type AttackRecord = {
  id: number;
  type: "beam" | "fireball" | "shockwave" | "thunder" | "heal" | "voice";
  owner: PlayerId;
  target: PlayerId | null;
  startedAt: number;
  lastHitAt: number | null;
  photo: string | null;
};

type DamageAttackType = Exclude<AttackRecord["type"], "heal">;

type BestWazaEntry = {
  key: string;
  type: DamageAttackType;
  owner: PlayerId;
  damage: number;
  attackId: number;
  attackCount: number;
  photo: string | null;
  updatedAt: number;
};

type VoiceAttackTarget = {
  owner: PlayerId;
  target: PlayerId;
  start: Point;
  targetCenter: Point;
  targetRadius: number;
  eyesClosed: boolean;
};

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  0: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultsLike = {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: SpeechRecognitionResultsLike;
};

type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
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

function isDefenseOpenHand(hand: Point[]) {
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
      distance(wrist, tip) > distance(wrist, pip) * 1.08 &&
      distance(palmCenter, tip) > distance(palmCenter, pip) * 1.01
    );
  }).length;

  return extendedCount >= 2;
}

function isOpenPalmFacingCamera(hand: Point[]) {
  const palmCenter = getPalmCenter(hand);
  const wrist = hand[0];

  if (!palmCenter || !wrist || !isDefenseOpenHand(hand)) {
    return false;
  }

  const handSize = getHandSize(hand);

  if (handSize < DEFENSE_MIN_HAND_SIZE) {
    return false;
  }

  const palmPoints = [hand[0], hand[5], hand[9], hand[13], hand[17]].filter(
    (point): point is Point => point !== undefined,
  );
  const palmZValues = palmPoints.map((point) => point.z);
  const palmZSpread = Math.max(...palmZValues) - Math.min(...palmZValues);
  const fingerCenter = getFingerCenter(hand);

  if (!fingerCenter) {
    return false;
  }

  const tips = OPEN_HAND_TIPS.map((index) => hand[index]).filter(
    (point): point is Point => point !== undefined,
  );
  const tipSpread = Math.max(
    ...tips.map((tip, index) =>
      tips
        .slice(index + 1)
        .reduce((largest, otherTip) => Math.max(largest, distance(tip, otherTip)), 0),
    ),
  );

  const fingersRaisedFromWrist = distance(wrist, fingerCenter) > handSize * 0.65;
  const palmLooksFlat =
    palmZSpread < Math.max(DEFENSE_MAX_PALM_Z_SPREAD, handSize * 0.75);
  const fingersSpread = tipSpread > handSize * 0.5;

  return fingersRaisedFromWrist && palmLooksFlat && fingersSpread;
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

function drawVoiceTextAttacks(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  attacks: VoiceTextAttack[],
  time: number,
) {
  attacks
    .filter((attack) => attack.delay <= 0)
    .forEach((attack) => {
      const alpha = Math.max(0, attack.life / attack.maxLife);
      const progress = 1 - alpha;
      const x = attack.x * canvas.width;
      const y = attack.y * canvas.height;
      const pulse = 0.92 + Math.sin(time / 70 + attack.seed) * 0.08;
      const direction = getNormalizedDirection(
        {
          x: attack.x - attack.vx * 120,
          y: attack.y - attack.vy * 120,
          z: 0,
        },
        {
          x: attack.x,
          y: attack.y,
          z: 0,
        },
      );

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(1, alpha * 1.4);

      for (let index = 1; index <= 3; index += 1) {
        const echoProgress = Math.max(0, progress - index * 0.055);
        const wobble =
          Math.sin(time / 95 + attack.seed + index * 1.9) *
          attack.radius *
          0.65;
        const echoX =
          (attack.startX + (attack.targetX - attack.startX) * echoProgress) *
            canvas.width +
          -direction.y * wobble * canvas.width;
        const echoY =
          (attack.startY + (attack.targetY - attack.startY) * echoProgress) *
            canvas.height +
          direction.x * wobble * canvas.height;

        ctx.save();
        ctx.globalAlpha = alpha * (0.24 / index);
        ctx.translate(echoX, echoY);
        ctx.scale(-1, 1);
        ctx.font = `900 ${
          attack.fontSize * (1 - index * 0.1)
        }px Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = attack.color;
        ctx.fillText(attack.text, 0, 0);
        ctx.restore();
      }

      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.rotate(Math.sin(time / 120 + attack.seed) * 0.22);
      ctx.font = `900 ${attack.fontSize * pulse}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(6, attack.fontSize * 0.14);
      ctx.shadowColor = attack.color;
      ctx.shadowBlur = 30;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
      ctx.strokeText(attack.text, 0, 0);
      ctx.fillStyle = attack.color;
      ctx.fillText(attack.text, 0, 0);
      ctx.lineWidth = Math.max(2, attack.fontSize * 0.04);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.strokeText(attack.text, 0, 0);
      ctx.restore();
    });
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

function drawDefenseShields(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  defenses: DefenseState[],
  time: number,
) {
  defenses.forEach((defense, index) => {
    const x = defense.center.x * canvas.width;
    const y = defense.center.y * canvas.height;
    const radius = defense.radius * Math.min(canvas.width, canvas.height);
    const pulse = 0.5 + Math.sin(time / 110 + index * 1.7) * 0.5;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(105, 245, 255, 0.95)";
    ctx.shadowBlur = 24 + pulse * 18;

    const gradient = ctx.createRadialGradient(
      x,
      y,
      radius * 0.15,
      x,
      y,
      radius * 1.12,
    );

    gradient.addColorStop(0, "rgba(255, 255, 255, 0.28)");
    gradient.addColorStop(0.42, "rgba(102, 245, 255, 0.2)");
    gradient.addColorStop(1, "rgba(63, 120, 255, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.12, 0, Math.PI * 2);
    ctx.fill();

    for (let ring = 0; ring < 3; ring += 1) {
      const ringProgress = (time / 720 + ring / 3) % 1;
      const ringRadius = radius * (0.62 + ringProgress * 0.38);
      const alpha = 0.72 * (1 - ringProgress);

      ctx.strokeStyle = `rgba(190, 255, 255, ${alpha})`;
      ctx.lineWidth = 5 - ringProgress * 2.5;
      ctx.beginPath();
      ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.lineWidth = 5 + pulse * 2;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.88, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(82, 214, 255, 0.78)";
    ctx.lineWidth = 3;

    for (let spoke = 0; spoke < 8; spoke += 1) {
      const angle = time / 520 + spoke * (Math.PI / 4);
      const inner = radius * 0.28;
      const outer = radius * (0.84 + pulse * 0.04);

      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
      ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
      ctx.stroke();
    }

    ctx.font = `900 ${Math.max(18, radius * 0.22)}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.88)";
    ctx.lineWidth = 6;
    ctx.strokeText("GUARD", x, y);
    ctx.fillText("GUARD", x, y);

    ctx.restore();
  });
}

function drawDefenseEffects(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  effects: DefenseEffect[],
) {
  effects.forEach((effect) => {
    const alpha = effect.life / effect.maxLife;
    const x = effect.x * canvas.width;
    const y = effect.y * canvas.height;
    const radius =
      (0.08 + (1 - alpha) * 0.16) * Math.min(canvas.width, canvas.height);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, alpha * 1.35);
    ctx.strokeStyle = "rgba(185, 255, 255, 0.95)";
    ctx.fillStyle = "rgba(86, 232, 255, 0.18)";
    ctx.lineWidth = 7;
    ctx.shadowColor = "rgba(102, 245, 255, 1)";
    ctx.shadowBlur = 32;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.font = "900 30px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "white";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
    ctx.lineWidth = 5;
    ctx.strokeText("BLOCK -1", x, y - radius * 0.15);
    ctx.fillText("BLOCK -1", x, y - radius * 0.15);
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

function getMouthCenter(face: Point[]) {
  const upperLip = face[13];
  const lowerLip = face[14];

  if (!upperLip || !lowerLip) {
    return null;
  }

  return getMidPoint(upperLip, lowerLip);
}

function getBattlePlayers(
  faces: Point[][],
  attacks: FaceAttackState[],
  maxPlayers: number,
): BattlePlayer[] {
  return faces
    .map((face, index) => {
      const target = getFaceTarget(face);

      if (!target) {
        return null;
      }

      return {
        id: PLAYER_IDS[index],
        face,
        center: target.center,
        radius: target.radius,
        attack: attacks[index],
      };
    })
    .filter((player): player is BattlePlayer => player !== null)
    .sort((a, b) => b.center.x - a.center.x)
    .slice(0, maxPlayers)
    .map((player, index) => ({
      ...player,
      id: PLAYER_IDS[index],
    }));
}

function updateTrackedPlayerSlots(
  detectedPlayers: BattlePlayer[],
  previousSlots: Record<PlayerId, TrackedPlayerSlot>,
  maxPlayers: number,
  time: number,
) {
  const activePlayerIds = getActivePlayerIds(maxPlayers);
  const nextSlots = createTrackedPlayerSlots();
  const unmatchedPlayers = [...detectedPlayers];

  activePlayerIds.forEach((playerId) => {
    const previous = previousSlots[playerId];

    nextSlots[playerId] = {
      ...previous,
      visible: false,
      face: null,
      attack: null,
    };
  });

  activePlayerIds.forEach((playerId) => {
    const previous = previousSlots[playerId];

    if (!previous.registered || !previous.center || unmatchedPlayers.length === 0) {
      return;
    }

    const nearest = unmatchedPlayers
      .map((player, index) => ({
        player,
        index,
        distance: distance(previous.center as Point, player.center),
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    if (!nearest || nearest.distance > FACE_TRACK_MAX_DISTANCE) {
      return;
    }

    nextSlots[playerId] = {
      ...previous,
      face: nearest.player.face,
      center: nearest.player.center,
      radius: nearest.player.radius,
      attack: nearest.player.attack,
      registered: true,
      visible: true,
      lastSeenAt: time,
    };
    unmatchedPlayers.splice(nearest.index, 1);
  });

  activePlayerIds
    .filter((playerId) => !nextSlots[playerId].registered)
    .forEach((playerId) => {
      const player = unmatchedPlayers.shift();

      if (!player) {
        return;
      }

      nextSlots[playerId] = {
        id: playerId,
        face: player.face,
        center: player.center,
        radius: player.radius,
        attack: player.attack,
        registered: true,
        visible: true,
        lastSeenAt: time,
      };
    });

  PLAYER_IDS.filter((playerId) => !activePlayerIds.includes(playerId)).forEach(
    (playerId) => {
      nextSlots[playerId] = {
        ...nextSlots[playerId],
        registered: false,
      };
    },
  );

  return nextSlots;
}

function getVisibleBattlePlayers(
  slots: Record<PlayerId, TrackedPlayerSlot>,
): BattlePlayer[] {
  return PLAYER_IDS.map((playerId) => slots[playerId])
    .filter(
      (slot) =>
        slot.registered &&
        slot.visible &&
        slot.face !== null &&
        slot.center !== null &&
        slot.attack !== null,
    )
    .map((slot) => ({
      id: slot.id,
      face: slot.face as Point[],
      center: slot.center as Point,
      radius: slot.radius,
      attack: slot.attack as FaceAttackState,
    }));
}

function getOpponent(
  player: BattlePlayer,
  players: BattlePlayer[],
  playerHp?: PlayerHp,
) {
  return players
    .filter(
      (candidate) =>
        candidate.id !== player.id &&
        (!playerHp || playerHp[candidate.id] > 0),
    )
    .sort(
      (a, b) =>
        distance(player.center, a.center) - distance(player.center, b.center),
    )[0];
}

function getOpponents(
  playerId: PlayerId,
  players: BattlePlayer[],
  playerHp?: PlayerHp,
) {
  return players.filter(
    (candidate) =>
      candidate.id !== playerId && (!playerHp || playerHp[candidate.id] > 0),
  );
}

function getAttackPairKey(owner: PlayerId, target: PlayerId) {
  return `${owner}:${target}`;
}

function getPlayerLabel(id: PlayerId) {
  return `P${PLAYER_IDS.indexOf(id) + 1}`;
}

function getPlayerColor(id: PlayerId) {
  return PLAYER_COLORS[id];
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

function getDefenseStates(assignments: HandAssignment[]): DefenseState[] {
  return assignments
    .map((assignment) => {
      if (getHandShockwaveData(assignment.hands)) {
        return null;
      }

      if (assignment.hands.some(isPeaceHand)) {
        return null;
      }

      const defendingHands = assignment.hands.filter(isOpenPalmFacingCamera);

      if (defendingHands.length === 0) {
        return null;
      }

      const centers = defendingHands
        .map(getPalmCenter)
        .filter((center): center is Point => center !== null);

      if (centers.length === 0) {
        return null;
      }

      const center = getAveragePoint(centers);
      const largestHandSize = Math.max(...defendingHands.map(getHandSize));

      return {
        playerId: assignment.player.id,
        center,
        radius: Math.max(0.08, largestHandSize * 0.95),
      };
    })
    .filter((state): state is DefenseState => state !== null);
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

  const audioContextRef = useRef<AudioContext | null>(null);

  const audioAnalyserRef = useRef<AnalyserNode | null>(null);

  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const audioDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const audioAnimationRef = useRef<number | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const recognitionShouldRunRef = useRef(false);

  const animationRef = useRef<number | null>(null);

  const lastTimeRef = useRef(-1);

  const detectionPreviousTimeRef = useRef(0);

  const punchStatesRef = useRef<PunchHandState[]>([]);

  const fireballsRef = useRef<Fireball[]>([]);

  const voiceTextAttacksRef = useRef<VoiceTextAttack[]>([]);

  const latestVoiceAttackTargetRef = useRef<VoiceAttackTarget | null>(null);

  const latestVoiceTargetsRef = useRef<
    Partial<Record<PlayerId, VoiceAttackTarget>>
  >({});

  const voiceMouthRatiosRef = useRef<Record<PlayerId, number>>(
    createPlayerNumberRecord(0),
  );

  const voiceMouthActivityRef = useRef<Record<PlayerId, number>>(
    createPlayerNumberRecord(0),
  );

  const speakingVoiceTargetRef = useRef<VoiceAttackTarget | null>(null);

  const voiceSessionActiveRef = useRef(false);

  const voiceUtteranceFiredRef = useRef(false);

  const voiceLastSoundAtRef = useRef(0);

  const lastVoiceAttackAtRef = useRef(0);

  const lastVoiceAttackTextRef = useRef("");

  const recentVoiceAttackTextsRef = useRef<{ text: string; at: number }[]>([]);

  const micLevelRef = useRef(0);

  const hitEffectsRef = useRef<HitEffect[]>([]);

  const healEffectsRef = useRef<HealEffect[]>([]);

  const defenseEffectsRef = useRef<DefenseEffect[]>([]);

  const defenseStatesRef = useRef<DefenseState[]>([]);

  const lightningEffectsRef = useRef<LightningEffect[]>([]);

  const trackedPlayerSlotsRef = useRef<Record<PlayerId, TrackedPlayerSlot>>(
    createTrackedPlayerSlots(),
  );

  const lastMissingDamageRef = useRef<Record<PlayerId, number>>(
    createPlayerNumberRecord(0),
  );

  const attackRecordsRef = useRef<AttackRecord[]>([]);

  const nextAttackIdRef = useRef(1);

  const bestWazaEntriesRef = useRef<Record<string, BestWazaEntry>>({});

  const battleStartedRef = useRef(false);

  const lastBeamDamageRef = useRef<Record<string, number>>({});

  const lastShockwaveDamageRef = useRef<Record<string, number>>({});

  const damageFlashUntilRef = useRef<Record<PlayerId, number>>({
    ...createPlayerNumberRecord(0),
  });

  const thunderChargeStartedRef = useRef<Record<PlayerId, number | null>>({
    ...createPlayerNullableNumberRecord(null),
  });

  const thunderCooldownUntilRef = useRef<Record<PlayerId, number>>({
    ...createPlayerNumberRecord(0),
  });

  const healChargeStartedRef = useRef<Record<PlayerId, number | null>>({
    ...createPlayerNullableNumberRecord(null),
  });

  const healCooldownUntilRef = useRef<Record<PlayerId, number>>({
    ...createPlayerNumberRecord(0),
  });

  const [playerHp, setPlayerHp] = useState<PlayerHp>(() => createPlayerHp());

  const playerHpRef = useRef<PlayerHp>(createPlayerHp());

  const [battleWinner, setBattleWinner] = useState<BattleWinner | null>(null);

  const [bestWaza, setBestWaza] = useState<BestWazaEntry | null>(null);

  const [cameraStarted, setCameraStarted] = useState(false);

  const [micStarted, setMicStarted] = useState(false);

  const [micLevel, setMicLevel] = useState(0);

  const [speechSupported, setSpeechSupported] = useState(true);

  const [speechListening, setSpeechListening] = useState(false);

  const [speechStatus, setSpeechStatus] = useState("待機中");

  const [voiceTranscripts, setVoiceTranscripts] = useState<
    Record<PlayerId, string>
  >(() => createPlayerStringRecord(""));

  const [hands, setHands] = useState(0);

  const [bodyCount, setBodyCount] = useState(0);

  const [faceCount, setFaceCount] = useState(0);

  const [playerMarkers, setPlayerMarkers] = useState<PlayerMarker[]>([]);

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

  const updatePlayerHp = (updater: (current: PlayerHp) => PlayerHp) => {
    setPlayerHp((current) => {
      const next = updater(current);

      playerHpRef.current = next;

      return next;
    });
  };

  const applySettings = (nextSettings: BattleSettings) => {
    setMaxPlayers(nextSettings.maxPlayers);
    setMaxHands(nextSettings.maxHands);
    setShowJointGuides(nextSettings.showJointGuides);

    saveBattleSettings(nextSettings);
    resetBattleState();

    if (cameraStarted) {
      initializeModels(nextSettings.maxPlayers, nextSettings.maxHands);
    }
  };

  const resetBattleState = () => {
    const initialHp = createPlayerHp();

    playerHpRef.current = initialHp;
    setPlayerHp(initialHp);
    setBattleWinner(null);
    battleStartedRef.current = false;
    lastBeamDamageRef.current = {};
    lastShockwaveDamageRef.current = {};
    damageFlashUntilRef.current = createPlayerNumberRecord(0);
    attackRecordsRef.current = [];
    nextAttackIdRef.current = 1;
    bestWazaEntriesRef.current = {};
    setBestWaza(null);
    lastVoiceAttackTextRef.current = "";
    voiceSessionActiveRef.current = false;
    voiceUtteranceFiredRef.current = false;
    speakingVoiceTargetRef.current = null;
    voiceLastSoundAtRef.current = 0;
    recentVoiceAttackTextsRef.current = [];
    voiceMouthRatiosRef.current = createPlayerNumberRecord(0);
    voiceMouthActivityRef.current = createPlayerNumberRecord(0);
    fireballsRef.current = [];
    voiceTextAttacksRef.current = [];
    hitEffectsRef.current = [];
    healEffectsRef.current = [];
    defenseEffectsRef.current = [];
    defenseStatesRef.current = [];
    lightningEffectsRef.current = [];
    trackedPlayerSlotsRef.current = createTrackedPlayerSlots();
    lastMissingDamageRef.current = createPlayerNumberRecord(0);
    thunderChargeStartedRef.current = createPlayerNullableNumberRecord(null);
    thunderCooldownUntilRef.current = createPlayerNumberRecord(0);
    healChargeStartedRef.current = createPlayerNullableNumberRecord(null);
    healCooldownUntilRef.current = createPlayerNumberRecord(0);
    setVoiceTranscripts(createPlayerStringRecord(""));
    setPlayerMarkers([]);
  };

  const restartBattleLoop = () => {
    if (
      cameraStarted &&
      !animationRef.current &&
      handLandmarkerRef.current &&
      poseLandmarkerRef.current &&
      faceLandmarkerRef.current
    ) {
      startDetection();
    }
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

  const updateMicLevel = useCallback(() => {
    const analyser = audioAnalyserRef.current;
    const data = audioDataRef.current;

    if (!analyser || !data) {
      return;
    }

    analyser.getByteTimeDomainData(data);

    let sum = 0;

    for (const value of data) {
      const centered = (value - 128) / 128;
      sum += centered * centered;
    }

    const rms = Math.sqrt(sum / data.length);

    const nextLevel = Math.min(100, Math.round(rms * 260));
    const now = performance.now();

    micLevelRef.current = nextLevel;
    setMicLevel(nextLevel);

    if (nextLevel >= VOICE_SOUND_START_LEVEL) {
      voiceLastSoundAtRef.current = now;

      if (!voiceSessionActiveRef.current) {
        voiceSessionActiveRef.current = true;
        voiceUtteranceFiredRef.current = false;
        lastVoiceAttackTextRef.current = "";
        speakingVoiceTargetRef.current = chooseVoiceTargetFromMouthActivity();
      }
    } else if (
      voiceSessionActiveRef.current &&
      nextLevel <= VOICE_SOUND_END_LEVEL &&
      now - voiceLastSoundAtRef.current > VOICE_SILENCE_RESET_TIME
    ) {
      voiceSessionActiveRef.current = false;
      voiceUtteranceFiredRef.current = false;
      speakingVoiceTargetRef.current = null;
      lastVoiceAttackTextRef.current = "";
    }

    audioAnimationRef.current = requestAnimationFrame(updateMicLevel);
  }, []);

  const stopMicMonitor = useCallback(() => {
    if (audioAnimationRef.current) {
      cancelAnimationFrame(audioAnimationRef.current);
      audioAnimationRef.current = null;
    }

    audioSourceRef.current?.disconnect();
    audioSourceRef.current = null;
    audioAnalyserRef.current = null;
    audioDataRef.current = null;
    setMicStarted(false);
    setMicLevel(0);

    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    recognitionShouldRunRef.current = false;
    voiceSessionActiveRef.current = false;
    voiceUtteranceFiredRef.current = false;
    speakingVoiceTargetRef.current = null;
    lastVoiceAttackTextRef.current = "";
    recentVoiceAttackTextsRef.current = [];

    const recognition = recognitionRef.current;

    if (!recognition) {
      return;
    }

    recognition.onend = null;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.abort();
    recognitionRef.current = null;
    setSpeechListening(false);
    setSpeechStatus("停止中");
  }, []);

  const setPlayerTranscript = (playerId: PlayerId, text: string) => {
    setVoiceTranscripts((current) => ({
      ...current,
      [playerId]: text,
    }));
  };

  const clearPlayerTranscriptSoon = (playerId: PlayerId, text: string) => {
    window.setTimeout(() => {
      setVoiceTranscripts((current) => {
        if (current[playerId] !== text) {
          return current;
        }

        return {
          ...current,
          [playerId]: "",
        };
      });
    }, 450);
  };

  const chooseVoiceTargetFromMouthActivity = () => {
    const candidates = getActivePlayerIds(maxPlayers)
      .map((playerId) => {
        const target = latestVoiceTargetsRef.current[playerId];

        if (!target) {
          return null;
        }

        return {
          target,
          score:
            voiceMouthActivityRef.current[playerId] +
            voiceMouthRatiosRef.current[playerId] * 0.9,
        };
      })
      .filter(
        (candidate): candidate is { target: VoiceAttackTarget; score: number } =>
          candidate !== null,
      )
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.target ?? latestVoiceAttackTargetRef.current;
  };

  const getCurrentVoiceTarget = (): VoiceAttackTarget | null =>
    speakingVoiceTargetRef.current ??
    chooseVoiceTargetFromMouthActivity() ??
    getActivePlayerIds(maxPlayers)
      .map((playerId) => latestVoiceTargetsRef.current[playerId])
      .find((target): target is VoiceAttackTarget => target !== undefined) ??
    null;

  const lockVoiceTargetIfNeeded = () => {
    if (!speakingVoiceTargetRef.current) {
      speakingVoiceTargetRef.current = chooseVoiceTargetFromMouthActivity();
    }

    if (!voiceSessionActiveRef.current) {
      voiceSessionActiveRef.current = true;
      voiceUtteranceFiredRef.current = false;
      lastVoiceAttackTextRef.current = "";
      voiceLastSoundAtRef.current = performance.now();
    }
  };

  const isRecentlyFiredVoiceText = (text: string, now: number) => {
    recentVoiceAttackTextsRef.current =
      recentVoiceAttackTextsRef.current.filter((item) => now - item.at < 2600);

    return recentVoiceAttackTextsRef.current.some(
      (item) =>
        text === item.text ||
        text.startsWith(item.text) ||
        item.text.startsWith(text),
    );
  };

  const startSpeechRecognition = () => {
    const SpeechRecognition =
      (window as SpeechRecognitionWindow).SpeechRecognition ??
      (window as SpeechRecognitionWindow).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setSpeechListening(false);
      setSpeechStatus("このブラウザは音声認識に未対応です");
      return;
    }

    stopSpeechRecognition();

    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "ja-JP";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setSpeechListening(true);
      setSpeechStatus("聞き取り中");
    };

    recognition.onresult = (event) => {
      let interimTranscript = "";

      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        const text = result[0]?.transcript.trim() ?? "";

        if (!text) {
          continue;
        }

        if (result.isFinal) {
          lockVoiceTargetIfNeeded();
          const target = getCurrentVoiceTarget();

          if (!target?.eyesClosed) {
            setSpeechStatus("目を閉じるとVOICEに入ります");
            continue;
          }

          const owner = target.owner;
          setPlayerTranscript(owner, text);
          setSpeechStatus("認識しました");
          if (triggerVoiceTextAttack(text)) {
            clearPlayerTranscriptSoon(owner, text);
          }
        } else {
          interimTranscript = text;
        }
      }

      if (interimTranscript) {
        lockVoiceTargetIfNeeded();
        const target = getCurrentVoiceTarget();

        if (!target?.eyesClosed) {
          setSpeechStatus("目を閉じるとVOICEに入ります");
          return;
        }

        const owner = target.owner;
        setPlayerTranscript(owner, interimTranscript);
        setSpeechStatus("聞き取り中");
      }
    };

    recognition.onerror = (event) => {
      const error = event.error ?? "unknown";

      if (
        error === "not-allowed" ||
        error === "service-not-allowed"
      ) {
        recognitionShouldRunRef.current = false;
        setSpeechListening(false);
        setStatus("音声認識の利用が許可されていません");
        setSpeechStatus("音声認識が許可されていません");
        return;
      }

      if (error === "no-speech") {
        setSpeechStatus("声を待っています");
        return;
      }

      setSpeechStatus(`音声認識エラー: ${error}`);
    };

    recognition.onend = () => {
      setSpeechListening(false);

      if (!recognitionShouldRunRef.current) {
        return;
      }

      setSpeechStatus("聞き取りを再開中");

      window.setTimeout(() => {
        try {
          recognition.start();
          setSpeechListening(true);
        } catch (error) {
          console.error("音声認識の再開に失敗しました:", error);
        }
      }, 250);
    };

    recognitionRef.current = recognition;
    recognitionShouldRunRef.current = true;
    setSpeechSupported(true);

    try {
      recognition.start();
      setSpeechStatus("聞き取りを開始しました");
    } catch (error) {
      console.error("音声認識の起動に失敗しました:", error);
      setSpeechListening(false);
      setSpeechStatus("音声認識を開始できませんでした");
    }
  };

  const startMicMonitor = async (stream: MediaStream) => {
    const audioTrack = stream.getAudioTracks()[0];

    if (!audioTrack) {
      setMicStarted(false);
      setMicLevel(0);
      return;
    }

    stopMicMonitor();

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(
      new MediaStream([audioTrack]),
    );

    analyser.fftSize = 1024;
    source.connect(analyser);

    audioContextRef.current = audioContext;
    audioAnalyserRef.current = analyser;
    audioSourceRef.current = source;
    audioDataRef.current = new Uint8Array(analyser.fftSize);

    setMicStarted(true);
    updateMicLevel();
  };

  const startCamera = async () => {
    try {
      setStatus("カメラ・マイクを起動中...");
      resetBattleState();

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
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      videoRef.current.srcObject = stream;

      await videoRef.current.play();

      await startMicMonitor(stream);

      startSpeechRecognition();

      setCameraStarted(true);

      setStatus("カメラ・マイク起動完了。認識モデルを読み込み中...");

      initializeModels();
    } catch (error) {
      console.error(error);

      stopSpeechRecognition();
      setMicStarted(false);
      setMicLevel(0);
      setStatus("カメラまたはマイクを起動できませんでした");
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

  const spawnDefenseEffect = (
    target: PlayerId,
    hitX?: number,
    hitY?: number,
  ) => {
    const defense = defenseStatesRef.current.find(
      (state) => state.playerId === target,
    );

    defenseEffectsRef.current = [
      ...defenseEffectsRef.current,
      {
        x: hitX ?? defense?.center.x ?? 0.5,
        y: hitY ?? defense?.center.y ?? 0.5,
        life: 520,
        maxLife: 520,
        target,
      },
    ].slice(-10);
  };

  const captureCurrentBattleFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    const snapshot = document.createElement("canvas");
    snapshot.width = 640;
    snapshot.height = Math.round((video.videoHeight / video.videoWidth) * 640);

    const ctx = snapshot.getContext("2d");

    if (!ctx) {
      return null;
    }

    ctx.translate(snapshot.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, snapshot.width, snapshot.height);
    ctx.drawImage(canvas, 0, 0, snapshot.width, snapshot.height);

    return snapshot.toDataURL("image/jpeg", 0.82);
  };

  const getCurrentBestWaza = () =>
    Object.values(bestWazaEntriesRef.current).sort(
      (a, b) => b.damage - a.damage || b.updatedAt - a.updatedAt,
    )[0] ?? null;

  const registerWazaDamage = (
    attackId: number | undefined,
    damage: number,
    time: number,
  ) => {
    if (!attackId || damage <= 0) {
      return;
    }

    const attack = attackRecordsRef.current.find(
      (record) => record.id === attackId,
    );

    if (!attack || !isDamageAttackType(attack.type)) {
      return;
    }

    const key = `${attack.owner}:${attack.type}`;
    const current = bestWazaEntriesRef.current[key];
    const photo = attack.photo ?? captureCurrentBattleFrame();

    bestWazaEntriesRef.current = {
      ...bestWazaEntriesRef.current,
      [key]: {
        key,
        type: attack.type,
        owner: attack.owner,
        damage: (current?.damage ?? 0) + damage,
        attackId: attack.id,
        attackCount:
          current && current.attackId === attack.id
            ? current.attackCount
            : (current?.attackCount ?? 0) + 1,
        photo: photo ?? current?.photo ?? null,
        updatedAt: time,
      },
    };
  };

  const recordAttack = (
    type: AttackRecord["type"],
    owner: PlayerId,
    target: PlayerId | null,
    time: number,
    reuseWindow = 700,
  ) => {
    const recent =
      reuseWindow > 0
        ? attackRecordsRef.current.findLast(
            (attack) =>
              attack.type === type &&
              attack.owner === owner &&
              attack.target === target &&
              time - attack.startedAt < reuseWindow,
          )
        : null;

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
      photo: captureCurrentBattleFrame(),
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

  const triggerVoiceTextAttack = (text: string): PlayerId | null => {
    if (battleWinner) {
      return null;
    }

    const trimmedText = text.trim().replace(/\s+/g, " ");
    const target = getCurrentVoiceTarget();
    const now = performance.now();
    const utteranceLockActive =
      voiceUtteranceFiredRef.current &&
      now - lastVoiceAttackAtRef.current < 900;
    const textLooksLikeSameUtterance =
      lastVoiceAttackTextRef.current !== "" &&
      (trimmedText.startsWith(lastVoiceAttackTextRef.current) ||
        lastVoiceAttackTextRef.current.startsWith(trimmedText));

    if (
      !trimmedText ||
      !target ||
      !target.eyesClosed ||
      utteranceLockActive ||
      isRecentlyFiredVoiceText(trimmedText, now) ||
      (textLooksLikeSameUtterance &&
        now - lastVoiceAttackAtRef.current < 1200) ||
      now - lastVoiceAttackAtRef.current < VOICE_ATTACK_COOLDOWN
    ) {
      return null;
    }

    const levelRatio = Math.min(1, Math.max(0.18, micLevelRef.current / 100));
    const attack = recordAttack("voice", target.owner, target.target, now, 0);
    const fontSize = Math.round(58 + levelRatio * 96);
    const letters = Array.from(trimmedText.replace(/\s+/g, "")).slice(0, 14);
    const direction = getNormalizedDirection(target.start, target.targetCenter);
    const perpendicular = {
      x: -direction.y,
      y: direction.x,
    };

    voiceTextAttacksRef.current = [
      ...voiceTextAttacksRef.current,
      ...letters.map((letter, index) => {
        const spread = (index - (letters.length - 1) / 2) * 0.055;
        const seed = Math.random() * 1000;
        const startX = target.start.x + perpendicular.x * spread;
        const startY = target.start.y + perpendicular.y * spread;
        const initialSpeed = 0.00016 + levelRatio * 0.00016;

        return {
          text: letter,
          x: startX,
          y: startY,
          vx:
            direction.x * initialSpeed +
            perpendicular.x * Math.sin(seed) * 0.0001,
          vy:
            direction.y * initialSpeed +
            perpendicular.y * Math.cos(seed) * 0.0001,
          startX,
          startY,
          targetX: target.targetCenter.x,
          targetY: target.targetCenter.y,
          fontSize: Math.round(fontSize * (0.86 + (index % 3) * 0.08)),
          radius: 0.035 + levelRatio * 0.06,
          damage: VOICE_CHARACTER_DAMAGE,
          delay: index * 82,
          seed,
          life: VOICE_ATTACK_LIFE + index * 82,
          maxLife: VOICE_ATTACK_LIFE + index * 82,
          owner: target.owner,
          target: target.target,
          attackId: attack.id,
          color: getPlayerColor(target.owner),
        };
      }),
    ].slice(-36);

    lastVoiceAttackAtRef.current = now;
    lastVoiceAttackTextRef.current = trimmedText;
    recentVoiceAttackTextsRef.current = [
      ...recentVoiceAttackTextsRef.current,
      {
        text: trimmedText,
        at: now,
      },
    ].slice(-8);
    voiceSessionActiveRef.current = true;
    voiceUtteranceFiredRef.current = true;
    speakingVoiceTargetRef.current = target;
    voiceLastSoundAtRef.current = now;
    return target.owner;
  };

  const triggerThunderAttack = (
    attacker: BattlePlayer,
    defender: BattlePlayer,
    time: number,
  ) => {
    const attack = recordAttack("thunder", attacker.id, defender.id, time, 0);

    markAttackHit(attack.id, time);

    spawnLightningEffect(defender);

    applyBattleDamage(
      defender.id,
      THUNDER_DAMAGE,
      defender.center.x,
      defender.center.y,
      "#f8fbff",
      attack.id,
    );

    thunderCooldownUntilRef.current[attacker.id] = time + THUNDER_COOLDOWN;
    thunderChargeStartedRef.current[attacker.id] = null;
  };

  const applyHeal = (player: BattlePlayer, amount: number) => {
    if (battleWinner) {
      return;
    }

    updatePlayerHp((current) => ({
      ...current,
      [player.id]: Math.min(MAX_HP, current[player.id] + amount),
    }));

    spawnHealEffect(player, amount);
  };

  const triggerHeal = (player: BattlePlayer, time: number) => {
    const attack = recordAttack("heal", player.id, player.id, time, 0);

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
    attackId?: number,
  ) => {
    if (battleWinner) {
      return;
    }

    battleStartedRef.current = true;

    const defending = defenseStatesRef.current.some(
      (state) => state.playerId === target,
    );
    const finalAmount = defending ? DEFENSE_DAMAGE : amount;

    if (defending) {
      spawnDefenseEffect(target, hitX, hitY);
    }

    const current = playerHpRef.current;

    if (current[target] <= 0) {
      return;
    }

    const actualDamage = Math.min(current[target], finalAmount);
    const nextHp = {
      ...current,
      [target]: current[target] - actualDamage,
    };

    playerHpRef.current = nextHp;
    setPlayerHp(nextHp);
    registerWazaDamage(attackId, actualDamage, performance.now());

    if (!defending && hitX !== undefined && hitY !== undefined) {
      spawnHitEffect(
        hitX,
        hitY,
        hitColor ?? getPlayerColor(target),
        actualDamage,
        target,
      );
    }

    if (!defending) {
      damageFlashUntilRef.current[target] =
        performance.now() + DAMAGE_FLASH_TIME;
    }

    const winner = getBattleWinner(
      nextHp,
      getRegisteredPlayerIds(trackedPlayerSlotsRef.current, maxPlayers),
    );

    if (winner) {
      setBestWaza(getCurrentBestWaza());
      setBattleWinner(winner);
    }
  };

  const applyMissingFaceDamage = (
    slots: Record<PlayerId, TrackedPlayerSlot>,
    time: number,
  ) => {
    getActivePlayerIds(maxPlayers).forEach((playerId) => {
      const slot = slots[playerId];

      if (
        !slot.registered ||
        slot.visible ||
        playerHpRef.current[playerId] <= 0 ||
        time - lastMissingDamageRef.current[playerId] <
          FACE_MISSING_DAMAGE_INTERVAL
      ) {
        return;
      }

      lastMissingDamageRef.current[playerId] = time;

      applyBattleDamage(
        playerId,
        FACE_MISSING_DAMAGE,
        slot.center?.x,
        slot.center?.y,
        getPlayerColor(playerId),
      );
    });
  };

  const updateVoiceTextAttacks = (
    time: number,
    battlePlayers: BattlePlayer[],
    frameDelta: number,
  ) => {
    const hitVoiceAttacks = new Set<number>();

    voiceTextAttacksRef.current = voiceTextAttacksRef.current
      .map((attack) => {
        if (attack.delay > 0) {
          return {
            ...attack,
            delay: attack.delay - frameDelta,
          };
        }

        const defender = battlePlayers.find(
          (player) => player.id === attack.target,
        );
        const nextLife = attack.life - frameDelta;
        const targetX = defender?.center.x ?? attack.targetX;
        const targetY = defender?.center.y ?? attack.targetY;
        const toTargetX = targetX - attack.x;
        const toTargetY = targetY - attack.y;
        const targetDistance = Math.hypot(toTargetX, toTargetY);
        const direction =
          targetDistance > 0.001
            ? {
                x: toTargetX / targetDistance,
                y: toTargetY / targetDistance,
              }
            : {
                x: 0,
                y: 0,
              };
        const desiredSpeed = 0.00034 + (attack.fontSize / 100) * 0.00015;
        const steer = Math.min(0.22, frameDelta / 120);
        const nextVx =
          attack.vx + (direction.x * desiredSpeed - attack.vx) * steer;
        const nextVy =
          attack.vy + (direction.y * desiredSpeed - attack.vy) * steer;
        const wobble =
          Math.sin(time / 70 + attack.seed) *
          Math.min(0.00022, desiredSpeed * 0.36);
        const nextX = attack.x + (nextVx + -direction.y * wobble) * frameDelta;
        const nextY = attack.y + (nextVy + direction.x * wobble) * frameDelta;

        return {
          ...attack,
          x: nextX,
          y: nextY,
          vx: nextVx,
          vy: nextVy,
          targetX,
          targetY,
          life: nextLife,
        };
      })
      .filter(
        (attack) =>
          (attack.life > 0 || attack.delay > 0) &&
          attack.x > -0.35 &&
          attack.x < 1.35 &&
          attack.y > -0.35 &&
          attack.y < 1.35,
      );

    voiceTextAttacksRef.current.forEach((attack, attackIndex) => {
      if (attack.delay > 0) {
        return;
      }

      const defender = battlePlayers.find(
        (player) => player.id === attack.target,
      );

      if (!defender) {
        return;
      }

      const hit = isCircleCollidingWithTarget(
        {
          x: attack.x,
          y: attack.y,
          z: 0,
        },
        attack.radius,
        defender.center,
        defender.radius,
      );

      if (!hit) {
        return;
      }

      hitVoiceAttacks.add(attackIndex);
      markAttackHit(attack.attackId, time);

      applyBattleDamage(
        defender.id,
        attack.damage,
        defender.center.x,
        defender.center.y,
        attack.color,
        attack.attackId,
      );
    });

    if (hitVoiceAttacks.size > 0) {
      voiceTextAttacksRef.current = voiceTextAttacksRef.current.filter(
        (_, index) => !hitVoiceAttacks.has(index),
      );
    }
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

      const fireballCenter = {
        x: fireball.x,
        y: fireball.y,
        z: 0,
      };
      const defender = getOpponents(
        fireball.owner,
        battlePlayers,
        playerHpRef.current,
      ).find((candidate) =>
        isCircleCollidingWithTarget(
          fireballCenter,
          fireball.radius,
          candidate.center,
          candidate.radius,
        ),
      );

      if (!defender) {
        return;
      }

      hitFireballs.add(fireballIndex);

      if (fireball.attackId) {
        markAttackHit(fireball.attackId, time);
      }

      applyBattleDamage(
        defender.id,
        fireball.damage,
        defender.center.x,
        defender.center.y,
        getPlayerColor(defender.id),
        fireball.attackId ?? undefined,
      );
    });

    if (hitFireballs.size > 0) {
      fireballsRef.current = fireballsRef.current.filter(
        (_, index) => !hitFireballs.has(index),
      );
    }

    const fireballChargeByPlayer = createPlayerNumberRecord(0);

    trackedHands.forEach((hand, handIndex) => {
      const owner = trackedHandEntries[handIndex]?.owner ?? null;

      const center = getFistCenter(hand);
      const peaceHand = isPeaceHand(hand);

      const isPunchReady =
        !peaceHand && isFist(hand) && fistsAreSeparated && center;

      if (!punchStates[handIndex]) {
        punchStates[handIndex] = {
          previousCenter: null,
          previousSize: 0,
          previousTime: time,
          chargeAnchor: null,
          punchReadyUntil: 0,
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
        state.chargeAnchor = null;
        state.punchReadyUntil = 0;
        state.trajectory = center ? [center] : [];
        state.charge = 0;
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
      const stillMoveBuffer = Math.max(PUNCH_STILL_MOVE_BUFFER, handSize * 0.1);
      const isStill = movementDistance <= stillMoveBuffer;

      if (isStill) {
        state.charge = Math.min(MAX_PUNCH_CHARGE, state.charge + deltaTime);
        state.chargeAnchor = state.chargeAnchor
          ? {
              x: state.chargeAnchor.x * 0.88 + center.x * 0.12,
              y: state.chargeAnchor.y * 0.88 + center.y * 0.12,
              z: state.chargeAnchor.z * 0.88 + center.z * 0.12,
            }
          : center;

        if (state.charge >= MIN_PUNCH_CHARGE) {
          state.punchReadyUntil = time + PUNCH_READY_BUFFER_TIME;
        }
      }

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

      const punchAnchor = state.chargeAnchor ?? state.previousCenter ?? center;
      const releaseDistance = distance(punchAnchor, center);
      const punchWindowActive =
        state.charge >= MIN_PUNCH_CHARGE || time <= state.punchReadyUntil;

      state.ready = punchWindowActive && state.cooldown === 0;

      if (
        !isStill &&
        punchWindowActive &&
        speed > 0.00055 &&
        releaseDistance > minPunchMoveDistance &&
        trajectoryStraightness > MIN_PUNCH_STRAIGHTNESS &&
        state.cooldown === 0
      ) {
        const direction = getNormalizedDirection(punchAnchor, center);

        const chargeLevel = getFireballChargeLevel(state.charge);
        const fireballStats = getFireballLevelStats(state.charge);

        const fireballSpeed = Math.min(0.0026, Math.max(0.001, speed * 0.72));

        const attack = owner
          ? recordAttack("fireball", owner, null, time, 0)
          : null;

        fireballsRef.current = [
          ...fireballsRef.current,
          {
            x: center.x,
            y: center.y,
            vx: direction.x * fireballSpeed,
            vy: direction.y * fireballSpeed,
            radius: fireballStats.radius,
            damage: fireballStats.damage,
            chargeLevel,
            life: 1700,
            maxLife: 1700,
            owner,
            attackId: attack?.id ?? null,
          },
        ].slice(-8);

        state.charge = 0;
        state.cooldown = PUNCH_COOLDOWN;
        state.chargeAnchor = null;
        state.punchReadyUntil = 0;
        state.trajectory = [center];
      } else if (!isStill && time > state.punchReadyUntil) {
        state.charge = 0;
        state.chargeAnchor = center;
        state.trajectory = [center];
      }

      if (owner && state.cooldown === 0 && state.charge > 0) {
        fireballChargeByPlayer[owner] = Math.max(
          fireballChargeByPlayer[owner],
          state.charge,
        );
      }

      state.previousCenter = center;
      state.previousSize = handSize;
      state.previousTime = time;
    });

    return fireballChargeByPlayer;
  };

  const detect = () => {
    if (battleWinner) {
      animationRef.current = null;
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
      const frameDelta =
        detectionPreviousTimeRef.current > 0
          ? Math.min(50, now - detectionPreviousTimeRef.current)
          : 16;

      detectionPreviousTimeRef.current = now;

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

      const detectedBattlePlayers = getBattlePlayers(
        faceResult.faceLandmarks,
        faceAttackStates,
        maxPlayers,
      );
      const trackedPlayerSlots = updateTrackedPlayerSlots(
        detectedBattlePlayers,
        trackedPlayerSlotsRef.current,
        maxPlayers,
        now,
      );
      const battlePlayers = getVisibleBattlePlayers(trackedPlayerSlots);

      trackedPlayerSlotsRef.current = trackedPlayerSlots;

      const activeBattlePlayers = battlePlayers.filter(
        (player) => playerHpRef.current[player.id] > 0,
      );

      applyMissingFaceDamage(trackedPlayerSlots, now);

      const voiceTargets = battlePlayers.reduce<
        Partial<Record<PlayerId, VoiceAttackTarget>>
      >((targets, player) => {
        if (playerHpRef.current[player.id] <= 0) {
          return targets;
        }

        const defender = getOpponent(
          player,
          activeBattlePlayers,
          playerHpRef.current,
        );
        const start = getMouthCenter(player.face);

        if (!defender || !start) {
          return targets;
        }

        targets[player.id] = {
          owner: player.id,
          target: defender.id,
          start,
          targetCenter: defender.center,
          targetRadius: defender.radius,
          eyesClosed: !player.attack.leftEyeOpen && !player.attack.rightEyeOpen,
        };

        return targets;
      }, {});
      const voiceAttacker =
        activeBattlePlayers
          .filter((player) => player.attack.mouthOpen)
          .sort((a, b) => b.attack.mouthRatio - a.attack.mouthRatio)[0] ??
        activeBattlePlayers[0];

      latestVoiceTargetsRef.current = voiceTargets;
      battlePlayers.forEach((player) => {
        const previousRatio = voiceMouthRatiosRef.current[player.id];
        const mouthDelta = Math.abs(player.attack.mouthRatio - previousRatio);
        const openBoost = player.attack.mouthOpen
          ? Math.max(0, player.attack.mouthRatio - 0.18) * 0.8
          : 0;

        voiceMouthActivityRef.current[player.id] =
          voiceMouthActivityRef.current[player.id] *
            VOICE_MOUTH_ACTIVITY_DECAY +
          mouthDelta * VOICE_MOUTH_ACTIVITY_WEIGHT +
          openBoost;
        voiceMouthRatiosRef.current[player.id] = player.attack.mouthRatio;
      });
      latestVoiceAttackTargetRef.current = voiceAttacker
        ? voiceTargets[voiceAttacker.id] ?? null
        : null;

      const handAssignments = assignHandsToPlayers(
        handResult.landmarks,
        activeBattlePlayers,
      );

      const defenseStates = getDefenseStates(handAssignments);

      defenseStatesRef.current = defenseStates;

      const fireballChargeByPlayer = updatePunchFireballs(
        now,
        handAssignments,
        activeBattlePlayers,
      );

      updateVoiceTextAttacks(now, activeBattlePlayers, frameDelta);

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

        const defender = getOpponent(
          assignment.player,
          activeBattlePlayers,
          playerHpRef.current,
        );

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

      const shockwaveAssignments = handAssignments.filter(
        (assignment) => !thunderChargingPlayers.has(assignment.player.id),
      );

      const activePlayer = battlePlayers.find(
        (player) =>
          playerHpRef.current[player.id] > 0 && player.attack.beamActive,
      );

      const displayFaceState = activePlayer?.attack ?? faceAttackStates[0];

      setPlayerMarkers(
        getActivePlayerIds(maxPlayers)
          .map((playerId) => trackedPlayerSlots[playerId])
          .filter(
            (slot) =>
              slot.registered && slot.center !== null && playerHpRef.current[slot.id] > 0,
          )
          .map((slot) => {
            const player = battlePlayers.find(
              (candidate) => candidate.id === slot.id,
            );
            const thunderStarted = thunderChargeStartedRef.current[slot.id];
            const healStarted = healChargeStartedRef.current[slot.id];
            const alive = playerHpRef.current[slot.id] > 0;

          return {
            handCount:
              handAssignments.find(
                (assignment) => assignment.player.id === slot.id,
              )?.hands.length ?? 0,
            id: slot.id,
            x: 1 - (slot.center as Point).x,
            y: Math.max(0.08, (slot.center as Point).y - slot.radius),
            damaged: now < damageFlashUntilRef.current[slot.id],
            attacking:
              alive &&
              ((player?.attack.beamActive ?? false) ||
                thunderChargingPlayers.has(slot.id) ||
                healChargingPlayers.has(slot.id)),
            defending: defenseStates.some(
              (state) => state.playerId === slot.id,
            ),
            chargingThunder: thunderChargingPlayers.has(slot.id),
            thunderProgress:
              thunderStarted === null
                ? 0
                : Math.min(1, (now - thunderStarted) / THUNDER_CHARGE_TIME),
            chargingHeal: healChargingPlayers.has(slot.id),
            healProgress:
              healStarted === null
                ? 0
                : Math.min(1, (now - healStarted) / HEAL_CHARGE_TIME),
            missing: !slot.visible,
            fireballChargeLevel:
              fireballChargeByPlayer[slot.id] >= MIN_PUNCH_CHARGE
                ? getFireballChargeLevel(fireballChargeByPlayer[slot.id])
                : 0,
            fireballChargeProgress: getFireballChargeProgress(
              fireballChargeByPlayer[slot.id],
            ),
          };
          }),
      );

      setMouthRatio(displayFaceState?.mouthRatio ?? 0);
      setLeftEyeRatio(displayFaceState?.leftEyeRatio ?? 0);
      setRightEyeRatio(displayFaceState?.rightEyeRatio ?? 0);
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

      defenseEffectsRef.current = defenseEffectsRef.current
        .map((effect) => ({
          ...effect,
          life: effect.life - 16,
        }))
        .filter((effect) => effect.life > 0);

      shockwaveAssignments.forEach((assignment) => {
        const shockwave = getHandShockwaveData(assignment.hands);

        if (!shockwave) {
          return;
        }

        getOpponents(
          assignment.player.id,
          activeBattlePlayers,
          playerHpRef.current,
        ).forEach((defender) => {
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
          const damageKey = getAttackPairKey(assignment.player.id, defender.id);

          if (
            hit &&
            now - (lastShockwaveDamageRef.current[damageKey] ?? 0) >=
              SHOCKWAVE_DAMAGE_COOLDOWN
          ) {
            lastShockwaveDamageRef.current[damageKey] = now;
            markAttackHit(attack.id, now);

            applyBattleDamage(
              defender.id,
              SHOCKWAVE_DAMAGE,
              defender.center.x,
              defender.center.y,
              getPlayerColor(defender.id),
              attack.id,
            );
          }
        });
      });

      activeBattlePlayers.forEach((attacker) => {
        if (!attacker.attack.beamActive) {
          return;
        }

        const defender = getOpponent(
          attacker,
          activeBattlePlayers,
          playerHpRef.current,
        );

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
          const damageKey = getAttackPairKey(attacker.id, defender.id);

          if (
            hit &&
            now - (lastBeamDamageRef.current[damageKey] ?? 0) >=
              BEAM_DAMAGE_COOLDOWN
          ) {
            lastBeamDamageRef.current[damageKey] = now;
            markAttackHit(attack.id, now);

            applyBattleDamage(
              defender.id,
              BEAM_DAMAGE,
              defender.center.x,
              defender.center.y,
              getPlayerColor(defender.id),
              attack.id,
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
        defenseStates,
        thunderChargingPlayers,
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
    defenseStates: DefenseState[],
    thunderChargingPlayers: Set<PlayerId>,
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

    handAssignments
      .filter((assignment) => !thunderChargingPlayers.has(assignment.player.id))
      .forEach((assignment) =>
        drawHandShockwave(ctx, canvas, assignment.hands, time),
      );

    drawFireballs(ctx, canvas, fireballs, time);

    drawVoiceTextAttacks(ctx, canvas, voiceTextAttacksRef.current, time);

    drawDefenseShields(ctx, canvas, defenseStates, time);

    drawDefenseEffects(ctx, canvas, defenseEffectsRef.current);

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

      stopSpeechRecognition();

      stopMicMonitor();

      handLandmarkerRef.current?.close();

      poseLandmarkerRef.current?.close();

      faceLandmarkerRef.current?.close();
    };
  }, [stopMicMonitor, stopSpeechRecognition]);

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
                <div className="battle-result-winner">
                  {getPlayerLabel(battleWinner)} WIN
                </div>
                <div className="battle-result-sub">HPが残っている方の勝ち</div>
                {bestWaza && (
                  <div className="best-waza">
                    <div className="best-waza-label">Best WAZA</div>
                    {bestWaza.photo && (
                      <img
                        src={bestWaza.photo}
                        alt={`${getPlayerLabel(bestWaza.owner)} ${WAZA_LABELS[bestWaza.type]}`}
                      />
                    )}
                    <div className="best-waza-name">
                      {getPlayerLabel(bestWaza.owner)} /{" "}
                      {WAZA_LABELS[bestWaza.type]}
                    </div>
                    <div className="best-waza-damage">
                      {bestWaza.damage} DAMAGE
                    </div>
                    <div className="best-waza-id">
                      WAZA ID {bestWaza.key} / LAST #{bestWaza.attackId}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="rematch-button"
                  onClick={() => {
                    resetBattleState();
                    restartBattleLoop();
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
            {getActivePlayerIds(maxPlayers).map((playerId) => (
              <div
                key={playerId}
                className={`tiny-panel ${playerId}-panel`}
              >
                <span>{getPlayerLabel(playerId)} HP</span>
                <strong>{playerHp[playerId]}</strong>
              </div>
            ))}
          </div>

          <div className="camera">
            {!cameraStarted && (
              <div className="start">
                <h2>全身を構えろ</h2>

                <p>手・指・顔・全身・音声を認識</p>

                <button onClick={startCamera}>カメラ・マイクを起動</button>
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
                  marker.defending ? "defending" : "",
                  marker.missing ? "missing" : "",
                ].join(" ")}
                style={{
                  left: `${marker.x * 100}%`,
                  top: `${marker.y * 100}%`,
                }}
              >
                <span>{getPlayerLabel(marker.id)}</span>
                <small>
                  {marker.defending
                    ? "GUARD"
                    : marker.missing
                      ? "MISSING"
                    : marker.chargingHeal
                      ? "HEAL"
                      : marker.chargingThunder
                        ? "THUNDER"
                      : `${marker.handCount} HANDS`}
                </small>
                {marker.fireballChargeProgress > 0 && !marker.missing && (
                  <div
                    className={[
                      "fireball-charge",
                      marker.fireballChargeLevel > 0 ? "ready" : "",
                    ].join(" ")}
                  >
                    <strong>
                      {marker.fireballChargeLevel > 0
                        ? `FIRE Lv${marker.fireballChargeLevel}`
                        : "FIRE"}
                    </strong>
                    <div aria-hidden="true">
                      {FIREBALL_LEVELS.map((_, index) => (
                        <b
                          key={index}
                          className={
                            index < marker.fireballChargeLevel ? "filled" : ""
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
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

            <div className={micStarted ? "mic-panel active" : "mic-panel"}>
              <span>MIC</span>

              <strong>{micStarted ? `${micLevel}%` : "OFF"}</strong>

              <div className="mic-meter" aria-hidden="true">
                <b style={{ width: `${micLevel}%` }} />
              </div>
            </div>

            <div
              className={
                speechListening ? "speech-panel active" : "speech-panel"
              }
            >
              <span>SPEECH</span>

              <strong>
                {!speechSupported ? "NO" : speechListening ? "ON" : "OFF"}
              </strong>
            </div>
          </div>

          <div className="voice-transcripts">
            {getActivePlayerIds(maxPlayers).map((playerId) => (
              <div
                key={playerId}
                className={`voice-transcript ${playerId}-voice`}
              >
                <span>{getPlayerLabel(playerId)} VOICE</span>
                <strong>{voiceTranscripts[playerId] || "..."}</strong>
              </div>
            ))}

            <div className="speech-control">
              <small>{speechStatus}</small>
              {cameraStarted && speechSupported && !speechListening && (
                <button
                  type="button"
                  className="speech-start-button"
                  onClick={startSpeechRecognition}
                >
                  音声認識を開始
                </button>
              )}
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
            手・指・顔・全身・声
            <br />
            <strong>目を閉じて言葉を放て。</strong>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
