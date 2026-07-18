# Sleep Light Study

一个研究睡前屏幕光照、主观困倦与次日简单反应表现的中英双语网页实验。Protocol v3 包含四种五分钟屏幕颜色条件和一个不进行屏幕光照的正常睡眠 Control 条件，并把睡前问卷、整夜等待、睡醒后的问卷、三次反应检查和可选反馈连接为同一次研究记录。

## 在线版本

- 推荐入口：[GitHub Pages](https://howtobeawafer.github.io/sleep-light-study/)
- 旧版备用地址：[OpenAI Sites](https://sleep-light-study.dkm26355.chatgpt.site/)（部分网络会被 Cloudflare 拦截，不作为本版本参与者入口）

部分网络可能会被 `chatgpt.site` 前方的 Cloudflare 安全规则拦截，因此参与者应优先使用 GitHub Pages。

2026-07-18 双语姓名档案版本已完成生产数据库迁移，并发布到 GitHub Pages。OpenAI Sites 的源码仓库在当前受限网络中无法连接，而且该域名仍会向部分访问者显示 Cloudflare 拦截页，因此本次没有把它记录为新版发布成功；参与者只应使用 GitHub Pages。

## Protocol v3 实验流程

1. 在首页切换 English / 中文，输入一个真实姓名或网名，并选择研究者分配的条件。
2. 首次使用该姓名时，系统建立唯一档案并生成 20 位恢复码；返回者使用同一浏览器，或在其他设备输入姓名和恢复码，打开原档案。
3. 查看该姓名已经完成和尚未完成的五种条件，再阅读所选语言的完整教程。
4. 网页通过浏览器输入能力自动判断 Phone、Tablet 或 Computer；参与者可在判断不准确时改正。
5. 完成睡前问卷和第一次 Karolinska Sleepiness Scale（KSS 1–9）。
6. 四种颜色条件进入五分钟全屏光照，并在期间呈现四次稀疏黑色十字；Control 不显示颜色、不改变亮度，也不进行五分钟注意力任务。
7. 参与者开始当晚的正常睡眠。网页保存一份最多保留 48 小时的受保护草稿，用于第二天继续同一会话。
8. 睡醒后返回网页，复核设备类别，完成第二次 KSS，然后按照放松、自然回应的说明完成一次练习和三次正式简单反应检查。
9. 完整最终记录上传至 Supabase；网络失败时保留浏览器重试副本，并可导出 CSV/JSON。
10. 参与者可在结果页选择 Feedback 或 Question 留言，也可以跳过。

网页不会强制插入 washout day（洗脱日/空白日）。如果同一参与者需要完成多个条件，各次实验安排和间隔由研究方案及研究者控制，不由网站自动阻止或延后。

## 中英双语参与者教程 / Bilingual participant tutorial

首页语言按钮会切换开始页、设备确认、问卷、实验控制、睡醒流程、反应检查、结果和反馈。参与者开始前应阅读对应语言的教程：

| 阶段 | 中文教程 | English tutorial |
| --- | --- | --- |
| 实验前 | 每一次实验都尽量保持相同的设备、屏幕设置和睡眠环境。尽可能维持相近的室温、计划入睡时间、声音/噪音、灯光、睡前屏幕使用、音乐、咖啡因和助眠品习惯。请如实回答；不要为了让答案相同而填写不真实的信息。 | Keep the device, display settings, and sleep environment as similar as reasonably possible for every session. Aim for a similar temperature, intended sleep time, sound/noise, lighting, pre-sleep screen use, music, caffeine, and sleep-aid routine. Answer honestly; do not report an untrue answer just to make sessions match. |
| 姓名与恢复 | 输入真名或网名。为了隐私，推荐使用不会直接识别你的网名。姓名在整个研究中必须唯一；首次建立档案后请私下保存 20 位恢复码，不要分享。 | Enter a real name or nickname. For privacy, a nickname that does not directly identify you is recommended. The study name must be unique; after creating it, privately save the 20-character recovery code and do not share it. |
| 颜色阶段 | 保持专注并看着屏幕。黑色十字出现时点击屏幕或按 Space/Enter。电脑按 P 暂停/继续并依次输入 E、N、D 终止；手机和平板使用屏幕底部按钮。 | Stay attentive and watch the screen. When a black cross appears, tap/click or press Space/Enter. On a computer, press P to pause/resume and type E, N, D in sequence to end; on a phone or tablet, use the bottom controls. |
| Control | Control 没有颜色、亮度或十字阶段；完成睡前问卷后按平常方式睡一整晚。 | Control has no color, brightness, or cross task; after the pre-sleep questionnaire, sleep normally for the full night. |
| 睡醒后 | 返回同一网页，完成睡醒 KSS 和一次练习加三次有效反应。请放松并自然回应，不需要刻意提高警觉。 | Return to the same site, complete the post-waking KSS, then one practice and three valid reactions. Stay relaxed and respond naturally; do not deliberately heighten alertness. |
| 完成后 | 确认保存状态。如有异常、建议或疑问，可提交反馈或问题；每条留言会作为新的历史项保存。 | Confirm the save status. If anything unusual happened, or you have a suggestion or question, submit it after the session; each message is stored as a new history entry. |

这些一致性要求用于减少实验外因素变化，不代表必须在不安全或不舒适的环境中睡眠；安全和诚实回答优先。

## 唯一姓名档案与五条件进度

- `Participant ID` 在新界面中改为 **Study name / 实验姓名**，可以使用真名或网名；为减少不必要的个人身份信息，推荐不含邮箱、电话、学校编号等信息的网名。
- 姓名经过 Unicode 规范化、大小写不敏感比较和连续空白合并后必须全局唯一。因此 `Sleepy Fox`、`sleepy  fox` 等形式属于同一个姓名。
- 首次建立档案时生成 20 位恢复码。原始恢复码只保存在参与者浏览器或由参与者自行私下保存；数据库只接收和保存不可逆的哈希证明。
- 恢复码用于在新设备上重新打开同一档案并查看该姓名的实验进度。它不是密码重置服务；遗失恢复码后，研究者不能从数据库还原原码。
- 20 位档案恢复码用于长期姓名档案；64 位十六进制隔夜令牌只用于恢复一条 48 小时草稿。两者用途不同，不能互相替代。
- 档案会显示五种条件中已经完成和仍然剩余的项目及历史完成记录，但不会自动决定下一个条件或实验顺序。
- 相同姓名的每次会话都以新的会话 ID 追加到该档案，重复条件仍作为单独记录保留。

### Control 的含义

Control 是第五个正式条件，不是额外的亮度级别：

- 没有颜色刺激
- 没有屏幕亮度暴露阶段
- 没有黑色十字注意力试次
- 参与者按照平常方式完成整晚正常睡眠
- 仍然完成同样的睡前问卷、睡前 KSS、睡醒后 KSS、设备复核和三次反应检查

因此 Control 的记录中 `plannedDurationMs` 为 `0`，`trialPlan` 和 `trials` 都为空；它不能被解释成黑屏、暗色或五分钟“零亮度视频”。

## 五种实验条件

| 条件 | 数字颜色值 | 流程 |
| --- | --- | --- |
| Bright Red | `#FF0000` / RGB `255, 0, 0` | 五分钟高数字强度红色曝光 |
| Dim Red | `#660000` / RGB `102, 0, 0` | 五分钟低数字强度红色曝光 |
| Bright Blue | `#0000FF` / RGB `0, 0, 255` | 五分钟高数字强度蓝色曝光 |
| Dim Blue | `#000066` / RGB `0, 0, 102` | 五分钟低数字强度蓝色曝光 |
| Control — Normal Sleep | 无 | 无颜色、无亮度暴露，正常睡眠整晚 |

网页 RGB 值只控制数字像素，不等于物理亮度、照度或光谱功率。正式实验应固定设备、浏览器和显示设置，关闭自动亮度、True Tone、Night Shift 等自动调节，并用仪器校准实际屏幕输出。Control 应避免额外打开该实验的光照页面，而不是用未校准的“黑屏”替代。

## 稀疏注意力任务

Protocol v3 为减少频繁目标造成的警觉性提高，将颜色条件中的目标减少为：

- 每个五分钟颜色条件固定最多 `4` 次黑色十字
- 相邻计划出现时间间隔为 `50–70` 秒
- 十字显示 `1,800 ms`
- 四个时间和位置在曝光开始时预先生成，不受参与者反应快慢影响
- Control 的十字数量为 `0`
- 保存计划 onset、实际绘制 onset、点击时间、反应时、目标与点击坐标和输入方式
- 记录 `hit`、`missed`、`omitted`、`cancelled` 和无目标/额外响应 `false_click`

电脑端可用 `Space` / `Enter` 回应、`P` 暂停/继续，并依次输入 `E`、`N`、`D` 提前终止颜色曝光。手机和平板使用底部 Pause/Resume 与需二次确认的 End 控件。暂停期间五分钟有效计时和十字计划一起冻结，暂停时长单独记录。

历史 schema v2 会话仍保留原来的 20 次十字设计；数据库不会把旧数据改写成 v3。分析时必须按 `schemaVersion` 和 `attentionProtocolVersion` 分开处理两代协议。

## 睡前和睡醒后问卷

### Karolinska Sleepiness Scale

睡前与睡醒后使用同一个完整标注版 KSS，问题回顾“刚刚过去的五分钟”。这是 1–9 量表，不应改写为自定义 1–10：

| 分数 | 英文标准标签 | 中文释义 |
| --- | --- | --- |
| 1 | Extremely alert | 极度清醒 |
| 2 | Very alert | 非常清醒 |
| 3 | Alert | 清醒 |
| 4 | Rather alert | 比较清醒 |
| 5 | Neither alert nor sleepy | 既不清醒也不困倦 |
| 6 | Some signs of sleepiness | 有一些困倦迹象 |
| 7 | Sleepy, but no effort to keep awake | 困倦，但无需努力保持清醒 |
| 8 | Sleepy, some effort to keep awake | 困倦，需要稍微努力保持清醒 |
| 9 | Very sleepy, great effort keeping awake, fighting sleep | 非常困倦，需要很努力保持清醒，正在与睡意抗争 |

睡醒后 KSS 会先于反应检查说明出现，避免测试提示先提高警觉性。数据库保存原始整数、问卷版本和回答时间，不把 KSS 转换为百分比或与其他问题相加。

量表依据包括 [Åkerstedt & Gillberg 的原始研究](https://doi.org/10.3109/00207459008994241)、[KSS 与 EEG/PVT 的验证](https://doi.org/10.1016/j.clinph.2006.03.011)，以及[完整标注 9 点版本与原版的比较](https://doi.org/10.1007/s41105-016-0048-8)。

### 睡前问卷字段

每个条件（包括 Control）都会记录：

- 最近一次睡眠时尝试入睡的时间
- 睡前 KSS 1–9
- 本次会话前两小时是否使用屏幕电子产品；如果使用，记录估计分钟数
- 今晚是否计划开灯睡觉；如果是，记录暖白/黄色、冷白、红、蓝、绿、多色、其他或不确定
- 今晚睡眠环境的主观温度：冷、稍冷、舒适、稍热或热
- 今晚是否使用助眠药物或保健品；只记录 Yes / No / Prefer not to answer，不收集药名
- 最近一次醒来时的精力恢复感，1（完全没有休息好）至 5（休息得非常好）
- 最近一次睡眠质量，1（非常差）至 5（非常好）
- 过去八小时是否摄入咖啡因
- 今晚入睡时是否计划播放音乐
- 今晚正常睡眠环境的噪音程度：无、低、中或高
- 过去十二小时是否进行了剧烈运动

这些环境和行为问题作为独立协变量保存，不会被相加成一个未经验证的“睡眠总分”。问卷允许 `Prefer not to answer`，并提醒参与者不要输入姓名或药品名称。

休息恢复感和最近睡眠质量的措辞参考 [Consensus Sleep Diary](https://doi.org/10.5665/sleep.1642)，但本网页没有完整施测该日记，因此不能把整份睡前问卷报告为一个经过验证的 CSD 总量表。

## 设备记录

- 系统不保存完整 User-Agent 字符串。
- 自动分类只使用触点数量、粗/细指针、悬停能力和屏幕短边等浏览器能力。
- 最终只记录自动判断、参与者确认后的 `phone` / `tablet` / `computer` 分类和低粒度能力信息。
- 睡前和睡醒后各记录一次，并保存 `deviceChanged`，用于识别两阶段是否更换设备。
- 自动判断只是便利功能；混合触屏电脑、带触控板的平板等情况允许参与者改正。

## 三次简单反应检查

睡醒后 KSS 完成后，网页提示参与者放松并自然回应，不要求刻意进入高警觉状态：

- 先进行一次不计入数据的练习
- 随后收集三次有效正式回应
- 每次目标在随机 `2–5` 秒后出现
- 目标出现后最多等待 `2` 秒
- 提前响应记为 `false-start`，超时记为 `missed`；两者都会计数，并重做当前编号，直到获得三次有效回应
- 最终数组只保存三次 `valid` 回应并用于平均反应时和中位反应时；提前响应和漏答分别保存累计数量

这是简短的浏览器反应检查，不是完整的临床 Psychomotor Vigilance Test。设备、浏览器、触屏和键盘延迟都可能影响绝对毫秒值，分析时应结合前后设备记录。

## 48 小时草稿与恢复

睡前问卷完成后，当前会话就会以 `active` 草稿状态保存；颜色阶段开始时标记为 `in-progress`，并在试次、回应、暂停、页面隐藏及固定时间点写入本地检查点。颜色曝光结束后或 Control 完成问卷后，参与者可以正常睡眠再回来：

- 浏览器生成 32 字节随机恢复令牌，以 64 位十六进制形式持有
- Supabase 使用 PostgreSQL 核心 SHA-256 函数保存令牌摘要，不保存原始恢复令牌，也不依赖 `pgcrypto`
- 草稿位于 `private.study_drafts`，`anon` 和普通已登录用户都没有表级读取权限
- 匿名页面只能调用范围受限的 `save_study_draft`、`load_study_draft` 和 `delete_study_draft` RPC
- 草稿 JSON 最大 `128 KiB`，每次保存后的有效期为 48 小时；过期草稿在后续操作时清理
- 没有恢复令牌就不能通过参与者编号枚举或读取草稿；恢复令牌本身属于敏感 bearer token，不应分享
- 完成睡醒后流程并保存最终记录后删除草稿；最终记录仍受正常 RLS 和管理员 allow-list 保护
- 非测试会话标记“开始睡眠”后至少四小时才开放睡醒按钮，用于防止误点；这不是睡眠时长的测量

“受保护”指令牌哈希、私有表和最小 RPC 权限，不代表网页对草稿内容另外进行端到端加密。清除浏览器网站数据、丢失恢复令牌或超过 48 小时都可能导致无法继续。

## 最终数据记录

Schema v3 最终记录包含：

- 会话 ID、唯一姓名档案 ID、显示姓名、五种条件之一、网站构建版本、协议和问卷版本
- 睡前/睡醒后时间点、刺激开始结束、开始睡眠、早晨返回和评估完成时间
- 睡前问卷、前后 KSS 和三次反应检查的原始数据与摘要
- 睡前设备、睡醒后设备和是否换设备
- 颜色条件的四次计划、实际呈现和响应；Control 对应数组为空
- 暂停、误点、页面隐藏/恢复和全屏事件
- 正常完成或提前终止状态及终止方式

CSV 始终保留 `session_summary`；JSON 保存完整嵌套结构。显示姓名会进行电子表格公式注入防护。旧 schema v2、早期 schema v3 和新档案式 schema v3 记录都保留在同一数据库中，但校验规则和分析协议不同。

### 反馈、问题和管理员黄色审查

- 每次实验完成后可提交一条 **Feedback** 或 **Question**，也可以跳过。提交会生成独立 ID、时间戳、界面语言、提示版本和网站构建版本。
- 会话与反馈采用只追加设计；再次提交会新增历史项，不会覆盖之前的回答、反馈或问题。
- 管理员页面会按姓名汇总历史。如果不同晚上的环境可能存在明显差异，姓名和相关会话旁会显示黄色感叹号，供研究者人工复核；它不是自动排除或自动判定数据无效。
- 黄色提醒规则为：跨午夜正确计算后的入睡时间最小跨度 **超过 90 分钟**；温度等级跨度 **超过 1 级**；噪音等级跨度 **超过 1 级**；是否开灯或灯光颜色发生变化；或屏幕使用、入睡音乐、过去八小时咖啡因、助眠品四项中至少两项发生 Yes/No 变化。
- 研究者分配的 Bright/Dim Red/Blue/Control 条件变化绝不会被当作环境不一致；`Prefer not to answer` 也不会凭空制造变化提醒。

## 数据保存与权限

- 未登录参与者只能新增符合约束的最终 `completed` / `terminated` 记录，不能读取、修改或删除最终记录。
- 只有 Supabase Auth 中已确认并加入私有 allow-list 的管理员可以读取远程记录。
- 浏览器保留最终上传失败的重试副本；远程保存成功后清除相应副本。
- `test` 和 `admin` 都不能作为正式实验姓名写入数据库。
- 每个新会话写入不可变的 `studyBuildVersion`，以便回答始终可以追溯到当时的网页版本。
- 数据库升级采用 additive migration（增量迁移）：旧 schema v2、旧 schema v3、先前问卷答案和反馈不会被新版本覆盖、改写或自动删除。新的会话、回答和反馈始终追加为新记录。

数据库首次设置、现有项目升级和管理员步骤见 [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)。已有 v2 项目必须先执行 [`supabase/migrations/20260718_protocol_v3.sql`](./supabase/migrations/20260718_protocol_v3.sql)，再执行档案迁移 [`supabase/migrations/20260718_participant_profiles.sql`](./supabase/migrations/20260718_participant_profiles.sql)。当前生产项目已于 2026-07-18 按此顺序完成两份迁移；迁移前后 `study_sessions` 均为 0 条，因此历史记录计数和指纹保持一致。

## 内置研究者入口

### Test mode

实验姓名输入隐藏保留值 `test`（不区分大小写）可反复试用流程。Test mode 不写入正式档案、会话历史、反馈或 Supabase，也不会出现在管理员数据中；开始页不会向普通参与者提示该保留值。

### 管理员

实验姓名输入 `admin` 会进入 Supabase 邮箱密码登录页。管理员页面支持搜索、刷新、分页读取、姓名档案进度、反馈/问题、黄色环境一致性提醒，以及下载单次或全部 CSV/JSON。Email provider 必须保持开启；只关闭 **Allow new users to sign up / Enable sign ups**，不要关闭 Email provider 本身。

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

生产检查：

```bash
npm run lint
npm test
```

## 主要文件

- `app/page.tsx`：完整过夜流程和实验状态协调
- `app/study-tutorial.tsx`：中英双语完整实验教程
- `app/participant-profile.ts`：唯一姓名、恢复码和本地档案
- `app/consistency-review.ts`：管理员环境一致性提醒与五条件历史摘要
- `app/session-feedback.tsx`：完成后的版本化反馈/问题窗口
- `app/protocol-v3.ts`：v3 条件、KSS、问卷、设备和反应检查数据契约
- `app/study-surveys.tsx`：睡前/睡醒后问卷
- `app/reaction-test.tsx`：一次练习和三次正式反应检查
- `app/session-record.ts`、`app/session-validation.ts`：v3 会话结构和严格校验
- `app/study-data.ts`：CSV/JSON 序列化
- `app/remote-storage.ts`：最终记录、48 小时草稿和管理员 Supabase 请求
- `supabase/setup.sql`：全新数据库完整设置
- `supabase/migrations/20260718_protocol_v3.sql`：现有 v2 数据库升级到 v3
- `supabase/migrations/20260718_participant_profiles.sql`：唯一姓名档案、历史关联、反馈和只追加保护；生产项目已执行
- [`BUILD_LOG.md`](./BUILD_LOG.md)：按时间保留的搭建与协议变更日志
- [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)：Supabase 恢复、迁移和权限设置

## 研究与技术限制

- 正式研究前仍需取得适用的知情同意、伦理审批，并预先规定数据保留、排除标准和统计分析方法。
- 网站不执行随机分组、条件平衡、盲法或 washout 安排；这些属于研究方案。
- 浏览器无法测量真实 lux、光谱、环境光或睡眠本身；Control 也不能证明参与者整夜完全没有其他光照。
- KSS 是主观状态量表；简短三次反应检查不是诊断工具。
- 浏览器行为计时为近似值，后台节流、设备休眠、锁屏和设备差异会影响记录。
- 草稿恢复依赖 48 小时内仍持有正确令牌；最终远程上传依赖网络。
- 匿名最终写入和令牌式草稿接口保护读取权限，但不能证明每次提交都来自真实受试者。公开招募时应考虑一次性 Participant token、服务器端限流或 Edge Function。
- 四个颜色条件与旧版 20 次注意力数据不得直接混合分析；必须按协议版本区分。

## 版本状态

- 2026-07-11：发布 schema v2，包括 Supabase 最终上传、管理员仪表板和触摸设备控制。
- 2026-07-18：加入 Protocol v3 源码与数据库迁移，包括四次稀疏十字、正常睡眠 Control、前后 KSS、睡眠/环境问卷、前后设备记录、三次反应检查和 48 小时草稿恢复。
- 2026-07-18：完成中英双语、唯一姓名档案与恢复码、五条件进度、只追加反馈、构建版本追踪和管理员黄色一致性提醒；生产数据库两份增量迁移和结构核对通过，并发布到 GitHub Pages。OpenAI Sites 因源码仓库网络隔离及既有 Cloudflare 拦截没有记为本版发布成功。

正式收集新版数据前必须确认 Supabase 项目已恢复运行、两份迁移均成功、当前网页构建已部署，并完成一次中英文、档案恢复及跨睡前与睡醒阶段的端到端试验。
