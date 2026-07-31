# Sleep Light Study

一个研究五分钟睡前屏幕颜色暴露、即时困倦与第二天早晨主观状态的中英双语网页实验。当前数据契约是 **Protocol v4**（`schemaVersion: 4`、`protocolVersion: "overnight-v2"`）：所有参与者依次完成四种颜色，反应时间来自曝光期间的黑色十字，不再设置当前版 Control 或第二天早晨的独立反应测试。

## 在线版本

- 推荐入口：[GitHub Pages](https://howtobeawafer.github.io/sleep-light-study/)
- 旧版备用地址：[OpenAI Sites](https://sleep-light-study.dkm26355.chatgpt.site/)（部分网络会被 Cloudflare 拦截，不作为本版本参与者入口）

部分网络可能会被 `chatgpt.site` 前方的 Cloudflare 安全规则拦截，因此参与者应优先使用 GitHub Pages。

2026-07-18 双语姓名档案版本已完成生产数据库迁移，并发布到 GitHub Pages。OpenAI Sites 的源码仓库在当前受限网络中无法连接，而且该域名仍会向部分访问者显示 Cloudflare 拦截页，因此本次没有把它记录为新版发布成功；参与者只应使用 GitHub Pages。

2026-07-23 的密码账户增量迁移 `20260723_password_accounts.sql` 已由项目负责人确认于 2026-07-26 在生产项目成功执行，SQL Editor 显示 `Success. No rows returned`。匹配的 `2026-07-26-password-practice-admin-results-v1` 网页随后通过 GitHub Pages workflow #42 发布；公开页面已核对到密码账户入口和匹配的静态资源。完整参与者过夜流程和需要管理员密码的真实数据详情仍应由项目负责人完成一次端到端核对。晨间邮件提醒原型已在生产发布前取消，网页不向参与者索取提醒邮箱。

> **Protocol v4 生产验证 — 2026-07-31 已完成：**生产 Supabase 已完整运行 [`supabase/migrations/20260731_protocol_v4.sql`](./supabase/migrations/20260731_protocol_v4.sql)。只读核对确认 v4 函数、档案关联草稿、RLS、匿名执行权限、三条会话约束和服务器端固定顺序均已生效。迁移后仍有 1 条历史 schema 3 记录；其数量与 payload 指纹 `b9cf9c7fbb0656882991ce141f221ebf` 和 2026-07-26 的管理员备份完全一致。当前源码是与该数据库契约匹配的 v4 发布源。

## Protocol v4（当前方案）

### 固定的四次实验顺序

`sequenceVersion` 固定为 `"fixed-four-v1"`。普通参与者不能选择、跳过或重新排列条件；登录后网页根据已完成的 v4 顺序位置自动分配下一项：

| 顺序位置 | 条件 | 数字颜色值 | 暴露 |
| --- | --- | --- | --- |
| 1 | Dim Red / 暗红 | `#660000` / RGB `102, 0, 0` | 五分钟 |
| 2 | Dim Blue / 暗蓝 | `#000066` / RGB `0, 0, 102` | 五分钟 |
| 3 | Bright Blue / 亮蓝 | `#0000ff` / RGB `0, 0, 255` | 五分钟 |
| 4 | Bright Red / 亮红 | `#ff0000` / RGB `255, 0, 0` | 五分钟 |

只有 `completed` 且曝光也为 `completed` 的 v4 会话才完成对应顺序位置。提前终止并完成后续问卷的最终 `terminated` 记录会保留给管理员审查，但不会推进顺序；尚未完成的 `active` 数据只保存在私有草稿中，其有效期在每次保存时更新为 48 小时，而且不会出现在最终记录管理员页面。Protocol v4 不含 Control；v3 的 Control 会话和回答仍以原样保留、显示和导出。

所有网页 RGB 值只是数字像素指令，不等于实测照度、亮度或光谱功率。正式研究需要固定并记录设备与显示设置；如果要报告物理光照强度，应另外用合适仪器校准。

### 每次实验流程

1. 用唯一的 **Study name / 实验姓名** 和密码登录。网页显示已经完成的顺序位置并自动分配下一项。
2. 阅读教程并确认安全说明。存在**光敏性癫痫病史**，或闪烁、快速出现的视觉刺激会造成明显不适者不应参加；任何画面造成不适时立即停止。
3. 在**平常睡觉时间**进行，不要为了实验提前或推迟上床。完成实验前问卷和基线 Karolinska Sleepiness Scale 1–9。
4. 完成一次不保存的操作练习，然后观看指定颜色五分钟。黑色十字按 `"sparse-4-50-70-v1"` 规则出现四次，相邻计划时间为 50–70 秒，显示 1,800 ms。
5. 十字出现时点击/轻触屏幕或按 `Space` / `Enter`。无十字点击、多余点击、漏答、暂停、页面隐藏、全屏变化和提前终止都会保留。
6. 颜色结束后**立即**完成完整标注的 Karolinska Sleepiness Scale 1–9（`"post-exposure-kss-v1"`），然后在平常时间按平常方式睡觉。
7. 第二天醒来后在最近一次草稿保存后的 48 小时内重新打开网页，确认设备类别并完成版本化的**第二天早晨问卷**（`"morning-study-v1"`）。当前版没有睡醒后的独立三次反应测试。
8. 完整记录上传到 Supabase，并以 `schemaVersion: 4`、`protocolVersion: "overnight-v2"` 和 `sequenceVersion: "fixed-four-v1"` 与历史记录区分。

网页不强制插入 washout day；可以连续几晚完成不同条件，但每晚都应保持平常睡觉时间。连续实验安排仍须由获批研究方案决定。

### 标准化、安全与注意要求

- 所有四次实验尽量使用**同一设备、同一浏览器、相同屏幕亮度和相同显示设置**。
- 条件允许时关闭自动亮度、Night Shift、True Tone、蓝光过滤器及其他自动显示调整；每晚都采用相同设置。
- 尽量保持室温、声音/噪音、灯光、被褥、睡衣和睡前习惯相近；真实情况不同就如实回答，不能为了“看起来一致”填写不真实答案。
- 五分钟曝光期间保持注视，**不要切换应用、查看消息、浏览网页、使用分屏或另一个屏幕**。
- 电脑按 `P` 暂停/继续并依次输入 `E`、`N`、`D` 提前结束；手机和平板使用底部 Pause/Resume 和双重确认 End 按钮。
- 跨浏览器或设备恢复只是防止数据丢失的备用能力，不是更换实验设备的建议。为减少设备差异，恢复后仍应尽可能回到原设备和浏览器。

### Required English participant wording

The current protocol requires the English participant instructions to include:

- **Safety and eligibility:** “Do not participate if you have a history of photosensitive seizures or significant discomfort with flashing or rapidly appearing visual stimuli. Stop the session if the display causes discomfort.”
- **Normal bedtime:** “Do not go to bed later or earlier for the experiment.”
- **Device and display:** “Use the same device and browser for all sessions. Keep the same manual screen-brightness level and display settings across all four sessions. Disable automatic brightness, Night Shift, True Tone, blue-light filters, or other automatic display adjustments when possible. Follow the assigned brightness instructions for each condition.”
- **No multitasking:** “Do not multitask or use split-screen. Do not switch apps, read messages, browse, or use another screen during the five-minute display.”

### 当前结果变量与早晨问卷

- **即时困倦：**五分钟曝光结束后立即填写的 Karolinska Sleepiness Scale 1–9；实验前问卷中的基线 Karolinska Sleepiness Scale 另行保存。
- **曝光期间反应时间：**只从状态为 `hit` 且含有效 `reactionTimeMs` 的十字试次计算有效数量、平均值和中位数；`missed`、误点及全部原始试次分别保留。它是注意检查兼反应指标，不是独立或临床 PVT。
- **第二天早晨问卷：**尝试入睡时间、起床时间、记得的夜间醒来次数、睡眠质量 1–5、恢复感 1–5、早晨清醒程度 1–5，以及是否存在异常因素；选择 Yes 时必须填写 1–1,000 字符说明，选择其他答案时说明保存为 `null`。
- **过程与协变量：**实验前问卷、设备类别、曝光时长、暂停、页面/全屏事件、终止状态和版本信息。

Karolinska Sleepiness Scale 使用完整标注 1–9 版本，不改写成自定义 1–10。依据包括 [Åkerstedt & Gillberg 的原始研究](https://doi.org/10.3109/00207459008994241)、[该量表与 EEG/PVT 的验证](https://doi.org/10.1016/j.clinph.2006.03.011)以及[完整标注 9 点版本与原版的比较](https://doi.org/10.1007/s41105-016-0048-8)。

### 跨浏览器恢复与历史记录

- v4 未完成草稿与通过身份验证的姓名档案关联；每次保存都会把有效期更新为从该次保存起 48 小时。刷新页面，或换浏览器/设备后使用**相同实验姓名和密码**登录，可以读取仍未过期的远程草稿。
- 一个档案同一时间只能有一条未完成 v4 会话。完成后删除临时草稿并追加最终记录。
- v2、v3 和 v4 记录通过 schema/protocol/build 版本区分。迁移不得更新、重写或删除任何历史 payload、问卷、反馈或 Control 答案。
- v3 的 Control、前后 KSS 和独立三次反应测试属于历史协议；它们的最终记录仍可在管理员页面和 CSV/JSON 中查看，但不得补写成 v4 字段或与 v4 指标直接混合。v3 的令牌式草稿恢复只服务尚未完成的旧草稿，不会把 active 草稿暴露在最终记录管理员页面。

## Protocol v3 历史实验流程（只用于解释旧记录）

以下各节记录 2026-07-18 至 v4 上线前的 v3 行为，用于审计和解释历史数据；它们不是当前参与者流程。

1. 在首页切换 English / 中文，输入一个真实姓名或网名，并选择研究者分配的条件。
2. 首次使用该姓名时选择一个 **8–128 个字符的密码**；同一浏览器刷新后会自动恢复已登录档案和进度，换浏览器或设备时用姓名和密码登录。
3. 查看该姓名已经完成和尚未完成的五种条件，再阅读所选语言的完整教程。旧版 20 位恢复码持有者可在首次返回时升级为密码，原有会话和进度不会丢失。
4. 网页通过浏览器输入能力自动判断 Phone、Tablet 或 Computer；参与者可在判断不准确时改正。
5. 四种颜色条件先进行一次带操作提示的独立练习轮；练习不保存、不上传，也不计入正式数据。Control 为避免额外屏幕暴露而跳过练习轮。
6. 完成睡前问卷和第一次 Karolinska Sleepiness Scale（KSS 1–9）。
7. 四种颜色条件进入五分钟全屏光照，并在期间呈现四次稀疏黑色十字；Control 不显示颜色、不改变亮度，也不进行五分钟注意力任务。
8. 参与者开始当晚的正常睡眠。网页保存一份最多保留 48 小时的受保护草稿，用于第二天继续同一会话。
9. 睡醒后返回网页，复核设备类别，完成第二次 KSS，然后按照放松、自然回应的说明完成一次练习和三次正式简单反应检查。
10. 完整最终记录上传至 Supabase；网络失败时保留浏览器重试副本，并可导出 CSV/JSON。
11. 参与者可在结果页选择 Feedback 或 Question 留言，也可以跳过。

网页不会强制插入 washout day（洗脱日/空白日）。如果同一参与者需要完成多个条件，各次实验安排和间隔由研究方案及研究者控制，不由网站自动阻止或延后。

## Protocol v3 历史参与者教程 / Historical bilingual tutorial

首页语言按钮会切换开始页、设备确认、问卷、实验控制、睡醒流程、反应检查、结果和反馈。参与者开始前应阅读对应语言的教程：

| 阶段 | 中文教程 | English tutorial |
| --- | --- | --- |
| 实验前 | 每一次实验都尽量保持相同的设备、屏幕设置和睡眠环境。尽可能维持相近的室温、计划入睡时间、声音/噪音、灯光、睡前屏幕使用、音乐、咖啡因和助眠品习惯。请如实回答；不要为了让答案相同而填写不真实的信息。 | Keep the device, display settings, and sleep environment as similar as reasonably possible for every session. Aim for a similar temperature, intended sleep time, sound/noise, lighting, pre-sleep screen use, music, caffeine, and sleep-aid routine. Answer honestly; do not report an untrue answer just to make sessions match. |
| 姓名与密码 | 输入真名或网名。为了隐私，推荐使用不会直接识别你的网名。姓名必须唯一，并选择一个 8–128 个字符、自己能记住的密码；换浏览器时用同一姓名和密码登录。 | Enter a real name or nickname. For privacy, a nickname that does not directly identify you is recommended. The study name must be unique; choose a memorable 8–128-character password and use the same name and password in a new browser. |
| 暴露前练习 | 颜色条件会先显示暗色中性、不保存的引导练习：等待黑色十字出现，再按提示点击/轻触或按键，并练习暂停和结束控件。Control 跳过这一练习，避免增加额外屏幕暴露。 | Color conditions begin with an unsaved, dim-neutral guided practice: wait for the black cross, respond as instructed, and try the pause and end controls. Control skips this practice to avoid extra screen exposure. |
| 颜色阶段 | 保持专注并看着屏幕。黑色十字出现时点击屏幕或按 Space/Enter。电脑按 P 暂停/继续并依次输入 E、N、D 终止；手机和平板使用屏幕底部按钮。 | Stay attentive and watch the screen. When a black cross appears, tap/click or press Space/Enter. On a computer, press P to pause/resume and type E, N, D in sequence to end; on a phone or tablet, use the bottom controls. |
| Control | Control 没有颜色、亮度或十字阶段；完成睡前问卷后按平常方式睡一整晚。 | Control has no color, brightness, or cross task; after the pre-sleep questionnaire, sleep normally for the full night. |
| 睡醒后 | 返回同一网页，完成睡醒 KSS 和一次练习加三次有效反应。请放松并自然回应，不需要刻意提高警觉。 | Return to the same site, complete the post-waking KSS, then one practice and three valid reactions. Stay relaxed and respond naturally; do not deliberately heighten alertness. |
| 完成后 | 确认保存状态。如有异常、建议或疑问，可提交反馈或问题；每条留言会作为新的历史项保存。 | Confirm the save status. If anything unusual happened, or you have a suggestion or question, submit it after the session; each message is stored as a new history entry. |

这些一致性要求用于减少实验外因素变化，不代表必须在不安全或不舒适的环境中睡眠；安全和诚实回答优先。

## Protocol v3 历史姓名档案与五条件进度

- `Participant ID` 在新界面中改为 **Study name / 实验姓名**，可以使用真名或网名；为减少不必要的个人身份信息，推荐不含邮箱、电话、学校编号等信息的网名。
- 姓名经过 Unicode 规范化、大小写不敏感比较和连续空白合并后必须全局唯一。因此 `Sleepy Fox`、`sleepy  fox` 等形式属于同一个姓名。
- 首次建立档案时由参与者选择 **8–128 个字符的密码**。浏览器先用慢速 PBKDF2 派生不可逆的凭证证明；数据库不接收或保存可显示的原始密码。
- 同一浏览器会记住已登录档案并在刷新后自动恢复完成/剩余进度。新浏览器或新设备需要输入同一姓名和密码；网站不提供通过邮件重置参与者密码的服务。
- 2026-07-18 版已经建立的档案仍可使用原 20 位恢复码完成一次性升级。升级只替换档案凭证，不删除、改写或重新归类既有会话、问卷、反馈和五条件进度。
- 参与者密码用于长期姓名档案；64 位十六进制隔夜令牌只用于恢复一条 48 小时草稿。两者用途不同，不能互相替代。
- 档案会显示五种条件中已经完成和仍然剩余的项目及历史完成记录，但不会自动决定下一个条件或实验顺序。
- 相同姓名的每次会话都以新的会话 ID 追加到该档案，重复条件仍作为单独记录保留。

### Control 的历史含义

Control 是第五个正式条件，不是额外的亮度级别：

- 没有颜色刺激
- 没有屏幕亮度暴露阶段
- 没有黑色十字注意力试次
- 参与者按照平常方式完成整晚正常睡眠
- 仍然完成同样的睡前问卷、睡前 KSS、睡醒后 KSS、设备复核和三次反应检查

因此 Control 的记录中 `plannedDurationMs` 为 `0`，`trialPlan` 和 `trials` 都为空；它不能被解释成黑屏、暗色或五分钟“零亮度视频”。

## Protocol v3 历史五种实验条件

| 条件 | 数字颜色值 | 流程 |
| --- | --- | --- |
| Bright Red | `#FF0000` / RGB `255, 0, 0` | 五分钟高数字强度红色曝光 |
| Dim Red | `#660000` / RGB `102, 0, 0` | 五分钟低数字强度红色曝光 |
| Bright Blue | `#0000FF` / RGB `0, 0, 255` | 五分钟高数字强度蓝色曝光 |
| Dim Blue | `#000066` / RGB `0, 0, 102` | 五分钟低数字强度蓝色曝光 |
| Control — Normal Sleep | 无 | 无颜色、无亮度暴露，正常睡眠整晚 |

网页 RGB 值只控制数字像素，不等于物理亮度、照度或光谱功率。正式实验应固定设备、浏览器和显示设置，关闭自动亮度、True Tone、Night Shift 等自动调节，并用仪器校准实际屏幕输出。Control 应避免额外打开该实验的光照页面，而不是用未校准的“黑屏”替代。

## Protocol v3 历史稀疏注意力任务

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

### 暴露前引导练习

四种颜色条件在正式睡前问卷和五分钟暴露前加入一个隔离练习轮。练习使用低亮度的暗色中性背景，以逐步提示参与者等待黑色十字、点击/轻触或按 `Space` / `Enter`、暂停/继续，以及使用对应设备的结束控件。练习状态只存在于当前页面内，不调用 Supabase、不写入浏览器研究记录，也不进入正式十字、反应时、暂停或误点数据。

Control 不运行这一练习，因为它的研究定义是不进行颜色、亮度或十字暴露；跳过练习可以避免给 Control 参与者增加额外的注意任务和屏幕时间。这个暴露前练习与睡醒后反应检查中的一次练习目的不同，两者都不计入各自的正式结果。

## Protocol v3 历史睡前和睡醒后问卷

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

## Protocol v3 历史设备记录

- 系统不保存完整 User-Agent 字符串。
- 自动分类只使用触点数量、粗/细指针、悬停能力和屏幕短边等浏览器能力。
- 最终只记录自动判断、参与者确认后的 `phone` / `tablet` / `computer` 分类和低粒度能力信息。
- 睡前和睡醒后各记录一次，并保存 `deviceChanged`，用于识别两阶段是否更换设备。
- 自动判断只是便利功能；混合触屏电脑、带触控板的平板等情况允许参与者改正。

## Protocol v3 历史三次简单反应检查

睡醒后 KSS 完成后，网页提示参与者放松并自然回应，不要求刻意进入高警觉状态：

- 先进行一次不计入数据的练习
- 随后收集三次有效正式回应
- 每次目标在随机 `2–5` 秒后出现
- 目标出现后最多等待 `2` 秒
- 提前响应记为 `false-start`，超时记为 `missed`；两者都会计数，并重做当前编号，直到获得三次有效回应
- 最终数组只保存三次 `valid` 回应并用于平均反应时和中位反应时；提前响应和漏答分别保存累计数量

这是简短的浏览器反应检查，不是完整的临床 Psychomotor Vigilance Test。设备、浏览器、触屏和键盘延迟都可能影响绝对毫秒值，分析时应结合前后设备记录。

## Protocol v3 历史 48 小时令牌式草稿与恢复

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

## 参与者联系方式

本版本不提供晨间邮件提醒或参与者邮箱字段，也不会主动索取提醒邮箱。参与者不应把邮箱用作实验姓名或写入自由文本反馈。管理员用于 Supabase 登录的固定邮箱属于独立的研究者认证流程。

## Protocol v3 历史最终数据记录

Schema v3 最终记录包含：

- 会话 ID、唯一姓名档案 ID、显示姓名、五种条件之一、网站构建版本、协议和问卷版本
- 睡前/睡醒后时间点、刺激开始结束、开始睡眠、早晨返回和评估完成时间
- 睡前问卷、前后 KSS 和三次反应检查的原始数据与摘要
- 睡前设备、睡醒后设备和是否换设备
- 颜色条件的四次计划、实际呈现和响应；Control 对应数组为空
- 暂停、误点、页面隐藏/恢复和全屏事件
- 正常完成或提前终止状态及终止方式

CSV 始终保留 `session_summary`；JSON 保存完整嵌套结构。显示姓名会进行电子表格公式注入防护。旧 schema v2、早期 schema v3 和新档案式 schema v3 记录都保留在同一数据库中，但校验规则和分析协议不同。

## 反馈、问题和管理员黄色审查（所有版本）

- 每次实验完成后可提交一条 **Feedback** 或 **Question**，也可以跳过。提交会生成独立 ID、时间戳、界面语言、提示版本和网站构建版本。
- 会话与反馈采用只追加设计；再次提交会新增历史项，不会覆盖之前的回答、反馈或问题。
- 管理员页面会按姓名汇总历史。如果不同晚上的环境可能存在明显差异，姓名和相关会话旁会显示黄色感叹号，供研究者人工复核；它不是自动排除或自动判定数据无效。
- 黄色提醒规则为：跨午夜正确计算后的入睡时间最小跨度 **超过 90 分钟**；温度等级跨度 **超过 1 级**；噪音等级跨度 **超过 1 级**；是否开灯或灯光颜色发生变化；或屏幕使用、入睡音乐、过去八小时咖啡因、助眠品四项中至少两项发生 Yes/No 变化。
- 研究者分配的颜色条件变化，以及历史 v3 的 Control，绝不会被当作环境不一致；`Prefer not to answer` 也不会凭空制造变化提醒。

### 管理员详细结果查看

管理员登录后仍先看到可搜索的会话摘要表。每条会话新增一个可展开的只读 **View details / 查看详情** 区域，在页面内按以下部分整理原始记录：

- 会话、姓名档案、schema、协议、问卷和网页构建版本；
- 条件、暴露、精确时间点、时长和终止信息；
- v4 的实验前问卷、曝光后即时 Karolinska Sleepiness Scale 和第二天早晨问卷；v3 的睡前/睡醒后问卷和 KSS；
- 睡前和睡醒后设备、设备是否变化；
- 注意力计划与实际试次、无目标/额外点击、暂停和页面/全屏事件；
- v4 从曝光 `hit` 试次得到的有效数量、平均值和中位反应时；历史 v3 的独立三次反应结果；
- 反馈/问题及环境一致性人工复核信息；
- 按需展开的完整、已校验 JSON payload。

长数组在详情中每页显示 50 条，只有当前展开的会话会渲染详细内容。页面保留单次和全部 CSV/JSON 下载，详细查看不会替代研究导出。时间、毫秒值和标识符会保留精确值，不只显示四舍五入摘要。

该功能复用管理员已经获得的完整只读会话、档案和反馈结果。自由文本和 JSON 作为普通 React 文本显示，不作为 HTML 注入。某个历史 schema 没有采集的字段会明确标为未收集；页面不会猜测、补值或改写旧记录。v3 Control 和全部历史问卷答案仍可查看和导出。

## 数据保存与权限

- 历史 v2/v3 的匿名写入只接受最终 `completed` / `terminated` 记录；v4 必须通过姓名档案和密码凭证保护的提交路径保存。参与者不能读取、修改或删除最终记录。
- 只有 Supabase Auth 中已确认并加入私有 allow-list 的管理员可以读取远程记录。
- 浏览器保留最终上传失败的重试副本；远程保存成功后清除相应副本。
- `test` 和 `admin` 都不能作为正式实验姓名写入数据库。
- 参与者姓名/密码凭证与管理员 Supabase Auth 是两套独立机制；参与者不会成为 Supabase Auth 用户。
- 每个新会话写入不可变的 `studyBuildVersion`，以便回答始终可以追溯到当时的网页版本。
- 数据库升级采用 additive migration（增量迁移）：旧 schema v2、旧 schema v3（包括 Control）、先前问卷答案和反馈不会被 v4 覆盖、改写或自动删除。新的会话、回答和反馈始终追加为新记录。

数据库首次设置、现有项目升级和管理员步骤见 [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)。现有生产项目已完成 2026-07-18 的 v3/档案迁移及 [`20260723_password_accounts.sql`](./supabase/migrations/20260723_password_accounts.sql)。发布 v4 前必须再完整执行 [`20260731_protocol_v4.sql`](./supabase/migrations/20260731_protocol_v4.sql)，确认 `Success. No rows returned`、旧 v2/v3 计数和 payload 指纹完全不变，然后才部署匹配的 v4 前端。不能先部署 v4 前端。

## 内置研究者入口

### Test mode

实验姓名输入隐藏保留值 `test`（不区分大小写）可反复试用流程。Test mode 不写入正式档案、会话历史、反馈或 Supabase，也不会出现在管理员数据中；开始页不会向普通参与者提示该保留值。

### 管理员

实验姓名输入 `admin` 会进入 Supabase 邮箱密码登录页。管理员页面支持搜索、刷新、分页读取、姓名档案进度、反馈/问题、黄色环境一致性提醒、在页面内展开单次会话的完整分类详情，以及下载单次或全部 CSV/JSON。详情查看是只读的，不会修改、排除或删除记录。Email provider 必须保持开启；只关闭 **Allow new users to sign up / Enable sign ups**，不要关闭 Email provider 本身。

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
- `app/admin-session-details.tsx`：管理员页面内的分类、只读会话详情
- `app/study-tutorial.tsx`：中英双语完整实验教程
- `app/attention-practice.tsx`：颜色条件的隔离、不保存引导练习轮
- `app/participant-profile.ts`：唯一姓名、密码凭证证明、旧恢复码兼容和本地已登录档案
- `app/consistency-review.ts`：管理员环境一致性提醒与五条件历史摘要
- `app/session-feedback.tsx`：完成后的版本化反馈/问题窗口
- `app/protocol-v4.ts`：v4 固定顺序、曝光后 Karolinska Sleepiness Scale 和第二天早晨问卷数据契约
- `app/protocol-v3.ts`：v3 条件、KSS、问卷、设备和反应检查数据契约
- `app/study-surveys.tsx`：实验前问卷、曝光后即时 Karolinska Sleepiness Scale 和第二天早晨问卷
- `app/reaction-test.tsx`：只用于历史 v3 的一次练习和三次正式反应检查
- `app/session-record.ts`、`app/session-validation.ts`、`app/session-validation-v4.ts`：版本化会话结构和严格校验
- `app/study-data.ts`：CSV/JSON 序列化
- `app/remote-storage.ts`：最终记录、48 小时草稿和管理员 Supabase 请求
- `supabase/setup.sql`：全新数据库的 v3/姓名档案基础设置；新项目仍须依次运行密码迁移和 v4 迁移
- `supabase/migrations/20260718_protocol_v3.sql`：现有 v2 数据库升级到 v3
- `supabase/migrations/20260718_participant_profiles.sql`：唯一姓名档案、历史关联、反馈和只追加保护；生产项目已执行
- `supabase/migrations/20260723_password_accounts.sql`：把旧恢复码档案安全升级为参与者密码凭证；项目负责人确认生产项目已于 2026-07-26 执行
- `supabase/migrations/20260731_protocol_v4.sql`：在不改写 v2/v3 的前提下加入 schema v4、固定四条件进度和档案关联的跨浏览器草稿；必须先迁移数据库再发布 v4 前端
- [`BUILD_LOG.md`](./BUILD_LOG.md)：按时间保留的搭建与协议变更日志
- [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)：Supabase 恢复、迁移和权限设置

## 研究与技术限制

- 正式研究前仍需取得适用的知情同意、伦理审批，并预先规定数据保留、排除标准和统计分析方法。
- Protocol v4 有意使用同一参与者内的固定顺序，不执行随机分组、顺序平衡、盲法或 washout 安排；固定顺序可能与夜次或练习效应混杂，必须在研究解释中明确。
- 浏览器无法测量真实 lux、光谱、环境光或睡眠本身；数字 RGB 值不能替代物理校准。
- Karolinska Sleepiness Scale 是主观状态量表；曝光期间四次十字得到的反应时间是稀疏浏览器指标，不是诊断工具或完整 PVT。
- 浏览器行为计时为近似值，后台节流、设备休眠、锁屏和设备差异会影响记录。
- v4 跨浏览器草稿恢复依赖 48 小时有效期、正确姓名/密码和网络；历史 v3 草稿仍依赖其单独令牌。
- RLS 和 v4 姓名档案凭证保护记录读取与提交路径，但不能证明每次提交都来自真实受试者。公开招募时应考虑研究者发放的 Participant token、服务器端限流或 Edge Function。
- 暗色引导练习仍会增加少量、参与者操作速度相关的屏幕时间。正式研究方案应明确把它作为标准化训练步骤并在预实验中评估其影响。
- v4、v3 和旧版 20 次注意力数据不得直接混合分析；必须按 schema、protocol、attention protocol 和 build 版本区分。

## 版本状态

- 2026-07-11：发布 schema v2，包括 Supabase 最终上传、管理员仪表板和触摸设备控制。
- 2026-07-18：加入 Protocol v3 源码与数据库迁移，包括四次稀疏十字、正常睡眠 Control、前后 KSS、睡眠/环境问卷、前后设备记录、三次反应检查和 48 小时草稿恢复。
- 2026-07-18：完成中英双语、唯一姓名档案与恢复码、五条件进度、只追加反馈、构建版本追踪和管理员黄色一致性提醒；生产数据库两份增量迁移和结构核对通过，并发布到 GitHub Pages。OpenAI Sites 因源码仓库网络隔离及既有 Cloudflare 拦截没有记为本版发布成功。
- 2026-07-23：本地源码加入 8–128 字符参与者密码、刷新自动恢复、跨浏览器姓名/密码登录、旧恢复码无损升级、教程关键词加粗，以及颜色条件的独立不保存练习轮；Control 跳过练习以避免额外暴露。晨间邮件提醒原型在生产发布前取消，从未执行生产迁移或收集生产邮箱。
- 2026-07-26：项目负责人确认生产项目成功执行 `20260723_password_accounts.sql`。构建 `2026-07-26-password-practice-admin-results-v1` 加入管理员页面内的分类只读详细结果查看，并通过 GitHub Pages workflow #42 发布。公开密码入口和构建资源已核对；完整过夜流程及需管理员密码的真实详情仍待项目负责人端到端复核。
- 2026-07-31：锁定 Protocol v4（`overnight-v2`）：固定暗红 → 暗蓝 → 亮蓝 → 亮红；移除当前 Control；要求平常睡觉时间、同设备/设置与曝光期间不多任务；颜色结束后立即填写 Karolinska Sleepiness Scale；第二天早晨确认设备并填写问卷，不做独立反应测试；反应时间改由曝光 `hit` 试次计算；未完成进度可通过姓名/密码跨浏览器恢复。v2/v3 和 Control 历史答案继续保留。

正式收集 v4 数据前必须确认 Supabase 项目运行正常，先执行并验证 `20260731_protocol_v4.sql`，再部署匹配前端；随后用非识别性测试账户完成中英文、安全排除、固定四条件顺序、同浏览器刷新、另一浏览器姓名/密码恢复、练习、五分钟曝光、即时 Karolinska Sleepiness Scale、第二天早晨问卷、最终保存、管理员 v2/v3/v4 分类详情和文件下载的端到端试验。迁移前后还必须核对每一代历史记录的计数和指纹。
