import { useEffect, useRef } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

function App() {
  // カメラ映像を表示するためのvideo要素
  const videoRef = useRef<HTMLVideoElement>(null);

  // MediaPipeの初期化
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

        console.log("MediaPipe初期化成功！");
        console.log(poseLandmarker);
      } catch (error) {
        console.error("MediaPipeの初期化に失敗しました:", error);
      }
    };

    initializeMediaPipe();
  }, []);

  // カメラの起動
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
        }

        console.log("カメラ起動成功！");
      } catch (error) {
        console.error("カメラの起動に失敗しました:", error);
      }
    };

    startCamera();

    // ページを離れたときにカメラを停止
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div>
      <h1>必殺技ジェネレーター</h1>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: "640px",
          maxWidth: "100%",
        }}
      />

      <p>MediaPipe準備中...</p>
    </div>
  );
}

export default App;
