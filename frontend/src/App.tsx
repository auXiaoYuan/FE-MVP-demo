import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type User } from "./api";
import SetupScreen from "./components/SetupScreen";
import KnockScreen from "./components/KnockScreen";

type Phase = "loading" | "setup" | "knock";

export default function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [user, setUser] = useState<User | null>(null);

  // 启动时向后端查询是否已设置用户信息
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await api.getUser();
        if (!cancelled) {
          setUser(u);
          setPhase("knock");
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setPhase("setup");
        } else {
          console.error("查询用户信息失败:", e);
          setPhase("setup");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSetup = useCallback(
    async (p: { nickname: string; wish: string; avatar: string }) => {
      const u = await api.createUser(p);
      setUser(u);
      setPhase("knock");
    },
    []
  );

  if (phase === "loading") {
    return (
      <div className="screen loading-screen">
        <div className="loading-emoji">🪵</div>
        <div className="loading-text">加载中…</div>
      </div>
    );
  }

  if (phase === "setup") {
    return <SetupScreen onDone={handleSetup} />;
  }

  return <KnockScreen user={user!} />;
}
