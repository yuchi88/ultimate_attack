import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  FaceLandmarker,
} from "@mediapipe/tasks-vision";

import "./App.css";

type Point = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
};

const FINGER_TIPS = [4, 8, 12, 16, 20];

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

              numHands: 2,

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

              numPoses: 1,

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

              numFaces: 1,

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

      setHands(
        handResult.landmarks.length
      );

      setPoseDetected(
        poseResult.landmarks.length > 0
      );

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

          setMouthOpen(
            isOpen
          );
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

        setLeftEyeOpen(leftEye > 0.15);
        setRightEyeOpen(rightEye > 0.15);
      } else {
        setLeftEyeOpen(false);
        setRightEyeOpen(false);
        setLeftEyeRatio(0);
        setRightEyeRatio(0);
      }

      draw(
        handResult.landmarks,
        poseResult.landmarks,
        faceResult.faceLandmarks
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
    faces: Point[][]
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

      <h1>
        必殺技ジェネレーター
      </h1>

      <p className="subtitle">
        ULTIMATE ATTACK SYSTEM
      </p>

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
