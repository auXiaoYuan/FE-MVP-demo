//! muyu-backend —— 敲木鱼应用的后端服务（独立 crate）。
//!
//! 提供极简 HTTP API（前后端分离，通过 HTTP 交互）：
//! - `GET  /api/health`   健康检查
//! - `GET  /api/user`     获取用户信息（未设置返回 404）
//! - `POST /api/user`     首次启动设置用户信息（仅可设置一次，不可修改）
//! - `POST /api/knock`    敲击一次木鱼，返回累计次数与随机祝福语
//! - `GET  /api/count`    获取累计敲击次数
//!
//! 数据存储：SQLite（rusqlite `bundled` 特性，无需系统安装 SQLite）。
//!
//! 本 crate 既可独立运行（`cargo run -p muyu-backend`，见 `main.rs`），
//! 也可被桌面端（src-tauri）作为内嵌本地 HTTP 服务直接调用（见 `serve`）。

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use rand::seq::SliceRandom;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tower_http::cors::CorsLayer;

/// 后端服务配置。
#[derive(Debug, Clone)]
pub struct BackendConfig {
    /// SQLite 数据库文件路径。
    pub db_path: PathBuf,
    /// 监听端口；`0` 表示自动选择空闲端口。
    pub port: u16,
}

impl Default for BackendConfig {
    fn default() -> Self {
        Self {
            db_path: PathBuf::from("data/muyu.db"),
            port: 17823,
        }
    }
}

/// 随机祝福语池（每次敲击由服务端随机返回一句）。
const BLESSINGS: &[&str] = &[
    "功德+1，心平气和 🙏",
    "随喜赞叹，善哉善哉 ✨",
    "放下执念，自在随心 🍃",
    "一敲一响，烦恼皆空 🌿",
    "福慧双修，功德无量 🌟",
    "心若安定，万事可期 🌙",
    "积善之家，必有余庆 🏮",
    "念念清净，事事顺遂 ☁️",
    "愿你平安喜乐，诸事圆满 🪷",
    "一念放下，万般自在 🍂",
];

// ---------------------------------------------------------------
// 数据库
// ---------------------------------------------------------------

/// 用户信息。
#[derive(Debug, Clone, Serialize)]
pub struct User {
    pub id: i64,
    pub nickname: String,
    pub wish: String,
    pub avatar: String,
    pub total_knocks: i64,
    pub created_at: i64,
}

struct Db(Connection);

impl Db {
    fn open(path: &PathBuf) -> DbResult<Self> {
        if let Some(dir) = path.parent() {
            if !dir.as_os_str().is_empty() {
                std::fs::create_dir_all(dir)?;
            }
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS users (
                 id         INTEGER PRIMARY KEY AUTOINCREMENT,
                 nickname   TEXT NOT NULL,
                 wish       TEXT NOT NULL DEFAULT '',
                 avatar     TEXT NOT NULL DEFAULT '🙏',
                 created_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS knock_stats (
                 user_id         INTEGER PRIMARY KEY REFERENCES users(id),
                 total_knocks    INTEGER NOT NULL DEFAULT 0,
                 last_knocked_at INTEGER
             );",
        )?;
        Ok(Db(conn))
    }

    fn get_user(&self) -> DbResult<Option<User>> {
        let mut stmt = self.0.prepare(
            "SELECT u.id, u.nickname, u.wish, u.avatar, u.created_at,
                    COALESCE(k.total_knocks, 0)
             FROM users u
             LEFT JOIN knock_stats k ON k.user_id = u.id
             ORDER BY u.id
             LIMIT 1",
        )?;
        let mut rows = stmt.query([])?;
        match rows.next()? {
            Some(row) => Ok(Some(User {
                id: row.get(0)?,
                nickname: row.get(1)?,
                wish: row.get(2)?,
                avatar: row.get(3)?,
                created_at: row.get(4)?,
                total_knocks: row.get(5)?,
            })),
            None => Ok(None),
        }
    }

    fn create_user(&self, nickname: &str, wish: &str, avatar: &str) -> DbResult<User> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        self.0.execute(
            "INSERT INTO users (nickname, wish, avatar, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![nickname, wish, avatar, now],
        )?;
        let id = self.0.last_insert_rowid();
        self.0.execute(
            "INSERT INTO knock_stats (user_id, total_knocks) VALUES (?1, 0)",
            params![id],
        )?;
        self.get_user()?
            .ok_or_else(|| "创建用户后读取失败".to_string().into())
    }

    /// 敲击一次：累计次数 +1，返回新的累计次数与一句随机祝福语。
    fn knock(&self) -> DbResult<(i64, String)> {
        let user = self.get_user()?.ok_or("USER_NOT_SETUP")?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        self.0.execute(
            "INSERT INTO knock_stats (user_id, total_knocks, last_knocked_at)
             VALUES (?1, 1, ?2)
             ON CONFLICT(user_id) DO UPDATE SET
                 total_knocks = total_knocks + 1,
                 last_knocked_at = ?2",
            params![user.id, now],
        )?;
        let count: i64 = self.0.query_row(
            "SELECT total_knocks FROM knock_stats WHERE user_id = ?1",
            params![user.id],
            |r| r.get(0),
        )?;
        let blessing = BLESSINGS
            .choose(&mut rand::thread_rng())
            .copied()
            .unwrap_or("功德+1 🙏")
            .to_string();
        Ok((count, blessing))
    }

    fn get_count(&self) -> DbResult<i64> {
        let count: i64 = self
            .0
            .query_row("SELECT COALESCE(MAX(total_knocks), 0) FROM knock_stats", [], |r| r.get(0))?;
        Ok(count)
    }
}

/// 数据库层统一的 Result 别名（错误类型为 Box<dyn Error>）。
type DbResult<T> = std::result::Result<T, Box<dyn std::error::Error>>;
type SharedDb = Arc<Mutex<Db>>;

// ---------------------------------------------------------------
// HTTP 层
// ---------------------------------------------------------------

/// 统一的 API 错误。
pub struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn not_setup() -> Self {
        Self { status: StatusCode::NOT_FOUND, message: "USER_NOT_SETUP".into() }
    }
    fn bad_request(message: &str) -> Self {
        Self { status: StatusCode::BAD_REQUEST, message: message.into() }
    }
    fn conflict(message: &str) -> Self {
        Self { status: StatusCode::CONFLICT, message: message.into() }
    }
}

impl From<Box<dyn std::error::Error>> for ApiError {
    fn from(e: Box<dyn std::error::Error>) -> Self {
        Self { status: StatusCode::INTERNAL_SERVER_ERROR, message: format!("internal error: {e}") }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(json!({ "error": self.message }))).into_response()
    }
}

async fn health() -> Json<Value> {
    Json(json!({ "data": { "ok": true, "service": "muyu-backend" } }))
}

async fn get_user_handler(State(db): State<SharedDb>) -> Result<Json<Value>, ApiError> {
    let db = db.lock().unwrap();
    match db.get_user()? {
        Some(u) => Ok(Json(json!({ "data": u }))),
        None => Err(ApiError::not_setup()),
    }
}

#[derive(Deserialize)]
struct CreateUserReq {
    nickname: String,
    #[serde(default)]
    wish: String,
    #[serde(default)]
    avatar: String,
}

async fn create_user_handler(
    State(db): State<SharedDb>,
    Json(req): Json<CreateUserReq>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let nickname = req.nickname.trim().to_string();
    if nickname.is_empty() {
        return Err(ApiError::bad_request("昵称不能为空"));
    }
    if nickname.chars().count() > 30 {
        return Err(ApiError::bad_request("昵称最长 30 个字符"));
    }
    let wish = req.wish.trim().chars().take(100).collect::<String>();
    let avatar = if req.avatar.trim().is_empty() { "🙏" } else { req.avatar.trim() };
    if avatar.chars().count() > 4 {
        return Err(ApiError::bad_request("头像格式不正确"));
    }

    let db = db.lock().unwrap();
    if db.get_user()?.is_some() {
        return Err(ApiError::conflict("用户信息已设置，不可重复设置"));
    }
    let user = db.create_user(&nickname, &wish, avatar)?;
    Ok((StatusCode::CREATED, Json(json!({ "data": user }))))
}

async fn knock_handler(State(db): State<SharedDb>) -> Result<Json<Value>, ApiError> {
    let db = db.lock().unwrap();
    let (count, blessing) = db.knock().map_err(|_| ApiError::not_setup())?;
    Ok(Json(json!({ "data": { "count": count, "blessing": blessing } })))
}

async fn count_handler(State(db): State<SharedDb>) -> Result<Json<Value>, ApiError> {
    let db = db.lock().unwrap();
    let count = db.get_count()?;
    Ok(Json(json!({ "data": { "count": count } })))
}

fn build_router(db: SharedDb) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/user", get(get_user_handler).post(create_user_handler))
        .route("/api/knock", post(knock_handler))
        .route("/api/count", get(count_handler))
        .layer(CorsLayer::permissive())
        .with_state(db)
}

// ---------------------------------------------------------------
// 服务入口
// ---------------------------------------------------------------

/// 启动后端服务（绑定到 127.0.0.1，仅本机访问）。
///
/// 服务器在 tokio 后台任务中运行；返回实际监听端口。
pub async fn serve(config: BackendConfig) -> DbResult<u16> {
    let db = Arc::new(Mutex::new(Db::open(&config.db_path)?));
    let app = build_router(db);
    let addr = SocketAddr::from(([127, 0, 0, 1], config.port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let actual = listener.local_addr()?.port();
    println!(
        "[muyu-backend] listening on http://127.0.0.1:{actual} (db: {})",
        config.db_path.display()
    );
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("[muyu-backend] server error: {e}");
        }
    });
    Ok(actual)
}

// ---------------------------------------------------------------
// 单元测试
// ---------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn db_roundtrip() {
        let dir = std::env::temp_dir().join(format!("muyu-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.db");
        let db = Db::open(&path).unwrap();

        // 初始无用户
        assert!(db.get_user().unwrap().is_none());
        assert_eq!(db.get_count().unwrap(), 0);

        // 创建用户
        let u = db.create_user("测试", "平安", "🙏").unwrap();
        assert_eq!(u.nickname, "测试");
        assert_eq!(u.total_knocks, 0);

        // 敲击累计
        let (c1, b1) = db.knock().unwrap();
        assert_eq!(c1, 1);
        assert!(!b1.is_empty());
        let (c2, _) = db.knock().unwrap();
        assert_eq!(c2, 2);
        assert_eq!(db.get_count().unwrap(), 2);

        // 读取用户
        let u2 = db.get_user().unwrap().unwrap();
        assert_eq!(u2.total_knocks, 2);

        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
