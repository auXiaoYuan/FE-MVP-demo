import { useState } from "react";

const AVATARS = ["🙏", "🧘", "😊", "🪷", "🌿", "✨", "🕊️", "🍃", "🌸", "🌙"];

interface Props {
  onDone: (p: { nickname: string; wish: string; avatar: string }) => Promise<void>;
}

/** 首次启动的设置界面：选择头像 + 昵称/法号 + 心愿（可选），设置后不可更改 */
export default function SetupScreen({ onDone }: Props) {
  const [nickname, setNickname] = useState("");
  const [wish, setWish] = useState("");
  const [avatar, setAvatar] = useState("🙏");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = nickname.trim().length > 0 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      await onDone({ nickname: nickname.trim(), wish: wish.trim(), avatar });
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试");
      setSaving(false);
    }
  };

  return (
    <div className="screen setup-screen">
      <div className="setup-card">
        <div className="setup-title">初入佛门 🙏</div>
        <div className="setup-subtitle">先简单介绍一下自己，然后开始敲木鱼修行</div>

        <div className="field">
          <label>选择头像</label>
          <div className="avatar-grid">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                className={`avatar-option ${avatar === a ? "selected" : ""}`}
                onClick={() => setAvatar(a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>
            昵称 / 法号 <span className="required">*</span>
          </label>
          <input
            value={nickname}
            maxLength={30}
            placeholder="例如：小和尚、禅心"
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <div className="field">
          <label>心愿（可选）</label>
          <input
            value={wish}
            maxLength={100}
            placeholder="例如：愿家人平安健康"
            onChange={(e) => setWish(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <div className="notice">⚠️ 设置完成后将不可更改</div>
        {error && <div className="error-text">{error}</div>}

        <button type="button" className="primary-btn" disabled={!canSubmit} onClick={submit}>
          {saving ? "保存中…" : "开始修行 →"}
        </button>
      </div>
    </div>
  );
}
