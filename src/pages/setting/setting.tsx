import { useEffect, useState } from "react";
import "./setting.css";

function Settings() {
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [maxHands, setMaxHands] = useState(8);
  const [fireballEnabled, setFireballEnabled] = useState(true);
  const [playerAttributes, setPlayerAttributes] = useState([
    "fire",
    "thunder",
    "ice",
    "wind",
  ]);

  useEffect(() => {
    const savedPlayers = localStorage.getItem("maxPlayers");
    const savedHands = localStorage.getItem("maxHands");
    const savedFireball = localStorage.getItem("fireballEnabled");
    const savedAttributes = localStorage.getItem("playerAttributes");

    if (savedPlayers) {
      setMaxPlayers(Number(savedPlayers));
    }

    if (savedHands) {
      setMaxHands(Number(savedHands));
    }

    if (savedFireball !== null) {
      setFireballEnabled(savedFireball !== "false");
    }

    if (savedAttributes) {
      try {
        setPlayerAttributes(JSON.parse(savedAttributes));
      } catch {
        console.log("属性設定の読み込みに失敗しました");
      }
    }
  }, []);

  const handlePlayersChange = (value: number) => {
    setMaxPlayers(value);
    localStorage.setItem("maxPlayers", String(value));
  };

  const handleHandsChange = (value: number) => {
    setMaxHands(value);
    localStorage.setItem("maxHands", String(value));
  };

  const handleFireballChange = (value: boolean) => {
    setFireballEnabled(value);
    localStorage.setItem("fireballEnabled", String(value));
  };

  const handleAttributeChange = (
    playerIndex: number,
    attribute: string
  ) => {
    const nextAttributes = [...playerAttributes];
    nextAttributes[playerIndex] = attribute;

    setPlayerAttributes(nextAttributes);

    localStorage.setItem(
      "playerAttributes",
      JSON.stringify(nextAttributes)
    );
  };

  const resetSettings = () => {
    setMaxPlayers(4);
    setMaxHands(8);
    setFireballEnabled(true);

    const defaultAttributes = [
      "fire",
      "thunder",
      "ice",
      "wind",
    ];

    setPlayerAttributes(defaultAttributes);

    localStorage.setItem("maxPlayers", "4");
    localStorage.setItem("maxHands", "8");
    localStorage.setItem("fireballEnabled", "true");
    localStorage.setItem(
      "playerAttributes",
      JSON.stringify(defaultAttributes)
    );
  };

  return (
    <div className="settings-page">
      <div className="settings-container">

        <h1 className="settings-title">
          SETTINGS
        </h1>

        <p className="settings-subtitle">
          ULTIMATE ATTACK SYSTEM
        </p>

        <section className="settings-section">
          <h2>認識設定</h2>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-name">
                最大認識人数
              </span>
              <span className="setting-description">
                同時に認識するプレイヤー数
              </span>
            </div>

            <select
              className="setting-select"
              value={maxPlayers}
              onChange={(e) =>
                handlePlayersChange(
                  Number(e.target.value)
                )
              }
            >
              <option value={1}>1人</option>
              <option value={2}>2人</option>
              <option value={3}>3人</option>
              <option value={4}>4人</option>
            </select>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-name">
                最大認識手数
              </span>
              <span className="setting-description">
                同時に認識する手の数
              </span>
            </div>

            <select
              className="setting-select"
              value={maxHands}
              onChange={(e) =>
                handleHandsChange(
                  Number(e.target.value)
                )
              }
            >
              <option value={2}>2本</option>
              <option value={4}>4本</option>
              <option value={6}>6本</option>
              <option value={8}>8本</option>
            </select>
          </div>
        </section>

        <section className="settings-section">
          <h2>エフェクト</h2>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-name">
                火球エフェクト
              </span>
              <span className="setting-description">
                必殺技の火球エフェクトを表示
              </span>
            </div>

            <label className="setting-switch">
              <input
                type="checkbox"
                checked={fireballEnabled}
                onChange={(e) =>
                  handleFireballChange(
                    e.target.checked
                  )
                }
              />
              <span className="setting-slider"></span>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <h2>プレイヤー属性</h2>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-name">
                PLAYER 1
              </span>
              <span className="setting-description">
                属性を選択
              </span>
            </div>

            <select
              className="setting-select"
              value={playerAttributes[0]}
              onChange={(e) =>
                handleAttributeChange(0, e.target.value)
              }
            >
              <option value="fire">🔥 炎</option>
              <option value="thunder">⚡ 雷</option>
              <option value="ice">❄️ 氷</option>
              <option value="wind">🌪️ 風</option>
            </select>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-name">
                PLAYER 2
              </span>
              <span className="setting-description">
                属性を選択
              </span>
            </div>

            <select
              className="setting-select"
              value={playerAttributes[1]}
              onChange={(e) =>
                handleAttributeChange(1, e.target.value)
              }
            >
              <option value="fire">🔥 炎</option>
              <option value="thunder">⚡ 雷</option>
              <option value="ice">❄️ 氷</option>
              <option value="wind">🌪️ 風</option>
            </select>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-name">
                PLAYER 3
              </span>
              <span className="setting-description">
                属性を選択
              </span>
            </div>

            <select
              className="setting-select"
              value={playerAttributes[2]}
              onChange={(e) =>
                handleAttributeChange(2, e.target.value)
              }
            >
              <option value="fire">🔥 炎</option>
              <option value="thunder">⚡ 雷</option>
              <option value="ice">❄️ 氷</option>
              <option value="wind">🌪️ 風</option>
            </select>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-name">
                PLAYER 4
              </span>
              <span className="setting-description">
                属性を選択
              </span>
            </div>

            <select
              className="setting-select"
              value={playerAttributes[3]}
              onChange={(e) =>
                handleAttributeChange(3, e.target.value)
              }
            >
              <option value="fire">🔥 炎</option>
              <option value="thunder">⚡ 雷</option>
              <option value="ice">❄️ 氷</option>
              <option value="wind">🌪️ 風</option>
            </select>
          </div>
        </section>

        <section className="settings-section">
          <h2>現在の設定</h2>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-name">
                認識人数
              </span>
            </div>

            <strong>
              {maxPlayers}人
            </strong>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-name">
                認識手数
              </span>
            </div>

            <strong>
              {maxHands}本
            </strong>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-name">
                火球エフェクト
              </span>
            </div>

            <strong>
              {fireballEnabled ? "ON" : "OFF"}
            </strong>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-name">
                PLAYER 1〜4
              </span>
            </div>

            <strong>
              {playerAttributes.join(" / ")}
            </strong>
          </div>
        </section>

        <section className="settings-section">
          <button
            className="reset-button"
            onClick={resetSettings}
          >
            初期設定に戻す
          </button>
        </section>

      </div>
    </div>
  );
}

export default Settings;
