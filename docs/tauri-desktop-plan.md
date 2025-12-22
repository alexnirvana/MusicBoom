# Navidrome + OpenList 桌面客户端（Tauri）技术方案 v1

## 目标
- Windows/macOS/Linux 通用桌面客户端（Tauri 2）。
- 连接一个或多个 Navidrome 服务器（兼容 Subsonic API），提供歌单管理、播放队列、搜索、下载/离线能力。
- 连接 OpenList，支持目录浏览与流式上传（大文件友好）。
- 配置写入固定文件（固定文件名 + 系统认可的 App 数据目录）。
- 敏感凭证不落明文配置，使用系统凭据库（Keychain/Credential Manager/Secret Service）。

## Tauri 插件与权限要求
- **基础插件**：
  - 文件访问：`npm run tauri add fs`（或等效配置），确保访问离线目录、缓存路径、诊断包导出目录。
  - 网络请求：`npm run tauri add http`，所有 HTTP 请求经 Rust 侧转发。
  - 数据库：`npm add @tauri-apps/plugin-sql`，并在 `src-tauri/Cargo.toml` 添加：
    ```toml
    [dependencies.tauri-plugin-sql]
    features = ["sqlite"] # 可替换为 "postgres" 或 "mysql"
    version = "2.0.0"
    ```
  - 上传：`npm run tauri add upload`，用于 OpenList 流式上传。
- **图标库**：前端统一使用已安装的 `@vicons/ionicons5`。
- **权限/Allowlist**：
  - 确认 Tauri 配置中允许所需的 FS、HTTP、上传、SQL 插件权限（生产环境开启最小权限）。
  - 若需要打开系统文件选择器/目录创建等，按需开启 `dialog` / `fs` 相关权限。

## 分层架构
### UI 层（Vue 3 + TypeScript）
- **框架与状态**：Vue 3、Pinia、Vue Router，UI 组件库 Naive UI。
- **播放**：HTMLAudioElement，前端只负责播放控制、渲染进度与音量，不直接向服务器发起请求。
- **与核心交互**：所有网络/文件操作统一通过 `invoke()` 调用 Rust Commands，避免 CORS、大文件占用内存，以及浏览器网络限制。

### App Core（Rust / Tauri Commands）
- **网络请求**：统一实现 Navidrome(Subsonic) 与 OpenList 的 HTTP 客户端，包含签名、重试、日志。
- **上传/下载队列**：并发、重试、进度、取消；使用 Rust 异步任务管理器（如 tokio）与通道汇报状态。
- **本地数据库**：SQLite（Rusqlite / sqlx），用于缓存（歌单、曲目、元数据）、索引、队列状态、播放历史。
- **配置**：`tauri-plugin-store`，使用固定文件名（如 `settings.json`）并写入 Tauri 提供的 App 数据目录。
- **凭证**：系统 Keyring，通过 Rust `keyring` crate 或相应插件读写；配置中仅保存 key 名称或指针，不保存明文。

## 为什么“请求走 Rust”
- **OpenList 流式上传**：`PUT /api/fs/put` 可直接用文件句柄/流，Rust 侧可零拷贝或分块直传，避免前端内存爆炸与浏览器限制。
- **Navidrome 鉴权**：Subsonic API 采用 `u/t/s/v/c/f` 形式的参数式鉴权；统一在 Rust 侧生成签名、附带重试与结构化日志，提升稳定性。

## 模块设计
### 1. Command 入口
- `commands/mod.rs` 聚合模块。
- 典型命令：
  - `list_servers` / `add_server` / `remove_server`：管理服务器配置（存于 store + keyring）。
  - `navidrome_search`, `navidrome_playlist`, `navidrome_stream_url`：包装 Subsonic 请求。
  - `openlist_browse`, `openlist_upload`, `openlist_download`：目录浏览、流式上传与下载。
  - `queue_status`, `queue_pause`, `queue_resume`, `queue_cancel`：队列管理。
  - `cache_fetch`, `cache_refresh`：缓存/索引更新。

### 2. 网络层
- 使用 `reqwest`（native TLS）或 `ureq`，支持：
  - 统一的请求构建器（基 URL、鉴权参数、User-Agent、错误转换）。
  - 幂等请求重试（指数退避，部分 5xx/网络错误）。
  - 进度回调：下载/上传用 `bytes_stream` + 通道推送进度事件。
  - 登录态管理：首次登录以用户名/密码或 Token 通过 Rust 请求，成功后将凭证写入系统 Keyring，并把服务器配置（含 key 引用、默认版本号、基础 URL）写入 `tauri-plugin-store` 固定配置文件；如果接口返回 Session/Token 需复用，可将短期 Session（非敏感）缓存在 store，敏感 Token 仍入 Keyring。

### 3. 队列与并发
- 任务模型：
  - 上传/下载任务存入 SQLite（状态、重试次数、文件路径、目标服务器、优先级）。
  - tokio 任务消费队列，限制并发数（如下载 3、上传 2），支持暂停/恢复。
  - 进度事件通过 Tauri `emit` 推送到前端，前端 Pinia 订阅更新。
- 失败重试策略：HTTP 5xx、连接超时、可配置重试次数与冷却；用户可手动重试。

### 4. 本地存储与缓存
- SQLite 表示例：
  - `servers`：id、名称、base_url、username、key_ref（keyring 中的凭据标识）。
  - `playlists`、`tracks`、`albums`、`artists`：来自 Navidrome 的缓存，带版本/更新时间。
  - `queues`：任务队列（上传/下载），含进度、状态、错误信息。
  - `play_history`：播放历史与偏好。
- 索引与查询：常用字段加索引；分页查询；缓存失效策略（按更新时间或 ETag）。

### 5. 配置与凭证
- 配置文件：`settings.json`（或同名），位于 Tauri 默认的 App 数据目录（跨平台）。
- 内容示例：UI 偏好、默认服务器 ID、离线目录路径、并发数设置。
- 凭证：使用系统 Keyring，key 名称存储在 `servers.key_ref`，实际密码/Token 只在 Keyring。
- 导入/导出：配置可导出为加密包（不含凭证），凭证需用户重新输入或单独迁移。

### 6. 播放与离线
- 播放 URL 由 Rust 侧生成（带鉴权参数），前端使用 `audio.src = url` 播放。
- 离线下载：
  - Rust 负责下载到离线目录，记录哈希/大小校验。
  - 前端显示进度与离线标记；若无网络，播放本地文件路径。

### 7. 安全与隐私
- 所有敏感信息（密码、Token）存入系统凭据库，配置文件不落明文。
- 日志分级：默认 info；敏感字段打码；可开启 debug 追踪网络请求但不记录 token。
- 证书：支持自签证书信任配置；必要时提供“仅当前会话信任”。

### 8. 观察性与调试
- 日志：Rust 侧使用 `tracing` + `tracing_subscriber`，输出到文件与 console。
- 前端 DevTools：Tauri Dev 模式可开启；生产环境提供“导出诊断包”（日志 + 队列状态但无凭证）。

### 9. 交互流程示例
1. 用户添加 Navidrome 服务器：
   - 前端通过 `invoke(add_server)` 传入 URL、用户名、密码；Rust 验证后将密码写入 keyring，配置写入 store。
2. 搜索歌曲：
   - 前端调用 `navidrome_search`，Rust 请求 Subsonic `/rest/search3.view`，结果写 SQLite 缓存并返回给前端。
3. 上传文件到 OpenList：
   - 前端选择文件 -> `openlist_upload`；Rust 以流式 PUT 上传，队列管理进度，完成后更新缓存。

## 开发与测试建议
- 单元测试：网络层使用 mockserver；队列逻辑用 in-memory SQLite 测试并覆盖重试、暂停恢复场景。
- 端到端：Tauri + Playwright，模拟添加服务器、播放、上传、离线下载流程。
- 性能：大文件上传走流式，避免前端加载；下载支持分块与断点续传（可选）。

## 里程碑
1. **基础通信**：完成 Subsonic 客户端、OpenList 上传/浏览、store+keyring 管线。
2. **队列与缓存**：实现上传/下载队列、SQLite 缓存、进度事件。
3. **播放与离线**：播放 URL 生成、离线下载与本地播放切换。
4. **完善体验**：错误提示、日志、诊断包、可配置并发与重试。
