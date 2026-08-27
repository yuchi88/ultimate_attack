import { useEffect, useState } from "react";

function Settings() {
  const [maxPlayers, setMaxPlayers] =
    useState(4);

  const [maxHands, setMaxHands] =
    useState(8);

  useEffect(() => {
    const savedPlayers =
      localStorage.getItem("maxPlayers");

    const savedHands =
      localStorage.getItem("maxHands");

    if (savedPlayers) {
      setMaxPlayers(
        Number(savedPlayers)
      );
    }

    if (savedHands) {
      setMaxHands(
        Number(savedHands)
      );
    }
  }, []);

  const handlePlayersChange = (
    value: number
  ) => {
    setMaxPlayers(value);

    localStorage.setItem(
      "maxPlayers",
      String(value)
    );
  };

  const handleHandsChange = (
    value: number
  ) => {
    setMaxHands(value);

    localStorage.setItem(
      "maxHands",
      String(value)
    );
  };

  return (
    <div>
      <h1>設定</h1>

      <div>
        <h2>認識設定</h2>

        <label>
          最大認識人数

          <select
            value={maxPlayers}
            onChange={(e) =>
              handlePlayersChange(
                Number(e.target.value)
              )
            }
          >
            <option value={1}>
              1人
            </option>

            <option value={2}>
              2人
            </option>

            <option value={3}>
              3人
            </option>

            <option value={4}>
              4人
            </option>
          </select>
        </label>

        <br />

        <label>
          最大認識手数

          <select
            value={maxHands}
            onChange={(e) =>
              handleHandsChange(
                Number(e.target.value)
              )
            }
          >
            <option value={2}>
              2本
            </option>

            <option value={4}>
              4本
            </option>

            <option value={6}>
              6本
            </option>

            <option value={8}>
              8本
            </option>
          </select>
        </label>
      </div>

      <div>
        <h2>現在の設定</h2>

        <p>
          最大認識人数：
          {maxPlayers}人
        </p>

        <p>
          最大認識手数：
          {maxHands}本
        </p>
      </div>
    </div>
  );
}

export default Settings;
