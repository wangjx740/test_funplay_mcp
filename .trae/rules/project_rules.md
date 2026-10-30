# 项目规则 — test_funplay_mcp

> 适用范围：`assets/scripts` 全部代码、场景、文档与验证工具。
> 优先级：本文件 > 个人全局规则；两者都要求「先计划、后修改」。
> 配套文件：[agent.md](file:///d:/work2/test_funplay_mcp/agent.md)、[移植执行方案](file:///d:/work2/test_funplay_mcp/doc/cursedSouls_CocosCreator_移植执行方案.md)。

---

## 1. 架构分层与依赖方向（强制）

依赖只能**单向向下**，禁止反向或跨层回调：

```
core (MainGame)
  └─ vendor (RotRng / RotCellular / RotFov / RotScheduler)
       └─ ecs (Components / EntityFactory / EntityRegistry)
            └─ system (GameSystem / MonsterAI / AchievementSystem)
                 └─ screens (ScreenFactory / Screens)
                      └─ input / data / save
                           └─ GameRoot (唯一入口)
```

- `vendor/`、`ecs/`、`core/`、`render/ScreenLayout` **禁止 `import 'cc'`**，必须能在 Node 中独立运行。
- 只有 `render/GridRenderer`、`input/KeyInput`、`save/SaveSystem`、`GameRoot` 允许依赖 `cc`。
- 需要新增能力时，优先在 `system/` 或 `screens/` 层扩展，不要改动 `vendor/` 的公共语义。

## 2. 移植一致性（最高优先级）

本项目是「移植」而不是「重写」，因此：

1. **函数名、参数顺序、返回值语义**与源工程 `d:/work2/cursedSouls/scripts/*.js` 保持一致（如 `npcMoveClose`、`Main.system.pcAct`）。
2. **调用顺序**不得调整，尤其是初始化顺序（见 `screens/Screens.ts` 的 `initialize`）。
3. **RNG 调用次数与顺序**不得增删。任何"顺手优化"都可能让同种子地图/敌人分布与源工程不一致。
4. 文案、数值、按键表、UI 坐标**逐字照搬**；发现源码奇怪行为（如数组入数组）时，先记录在文档「源码怪点清单」，再做最小必要的健壮化，并在代码注释里标注 `// 源码怪点`。
5. 源码以 `d:/work2/cursedSouls` 为唯一真相；该目录**只读**。

## 3. TypeScript 编码规范

- 缩进 4 空格；单引号；语句结尾带分号。
- 命名：类 `PascalCase`；方法/变量 `camelCase`；常量 `UPPER_SNAKE_CASE`；私有成员前缀 `_`。
- 命名**跟随源工程**（`Main.system.xxx`、`Main.entity.xxx`、`Main.screens.xxx`），不要改成其他项目的风格（如 `logic_user_update`）。
- 组件类用 `class`；`Main.*` 命名空间下的模块用 `Main.xxx = function (...) {}` 挂载，保持源码形态。
- `strict: false` 是既有配置，不因此滥用 `any`：仅在对接 JSON/动态实体时使用，且不得用 `@ts-ignore` 掩盖真实错误。
- 不使用 `enum` / `namespace` 等会改变输出结构的语法，除非引擎与工具链都支持且已评估。
- 公共方法必须有简短注释说明对应源码函数名（如 `// 对应 system.js: move`）。

## 4. 循环与兜底（强制）

**任何 `while` / `do-while` / `for(;;)` 必须有硬上限 + 退路 + 可观测告警。**

1. 地图生成：`MAX_CYCLE = 60`；超限取最接近 60% floor 的一版，仍失败则用固定连通模板，并 `console.warn` 打印种子。
2. `RotCellular.connect()`：迭代上限 `remaining.length * 4 + 64`，超限 `break` 并告警。
3. `Main.system.placeActor()`：重试上限 `200`，超限改为线性扫描找第一个合法格，保证返回结果。
4. `TurnEngine.unlock()`：
   - `_lock < 0` 视为计数失配，立即重置为 `1` 并 `console.error('[engine] lock < 0')`；
   - 单次泵步数上限 `2000`，超限强制 `_lock = 1` 并告警；
   - 泵循环内禁止再触发整屏重绘（重绘统一放到泵结束后）。
5. 文本断行 `_breakLines`：内层循环上限 `tokens.length * 2`。
6. **死循环风险必须人工审核（强制闸门）** —— 见 4.1。

新增循环若无法证明必然终止，一律按上述模板处理。

### 4.1 死循环风险 → 停下并提示人工审核

本节所说的「死循环」包含**两类**，两类都必须触发人工审核：

- **A 类｜代码死循环**：程序内某个循环不终止，表现为进程/页面卡住、CPU 飙高、按键无反应。
- **B 类｜验证死循环**：验证手段本身空转 —— 同一个动作反复做、每次都拿不到新信息，却继续重复（例：预览实际跑在浏览器里，却反复截 Creator 编辑器窗口；反复重发预览启动消息却不检查 `running` 与端口；反复跑同一条命令看同一份旧输出）。**这类同样禁止自行"再试一次"，见 4.2。**

出现以下**任一**情况，必须立即停止编码与参数调整，向用户输出「死循环风险提示」并等待人工确认，**不得自行放行**：

- 新增/修改的 `while`、`do-while`、`for(;;)` 无法用一句话说明"为什么一定终止"；
- 实测迭代次数或耗时随输入剧烈波动（例如：地图生成重试 > 20 轮、单次按键内泵步数 > 200、单个放置重试 > 50）；
- 修复手段是"放宽上限 / 加大重试次数 / 加 sleep / 降低刷新频率"这类掩盖症状的做法；
- 出现锁计数异常（`TurnEngine._lock` 为负、或 `_lock` 归零后泵不启动）；
- 浏览器或编辑器出现无响应，且 `console` 最后一条日志停在某个特定函数之后；
- 同一个验证动作（截图 / 重启预览 / 跑命令 / 查日志）已连续执行 **3 次**仍没有获得新信息（B 类，转 4.2）。

A 类提示模板（原样输出，便于人工快速判断）：

```
[死循环风险待审核]
位置：<文件:行号 或 函数名>
触发条件：<什么输入/状态下会触发>
当前边界：<无上限 / N 次 / N ms>
实测最坏：<N 轮 / X ms / 未复现>
影响范围：<地图生成 / 回合推进 / 渲染 / 其他>
建议兜底：<上限值 + 退路 + 告警>
请确认后再继续。
```

未经人工确认前：不提交、不合并、不以"先跑起来再说"为由跳过，也不用 `try/catch` 静默吞掉相关异常。

### 4.2 验证死循环（重复无效验证）

判定标准：**同一动作重复 ≥ 3 次，且每次都得不到新信息**。典型场景与本项目的对应处理：

| 重复动作 | 常见误区 | 正确做法 |
| --- | --- | --- |
| 反复截图 | 截 Creator 编辑器窗口判断游戏是否在跑（预览在浏览器里） | 先用 `get_runtime_state` 查 `running`、探测 `localhost:7456` |
| 反复重启预览 | 不检查端口/会话就重发 `preview-scene-in-browser` | 先确认会话状态，再决定是否重启 |
| 反复跑同一命令 | 拿同一份旧输出当新结果 | 换命令或换观测面（headless 回放读字符缓冲） |
| 反复"再试一次" | 把偶发当必然，不记录已排除项 | 记录证据，二分定位，再决定下一步 |

命中后必须停下，按下面模板汇报，等人工确认后再继续：

```
[验证死循环待审核]
重复动作：<截图 / 重启预览 / 命令，已重复 N 次>
预期信息：<这次想确认什么>
当前证据：<已经确认的事实，如 running:false、7456 不可达>
已排除：<已尝试且无效的手段>
建议改用的观测手段：<headless 回放 / running 状态 / 端口探测 / 浏览器控制台>
请确认后再继续。
```

红线：不得"再截一次看看"、不得用截图/日志假象代替运行状态判定；验证手段必须与运行载体匹配（浏览器预览 → 浏览器或 headless 回放；编辑器内运行 → Game View）。

## 5. 渲染规则

- `GridRenderer` 对外接口保持 `draw(x, y, ch, fg, bg)` / `drawText(x, y, text, maxWidth)` / `clear()` / `flush()` 不变。
- 业务层只写字符缓冲；`display()` 只置脏标记，真正的刷屏每帧一次（`GameRoot.update()`）。
- 不允许在业务代码里直接创建 `Label` 或操作 `Node`（`GameRoot` 除外）。
- 首帧 1820 个 `Label` 必须分帧创建；创建期间允许显示占位提示。

## 6. 输入规则

- 业务层不得直接调用 `input.on`；统一经 `Main.input.listenEvent` / `_handler` 路由。
- 键盘事件必须归一化为源码的字符键名（方向键、功能键、符号键各有约定），不得把 `KeyCode` 数字传进业务逻辑。
- `shiftKey` 必须由 `KeyInput` 自行跟踪（Cocos 的 `EventKeyboard` 不直接给出修饰键状态）。

## 7. 存档规则

- 只通过 `SaveSystem` 访问 `sys.localStorage`。
- 存档键固定六个：`achievement` / `wizard` / `dungeonLevel` / `seed` / `inventory` / `orb`；**不新增、不改名、不改结构**。
- 读写失败必须静默降级（`storageAvailable()` 为 false 时显示提示），不得抛出中断启动。

## 8. 场景与资产

- 场景为 `assets/scene.scene`，节点树 `Canvas → Camera + GameRoot`。
- 不手工编辑 `.scene` / `.meta` 的 JSON；用编辑器或 MCP `execute_javascript`（`context=scene`）。
- 新增脚本后如需被场景引用，先 `asset-db refresh-asset`，再 `addComponent`。
- 不删除 `Canvas` 下的 `Camera`，不修改 Canvas 的 1280×720 设计尺寸。

## 9. 验证与提交

每次改动必须依次通过：

1. `run_script_diagnostics`：`assets/scripts` 内 0 错误（引擎 `.d.ts` 的报错可忽略）。
2. `tsc -p temp/gen-test/headless/tsconfig.json`：0 error。
3. `node temp/gen-test/headless/run.js`：过场与主界面 ASCII 正确，按键后画面变化。
4. 涉及地图/随机 → 用固定种子 `#12345` 对比输出。

提交信息格式：`<type>(<scope>): <简述>`，`type ∈ feat|fix|refactor|docs|test|chore`，`scope` 取模块名（如 `screens`、`monster-ai`、`render`）。

## 10. 文档同步

- 改动架构分层、常量（分辨率/网格/UI 坐标）、验收标准、兜底策略时，同步更新 `doc/cursedSouls_CocosCreator_移植执行方案.md`。
- 不新增超出要求的说明文档；新增文件前先确认是否可并入现有文档。

## 11. 安全与访问（继承个人规则）

- 仅允许访问本工作区；忽略 `.svn`。
- 访问前审查文件名：命中 `keystore / cert / certificate / private / key / token / api / secret`（不区分大小写）即拒绝，并输出：
  `[ERROR] 访问被拒绝：文件名包含敏感关键词 - 路径: {filePath}`
- 涉及配置、密钥、安全变量的文件，读取前后都要复审；发现违规立即中止。
- 外部依赖：新增或替换前先做合规与安全评估，优先使用项目内已有能力。

## 12. 明确禁止

- 修改 `d:/work2/cursedSouls`。
- 修改 `temp/tsconfig.cocos.json`。
- 在 `vendor/`、`ecs/`、`core/` 中 `import 'cc'`。
- 用 `Math.random()` 替代 `RotRng`。
- 新增 npm 依赖而不评估。
- 用截图 Creator 编辑器窗口判断游戏是否运行（预览在浏览器中）。
- 提交 `temp/`、`library/`、`local/`、`build/` 等生成物。
