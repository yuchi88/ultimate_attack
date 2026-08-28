export type BattleSettings = {
  maxPlayers: number;
  maxHands: number;
  showJointGuides: boolean;
};

type SettingsPanelProps = {
  settings: BattleSettings;
  onApply: (settings: BattleSettings) => void;
  onClose: () => void;
};

const SETTINGS_STORAGE_KEYS = {
  maxPlayers: "ultimate_max_players",
  maxHands: "ultimate_max_hands",
  showJointGuides: "ultimate_show_joint_guides",
};

export function normalizeBattleSettings(
  settings: Partial<BattleSettings>
): BattleSettings {
  return {
    maxPlayers:
      Math.min(
        4,
        Math.max(
          2,
          Number(settings.maxPlayers ?? 2)
        )
      ),
    maxHands:
      Math.min(
        8,
        Math.max(
          4,
          Number(settings.maxHands ?? 4)
        )
      ),
    showJointGuides:
      settings.showJointGuides ?? true,
  };
}

export function loadBattleSettings(): BattleSettings {
  const storedPlayers =
    localStorage.getItem(
      SETTINGS_STORAGE_KEYS.maxPlayers
    );
  const storedHands =
    localStorage.getItem(
      SETTINGS_STORAGE_KEYS.maxHands
    );
  const storedShowJointGuides =
    localStorage.getItem(
      SETTINGS_STORAGE_KEYS.showJointGuides
    );

  return normalizeBattleSettings({
    maxPlayers: storedPlayers
      ? Number(storedPlayers)
      : undefined,
    maxHands: storedHands
      ? Number(storedHands)
      : undefined,
    showJointGuides:
      storedShowJointGuides === null
        ? undefined
        : storedShowJointGuides === "true",
  });
}

export function saveBattleSettings(
  settings: BattleSettings
) {
  const safeSettings =
    normalizeBattleSettings(settings);

  localStorage.setItem(
    SETTINGS_STORAGE_KEYS.maxPlayers,
    String(safeSettings.maxPlayers)
  );
  localStorage.setItem(
    SETTINGS_STORAGE_KEYS.maxHands,
    String(safeSettings.maxHands)
  );
  localStorage.setItem(
    SETTINGS_STORAGE_KEYS.showJointGuides,
    String(safeSettings.showJointGuides)
  );
}

function SettingsPanel({
  settings,
  onApply,
  onClose,
}: SettingsPanelProps) {
  const applyNext = (
    nextSettings: BattleSettings
  ) => {
    onApply(
      normalizeBattleSettings(
        nextSettings
      )
    );
  };

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>設定</h2>
          <button
            type="button"
            className="close-settings"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="settings-item">
          <label htmlFor="maxPlayers">
            認識人数上限
          </label>
          <select
            id="maxPlayers"
            value={settings.maxPlayers}
            onChange={(event) => {
              applyNext({
                ...settings,
                maxPlayers: Number(
                  event.target.value
                ),
              });
            }}
          >
            <option value={2}>2人</option>
            <option value={3}>3人</option>
            <option value={4}>4人</option>
          </select>
        </div>

        <div className="settings-item">
          <label htmlFor="maxHands">
            認識手数上限
          </label>
          <select
            id="maxHands"
            value={settings.maxHands}
            onChange={(event) => {
              applyNext({
                ...settings,
                maxHands: Number(
                  event.target.value
                ),
              });
            }}
          >
            <option value={4}>4手</option>
            <option value={5}>5手</option>
            <option value={6}>6手</option>
            <option value={7}>7手</option>
            <option value={8}>8手</option>
          </select>
        </div>

        <div className="settings-item">
          <label>
            関節ガイド表示
          </label>
          <button
            type="button"
            className={
              settings.showJointGuides
                ? "toggle active"
                : "toggle"
            }
            onClick={() => {
              applyNext({
                ...settings,
                showJointGuides:
                  !settings.showJointGuides,
              });
            }}
          >
            {settings.showJointGuides ? "ON" : "OFF"}
          </button>
        </div>

        <div className="settings-footer">
          <button
            type="button"
            className="settings-primary"
            onClick={onClose}
          >
            適用して戻る
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
