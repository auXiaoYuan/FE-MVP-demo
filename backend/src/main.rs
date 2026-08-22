//! muyu-backend 独立运行入口。
//!
//! 用法：
//! ```text
//! cargo run -p muyu-backend                          # 默认 127.0.0.1:17823，db 位于 ./data/muyu.db
//! cargo run -p muyu-backend -- --port 9000
//! cargo run -p muyu-backend -- --db ./my.db
//! ```

use std::path::PathBuf;

use muyu_backend::{serve, BackendConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut config = BackendConfig::default();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--port" => {
                config.port = args
                    .next()
                    .ok_or("--port 需要端口号")?
                    .parse()
                    .map_err(|_| "端口号格式不正确")?;
            }
            "--db" => {
                config.db_path = PathBuf::from(args.next().ok_or("--db 需要路径")?);
            }
            other => {
                eprintln!("未知参数: {other}（支持 --port <u16> / --db <path>）");
            }
        }
    }

    let port = serve(config).await?;
    println!("muyu-backend 已启动: http://127.0.0.1:{port}（Ctrl+C 退出）");
    tokio::signal::ctrl_c().await?;
    Ok(())
}
