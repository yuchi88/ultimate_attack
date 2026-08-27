import { useEffect, useRef, useState } from "react";
import { createHandpose } from "@svenflow/micro-handpose";
import "./App.css";

type Point = {
  x: number;
  y: number;
  z?: number;
};

type Hand = {
  score: number;
  handedness: "left" | "right";
  landmarks: Point[];
  keypoints: Record<string, Point>;
};

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<any>(null);
  const runningRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState("カメラを起動してください");
  const [handDetected, setHandDetected] = useState(false);

  const [indexX, setIndexX] = useState(0);
  const [indexY, setIndexY] = useState(0);

  const startCamera = async () => {
    try {
      if (!navigator.gpu) {
        setStatus("WebGPUが使えません。ChromeまたはSafari 18以降を確認してください。");
        return;
      }

      setStatus("手認識モデルを読み込んでいます...");

      const handpose = await createHandpose({
        maxHands: 2,
        scoreThreshold: 0.4,
      });

      detectorRef.current = handpose;

      setStatus("カメラを起動しています...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: 1280,
          height: 720,
        },
        audio: false,
      });

      if (!videoRef.current) return;

      videoRef.current.srcObject = stream;

      await videoRef.current.play();

      setStarted(true);
      setStatus("手をカメラに見せてください");

      runningRef.current = true;

      detect();
    } catch (error) {
      console.error(error);
      setStatus("起動エラー。Consoleを確認してください。");
    }
  };

  const detect = async () => {
    if (
      !runningRef.current ||
      !videoRef.current ||
      !detectorRef.current
    ) {
      return;
    }

    try {
      const hands: Hand[] =
        await detectorRef.current.detect(videoRef.current);

      draw(hands);

      if (hands.length > 0) {
        const hand = hands[0];

        setHandDetected(true);
        setStatus(
          `${hand.handedness} hand detected`
        );

        const indexTip = hand.keypoints.index_tip;

        if (indexTip) {
          setIndexX(indexTip.x);
          setIndexY(indexTip.y);
        }
      } else {
        setHandDetected(false);
        setStatus("手をカメラに見せてください");
      }
    } catch (error) {
      console.error(error);
    }

    requestAnimationFrame(detect);
  };

  const draw = (hands: Hand[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    for (const hand of hands) {
      const points = hand.landmarks;

      const connections = [
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

      ctx.strokeStyle = "#00ff88";
      ctx.lineWidth = 4;

      for (const [a, b] of connections) {
        const p1 = points[a];
        const p2 = points[b];

        ctx.beginPath();

        ctx.moveTo(
          p1.x * canvas.width,
          p1.y * canvas.height
        );

        ctx.lineTo(
          p2.x * canvas.width,
          p2.y * canvas.height
        );

        ctx.stroke();
      }

      ctx.fillStyle = "#ffffff";

      for (const point of points) {
        ctx.beginPath();

        ctx.arc(
          point.x * canvas.width,
          point.y * canvas.height,
          7,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }
    }
  };

  useEffect(() => {
    return () => {
      runningRef.current = false;

      if (videoRef.current?.srcObject) {
        const stream =
          videoRef.current.srcObject as MediaStream;

        stream.getTracks().forEach((track) => {
          track.stop();
        });
      }

      detectorRef.current?.dispose();
    };
  }, []);

  return (
    <div className="app">

      <h1>必殺技ジェネレーター</h1>

      <p className="subtitle">
        HAND TRACKING TEST
      </p>

      <div className="camera">

        {!started && (
          <div className="start">
            <h2>手を構えろ</h2>

            <button onClick={startCamera}>
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

        <canvas ref={canvasRef} />

        <div className="status">
          {status}
        </div>

      </div>

      <div className="data">

        <div className="card">
          <span>HAND</span>
          <strong>
            {handDetected ? "DETECTED" : "NOT FOUND"}
          </strong>
        </div>

        <div className="card">
          <span>INDEX TIP X</span>
          <strong>
            {indexX.toFixed(3)}
          </strong>
        </div>

        <div className="card">
          <span>INDEX TIP Y</span>
          <strong>
            {indexY.toFixed(3)}
          </strong>
        </div>

      </div>

      <p className="instruction">
        人差し指を動かしてください
      </p>

    </div>
  );
}

export default App;
