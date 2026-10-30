# AGENTS.md — test_funplay_mcp 项目工作指南

> 面向在本仓库工作的 AI Agent / 开发者。**动手前先读第 2 节与第 6 节**。
> 项目规则见 [.trae/rules/project_rules.md](file:///d:/work2/test_funplay_mcp/.trae/rules/project_rules.md)，本文件只做导览与执行说明。

---

## 1. 项目定位

这是一个 **Cocos Creator 3.8.8** 工程，目标是把 `d:/work2/cursedSouls`（纯 JavaScript + rot.js 的网页 ASCII 地牢 Roguelike）**1:1 移植**为可在 Cocos 中运行的版本。

- 移植原则：**逻辑零改写、表现层重写**。
- 施工依据文档：[cursedSouls_CocosCreator_移植执行方案.md](file:///d:/work2/test_funplay_mcp/doc/cursedSouls_CocosCreator_移植执行方案.md)（v1.1，含第 14 章故障复盘与兜底机制）。
- 源工程只读，仅作对照；**不要修改 `d:/work2/cursedSouls` 下任何文件**。

---

## 2. 技术栈与硬约束

| 项 | 值 |
| --- | --- |
| 引擎 | Cocos Creator 3.8.8（`package.json` 的 `creator.version`） |
| 语言 | TypeScript，`tsconfig.json` 中 `strict: false` |
| 设计分辨率 | 1280×720（Canvas UITransform），网格 70×26，单格 16×22 |
| 场景 | `assets/scene.scene`，节点树 `Canvas → Camera + GameRoot` |
| 渲染 | 每格一个 `Label`（1820 个）+ 差分刷新的 `GridRenderer` |
| 输入 | Cocos `input.on(KEY_DOWN/KEY_UP)`，归一化成源码的字符键名 |
| 存档 | `sys.localStorage`，六键不变 |
| 随机 | 自研 `RotRng`（Alea），**禁止用 `Math.random()` 替代** |

硬约束（违反即回归失败）：

1. `vendor/`、`ecs/`、`core/`、`render/ScreenLayout` **不得 `import` `cc`** —— 必须能脱离引擎在 Node 中运行。
2. **不得改变 RNG 调用顺序与次数**，否则同种子地图不一致。
3. 任何 `while` / `do-while` / `for(;;)` 必须有硬上限（见规则文档第 4 节）。

---

## 3. 目录结构（以实际为准）

```
assets/
  scene.scene                    场景（不要手改 uuid / 组件引用）
  scripts/
    GameRoot.ts                  入口：等价于源码 window.onload
    core/MainGame.ts             全局命名空间 Main
    render/GridRenderer.ts       字符网格渲染器（draw/drawText/clear/flush）
    render/ScreenLayout.ts       所有 UI 区块坐标（只留坐标）
    vendor/RotRng.ts             Alea RNG
    vendor/RotCellular.ts        rot.js Map.Cellular
    vendor/RotFov.ts             rot.js PreciseShadowcasting
    vendor/RotScheduler.ts       EventQueue / Scheduler / TurnEngine
    ecs/Components.ts            15 个组件
    ecs/EntityFactory.ts
    ecs/EntityRegistry.ts        实体模板
    system/GameSystem.ts         生成/移动/战斗/拾取/FOV/镜头
    system/MonsterAI.ts          全部怪物 AI 与 Boss 行为
    system/AchievementSystem.ts  9 项成就
    screens/ScreenFactory.ts     通用绘制函数
    screens/Screens.ts           main / cutScene / help / achievement
    input/KeyInput.ts            按键表 + getAction + 键盘监听
    data/TextData.ts             全部文案与拼接函数
    save/SaveSystem.ts           sys.localStorage 封装
doc/                             方案文档（交付物）
temp/gen-test/headless/          **验证工具**（cc 替身 + headless 回放），非交付物
extensions/funplay-cocos-mcp/    MCP 扩展
funplay-cocos-mcp.config.json    MCP 配置（127.0.0.1:25366，toolProfile=core）
```

`temp/` 全部是引擎缓存与验证工具，**不要提交、不要当作交付物**。

---

## 4. 常用命令

以下命令**不需要 Cocos 编辑器在运行**：

```powershell
# 全量类型检查 + 编译（0 error 才算通过）
node "D:\Downloads\Creator\3.8.8\resources\resources\3d\engine\node_modules\typescript\bin\tsc" -p d:\work2\test_funplay_mcp\temp\gen-test\headless\tsconfig.json

# headless 回放：真实执行 GameRoot.onLoad，直接打印 26 行 ASCII
cd d:\work2\test_funplay_mcp\temp\gen-test\headless
node run.js
```

`run.js` 的输出包含：过场画面、主界面（版本 / 关卡名 / HP / 背包 / 敌人 / 种子 / 底部消息）、按 `l` 移动后的画面。**这是验收逻辑层的第一手段。**

---

## 5. MCP 工具（FunPlay Cocos MCP）

服务地址 `http://127.0.0.1:25366/`，配置见 `funplay-cocos-mcp.config.json`。常用工具：

| 工具 | 用途 |
| --- | --- |
| `run_script_diagnostics` | 脚本诊断（只看 `assets/scripts` 内的错误；引擎 `.d.ts` 报错可忽略） |
| `get_preview_mode` / `get_runtime_state` | 预览模式与运行状态 |
| `execute_javascript`（`context=scene` / `editor`） | 场景内检查、资产刷新、编辑器消息 |
| `capture_preview_screenshot` | 仅用于**最终演示**截图 |

### 启动浏览器预览的正确姿势

```js
// context = editor
await Editor.Message.request('preview', 'preview-scene-in-browser');
// 之后用 query-preview-url 取地址；地址通常是 http://localhost:7456/
```

注意：**不存在** `preview.start` / `scene.play` 这类消息。浏览器标签关闭后预览会话即终止（端口不再监听、`running:false`），需要重新发 `preview-scene-in-browser`。

---

## 6. 验收 SOP（不要跳步）

1. `run_script_diagnostics` → `assets/scripts` 内 **0 错误**。
2. `tsc -p temp/gen-test/headless/tsconfig.json` → **0 error**。
3. `node temp/gen-test/headless/run.js` → 画面与预期一致，按 `l` 后 PC 位置变化。
4. `get_runtime_state` → `running: true`，且 `http://localhost:7456/` 可访问。
5. 浏览器控制台出现 `Seed: <数字>`，且**没有** `[engine]` / `[connect]` 告警。
6. 需要视觉存档时才截图。

**禁止**：用「截 Creator 编辑器窗口」判断游戏是否在跑 —— 预览跑在浏览器里，编辑器 Game View 本来就是空的。这是本轮已踩过的坑，详见方案文档 14.2。

**验证动作上限**：同一个验证动作（截图 / 重启预览 / 跑命令 / 查日志）最多连续 **3 次**；3 次仍拿不到新信息即视为「验证死循环」，按规则文档 4.2 停下汇报，不得"再截一次看看"。

---

## 7. 改动完成后必须做的检查

- 改动涉及 RNG / 地图 / 实体 → 跑 `temp/gen-test/run.js`（固定种子 `#12345` 的地牢 ASCII 对比）。
- 改动涉及循环 → 确认有硬上限（规则文档第 4 节）。
- 改动涉及 UI 坐标或文案 → 更新 `doc` 中的坐标表 / 文案注意点。
- 改动涉及场景 / 组件 → 走 MCP `execute_javascript`（`context=scene`）操作并在编辑器内保存场景，不要手工编辑 `.scene` JSON。

---

## 8. 常见坑（详见方案文档第 14 章）

| 现象 | 真实原因 | 处理 |
| --- | --- | --- |
| 页面显示「预览场景中啥都没有」 | 预览会话已结束（标签关闭 / 服务停止） | 重新发 `preview-scene-in-browser`，先查 `running` 与端口 |
| 控制台只有 `Seed: xxx`，没有 `Cycle/Floor` | 正常：后四行只在开发模式打印 | 不是卡死 |
| 按键永久无反应 | 回合泵 `_lock` 计数失配（可能变负数） | 按兜底方案自愈并报错（14.4 第 4 条） |
| 首帧长时间空白 | 同步创建 1820 个 Label + 整屏重绘 | 分帧创建、合并重绘（14.4 第 5 条） |
| 地牢生成偶尔很久 | `do-while` 无上限 | `MAX_CYCLE = 60` + 兜底模板 |

---

## 9. 禁止事项

- 不修改 `d:/work2/cursedSouls`。
- 不修改 `temp/tsconfig.cocos.json`（由引擎生成）。
- 不手工编辑 `assets/scene.scene` 的 JSON（用编辑器 / MCP）。
- 不在 `vendor/`、`ecs/`、`core/` 里 `import 'cc'`。
- 不新增 npm 依赖；确需新增先评估合规与替代方案。
- 不新增无关文档或示例文件；文档改动限定在 `doc/` 与本文件 / 规则文件。
- 不访问文件名含 `keystore/cert/token/api/secret` 等敏感关键词的文件，不访问 `.svn`。
- **不自行放行死循环风险（含代码死循环与验证死循环）**：遇到无法证明会终止的循环、锁计数异常（`_lock` 为负或泵不启动）、页面无响应且日志停在某函数之后，或同一验证动作重复 3 次仍无新信息，先按规则文档 4.1 / 4.2 的模板输出「死循环风险待审核」/「验证死循环待审核」并等待人工确认，再继续。
