import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
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

function App() {
  const videoRef =
    useRef<HTMLVideoElement>(null);

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const handLandmarkerRef =
    useRef<HandLandmarker | null>(null);

  const poseLandmarkerRef =
    useRef<PoseLandmarker | null>(null);

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

  const [status, setStatus] =
    useState("カメラを起動してください");

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

  const initializeModels =
    async () => {
      try {
        const vision =
          await FilesetResolver.forVisionTasks(
            "/mediapipe"
          );

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

        setModelReady(true);

        setStatus(
          "全身認識開始！"
        );

        startDetection();

      } catch (error) {
        console.error(error);

        setStatus(
          "MediaPipeの読み込みに失敗しました"
        );
      }
    };

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

    if (
      !video ||
      !handLandmarker ||
      !poseLandmarker
    ) {
      return;
    }

    if (
      video.readyState >= 2 &&
      video.currentTime !==
        lastTimeRef.current
    ) {
      lastTimeRef.current =
        video.currentTime;

      const now =
        performance.now();

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

      setHands(
        handResult.landmarks.length
      );

      setPoseDetected(
        poseResult.landmarks.length > 0
      );

      draw(
        handResult.landmarks,
        poseResult.landmarks
      );
    }

    animationRef.current =
      requestAnimationFrame(
        detect
      );
  };

  const draw = (
    hands: Point[][],
    poses: Point[][]
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

    // ---------------------
    // 全身
    // ---------------------

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
          (point, index) => {
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

    // ---------------------
    // 手＋指
    // ---------------------

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
  };

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
              手・指・腕・脚まで認識
            </p>

            <button
              onClick={
                startCamera
              }
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
            SYSTEM
          </span>

          <strong>
            {modelReady
              ? "READY"
              : "LOADING"}
          </strong>
        </div>

      </div>

      <div className="instruction">

        手だけじゃない。

        <br />

        <strong>
          全身で必殺技を放て。
        </strong>

      </div>

    </div>
  );
}

export default App;
