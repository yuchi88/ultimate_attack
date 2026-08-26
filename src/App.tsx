import { useEffect } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

function App() {
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

  return (
    <div>
      <h1>必殺技ジェネレーター</h1>
      <p>MediaPipe準備中...</p>
    </div>
  );
}

export default App;
