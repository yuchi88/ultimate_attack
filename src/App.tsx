import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  FaceLandmarker,
} from "@mediapipe/tasks-vision";


import "./App.css";
import Settings from "./pages/setting/setting";

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

type Fireball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  attribute: string;
  owner: "player" | "cpu";
  target: "cpu" | "player";
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

type HitEffect = {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
  damage: number;
};

const FINGER_TIPS = [4, 8, 12, 16, 20];
const OPEN_HAND_TIPS = [8, 12, 16, 20];
const MAX_PUNCH_CHARGE = 1800;
const MIN_PUNCH_CHARGE = 300;
const MIN_FIST_DISTANCE = 0.14;
const MIN_PUNCH_MOVE_SCALE = 0.32;
const MIN_PUNCH_MOVE_DISTANCE = 0.025;
const MIN_PUNCH_STRAIGHTNESS = 0.82;
const PUNCH_COOLDOWN = 900;

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
  61,
  146,
  91,
  181,
  84,
  17,
  314,
  405,
  321,
  375,
  291,
  308,
  324,
  318,
  402,
  317,
  14,
  87,
  178,
  88,
  95,
];

function distance(a: Point, b: Point) {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) +
    Math.pow(a.y - b.y, 2)
  );
}

function getMidPoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

function getNormalizedDirection(
  from: Point,
  to: Point
): Vector2 {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const length = Math.sqrt(
    x * x + y * y
  );

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

function getAveragePoint(
  points: Point[]
): Point {
  const total =
    points.reduce(
      (sum, point) => ({
        x: sum.x + point.x,
        y: sum.y + point.y,
        z: sum.z + point.z,
      }),
      {
        x: 0,
        y: 0,
        z: 0,
      }
    );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: total.z / points.length,
  };
}

function getPalmCenter(
  hand: Point[]
) {
  const points = [
    hand[0],
    hand[5],
    hand[9],
    hand[13],
    hand[17],
  ];

  if (
    points.some(
      (point) => !point
    )
  ) {
    return null;
  }

  return getAveragePoint(
    points as Point[]
  );
}

function getFingerCenter(
  hand: Point[]
) {
  const points =
    OPEN_HAND_TIPS.map(
      (index) => hand[index]
    );

  if (
    points.some(
      (point) => !point
    )
  ) {
    return null;
  }

  return getAveragePoint(
    points as Point[]
  );
}

function getFistCenter(
  hand: Point[]
) {
  const points = [
    hand[0],
    hand[5],
    hand[9],
    hand[13],
    hand[17],
  ];

  if (
    points.some(
      (point) => !point
    )
  ) {
    return null;
  }

  return getAveragePoint(
    points as Point[]
  );
}

function isFist(
  hand: Point[]
) {
  const palmCenter =
    getPalmCenter(hand);

  if (!palmCenter) {
    return false;
  }

  const foldedCount =
    [
      [8, 5],
      [12, 9],
      [16, 13],
      [20, 17],
    ].filter(([tipIndex, baseIndex]) => {
      const tip =
        hand[tipIndex];
      const base =
        hand[baseIndex];

      if (!tip || !base) {
        return false;
      }

      return (
        distance(
          palmCenter,
          tip
        ) <
          Math.max(
            0.09,
            distance(
              palmCenter,
              base
            ) *
              2.4
          )
      );
    }).length;

  return foldedCount >= 2;
}

function getFistDistance(
  hands: Point[][]
) {
  if (hands.length < 2) {
    return 0;
  }

  const firstCenter =
    getFistCenter(hands[0]);

  const secondCenter =
    getFistCenter(hands[1]);

  if (
    !firstCenter ||
    !secondCenter
  ) {
    return 0;
  }

  return distance(
    firstCenter,
    secondCenter
  );
}

function getHandSize(
  hand: Point[]
) {
  const palmCenter =
    getPalmCenter(hand);

  if (!palmCenter) {
    return 0;
  }

  const points = [
    hand[4],
    hand[8],
    hand[12],
    hand[16],
    hand[20],
  ];

  return Math.max(
    ...points.map((point) =>
      point
        ? distance(
            palmCenter,
            point
          )
        : 0
    )
  );
}

function getTrajectoryStraightness(
  points: Point[]
) {
  if (points.length < 3) {
    return 0;
  }

  const start = points[0];
  const end =
    points[points.length - 1];

  const directDistance =
    distance(
      start,
      end
    );

  const pathDistance =
    points
      .slice(1)
      .reduce(
        (total, point, index) =>
          total +
          distance(
            points[index],
            point
          ),
        0
      );

  if (pathDistance === 0) {
    return 0;
  }

  return directDistance /
    pathDistance;
}

function isOpenHand(
  hand: Point[]
) {
  const wrist = hand[0];
  const palmCenter =
    getPalmCenter(hand);

  if (!wrist || !palmCenter) {
    return false;
  }

  const extendedCount =
    [
      [8, 6],
      [12, 10],
      [16, 14],
      [20, 18],
    ].filter(([tipIndex, pipIndex]) => {
      const tip =
        hand[tipIndex];
      const pip =
        hand[pipIndex];

      if (!tip || !pip) {
        return false;
      }

      return (
        distance(
          wrist,
          tip
        ) >
          distance(
            wrist,
            pip
          ) *
            1.18 &&
        distance(
          palmCenter,
          tip
        ) >
          distance(
            palmCenter,
            pip
          ) *
            1.08
      );
    }).length;

  return extendedCount >= 3;
}

function getHandShockwaveData(
  hands: Point[][]
) {
  if (hands.length < 2) {
    return null;
  }

  const firstHand = hands[0];
  const secondHand = hands[1];

  if (
    !isOpenHand(firstHand) ||
    !isOpenHand(secondHand)
  ) {
    return null;
  }

  const firstPalm =
    getPalmCenter(firstHand);
  const secondPalm =
    getPalmCenter(secondHand);
  const firstFingerCenter =
    getFingerCenter(firstHand);
  const secondFingerCenter =
    getFingerCenter(secondHand);

  if (
    !firstPalm ||
    !secondPalm ||
    !firstFingerCenter ||
    !secondFingerCenter
  ) {
    return null;
  }

  const palmDistance =
    distance(
      firstPalm,
      secondPalm
    );

  if (
    palmDistance < 0.08 ||
    palmDistance > 0.5
  ) {
    return null;
  }

  const center =
    getMidPoint(
      firstPalm,
      secondPalm
    );

  const fingerCenter =
    getMidPoint(
      firstFingerCenter,
      secondFingerCenter
    );

  const direction =
    getNormalizedDirection(
      center,
      fingerCenter
    );

  return {
    center,
    direction,
    strength:
      Math.min(
        1,
        Math.max(
          0.45,
          palmDistance * 2.6
        )
      ),
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
  right: number
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
  time: number
) {
  const upperLip = face[13];
  const lowerLip = face[14];
  const noseTip = face[1];
  const leftCheek = face[234];
  const rightCheek = face[454];

  if (
    !upperLip ||
    !lowerLip ||
    !noseTip ||
    !leftCheek ||
    !rightCheek
  ) {
    return;
  }

  const mouthCenter =
    getMidPoint(
      upperLip,
      lowerLip
    );

  const faceCenter =
    getMidPoint(
      leftCheek,
      rightCheek
    );

  const direction =
    getNormalizedDirection(
      faceCenter,
      noseTip
    );

  const startX =
    mouthCenter.x *
    canvas.width;

  const startY =
    mouthCenter.y *
    canvas.height;

  const beamLength =
    Math.max(
      canvas.width,
      canvas.height
    ) * 1.25;

  const endX =
    startX +
    direction.x *
      beamLength;

  const endY =
    startY +
    direction.y *
      beamLength;

  const pulse =
    0.5 +
    Math.sin(time / 90) * 0.5;

  const outerWidth =
    70 +
    pulse * 35;

  const coreWidth =
    18 +
    pulse * 10;

  const perpX =
    -direction.y;

  const perpY =
    direction.x;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const coneGradient =
    ctx.createLinearGradient(
      startX,
      startY,
      endX,
      endY
    );

  coneGradient.addColorStop(
    0,
    "rgba(255, 255, 255, 0.95)"
  );
  coneGradient.addColorStop(
    0.12,
    "rgba(204, 92, 255, 0.85)"
  );
  coneGradient.addColorStop(
    0.55,
    "rgba(132, 44, 255, 0.5)"
  );
  coneGradient.addColorStop(
    1,
    "rgba(68, 0, 128, 0)"
  );

  ctx.fillStyle = coneGradient;
  ctx.shadowColor =
    "rgba(178, 80, 255, 0.95)";
  ctx.shadowBlur = 35;

  ctx.beginPath();
  ctx.moveTo(
    startX +
      perpX * 8,
    startY +
      perpY * 8
  );
  ctx.lineTo(
    endX +
      perpX * outerWidth,
    endY +
      perpY * outerWidth
  );
  ctx.lineTo(
    endX -
      perpX * outerWidth,
    endY -
      perpY * outerWidth
  );
  ctx.lineTo(
    startX -
      perpX * 8,
    startY -
      perpY * 8
  );
  ctx.closePath();
  ctx.fill();

  const beamGradient =
    ctx.createLinearGradient(
      startX,
      startY,
      endX,
      endY
    );

  beamGradient.addColorStop(
    0,
    "rgba(255, 255, 255, 1)"
  );
  beamGradient.addColorStop(
    0.2,
    "rgba(238, 157, 255, 0.95)"
  );
  beamGradient.addColorStop(
    0.75,
    "rgba(142, 54, 255, 0.8)"
  );
  beamGradient.addColorStop(
    1,
    "rgba(94, 0, 180, 0)"
  );

  ctx.strokeStyle = beamGradient;
  ctx.lineCap = "round";
  ctx.lineWidth = coreWidth;
  ctx.shadowBlur = 45;

  ctx.beginPath();
  ctx.moveTo(
    startX,
    startY
  );
  ctx.lineTo(
    endX,
    endY
  );
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.shadowBlur = 20;
  ctx.strokeStyle =
    "rgba(255, 255, 255, 0.95)";

  ctx.beginPath();
  ctx.moveTo(
    startX,
    startY
  );
  ctx.lineTo(
    endX,
    endY
  );
  ctx.stroke();

  for (let i = 0; i < 18; i += 1) {
    const progress =
      ((time / 550 + i / 18) % 1);

    const wave =
      Math.sin(
        time / 120 + i * 1.7
      );

    const radius =
      4 +
      (1 - progress) * 8;

    const spread =
      progress *
      outerWidth *
      0.7 *
      wave;

    const x =
      startX +
      direction.x *
        beamLength *
        progress +
      perpX * spread;

    const y =
      startY +
      direction.y *
        beamLength *
        progress +
      perpY * spread;

    ctx.fillStyle =
      i % 2 === 0
        ? "rgba(245, 200, 255, 0.8)"
        : "rgba(156, 72, 255, 0.65)";

    ctx.beginPath();
    ctx.arc(
      x,
      y,
      radius,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  const flare =
    ctx.createRadialGradient(
      startX,
      startY,
      4,
      startX,
      startY,
      60 + pulse * 25
    );

  flare.addColorStop(
    0,
    "rgba(255, 255, 255, 1)"
  );
  flare.addColorStop(
    0.35,
    "rgba(220, 110, 255, 0.9)"
  );
  flare.addColorStop(
    1,
    "rgba(106, 0, 255, 0)"
  );

  ctx.fillStyle = flare;
  ctx.beginPath();
  ctx.arc(
    startX,
    startY,
    60 + pulse * 25,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.restore();
}

function drawHandShockwave(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  hands: Point[][],
  time: number
) {
  const shockwave =
    getHandShockwaveData(
      hands
    );

  if (!shockwave) {
    return;
  }

  const startX =
    shockwave.center.x *
    canvas.width;

  const startY =
    shockwave.center.y *
    canvas.height;

  const direction =
    shockwave.direction;

  const perpX =
    -direction.y;

  const perpY =
    direction.x;

  const length =
    Math.max(
      canvas.width,
      canvas.height
    ) *
    (0.75 +
      shockwave.strength * 0.45);

  const endX =
    startX +
    direction.x * length;

  const endY =
    startY +
    direction.y * length;

  const pulse =
    0.5 +
    Math.sin(time / 80) * 0.5;

  const width =
    90 +
    shockwave.strength * 120 +
    pulse * 45;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const waveGradient =
    ctx.createLinearGradient(
      startX,
      startY,
      endX,
      endY
    );

  waveGradient.addColorStop(
    0,
    "rgba(255, 255, 255, 0.95)"
  );
  waveGradient.addColorStop(
    0.18,
    "rgba(113, 229, 255, 0.82)"
  );
  waveGradient.addColorStop(
    0.55,
    "rgba(82, 116, 255, 0.42)"
  );
  waveGradient.addColorStop(
    1,
    "rgba(70, 255, 220, 0)"
  );

  ctx.fillStyle =
    waveGradient;
  ctx.shadowColor =
    "rgba(90, 221, 255, 0.9)";
  ctx.shadowBlur = 36;

  ctx.beginPath();
  ctx.moveTo(
    startX +
      perpX * 18,
    startY +
      perpY * 18
  );
  ctx.lineTo(
    endX +
      perpX * width,
    endY +
      perpY * width
  );
  ctx.lineTo(
    endX -
      perpX * width,
    endY -
      perpY * width
  );
  ctx.lineTo(
    startX -
      perpX * 18,
    startY -
      perpY * 18
  );
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 5; i += 1) {
    const progress =
      ((time / 650 + i / 5) % 1);

    const ringX =
      startX +
      direction.x *
        length *
        progress;

    const ringY =
      startY +
      direction.y *
        length *
        progress;

    const ringWidth =
      28 +
      width *
        progress *
        0.85;

    const ringHeight =
      12 +
      width *
        progress *
        0.32;

    ctx.save();
    ctx.translate(
      ringX,
      ringY
    );
    ctx.rotate(
      Math.atan2(
        direction.y,
        direction.x
      )
    );

    ctx.strokeStyle =
      `rgba(210, 252, 255, ${0.85 * (1 - progress)})`;
    ctx.lineWidth =
      6 *
      (1 - progress) +
      2;
    ctx.shadowBlur = 26;

    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      ringWidth,
      ringHeight,
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();

    ctx.restore();
  }

  const coreGradient =
    ctx.createLinearGradient(
      startX,
      startY,
      endX,
      endY
    );

  coreGradient.addColorStop(
    0,
    "rgba(255, 255, 255, 1)"
  );
  coreGradient.addColorStop(
    0.35,
    "rgba(145, 245, 255, 0.9)"
  );
  coreGradient.addColorStop(
    1,
    "rgba(60, 130, 255, 0)"
  );

  ctx.strokeStyle =
    coreGradient;
  ctx.lineCap = "round";
  ctx.lineWidth =
    18 + pulse * 10;
  ctx.shadowBlur = 44;

  ctx.beginPath();
  ctx.moveTo(
    startX,
    startY
  );
  ctx.lineTo(
    endX,
    endY
  );
  ctx.stroke();

  const charge =
    ctx.createRadialGradient(
      startX,
      startY,
      4,
      startX,
      startY,
      80 + pulse * 22
    );

  charge.addColorStop(
    0,
    "rgba(255, 255, 255, 1)"
  );
  charge.addColorStop(
    0.28,
    "rgba(120, 238, 255, 0.92)"
  );
  charge.addColorStop(
    1,
    "rgba(44, 120, 255, 0)"
  );

  ctx.fillStyle = charge;
  ctx.beginPath();
  ctx.arc(
    startX,
    startY,
    80 + pulse * 22,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.restore();
}

function drawFireballs(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  fireballs: Fireball[],
  time: number
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  fireballs.forEach(
    (fireball, index) => {
      const x =
        fireball.x *
        canvas.width;

      const y =
        fireball.y *
        canvas.height;

      const radius =
        fireball.radius *
        Math.min(
          canvas.width,
          canvas.height
        );

      const fade =
        Math.max(
          0,
          fireball.life /
            fireball.maxLife
        );

      const pulse =
        0.5 +
        Math.sin(
          time / 70 + index
        ) *
          0.5;

      const flame =
        ctx.createRadialGradient(
          x,
          y,
          radius * 0.08,
          x,
          y,
          radius * (1.35 + pulse * 0.25)
        );

      flame.addColorStop(
        0,
        `rgba(255, 255, 255, ${fade})`
      );
      flame.addColorStop(
        0.18,
        `rgba(255, 232, 92, ${0.95 * fade})`
      );
      flame.addColorStop(
        0.46,
        `rgba(255, 92, 20, ${0.8 * fade})`
      );
      flame.addColorStop(
        0.75,
        `rgba(190, 18, 0, ${0.45 * fade})`
      );
      flame.addColorStop(
        1,
        "rgba(80, 0, 0, 0)"
      );

      ctx.shadowColor =
        "rgba(255, 91, 18, 0.95)";
      ctx.shadowBlur =
        radius * 0.9;
      ctx.fillStyle = flame;

      ctx.beginPath();
      ctx.arc(
        x,
        y,
        radius * 1.35,
        0,
        Math.PI * 2
      );
      ctx.fill();

      const direction =
        getNormalizedDirection(
          {
            x: fireball.x -
              fireball.vx * 80,
            y: fireball.y -
              fireball.vy * 80,
            z: 0,
          },
          {
            x: fireball.x,
            y: fireball.y,
            z: 0,
          }
        );

      const tailX =
        x - direction.x *
          radius *
          (2.8 + pulse);

      const tailY =
        y - direction.y *
          radius *
          (2.8 + pulse);

      const tail =
        ctx.createLinearGradient(
          x,
          y,
          tailX,
          tailY
        );

      tail.addColorStop(
        0,
        `rgba(255, 214, 76, ${0.8 * fade})`
      );
      tail.addColorStop(
        0.55,
        `rgba(255, 78, 0, ${0.45 * fade})`
      );
      tail.addColorStop(
        1,
        "rgba(80, 0, 0, 0)"
      );

      ctx.strokeStyle = tail;
      ctx.lineCap = "round";
      ctx.lineWidth =
        radius * 1.1;
      ctx.shadowBlur =
        radius * 0.65;

      ctx.beginPath();
      ctx.moveTo(
        x,
        y
      );
      ctx.lineTo(
        tailX,
        tailY
      );
      ctx.stroke();

      for (let i = 0; i < 9; i += 1) {
        const sparkAngle =
          time / 140 +
          i * 1.9 +
          index;

        const sparkDistance =
          radius *
          (0.7 +
            ((time / 260 + i * 0.17) %
              1) *
              1.4);

        const sparkX =
          x -
          direction.x *
            sparkDistance *
            0.8 +
          Math.cos(sparkAngle) *
            radius *
            0.55;

        const sparkY =
          y -
          direction.y *
            sparkDistance *
            0.8 +
          Math.sin(sparkAngle) *
            radius *
            0.55;

        ctx.fillStyle =
          `rgba(255, 190, 55, ${0.75 * fade})`;

        ctx.beginPath();
        ctx.arc(
          sparkX,
          sparkY,
          radius * 0.12,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
  );

  ctx.restore();
}
	         
function App() {
  const videoRef =
    useRef<HTMLVideoElement>(null);

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const handLandmarkerRef =
    useRef<HandLandmarker | null>(null);

  const poseLandmarkerRef =
    useRef<PoseLandmarker | null>(null);

  const faceLandmarkerRef =
    useRef<FaceLandmarker | null>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  const animationRef =
    useRef<number | null>(null);

  const lastTimeRef =
    useRef(-1);

  const punchStatesRef =
    useRef<PunchHandState[]>([]);

  const fireballsRef =
    useRef<Fireball[]>([]);

  const hitEffectsRef =
    useRef<HitEffect[]>([]);

  // --------------------------------
  // 見た目属性の安定判定
  // --------------------------------

  const visualAttributeHistoryRef =
    useRef<string[][]>([]);

  const [showSettings, setShowSettings] =
    useState(false);

  const [cameraStarted, setCameraStarted] =
    useState(false);

  const [modelReady, setModelReady] =
    useState(false);

  const [hands, setHands] =
    useState(0);

  const [poseDetected, setPoseDetected] =
    useState(false);

  const [mouthOpen, setMouthOpen] =
    useState(false);

  const [leftEyeOpen, setLeftEyeOpen] =
    useState(false);

  const [rightEyeOpen, setRightEyeOpen] =
    useState(false);

  const [leftEyeRatio, setLeftEyeRatio] =
    useState(0);

  const [rightEyeRatio, setRightEyeRatio] =
    useState(0);

  const [mouthRatio, setMouthRatio] =
    useState(0);

  const [status, setStatus] =
    useState("カメラを起動してください");

  // --------------------------------
  // プレイヤー属性
  // --------------------------------

  const [playerAttributes, setPlayerAttributes] =
    useState<string[]>([
      "none",
      "none",
      "none",
      "none",
    ]);

  const MAX_PLAYERS = 4;
  const MAX_HANDS = MAX_PLAYERS * 2;

  const [playerHP, setPlayerHP] =
    useState<number[]>(() =>
      Array.from(
        { length: MAX_PLAYERS },
        () => 100
      )
    );

  const [cpuHP, setCpuHP] =
    useState<number>(100);

  const [battleWinner, setBattleWinner] =
    useState<"PLAYER" | "CPU" | null>(null);

  const cpuAttackTimerRef =
    useRef<number>(0);

  useEffect(() => {
    setPlayerHP(
      Array.from(
        { length: MAX_PLAYERS },
        () => 100
      )
    );
    setCpuHP(100);
    setBattleWinner(null);
  }, [MAX_PLAYERS]);

  const ATTRIBUTE_STYLES: Record<
    string,
    { label: string; color: string; soft: string }
  > = {
    fire: {
      label: "炎",
      color: "#ff5a36",
      soft: "rgba(255, 90, 54, 0.24)",
    },
    thunder: {
      label: "雷",
      color: "#f6d74b",
      soft: "rgba(246, 215, 75, 0.24)",
    },
    ice: {
      label: "氷",
      color: "#6ec8ff",
      soft: "rgba(110, 200, 255, 0.24)",
    },
    wind: {
      label: "風",
      color: "#7ee7a7",
      soft: "rgba(126, 231, 167, 0.24)",
    },
    god: {
      label: "神",
      color: "#ffcf5a",
      soft: "rgba(255, 207, 90, 0.24)",
    },
    none: {
      label: "未判定",
      color: "#9aa0a6",
      soft: "rgba(154, 160, 166, 0.22)",
    },
  };

  const getPlayerHealthRatio = (
    index: number
  ) => {
    const hp = playerHP[index] ?? 100;
    const maxHp = 100;
    return Math.max(
      0,
      Math.min(1, hp / maxHp)
    );
  };

  const visiblePlayerEntries =
    playerAttributes
      .map((attribute, index) => ({
        index,
        attribute,
      }))
      .filter(
        ({ attribute }) =>
          attribute !== "none"
      );

  const getAttributeColor = (
    attribute: string
  ) => {
    return (
      ATTRIBUTE_STYLES[
        attribute
      ]?.color ?? "#9aa0a6"
    );
  };

  const spawnHitEffect = (
    x: number,
    y: number,
    color: string,
    damage: number
  ) => {
    hitEffectsRef.current = [
      ...hitEffectsRef.current,
      {
        x,
        y,
        life: 900,
        maxLife: 900,
        radius: 0.06,
        color,
        damage,
      },
    ].slice(-18);
  };

  const getWinnerFromHpState = (
    cpuValue: number,
    playerValues: number[]
  ) => {
    const playerStillAlive =
      playerValues.some(
        (hp) => hp > 0
      );

    if (cpuValue <= 0 && playerStillAlive) {
      return "PLAYER";
    }

    if (cpuValue > 0 && !playerStillAlive) {
      return "CPU";
    }

    return null;
  };

  const applyBattleDamage = (
    target: "cpu" | "player",
    amount: number,
    hitX?: number,
    hitY?: number,
    hitColor?: string
  ) => {
    if (battleWinner) {
      return;
    }

    if (target === "cpu") {
      setCpuHP((current) => {
        const next = Math.max(
          0,
          current - amount
        );

        if (hitX !== undefined && hitY !== undefined) {
          spawnHitEffect(
            hitX,
            hitY,
            hitColor ?? "#ff7a59",
            amount
          );
        }

        const winner = getWinnerFromHpState(
          next,
          playerHP
        );

        if (winner) {
          setBattleWinner(winner);
        }

        return next;
      });
      return;
    }

    setPlayerHP((current) => {
      const next = [...current];
      const playerIndex = 0;
      next[playerIndex] = Math.max(
        0,
        (next[playerIndex] ?? 100) - amount
      );

      if (hitX !== undefined && hitY !== undefined) {
        spawnHitEffect(
          hitX,
          hitY,
          hitColor ?? "#ff7a59",
          amount
        );
      }

      const winner = getWinnerFromHpState(
        cpuHP,
        next
      );

      if (winner) {
        setBattleWinner(winner);
      }

      return next;
    });
  };

  const normalizeHandSides = (
    landmarks: Point[][],
    handednesses: Array<
      Array<{ categoryName?: string }>
    >
  ) => {
    const leftHands: Point[][] = [];
    const rightHands: Point[][] = [];

    landmarks.forEach((hand, index) => {
      const side =
        handednesses[index]?.[0]?.categoryName;

      if (side === "Left") {
        leftHands.push(hand);
      }

      if (side === "Right") {
        rightHands.push(hand);
      }
    });

    const targetCount = Math.min(
      leftHands.length,
      rightHands.length
    );

    const normalizedLeft = leftHands.slice(
      0,
      targetCount
    );
    const normalizedRight = rightHands.slice(
      0,
      targetCount
    );

    return {
      leftHands: normalizedLeft,
      rightHands: normalizedRight,
      balancedHands: [
        ...normalizedLeft,
        ...normalizedRight,
      ],
      leftCount: normalizedLeft.length,
      rightCount: normalizedRight.length,
    };
  };

  const isBalancedHandCount = (
    totalHands: number,
    handednesses: Array<Array<{ categoryName?: string }>>
  ) => {
    if (totalHands === 0) {
      return true;
    }

    const leftCount = handednesses.filter(
      (hand) =>
        hand[0]?.categoryName === "Left"
    ).length;

    const rightCount = handednesses.filter(
      (hand) =>
        hand[0]?.categoryName === "Right"
    ).length;

    return leftCount === rightCount;
  };

  // --------------------------------
  // 見た目属性判定
  // --------------------------------

  const detectVisualAttribute = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): string => {
    const clamp = (
      value: number,
      min: number,
      max: number
    ) =>
      Math.max(
        min,
        Math.min(value, max)
      );

    const startX = clamp(
      Math.floor(x),
      0,
      Math.max(0, ctx.canvas.width - 1)
    );

    const startY = clamp(
      Math.floor(y),
      0,
      Math.max(0, ctx.canvas.height - 1)
    );

    const endX = clamp(
      Math.ceil(x + width),
      startX + 1,
      ctx.canvas.width
    );

    const endY = clamp(
      Math.ceil(y + height),
      startY + 1,
      ctx.canvas.height
    );

    const sampleWidth =
      endX - startX;

    const sampleHeight =
      endY - startY;

    if (
      sampleWidth <= 0 ||
      sampleHeight <= 0
    ) {
      return "none";
    }

    const imageData =
      ctx.getImageData(
        startX,
        startY,
        sampleWidth,
        sampleHeight
      );

    const pixels =
      imageData.data;

    let pink = 0;
    let red = 0;
    let blue = 0;
    let green = 0;
    let white = 0;

    let total = 0;

    for (
      let i = 0;
      i < pixels.length;
      i += 4
    ) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      const max =
        Math.max(r, g, b);

      if (max < 45) {
        continue;
      }

      total++;

      // 👑 ピンク・マゼンタ
      if (
        r > 145 &&
        r > g * 1.12 &&
        b > g * 1.02 &&
        r - b < 120
      ) {
        pink++;
      }

      // 🔥 赤・オレンジ
      if (
        r > 145 &&
        r > g * 1.25 &&
        r > b * 1.15
      ) {
        red++;
      }

      // ⚡ 青・紫
      if (
        b > 115 &&
        b > r * 1.12 &&
        b > g * 1.03
      ) {
        blue++;
      }

      // 🌪️ 緑
      if (
        g > 95 &&
        g > r * 1.18 &&
        g > b * 1.08
      ) {
        green++;
      }

      // ❄️ 白
      if (
        r > 175 &&
        g > 175 &&
        b > 175
      ) {
        white++;
      }
    }

    if (total === 0) {
      return "none";
    }

    const pinkScore =
      pink / total;

    const redScore =
      red / total;

    const blueScore =
      blue / total;

    const greenScore =
      green / total;

    const whiteScore =
      white / total;

    // =================================
    // ピンク髪 = 最強の神属性
    // =================================

    if (pinkScore >= 0.06) {
      return "god";
    }

    // =================================
    // 通常属性
    // =================================

    const scores: Record<
      string,
      number
    > = {
      fire: redScore,
      thunder: blueScore,
      ice: whiteScore,
      wind: greenScore,
    };

    let bestAttribute = "none";
    let bestScore = 0;

    Object.entries(scores).forEach(
      ([attribute, score]) => {
        if (score > bestScore) {
          bestScore = score;
          bestAttribute = attribute;
        }
      }
    );

    if (bestScore < 0.05) {
      return "none";
    }

    return bestAttribute;
  };

  // --------------------------------
  // 服・アクセサリーなどの色から属性判定
  // --------------------------------

  const detectClothingAttribute = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): string => {
    const clamp = (
      value: number,
      min: number,
      max: number
    ) =>
      Math.max(
        min,
        Math.min(value, max)
      );

    const startX = clamp(
      Math.floor(x),
      0,
      Math.max(0, ctx.canvas.width - 1)
    );

    const startY = clamp(
      Math.floor(y),
      0,
      Math.max(0, ctx.canvas.height - 1)
    );

    const endX = clamp(
      Math.ceil(x + width),
      startX + 1,
      ctx.canvas.width
    );

    const endY = clamp(
      Math.ceil(y + height),
      startY + 1,
      ctx.canvas.height
    );

    const sampleWidth =
      endX - startX;

    const sampleHeight =
      endY - startY;

    if (
      sampleWidth <= 0 ||
      sampleHeight <= 0
    ) {
      return "none";
    }

    const imageData =
      ctx.getImageData(
        startX,
        startY,
        sampleWidth,
        sampleHeight
      );

    const pixels =
      imageData.data;

    let red = 0;
    let blue = 0;
    let green = 0;
    let white = 0;
    let total = 0;

    for (
      let i = 0;
      i < pixels.length;
      i += 4
    ) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      const max =
        Math.max(r, g, b);

      if (max < 50) {
        continue;
      }

      total++;

      if (
        r > 145 &&
        r > g * 1.25 &&
        r > b * 1.15
      ) {
        red++;
      }

      if (
        b > 115 &&
        b > r * 1.12 &&
        b > g * 1.03
      ) {
        blue++;
      }

      if (
        g > 95 &&
        g > r * 1.18 &&
        g > b * 1.08
      ) {
        green++;
      }

      if (
        r > 175 &&
        g > 175 &&
        b > 175
      ) {
        white++;
      }
    }

    if (total === 0) {
      return "none";
    }

    const scores: Record<string, number> = {
      fire: red / total,
      thunder: blue / total,
      ice: white / total,
      wind: green / total,
    };

    let bestAttribute = "none";
    let bestScore = 0;

    Object.entries(scores).forEach(
      ([attribute, score]) => {
        if (score > bestScore) {
          bestScore = score;
          bestAttribute = attribute;
        }
      }
    );

    return bestScore >= 0.08
      ? bestAttribute
      : "none";
  };

  // --------------------------------
  // カメラ
  // --------------------------------

  const startCamera = async () => {
    try {
      setStatus("カメラを起動中...");

      const stream =
        await navigator.mediaDevices.getUserMedia({
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

      videoRef.current.srcObject =
        stream;

      await videoRef.current.play();

      setCameraStarted(true);

      setStatus(
        "カメラ起動完了。認識モデルを読み込み中..."
      );

      initializeModels();

    } catch (error) {
      console.error(error);

      setStatus(
        "カメラを起動できませんでした"
      );
    }
  };

  // --------------------------------
  // MediaPipe
  // --------------------------------

  const initializeModels =
    async () => {
      try {
        const vision =
          await FilesetResolver.forVisionTasks(
            "/mediapipe"
          );

        // ----------------------------
        // 手
        // ----------------------------

        setStatus(
          "手・指の認識モデルを読み込み中..."
        );

        const handLandmarker =
          await HandLandmarker.createFromOptions(
            vision,
            {
              baseOptions: {
                modelAssetPath:
                  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "GPU",
              },

              runningMode: "VIDEO",

              numHands: MAX_HANDS,

              minHandDetectionConfidence: 0.4,

              minHandPresenceConfidence: 0.4,

              minTrackingConfidence: 0.4,
            }
          );

        handLandmarkerRef.current =
          handLandmarker;

        // ----------------------------
        // 全身
        // ----------------------------

        setStatus(
          "全身認識モデルを読み込み中..."
        );

        const poseLandmarker =
          await PoseLandmarker.createFromOptions(
            vision,
            {
              baseOptions: {
                modelAssetPath:
                  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
                delegate: "GPU",
              },

              runningMode: "VIDEO",

              numPoses: MAX_PLAYERS,

              minPoseDetectionConfidence: 0.4,

              minPosePresenceConfidence: 0.4,

              minTrackingConfidence: 0.4,
            }
          );

        poseLandmarkerRef.current =
          poseLandmarker;

        // ----------------------------
        // 顔
        // ----------------------------

        setStatus(
          "顔・口の認識モデルを読み込み中..."
        );

        const faceLandmarker =
          await FaceLandmarker.createFromOptions(
            vision,
            {
              baseOptions: {
                modelAssetPath:
                  "/models/face_landmarker.task",
                delegate: "GPU",
              },

              runningMode: "VIDEO",

              numFaces: MAX_PLAYERS,

              minFaceDetectionConfidence: 0.4,

              minFacePresenceConfidence: 0.4,

              minTrackingConfidence: 0.4,

              outputFaceBlendshapes: true,
            }
          );

        faceLandmarkerRef.current =
          faceLandmarker;

        setModelReady(true);

        setStatus(
          "SYSTEM READY"
        );

        startDetection();

      } catch (error) {
        console.error(error);

        setStatus(
          "MediaPipeの読み込みに失敗しました"
        );
      }
    };

  // --------------------------------
  // 認識ループ
  // --------------------------------

  const startDetection = () => {
    animationRef.current =
      requestAnimationFrame(
        detect
      );
  };

  const spawnCpuAttack = (time: number) => {
    if (battleWinner) {
      return;
    }

    if (time - cpuAttackTimerRef.current < 2200) {
      return;
    }

    cpuAttackTimerRef.current = time;

    const enemyAttribute =
      playerAttributes[3] &&
      playerAttributes[3] !== "none"
        ? playerAttributes[3]
        : "fire";

    fireballsRef.current = [
      ...fireballsRef.current,
      {
        x: 0.88,
        y: 0.28 + Math.random() * 0.46,
        vx: -0.0031,
        vy: (Math.random() - 0.5) * 0.0014,
        radius: 0.05,
        life: 2200,
        maxLife: 2200,
        attribute: enemyAttribute,
        owner: "cpu" as const,
        target: "player" as const,
      },
    ].slice(-12);
  };

  const updatePunchFireballs = (
    hands: Point[][],
    time: number
  ) => {
    const punchStates =
      punchStatesRef.current;

    const previousFrameTime =
      punchStates.reduce(
        (latest, state) =>
          Math.max(
            latest,
            state.previousTime
          ),
        0
      );

  const frameDelta =
    previousFrameTime > 0
      ? Math.min(
          50,
            time -
              previousFrameTime
      )
      : 16;

    let trackedHands =
      hands.slice(0, 2);

    if (
      trackedHands.length === 2 &&
      punchStates[0]
        ?.previousCenter &&
      punchStates[1]
        ?.previousCenter
    ) {
      const firstCenter =
        getFistCenter(
          trackedHands[0]
        );

      const secondCenter =
        getFistCenter(
          trackedHands[1]
        );

      if (
        firstCenter &&
        secondCenter
      ) {
        const sameOrderDistance =
          distance(
            punchStates[0]
              .previousCenter,
            firstCenter
          ) +
          distance(
            punchStates[1]
              .previousCenter,
            secondCenter
          );

        const swappedOrderDistance =
          distance(
            punchStates[0]
              .previousCenter,
            secondCenter
          ) +
          distance(
            punchStates[1]
              .previousCenter,
            firstCenter
          );

        if (
          swappedOrderDistance <
          sameOrderDistance
        ) {
          trackedHands = [
            trackedHands[1],
            trackedHands[0],
          ];
        }
      }
    }

    const fistDistance =
      getFistDistance(
        trackedHands
      );

    const fistsAreSeparated =
      trackedHands.length < 2 ||
      fistDistance >
        MIN_FIST_DISTANCE;

    fireballsRef.current =
      fireballsRef.current
        .map((fireball) => ({
          ...fireball,
          x:
            fireball.x +
            fireball.vx *
              frameDelta,
          y:
            fireball.y +
            fireball.vy *
              frameDelta,
          life:
            fireball.life -
            frameDelta,
        }))
        .filter(
          (fireball) =>
            fireball.life > 0 &&
            fireball.x > -0.35 &&
            fireball.x < 1.35 &&
            fireball.y > -0.35 &&
            fireball.y < 1.35
        );

    fireballsRef.current.forEach(
      (fireball) => {
        if (
          fireball.owner === "player" &&
          fireball.target === "cpu" &&
          fireball.x > 0.7 &&
          fireball.y > 0.18 &&
          fireball.y < 0.82
        ) {
          const damage =
            fireball.attribute === "god"
              ? 22
              : fireball.attribute === "fire"
                ? 16
                : fireball.attribute === "thunder"
                  ? 14
                  : fireball.attribute === "ice"
                    ? 15
                    : 12;

          applyBattleDamage(
            "cpu",
            damage,
            0.82,
            fireball.y,
            getAttributeColor(
              fireball.attribute
            )
          );
          fireball.life = 0;
        }

        if (
          fireball.owner === "cpu" &&
          fireball.target === "player" &&
          fireball.x < 0.3 &&
          fireball.y > 0.18 &&
          fireball.y < 0.82
        ) {
          const damage =
            fireball.attribute === "god"
              ? 18
              : fireball.attribute === "fire"
                ? 14
                : fireball.attribute === "thunder"
                  ? 13
                  : fireball.attribute === "ice"
                    ? 12
                    : 10;

          applyBattleDamage(
            "player",
            damage,
            0.18,
            fireball.y,
            getAttributeColor(
              fireball.attribute
            )
          );
          fireball.life = 0;
        }
      }
    );

    fireballsRef.current =
      fireballsRef.current.filter(
        (fireball) => fireball.life > 0
      );

    trackedHands
      .forEach(
        (hand, handIndex) => {
          const center =
            getFistCenter(hand);

          const isPunchReady =
            isFist(hand) &&
            fistsAreSeparated &&
            center;

          if (
            !punchStates[handIndex]
          ) {
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

          const state =
            punchStates[handIndex];

          const handSize =
            getHandSize(hand);

          state.cooldown =
            Math.max(
              0,
              state.cooldown -
                frameDelta
            );

          if (
            !center ||
            !isPunchReady
          ) {
            state.previousCenter =
              center;
            state.previousSize =
              handSize;
            state.previousTime =
              time;
            state.trajectory = center
              ? [center]
              : [];
            state.charge =
              fistsAreSeparated
                ? state.charge
                : 0;
            state.ready = false;
            return;
          }

          const deltaTime =
            Math.max(
              1,
              time -
                state.previousTime
            );

          const velocity = state.previousCenter
            ? {
                x:
                  (center.x -
                    state
                      .previousCenter
                      .x) /
                  deltaTime,
                y:
                  (center.y -
                    state
                      .previousCenter
                      .y) /
                  deltaTime,
              }
            : {
                x: 0,
                y: 0,
              };

          const speed =
            Math.sqrt(
              velocity.x *
                velocity.x +
                velocity.y *
                  velocity.y
            );

          const movementDistance =
            state.previousCenter
              ? distance(
                  state.previousCenter,
                  center
                )
              : 0;

          const minPunchMoveDistance =
            Math.max(
              MIN_PUNCH_MOVE_DISTANCE,
              handSize *
                MIN_PUNCH_MOVE_SCALE
            );

          const lastTrajectoryPoint =
            state.trajectory[
              state.trajectory.length - 1
            ];

          const trajectoryStep =
            Math.max(
              0.008,
              handSize * 0.08
            );

          if (
            !lastTrajectoryPoint ||
            distance(
              lastTrajectoryPoint,
              center
            ) > trajectoryStep
          ) {
            state.trajectory = [
              ...state.trajectory,
              center,
            ].slice(-7);
          }

          const trajectoryStraightness =
            getTrajectoryStraightness(
              state.trajectory
            );

          const growthSpeed =
            state.previousSize > 0
              ? (handSize -
                  state.previousSize) /
                deltaTime
              : 0;

          state.charge =
            Math.min(
              MAX_PUNCH_CHARGE,
              state.charge +
                deltaTime
            );

          state.ready = true;

          if (
            (speed > 0.0012 ||
              growthSpeed > 0.00035) &&
            movementDistance >
              minPunchMoveDistance &&
            trajectoryStraightness >
              MIN_PUNCH_STRAIGHTNESS &&
            state.charge >
              MIN_PUNCH_CHARGE &&
            state.cooldown === 0
          ) {
            const direction =
              getNormalizedDirection(
                state.previousCenter ??
                  center,
                center
              );

            const chargeRatio =
              Math.min(
                1,
                state.charge /
                  MAX_PUNCH_CHARGE
              );

            const fireballSpeed =
              Math.min(
                0.0048,
                Math.max(
                  0.0018,
                  speed
                )
              );

            const playerAttribute =
              playerAttributes[handIndex] &&
              playerAttributes[handIndex] !==
                "none"
                ? playerAttributes[handIndex]
                : "fire";

            fireballsRef.current = [
              ...fireballsRef.current,
              {
                x: center.x,
                y: center.y,
                vx:
                  direction.x *
                  fireballSpeed,
                vy:
                  direction.y *
                  fireballSpeed,
                radius:
                  0.035 +
                  chargeRatio * 0.075,
                life: 1700,
                maxLife: 1700,
                attribute: playerAttribute,
                owner: "player" as const,
                target: "cpu" as const,
              },
            ].slice(-8);

            state.charge = 0;
            state.cooldown =
              PUNCH_COOLDOWN;
            state.trajectory = [
              center,
            ];
          }

          state.previousCenter =
            center;
          state.previousSize =
            handSize;
          state.previousTime =
            time;
        }
      );
  };

  const drawHitEffects = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    effects: HitEffect[]
  ) => {
    if (effects.length === 0) {
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    effects.forEach((effect) => {
      const alpha =
        Math.max(0, effect.life / effect.maxLife);
      const x = effect.x * canvas.width;
      const y = effect.y * canvas.height;
      const radius =
        30 + (1 - alpha) * 160 + effect.radius * canvas.width;

      const bloom = ctx.createRadialGradient(
        x,
        y,
        4,
        x,
        y,
        radius
      );

      bloom.addColorStop(0, "rgba(255,255,255,1)");
      bloom.addColorStop(0.18, `${effect.color}ee`);
      bloom.addColorStop(0.5, `${effect.color}66`);
      bloom.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `${effect.color}cc`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.62, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "700 28px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`-${effect.damage}`, x, y - 8);
    });

    ctx.restore();

    hitEffectsRef.current = effects
      .map((effect) => ({
        ...effect,
        life: effect.life - 16,
      }))
      .filter((effect) => effect.life > 0);
  };

  const drawCpuSilhouette = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    time: number
  ) => {
    const cpuAttribute =
      playerAttributes[3] &&
      playerAttributes[3] !== "none"
        ? playerAttributes[3]
        : "fire";
    const cpuColor =
      getAttributeColor(cpuAttribute);
    const cx = canvas.width * 0.82;
    const cy = canvas.height * 0.5;
    const pulse =
      0.5 + Math.sin(time / 260) * 0.5;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = cpuColor;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 5;
    ctx.shadowBlur = 26;
    ctx.shadowColor = cpuColor;

    ctx.beginPath();
    ctx.arc(0, -120, 42 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 10, 58, 94, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-54, 26);
    ctx.lineTo(-120, 100);
    ctx.moveTo(54, 26);
    ctx.lineTo(120, 100);
    ctx.moveTo(-28, 104);
    ctx.lineTo(-32, 190);
    ctx.moveTo(28, 104);
    ctx.lineTo(34, 190);
    ctx.stroke();

    const barWidth = 160;
    const barHeight = 14;
    const barX = -barWidth / 2;
    const barY = -205;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = cpuColor;
    ctx.fillRect(
      barX,
      barY,
      barWidth * (cpuHP / 100),
      barHeight
    );
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "700 18px Arial";
    ctx.textAlign = "center";
    ctx.fillText("CPU", 0, -180);

    ctx.restore();
  };

  const drawFloatingHealthBars = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    poses: Point[][]
  ) => {
    const displayTargets =
      playerAttributes
        .map((attribute, index) => ({
          index,
          attribute,
        }))
        .filter(
          ({ attribute }) =>
            attribute !== "none"
        );

    displayTargets.forEach(({ index, attribute }) => {
      const pose = poses[index];
      if (!pose) return;

      const nose = pose[0];
      if (!nose) return;

      const style =
        ATTRIBUTE_STYLES[attribute] ?? ATTRIBUTE_STYLES.none;
      const barWidth = 120;
      const barHeight = 12;
      const x = nose.x * canvas.width - barWidth / 2;
      const y = nose.y * canvas.height - 74;
      const hpRatio = Math.max(
        0,
        Math.min(1, (playerHP[index] ?? 100) / 100)
      );

      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.fillStyle = style.color;
      ctx.fillRect(x, y, barWidth * hpRatio, barHeight);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.strokeRect(x, y, barWidth, barHeight);
      ctx.restore();
    });
  };

  const detect = () => {
    const video =
      videoRef.current;

    const handLandmarker =
      handLandmarkerRef.current;

    const poseLandmarker =
      poseLandmarkerRef.current;

    const faceLandmarker =
      faceLandmarkerRef.current;

    if (
      !video ||
      !handLandmarker ||
      !poseLandmarker ||
      !faceLandmarker
    ) {
      animationRef.current =
        requestAnimationFrame(
          detect
        );

      return;
    }

    if (
      video.readyState >= 2 &&
      video.currentTime !==
        lastTimeRef.current
    ) {
      lastTimeRef.current =
        video.currentTime;

      // eslint-disable-next-line react-hooks/purity
      const now = performance.now();

      // 手
      const handResult =
        handLandmarker.detectForVideo(
          video,
          now
        );

      // 全身
      const poseResult =
        poseLandmarker.detectForVideo(
          video,
          now
        );

      // 顔
      const faceResult =
        faceLandmarker.detectForVideo(
          video,
          now
        );

      const normalizedHands =
        normalizeHandSides(
          handResult.landmarks,
          handResult.handednesses
        );

      const totalHands =
        normalizedHands.balancedHands.length;

      const handCountBalanced =
        isBalancedHandCount(
          handResult.landmarks.length,
          handResult.handednesses
        );

      setHands(totalHands);

      setPoseDetected(
        poseResult.landmarks.length > 0
      );

      if (!handCountBalanced) {
        setStatus(
          "左右の手を自動で同数に揃えています"
        );
      } else if (totalHands === 0) {
        setStatus(
          "手をカメラに見せてください"
        );
      } else if (totalHands === 1) {
        setStatus(
          "1つの手を認識中"
        );
      } else if (totalHands <= MAX_HANDS) {
        setStatus(
          "手を認識中..."
        );
      }

      // --------------------------------
      // プレイヤーの見た目から属性を判定
      // --------------------------------

      const attributeCanvas =
        document.createElement("canvas");

      const attributeCtx =
        attributeCanvas.getContext("2d");

      if (attributeCtx && video.videoWidth > 0) {
        attributeCanvas.width =
          video.videoWidth;

        attributeCanvas.height =
          video.videoHeight;

        attributeCtx.drawImage(
          video,
          0,
          0,
          attributeCanvas.width,
          attributeCanvas.height
        );

        poseResult.landmarks
          .slice(0, MAX_PLAYERS)
          .forEach((pose, playerIndex) => {
            const nose = pose[0];
            const leftShoulder = pose[11];
            const rightShoulder = pose[12];

            if (
              !nose ||
              !leftShoulder ||
              !rightShoulder
            ) {
              return;
            }

            const shoulderWidth =
              Math.abs(
                rightShoulder.x -
                  leftShoulder.x
              );

            // 頭周辺を少し広めに取得
            const headWidth =
              Math.max(
                50,
                shoulderWidth *
                  attributeCanvas.width *
                  0.8
              );

            const headHeight =
              headWidth * 0.9;

            const headX =
              nose.x *
                attributeCanvas.width -
              headWidth / 2;

            const headY =
              nose.y *
                attributeCanvas.height -
              headHeight * 0.75;

            const detectedAttribute =
              detectVisualAttribute(
                attributeCtx,
                headX,
                headY,
                headWidth,
                headHeight
              );

            // --------------------------------
            // 服・上半身の色から追加判定
            // --------------------------------

            const bodyTop =
              Math.min(
                leftShoulder.y,
                rightShoulder.y
              );

            const bodyBottom =
              bodyTop +
              Math.abs(
                leftShoulder.y -
                  nose.y
              ) *
                2.5;

            const bodyWidth =
              shoulderWidth *
              attributeCanvas.width *
              1.5;

            const bodyHeight =
              Math.max(
                80,
                (bodyBottom - bodyTop) *
                  attributeCanvas.height
              );

            const bodyX =
              ((leftShoulder.x +
                rightShoulder.x) /
                2) *
                attributeCanvas.width -
              bodyWidth / 2;

            const bodyY =
              bodyTop *
                attributeCanvas.height;

            const clothingAttribute =
              detectClothingAttribute(
                attributeCtx,
                bodyX,
                bodyY,
                bodyWidth,
                bodyHeight
              );

            const finalAttribute =
              detectedAttribute === "god"
                ? "god"
                : clothingAttribute !== "none"
                  ? clothingAttribute
                  : detectedAttribute;

            if (
              finalAttribute !== "none"
            ) {
              // プレイヤーごとの判定履歴を取得
              const history =
                visualAttributeHistoryRef.current;

              if (!history[playerIndex]) {
                history[playerIndex] = [];
              }

              history[playerIndex] = [
                ...history[playerIndex],
                detectedAttribute,
              ].slice(-3);

              // 3回連続で同じ属性なら確定
              const recent =
                history[playerIndex];

              const isStable =
                recent.length === 3 &&
                recent.every(
                  (attribute) =>
                    attribute ===
                    detectedAttribute
                );

              if (isStable) {
                setPlayerAttributes(
                  (current) => {
                    if (
                      current[playerIndex] ===
                      detectedAttribute
                    ) {
                      return current;
                    }

                    const next = [...current];

                    next[playerIndex] =
                      detectedAttribute;

                    return next;
                  }
                );

                console.log(
                  `PLAYER ${playerIndex + 1} 属性確定: ${detectedAttribute}`
                );
              }
            }
          });
      }

      updatePunchFireballs(
        normalizedHands.balancedHands,
        now
      );
      spawnCpuAttack(now);

      let currentMouthOpen = false;
      let currentLeftEyeOpen = false;
      let currentRightEyeOpen = false;

      // ----------------------------
      // 口の判定
      // ----------------------------

      if (
        faceResult.faceLandmarks.length > 0
      ) {
        const face =
          faceResult.faceLandmarks[0];

        // 上唇中央付近
        const upper =
          face[13];

        // 下唇中央付近
        const lower =
          face[14];

        // 口の左右
        const left =
          face[61];

        const right =
          face[291];

        if (
          upper &&
          lower &&
          left &&
          right
        ) {
          const vertical =
            distance(
              upper,
              lower
            );

          const horizontal =
            distance(
              left,
              right
            );

          const ratio =
            vertical /
            horizontal;

          setMouthRatio(ratio);

          // 閾値
          const isOpen =
            ratio > 0.22;

          currentMouthOpen =
            isOpen;

          setMouthOpen(
            isOpen
          );
        } else {
          setMouthOpen(false);

          setMouthRatio(0);
        }
      } else {
        setMouthOpen(false);

        setMouthRatio(0);
      }

      // ----------------------------
      // 左目・右目の判定
      // ----------------------------

      if (faceResult.faceLandmarks.length > 0) {
        const face = faceResult.faceLandmarks[0];

        const leftEye = getEyeRatio(
          face,
          159,
          160,
          145,
          144,
          33,
          133
        );

        const rightEye = getEyeRatio(
          face,
          386,
          385,
          374,
          380,
          362,
          263
        );

        setLeftEyeRatio(leftEye);
        setRightEyeRatio(rightEye);

        currentLeftEyeOpen =
          leftEye > 0.65;

        currentRightEyeOpen =
          rightEye > 0.65;

        setLeftEyeOpen(
          currentLeftEyeOpen
        );
        setRightEyeOpen(
          currentRightEyeOpen
        );
      } else {
        setLeftEyeOpen(false);
        setRightEyeOpen(false);
        setLeftEyeRatio(0);
        setRightEyeRatio(0);
      }

      draw(
        normalizedHands.balancedHands,
        poseResult.landmarks,
        faceResult.faceLandmarks,
        currentMouthOpen &&
          currentLeftEyeOpen &&
          currentRightEyeOpen,
        fireballsRef.current,
        now
      );
    }

    animationRef.current =
      requestAnimationFrame(
        detect
      );
  };

  // --------------------------------
  // 描画
  // --------------------------------

  const draw = (
    hands: Point[][],
    poses: Point[][],
    faces: Point[][],
    mouthBeamActive: boolean,
    fireballs: Fireball[],
    time: number
  ) => {
    const canvas =
      canvasRef.current;

    const video =
      videoRef.current;

    if (!canvas || !video) {
      return;
    }

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    canvas.width =
      video.videoWidth;

    canvas.height =
      video.videoHeight;

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    // ----------------------------
    // 全身
    // ----------------------------

    poses.forEach(
      (pose) => {
        ctx.strokeStyle =
          "#00aaff";

        ctx.fillStyle =
          "#00aaff";

        ctx.lineWidth = 5;

        for (
          const [a, b]
          of POSE_CONNECTIONS
        ) {
          const p1 =
            pose[a];

          const p2 =
            pose[b];

          if (!p1 || !p2) {
            continue;
          }

          if (
            p1.visibility !== undefined &&
            p1.visibility < 0.3
          ) {
            continue;
          }

          if (
            p2.visibility !== undefined &&
            p2.visibility < 0.3
          ) {
            continue;
          }

          ctx.beginPath();

          ctx.moveTo(
            p1.x *
              canvas.width,
            p1.y *
              canvas.height
          );

          ctx.lineTo(
            p2.x *
              canvas.width,
            p2.y *
              canvas.height
          );

          ctx.stroke();
        }

        pose.forEach(
          (point) => {
            if (
              point.visibility !== undefined &&
              point.visibility < 0.3
            ) {
              return;
            }

            ctx.beginPath();

            ctx.arc(
              point.x *
                canvas.width,
              point.y *
                canvas.height,
              7,
              0,
              Math.PI * 2
            );

            ctx.fill();
          }
        );
      }
    );

    // ----------------------------
    // 手・指
    // ----------------------------

    drawHandShockwave(
      ctx,
      canvas,
      hands,
      time
    );

    drawCpuSilhouette(
      ctx,
      canvas,
      time
    );

    drawFloatingHealthBars(
      ctx,
      canvas,
      poses
    );

    drawFireballs(
      ctx,
      canvas,
      fireballs,
      time
    );

    drawHitEffects(
      ctx,
      canvas,
      hitEffectsRef.current
    );

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

    hands.forEach(
      (hand, handIndex) => {
        const color =
          handIndex === 0
            ? "#00ff88"
            : "#ff00ff";

        ctx.strokeStyle =
          color;

        ctx.fillStyle =
          color;

        ctx.lineWidth = 4;

        for (
          const [a, b]
          of HAND_CONNECTIONS
        ) {
          const p1 =
            hand[a];

          const p2 =
            hand[b];

          if (!p1 || !p2) {
            continue;
          }

          ctx.beginPath();

          ctx.moveTo(
            p1.x *
              canvas.width,
            p1.y *
              canvas.height
          );

          ctx.lineTo(
            p2.x *
              canvas.width,
            p2.y *
              canvas.height
          );

          ctx.stroke();
        }

        hand.forEach(
          (point, index) => {
            const isTip =
              FINGER_TIPS.includes(
                index
              );

            ctx.beginPath();

            ctx.arc(
              point.x *
                canvas.width,
              point.y *
                canvas.height,
              isTip ? 12 : 5,
              0,
              Math.PI * 2
            );

            ctx.fill();
          }
        );
      }
    );

    // ----------------------------
    // 顔・口
    // ----------------------------

    faces.forEach(
      (face) => {
        if (mouthBeamActive) {
          drawMouthBeam(
            ctx,
            canvas,
            face,
            time
          );
        }

        ctx.fillStyle =
          "#ffff00";

        MOUTH_POINTS.forEach(
          (index) => {
            const point =
              face[index];

            if (!point) {
              return;
            }

            ctx.beginPath();

            ctx.arc(
              point.x *
                canvas.width,
              point.y *
                canvas.height,
              3,
              0,
              Math.PI * 2
            );

            ctx.fill();
          }
        );
      }
    );
  };

  // --------------------------------
  // 終了処理
  // --------------------------------

  useEffect(() => {
    return () => {
      if (
        animationRef.current
      ) {
        cancelAnimationFrame(
          animationRef.current
        );
      }

      streamRef.current
        ?.getTracks()
        .forEach(
          (track) =>
            track.stop()
        );

      handLandmarkerRef.current
        ?.close();

      poseLandmarkerRef.current
        ?.close();

      faceLandmarkerRef.current
        ?.close();
    };
  }, []);

  return (
    <div className="app">
      {showSettings && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.8)",
            zIndex: 1000,
            backdropFilter: "blur(4px)",
          }}
        >
          <button
            onClick={() => setShowSettings(false)}
            style={{
              position: "fixed",
              top: "20px",
              left: "20px",
              zIndex: 1001,
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid #555",
              background: "#111",
              color: "white",
              cursor: "pointer",
            }}
          >
            ← 戻る
          </button>

          <div
            style={{
              width: "100%",
              maxWidth: "1100px",
              margin: "0 auto",
              padding: "64px 20px 20px",
            }}
          >
            <Settings />
          </div>
        </div>
      )}

      <h1>
        必殺技ジェネレーター
      </h1>

      <p className="subtitle">
        ULTIMATE ATTACK SYSTEM
      </p>

      <button
        onClick={() => setShowSettings(true)}
        style={{
          display: "block",
          margin: "12px auto 18px",
          padding: "10px 18px",
          borderRadius: "8px",
          border: "1px solid #555",
          background: "#111",
          color: "white",
          cursor: "pointer",
          fontSize: "14px",
        }}
      >
        ⚙ 設定
      </button>

      <div className="battle-hud">
        <div
          className="player-card cpu-card"
          style={{
            borderColor: "#ff7a59",
            boxShadow: "0 0 18px rgba(255,122,89,0.25)",
          }}
        >
          <div className="player-header">
            <span>CPU</span>
            <strong style={{ color: "#ff7a59" }}>
              敵
            </strong>
          </div>

          <div className="player-hp-row">
            <span>HP {cpuHP}</span>
            <span>{Math.round((cpuHP / 100) * 100)}%</span>
          </div>

          <div className="player-bar">
            <div
              className="player-bar-fill"
              style={{
                width: `${(cpuHP / 100) * 100}%`,
                background: "#ff7a59",
              }}
            />
          </div>
        </div>

        {visiblePlayerEntries.map(
          ({ index, attribute }) => {
            const style =
              ATTRIBUTE_STYLES[
                attribute
              ] ?? ATTRIBUTE_STYLES.none;

            const hpRatio =
              getPlayerHealthRatio(index);

            return (
              <div
                key={index}
                className="player-card"
                style={{
                  borderColor:
                    style.color,
                  boxShadow:
                    `0 0 18px ${style.soft}`,
                }}
              >
                <div className="player-header">
                  <span>PLAYER {index + 1}</span>
                  <strong
                    style={{
                      color: style.color,
                    }}
                  >
                    {style.label}
                  </strong>
                </div>

                <div className="player-hp-row">
                  <span>
                    HP {playerHP[index] ?? 100}
                  </span>
                  <span>
                    {Math.round(
                      hpRatio * 100
                    )}%
                  </span>
                </div>

                <div className="player-bar">
                  <div
                    className="player-bar-fill"
                    style={{
                      width: `${hpRatio * 100}%`,
                      background:
                        style.color,
                    }}
                  />
                </div>
              </div>
            );
          }
        )}
      </div>

      {battleWinner && (
        <div className="battle-result">
          {battleWinner === "PLAYER"
            ? "PLAYER WIN"
            : "CPU WIN"}
        </div>
      )}

      <div className="camera">

        {!cameraStarted && (
          <div className="start">

            <h2>
              全身を構えろ
            </h2>

            <p>
              手・指・顔・全身を認識
            </p>

            <button
              onClick={startCamera}
            >
              カメラを起動
            </button>

          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
        />

        <canvas
          ref={canvasRef}
        />

        <div className="status">
          {status}
        </div>

        {modelReady && (
          <div
            className={`mouth-status ${
              mouthOpen
                ? "open"
                : "closed"
            }`}
          >
            {mouthOpen
              ? "OPEN"
              : "CLOSED"}
          </div>
        )}

      </div>

      <div className="info">

        <div>
          <span>
            HANDS
          </span>

          <strong>
            {hands} / 2
          </strong>
        </div>

        <div>
          <span>
            FULL BODY
          </span>

          <strong>
            {poseDetected
              ? "DETECTED"
              : "NOT FOUND"}
          </strong>
        </div>

        <div>
          <span>
            MOUTH
          </span>

          <strong>
            {mouthOpen
              ? "OPEN"
              : "CLOSED"}
          </strong>
        </div>

      </div>

      <div className="mouth-debug">
        MOUTH RATIO:
        {" "}
        {mouthRatio.toFixed(3)}
      </div>

        <div className="eye-status">
          <strong>
            LEFT EYE: {leftEyeOpen ? "OPEN" : "CLOSED"}
          </strong>
          <span></span>
          <strong>
            RIGHT EYE: {rightEyeOpen ? "OPEN" : "CLOSED"}
          </strong>
        </div>

        <div className="eye-debug">
          LEFT: {leftEyeRatio.toFixed(3)}
          <span></span>
          RIGHT: {rightEyeRatio.toFixed(3)}
        </div>

      <div className="instruction">

        手・指・顔・全身

        <br />

        <strong>
          全部使って必殺技を放て。
        </strong>

      </div>

    </div>
  );
}

export default App;
