import { useEffect, useRef } from "react";
import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

function App() {
  // カメラ映像
  const videoRef = useRef<HTMLVideoElement>(null);

  // 骨格を描画するCanvas
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // MediaPipeのPoseLandmarkerを保持
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);

  // アニメーションフレームID
  const animationFrameRef = useRef<number | null>(null);

  // =========================
  // MediaPipeの初期化
  // =========================
  useEffect(() => {
    const initializeMediaPipe = async () => {
      console.log("MediaPipeの初期化開始");

      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
        );

        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });

        poseLandmarkerRef.current = poseLandmarker;

        console.log("MediaPipe初期化成功！");
      } catch (error) {
        console.error("MediaPipeの初期化に失敗しました:", error);
      }
    };

    initializeMediaPipe();

    // 後片付け
    return () => {
      poseLandmarkerRef.current?.close();
      poseLandmarkerRef.current = null;
    };
  }, []);

  // =========================
  // カメラの起動
  // =========================
  useEffect(() => {
    const startCamera = async () => {
      console.log("カメラの起動開始");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          // カメラ映像の再生が始まったら検出開始
          videoRef.current.onloadeddata = () => {
            console.log("カメラ映像の読み込み完了！");
            detectPose();
          };
        }

        console.log("カメラ起動成功！");
      } catch (error) {
        console.error("カメラの起動に失敗しました:", error);
      }
    };

    startCamera();

    // カメラ停止
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;

        stream.getTracks().forEach((track) => {
          track.stop();
        });
      }

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // =========================
  // ポーズ検出
  // =========================
  const detectPose = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const poseLandmarker = poseLandmarkerRef.current;

    // まだ準備できていなければ終了
    if (!video || !canvas || !poseLandmarker) {
      animationFrameRef.current = requestAnimationFrame(detectPose);
      return;
    }

    // Canvasのサイズをカメラ映像に合わせる
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Canvasの描画コンテキスト
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    // 現在の映像時間
    const startTimeMs = performance.now();

    // MediaPipeで人体検出
    const result: PoseLandmarkerResult = poseLandmarker.detectForVideo(
      video,
      startTimeMs,
    );

    // Canvasを一度クリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 検出結果があれば骨格を描画
    if (result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];

      // 骨格の「線」
      const connections = [
        // 顔
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 7],
        [0, 4],
        [4, 5],
        [5, 6],
        [6, 8],

        // 左腕
        [11, 13],
        [13, 15],
        [15, 17],
        [15, 19],
        [15, 21],

        // 右腕
        [12, 14],
        [14, 16],
        [16, 18],
        [16, 20],
        [16, 22],

        // 肩
        [11, 12],

        // 胴体
        [11, 23],
        [12, 24],
        [23, 24],

        // 左脚
        [23, 25],
        [25, 27],
        [27, 29],
        [27, 31],

        // 右脚
        [24, 26],
        [26, 28],
        [28, 30],
        [28, 32],
      ];

      // 線を描く
      ctx.strokeStyle = "#00ff88";
      ctx.lineWidth = 4;

      connections.forEach(([start, end]) => {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];

        if (!startPoint || !endPoint) {
          return;
        }

        ctx.beginPath();

        ctx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);

        ctx.lineTo(endPoint.x * canvas.width, endPoint.y * canvas.height);

        ctx.stroke();
      });

      // 関節の点を描く
      landmarks.forEach((landmark) => {
        const x = landmark.x * canvas.width;
        const y = landmark.y * canvas.height;

        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);

        ctx.fillStyle = "#ffffff";
        ctx.fill();

        ctx.strokeStyle = "#00ff88";
        ctx.lineWidth = 3;
        ctx.stroke();
      });
    }

    // 次のフレーム
    animationFrameRef.current = requestAnimationFrame(detectPose);
  };

  // =========================
  // 画面
  // =========================
  return (
    <div
      style={{
        minHeight: "100vh",
        color: "white",
        textAlign: "center",
        padding: "20px",
      }}
    >
      <h1>⚡ 必殺技ジェネレーター ⚡</h1>

      <p>ポーズを決めて必殺技を発動しよう！</p>

      <div
        style={{
          position: "relative",
          width: "640px",
          maxWidth: "100%",
          margin: "0 auto",
        }}
      >
        {/* カメラ映像 */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: "100%",
            display: "block",
          }}
        />

        {/* 骨格表示用Canvas */}
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        />
      </div>

      <p>
        MediaPipe： {poseLandmarkerRef.current ? "🟢 準備完了" : "🟡 準備中..."}
      </p>
    </div>
  );
}

export default App;
