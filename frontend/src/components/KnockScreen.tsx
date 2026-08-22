import { useCallback, useEffect, useRef, useState } from "react";
import { api, type User } from "../api";
import { playKnock } from "../audio";

interface Props {
  user: User;
}

interface Burst {
  id: number;
  x: number;
  y: number;
  kind: "plus" | "ring";
}

/** 敲击主界面：木鱼动画 + 音效 + 飘字 + 累计次数 + 祝福语 */
export default function KnockScreen({ user }: Props) {
  const [count, setCount] = useState(user.total_knocks);
  const [blessing, setBlessing] = useState("");
  const [blessingKey, setBlessingKey] = useState(0);
  const [knocking, setKnocking] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);

  const stageRef = useRef<HTMLDivElement>(null);
  const fishRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const reqSeq = useRef(0);

  // 挂载时与服务端同步一次累计次数
  useEffect(() => {
    api
      .getCount()
      .then((r) => setCount((prev) => Math.max(prev, r.count)))
      .catch(() => {});
  }, []);

  // 木鱼敲击动画（Web Animations API，可随时打断重播）
  useEffect(() => {
    if (!knocking || !fishRef.current) return;
    fishRef.current.animate(
      [
        { transform: "scale(1) rotate(0deg)", offset: 0 },
        { transform: "scale(0.92, 0.86) rotate(-3deg)", offset: 0.3 },
        { transform: "scale(1.05, 1.08) rotate(2deg)", offset: 0.65 },
        { transform: "scale(1) rotate(0deg)", offset: 1 },
      ],
      { duration: 240, easing: "ease-out" }
    );
  }, [knocking]);

  const knock = useCallback((clientX: number, clientY: number) => {
    playKnock();
    setKnocking(true);
    window.setTimeout(() => setKnocking(false), 240);

    // 敲击点（相对敲击区）
    const rect = stageRef.current?.getBoundingClientRect();
    const x = rect ? clientX - rect.left : 200;
    const y = rect ? clientY - rect.top : 200;

    // 飘字 +1 与波纹扩散
    const base = ++idRef.current;
    setBursts((b) => [
      ...b.slice(-10),
      { id: base, x, y, kind: "plus" },
      { id: base + 1000, x, y, kind: "ring" },
    ]);
    window.setTimeout(
      () => setBursts((b) => b.filter((t) => t.id !== base && t.id !== base + 1000)),
      850
    );

    // 乐观更新次数，让界面立即响应
    setCount((c) => c + 1);

    // 调用后端：次数累计 + 随机祝福语
    const seq = ++reqSeq.current;
    api
      .knock()
      .then((r) => {
        if (reqSeq.current !== seq) return; // 丢弃过期响应
        setCount((prev) => Math.max(prev, r.count));
        setBlessing(r.blessing);
        setBlessingKey((k) => k + 1);
      })
      .catch(() => {
        // 网络异常时保留乐观次数；下次敲击会重新同步
      });
  }, []);

  return (
    <div className="screen knock-screen">
      <header className="knock-header">
        <div className="user-chip">
          <span className="user-avatar">{user.avatar}</span>
          <span className="user-name">{user.nickname}</span>
        </div>
        <div className="user-wish">{user.wish || "心诚则灵，随缘敲击"}</div>
      </header>

      <div className="count-block">
        <div className="count-label">累计敲击</div>
        <div key={count} className="count-number">
          {count.toLocaleString()}
        </div>
      </div>

      <div
        className="fish-stage"
        ref={stageRef}
        onClick={(e) => knock(e.clientX, e.clientY)}
      >
        {bursts.map((b) =>
          b.kind === "plus" ? (
            <span key={b.id} className="float-text" style={{ left: b.x, top: b.y }}>
              +1
            </span>
          ) : (
            <span key={b.id} className="knock-ring" style={{ left: b.x, top: b.y }} />
          )
        )}

        <div className={`mallet ${knocking ? "hit" : ""}`}>
          <svg viewBox="0 0 80 80" width="76" height="76" aria-hidden="true">
            <defs>
              <linearGradient id="malletGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e8b06a" />
                <stop offset="100%" stopColor="#a05a1c" />
              </linearGradient>
            </defs>
            <line x1="14" y1="70" x2="46" y2="28" stroke="#8b5a2b" strokeWidth="7" strokeLinecap="round" />
            <circle cx="52" cy="22" r="14" fill="url(#malletGrad)" stroke="#7a3c10" strokeWidth="3" />
          </svg>
        </div>

        <div className="fish-wrap" ref={fishRef}>
          <WoodenFish />
        </div>

        <div className="tap-hint">点击木鱼，功德+1</div>
      </div>

      <div className="blessing-area">
        {blessing && (
          <div key={blessingKey} className="blessing-toast">
            {blessing}
          </div>
        )}
      </div>
    </div>
  );
}

/** 木鱼 SVG（俯视造型：圆润鱼身 + 眼睛 + 嘴缝） */
function WoodenFish() {
  return (
    <svg className="wooden-fish" viewBox="0 0 220 220" width="210" height="210" aria-hidden="true">
      <defs>
        <radialGradient id="bodyGrad" cx="40%" cy="35%" r="80%">
          <stop offset="0%" stopColor="#d28a4e" />
          <stop offset="60%" stopColor="#b5651d" />
          <stop offset="100%" stopColor="#8b4513" />
        </radialGradient>
      </defs>
      {/* 鱼身 */}
      <ellipse cx="110" cy="118" rx="88" ry="72" fill="url(#bodyGrad)" stroke="#7a3c10" strokeWidth="5" />
      {/* 腹部高光 */}
      <ellipse cx="110" cy="146" rx="56" ry="24" fill="rgba(255, 255, 255, 0.16)" />
      {/* 眼睛 */}
      <circle cx="76" cy="86" r="10" fill="#4a2c10" />
      <circle cx="144" cy="86" r="10" fill="#4a2c10" />
      <circle cx="79" cy="83" r="3.5" fill="#fff" />
      <circle cx="147" cy="83" r="3.5" fill="#fff" />
      {/* 嘴缝（空心） */}
      <path d="M56 116 Q110 160 164 116" fill="none" stroke="#5a3312" strokeWidth="13" strokeLinecap="round" />
      <path d="M56 116 Q110 160 164 116" fill="none" stroke="#3a2008" strokeWidth="7" strokeLinecap="round" />
      {/* 顶部装饰环 */}
      <ellipse cx="110" cy="64" rx="30" ry="11" fill="none" stroke="rgba(255, 255, 255, 0.28)" strokeWidth="3" />
    </svg>
  );
}
