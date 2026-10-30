# Cursed Souls → Cocos Creator 3.8.8 完整移植执行方案

| 项目 | 内容 |
| --- | --- |
| 源工程 | `d:/work2/cursedSouls`（纯 JavaScript + rot.js 的 ASCII 地牢 Roguelike） |
| 目标工程 | `d:/work2/test_funplay_mcp`（Cocos Creator **3.8.8**，TypeScript，设计分辨率 1280×720） |
| 文档定位 | 可直接照做的施工方案：包含架构解读、技术选型、目录规划、场景搭建、分阶段实施、核心代码骨架、数值校验、验收清单 |
| 版本 | v1.1（新增第 14 章：故障复盘与兜底机制） |
| 适用读者 | 执行移植的开发者 / 自动化 Agent（FunPlay MCP 可校验每个阶段） |

---

## 0. 结论摘要（先看这里）

1. **源项目不是 Cocos 工程**：它是用 `index.html` 顺序加载 14 个普通 JS 文件、以全局对象 `Main` 组织起来的网页游戏，渲染完全依赖 rot.js 的 Canvas ASCII `Display`，没有任何引擎概念。
2. **移植原则：逻辑零改写、表现层重写。**
   - 保留：ECS 结构、组件数值、怪物 AI 决策、地图生成算法、FOV、回合调度、文案、存档键。
   - 重写：渲染（Canvas → Cocos `Label` 网格）、输入（`window.keydown` → Cocos `input`）、存档（`localStorage` → `sys.localStorage`）。
3. **必须保住随机序列**：地图由 `ROT.RNG` 驱动，同种子必须同地图。因此**不能**用 `Math.random()` 替代，需移植 rot.js 的 `RNG`（含 `Map.Cellular`、`FOV.PreciseShadowcasting`、`Scheduler.Action` 三件套）。
4. **渲染主方案**：每个字符格一个 `Label`（共 70×26 = 1820 个节点），共用等宽 TTF 字体、`CacheMode.CHAR`，**逐格差分刷新**（每回合只改动变化格子）；背景色/高亮由一张 `Graphics` 叠加绘制。
5. **兼容技巧**：`GridRenderer` 对外仍保留 rot.js 的「以字符格为单位、可带小数」的 `draw(x, y, ch, fg, bg)` / `drawText(x, y, text, maxWidth)` 接口，并解析 `%c{...}` `%b{...}` 内联颜色标记 —— 这样 `screenLayout.js` / `screenFactory.js` 里的全部 UI 布局与绘制代码可以**近乎原样搬运**，移植成本最低、回归风险最小。
6. **工期拆解**：P0 ~ P8 共 9 个阶段，每阶段有明确交付物与断言式验收标准（见第 6 章）。
7. **`v1.1` 增补**：第 14 章「故障复盘与兜底机制」是本轮踩坑后的必读补充 —— 解释了为什么曾误判为"死循环"，并给出全部无界循环的硬上限与自愈方案。**施工前请先读 14.4。**

---

## 1. 源项目解读

### 1.1 运行方式

[index.html](file:///d:/work2/cursedSouls/index.html) 按固定顺序加载脚本，所有模块把 API 挂到同一个全局对象 `Main` 上，最后 `main.js` 的 `window.onload` 启动：

```
rot.min.js（库）
main.js（入口、版本、颜色、日志）
screenLayout.js（UI 分块坐标 + ROT.Display 实例）
screenFactory.js（Screen 基类 + 绘制工具）
screenInGame.js（main / cutScene / help / achievement 四个屏幕）
keyInput.js（按键映射表）
text.js（全部文案）
component.js（组件定义）
entityFactory.js（实体工厂）
entity.js（实体模板注册表）
system.js（游戏逻辑中枢）
monsterAI.js（怪物 AI + 战斗结算）
saveLoad.js（存档）
achievement.js（成就）
```

> 关键点：脚本顺序即依赖顺序，`Main.display` 在 `screenLayout.js` 就被创建，`Main.screens.*` 在 `screenInGame.js` 才实例化。移植时必须按同一顺序初始化（Cocos 里对应 `GameRoot` 组件内的显式初始化顺序）。

### 1.2 模块职责与移植难度

| 文件 | 体积 | 职责 | 移植方式 | 难度 |
| --- | --- | --- | --- | --- |
| `rot.min.js` | 64 KB | Display / Map.Cellular / FOV.PreciseShadowcasting / RNG / Scheduler.Action / Engine | 只移植 RNG、Cellular、FOV、Scheduler 四个类 | 中 |
| `main.js` | 2.6 KB | 版本 `0.3.0`、颜色表、wizard 开关、日志、启动流程 | 直译为 `MainGame.ts` | 低 |
| `screenLayout.js` | 4.9 KB | 70×26 画布、状态栏/消息区/地牢区/过场区坐标，创建 `ROT.Display` | `ScreenLayout.ts`，删除 Display，只留坐标 | 低 |
| `component.js` | 13.4 KB | 15 个组件（Message/Seed/Dungeon/BossFight/Display/Position/ActionDuration/Inventory/HitPoint/Damage/AttackRange/DropRate/Memory/CombatRole/FastMove/Achievement） | `Components.ts`，函数式→class | 低 |
| `entityFactory.js` | 1.1 KB | 实体 ID 生成 + 组件挂载 | `EntityFactory.ts` | 低 |
| `entity.js` | 17.9 KB | 18 种实体模板 + PC/地图/计时器/球/楼梯/标记 | `EntityRegistry.ts` | 低 |
| `system.js` | 42 KB | 生成、放置、移动、攻击、拾取、下楼、FOV、朝向、镜头 | `GameSystem.ts`（逻辑 1:1） | 高 |
| `monsterAI.js` | 22 KB | 普通/精英/Boss AI、伤害、诅咒、炸弹、复活 | `MonsterAI.ts` | 高 |
| `screenFactory.js` | 20 KB | Screen 基类 + 所有绘制函数 | `ScreenBase.ts` + `DrawUtils.ts` | 中 |
| `screenInGame.js` | 11 KB | 四屏状态机与按键分发 | `Screens.ts` | 中 |
| `keyInput.js` | 3.4 KB | 模式化按键表 | `KeyBindings.ts` + `InputRouter.ts` | 中 |
| `text.js` | 27.8 KB | 文案字典与拼接函数 | `TextData.ts`（原样拷贝 500 行数据） | 低 |
| `saveLoad.js` | 4.4 KB | localStorage 六个键 | `SaveSystem.ts` | 低 |
| `achievement.js` | 5.7 KB | 9 个成就判定与解锁 | `AchievementSystem.ts` | 低 |

### 1.3 架构分层（迁移后依然成立）

```
┌─────────────────────────────────────────────────────────────┐
│ 输入层  InputRouter（Cocos input → 模式化 action）           │
├─────────────────────────────────────────────────────────────┤
│ 屏幕状态机 Screens（main / examine / aim / cutScene / help   │
│             / achievement），每屏一个 keyInput 处理器        │
├─────────────────────────────────────────────────────────────┤
│ 逻辑层 GameSystem + MonsterAI（改实体、放消息、解锁引擎）     │
├─────────────────────────────────────────────────────────────┤
│ 数据层 ECS：Entity(Factory) + 15 个 Component + 三张 Map      │
│        （npc / orb / 单例：pc, dungeon, marker, timer, ...）   │
├─────────────────────────────────────────────────────────────┤
│ 时间层 TurnEngine + Scheduler.Action（谁该动了 → actor.act） │
├─────────────────────────────────────────────────────────────┤
│ 表现层 GridRenderer（70×26 字符缓冲 → Label 差分刷新）        │
└─────────────────────────────────────────────────────────────┘
```

### 1.4 回合模型（最容易移植错的地方）

- `timer` 实体持有一个调度器 + 引擎：`new ROT.Scheduler.Action()`、`new ROT.Engine(scheduler)`。
- 任何 `act()` 的第一步都是 `engine.lock()`；动作末尾调用 `unlockEngine(duration)`：
  ```js
  Main.system.unlockEngine = function (duration) {
      scheduler.setDuration(duration);   // 本次动作耗费的时间
      engine.unlock();                   // 继续跑：挑下一个 actor
      display.clear();
      screens.main.display();            // 立刻整屏重绘
  };
  ```
- 因此「一回合」= 引擎从解锁到再次被锁住的过程；中途所有 NPC 按各自 `nextTurn` 依次行动。
- 行动耗时可以是小数（`fastMove: 0.4/0.5/0.6`、`slowMove: 1.2/1.5`），所以 `nextTurn` 也是小数。
- **注意**：`unlockEngine` 会在 `act()` 内部被调用（递归语义）。用 Navigator 之外的同步实现时必须写「泵循环」，见 7.4。

### 1.5 关键常量（已按源码核算，可直接抄进 `Constants.ts`）

| 常量 | 值 | 来源 |
| --- | --- | --- |
| 画布字符网格 | 70 × 26 | `ScreenLayout` |
| 字号 / 字体 | 20 px / `dejavu sans mono, consolas, monospace` | `ScreenLayout` |
| 状态栏 `status` | x=56, y=0.5, w=13, h=25 | 计算值 |
| 模式行 `modeline` | x=1, y=24.5, w=54, h=1 | 计算值 |
| 消息区 `message` | x=1, y=19.5, w=54, h=5 | 计算值 |
| 地牢区 `dungeon` | x=1, y=0.5, w=54, h=18（`floor` 后） | 计算值 |
| 地图逻辑尺寸 | **52 × 16**（地牢区四周各留 1 格 padding） | `Component.Dungeon` |
| 楼层可行走面积 | 55% ~ 65%（否则重新生成） | `Dungeon.getFloorArea` |
| 过场区 `cutScene` | x=6, y=3, w=58, h=20 | 计算值 |
| 成就左/中/右 | 26 / 1.5 / 30.5 宽，均 h=20，起点 (6,3) | 计算值 |
| PC 视野 | 5 | `entity.pc` |
| 背包容量 | 6 | `entity.pc` |
| 诅咒上限 | `floor(6/2)` = 3 | `Inventory.setCurse` |
| PC 初始球 | `slime, armor, armor, fire, lump` | `fillInventory` |
| PC 伤害 | base=1, nuke=9 | `entity.pc` |
| 球射程 | fire=1, ice=0, slime=2, lump=2, nuke=5 | `entity.pc` |
| 每层敌人 | 25 ~ 30（Lump 20% / 火+冰 50% / Slime 30%） | `createEnemies` |
| 地面球数量 | 第 1 层 3×4=12，第 2、3 层 2×4=8 + 继承≤4 | `createOrbs` |
| 掉落率 | base 20%、fire 100%、ice(冰甲撞) 60%、lump 60%、nuke 100% | `DropRate` |
| 最大单回合伤害 | 3（含 Boss） | README 约定 |

### 1.6 UI 坐标表（浮点行号可直接使用）

| 区块 | x | y | w | h | 备注 |
| --- | --- | --- | --- | --- | --- |
| 版本号 | 56+ | 0.5 | 13 | 1 | 右对齐，灰 |
| 楼层名 | 56 | 2.5 | 13 | 1 | `> Churchyard` |
| HP | 58 | 4 | 11 | 1 | `HP: %%`，实为 `HP: N` |
| 能量球区 | 56 | 5.5 | 13 | 6 | 每行 `1.1` 行距，右侧 1..6 刻度 |
| 脚下物品 | 56 | 13 | 13 | 1 | `@ Fire` |
| 敌人列表 | 58 | 14.5 | 11 | 8 | 按字符归类计数，橙 |
| 帮助提示 | 56 | 23 | 13 | 1 | 右对齐 `Help: ?` |
| 分隔线 | x=55 竖线 y∈[0.5,25)；y=18.5 横线 x∈[1,55] | | | | 见附录 H-1 的越界 bug |

> 注意：原 `drawBorder()` 的竖线循环上界写成 `i < status.getHeight()`（用高度当 y 上界），实际画出 y=0.5..24.5；移植时**保持原行为**，在代码里加注释标注，避免"顺手修复"引起 UI 差异。

### 1.7 实体数值全表

（完整表见附录 C，包含 18 种实体的字符、视野、HP、携带球、伤害、攻击距离、耗时、角色标记、AI 入口。）

---

## 2. 移植目标与验收基线

### 2.1 必须做到（功能对等）

1. 三层地牢（`Churchyard / Cellar / Sanctum`）+ 4 场 Boss（Gargoyle / Butcher 小 Boss / Ghoul / Giovanni），流程与文案一致。
2. 全部按键可用：移动、快速移动、等待、拾取/交互、查看、瞄准、锁敌、帮助、成就、wizard 开发模式。
3. 背包即血量：受伤按 LIFO 弹出球；诅咒槽不可用且计入血量；冰球换两层冰甲。
4. 掉落率、伤害、AI 决策、地图生成、FOV 与源码逐条一致。
5. 同种子复现同地图（`=` 打印种子；`main.js` 中 `12345` 手动种子入口保留）。
6. 存档：`achievement / wizard / dungeonLevel / seed / inventory / orb` 六键，切层后可续关。
7. 死亡与通关终局画面、过场文本一致。

### 2.2 明确不做（首版范围外）

- 美术化（精灵图/骨骼动画/特效）、音效、本地化多语言、触摸虚拟摇杆、移动端专项优化、联网排行。
- 这些可作为 P9 以后的迭代项，不阻塞验收。

### 2.3 性能与体验基线

| 指标 | 目标 |
| --- | --- |
| Web 预览帧率 | 60 FPS（静态画面 CPU 占用低） |
| 单回合重绘耗时 | < 8 ms（1820 格差分刷新） |
| 进入首层耗时 | < 3 s（含 1820 Label 创建） |
| 内存节点数 | 1820 Cell + ≈30 个 UI 节点，可控 |

---

## 3. 技术选型与差异对照

### 3.1 rot.js 能力 → Cocos Creator 方案

| 能力 | 原实现 | 新方案 | 风险 / 对策 |
| --- | --- | --- | --- |
| 字符渲染 | `ROT.Display`（DOM Canvas） | `GridRenderer`：每格 `Label` + `CacheMode.CHAR` + 差分刷新 | 1820 节点创建耗时 → P2 阶段实测，超 5 s 则降级为"行级 RichText" |
| 内联着色 | `%c{color}` `%b{color}` 标记，由 rot.js 解析 | 自写 tokenizer（同一套标记语法），逐格写缓冲 | 标记解析必须覆盖 `%c{}` / `%b{}` 复位 |
| 文字换行 | `drawText(x,y,text,maxWidth)` 自动断行 | 自写：按 `maxWidth` 逐字符累计宽度，遇 `\n` 强制换行 | 长单词策略与 rot.js 一致（不拆词，整体换行） |
| 地图生成 | `ROT.Map.Cellular` + 5 次 `create()` + `connect()` | vendor 移植 `RotCellular.ts` | 必须保同一 RNG 调用顺序，否则种子失效 |
| 视野 | `ROT.FOV.PreciseShadowcasting` | vendor 移植 `RotFov.ts` | 回调签名需保持 `(x, y, visibility)` |
| 随机 | `ROT.RNG.setSeed / getUniform / getPercentage` | vendor 移植 `RotRng.ts` | **禁止**改成 `Math.random()` |
| 回合调度 | `ROT.Scheduler.Action` + `ROT.Engine` | vendor `RotScheduler` + 自研 `TurnEngine`（同步泵循环） | `Engine` 原实现用 `setTimeout` 空转，Cocos 里不推荐 |
| 键盘 | `window.addEventListener('keydown')` + `e.key` | `input.on(KEY_DOWN / KEY_UP)` + `KeyCode → 字符` 映射 + Shift 状态机 | 大小写按键需靠 Shift 状态还原（`H` vs `h`） |
| 存档 | `window.localStorage` | `sys.localStorage`（接口兼容） | Web/Native 均已支持 |
| 容器节点 | `display.getContainer()` 塞进 `#game` | `Canvas > GridRoot` 节点 | 需设 `UITransform` 锚点与层级 |
| 入口 | `window.onload` | `GameRoot` 组件的 `start()` | 初始化顺序必须与 index.html 一致 |

### 3.2 依赖策略：vendor 移植（推荐） vs npm 安装 rot-js

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| **A. 移植 4 个类到 TS** | 无外部依赖、确定性最高、无 d.ts 问题、代码量小（约 400 行） | 需从 rot.js 源码抄一次 | **采用** |
| B. `npm i rot-js` 后 import | 少写代码 | 版本/模块格式/类型声明不确定；Cocos 打包配置成本 | 备选 |

> 采用 A。`rot.js` 为 BSD-3-Clause，移植文件头保留版权声明。**不要直接内联 `rot.min.js`**：它是 UMD 包装且 `this` 依赖，在 Cocos 的模块作用域里可能拿不到全局对象。

### 3.3 渲染方案对比

| 方案 | 节点数 | 颜色支持 | 背景色 | 实现成本 | 结论 |
| --- | --- | --- | --- | --- | --- |
| **A. 每格 Label（CHAR 缓存）** | 1820 | 逐格前景色 | Graphics 叠加 | 低 | **采用** |
| B. 每行 RichText（26 个） | 26 | `<color>` | 不支持（需另绘） | 中 | 备选（A 性能不达标时） |
| C. Graphics/BitmapFont 自绘 | 1~若干 | 全支持 | 全支持 | 高 | 后续优化 |

选 A 的理由：与 rot.js 的「格子 = 字符 + 前景色 + 背景色」模型 1:1；`CacheMode.CHAR` 下同字体同字号的字符纹理可共享，1820 个 Label 的 draw call 会被合批；**每回合只更新变化格**，实际开销极小。

### 3.4 主要风险清单

| # | 风险 | 影响 | 对策 |
| --- | --- | --- | --- |
| R1 | 1820 Label 创建慢 | 首屏卡顿 | 加载遮罩 + 分帧创建；不达标切方案 B |
| R2 | 等宽字体度量不准导致错位 | UI 歪斜 | `calibrate()` 实测字符宽后重排（7.6） |
| R3 | RNG 移植不精确 | 同种子不同地图 | 逐行对照源码；用固定种子做快照测试 |
| R4 | 同步泵循环与递归 `unlockEngine` 冲突 | 回合卡死/重复行动 | 用 `pumping` 标志的泵循环（7.4） |
| R5 | Shift 组合键识别 | 快速移动/帮助不可用 | 维护 `shiftPressed`，`KeyCode → key` 归一化（7.7） |
| R6 | `placeBoss` 可能返回 `undefined` | 召唤 Boss 时崩溃 | 加空判定，回退到"最远空地"（附录 H-3） |

---

## 4. 工程与目录规划

### 4.1 目标目录树

```
assets/
├── scenes/
│   └── Main.scene                     # 主场景（P0 搭建）
├── fonts/
│   └── DejaVuSansMono.ttf             # 等宽字体（免费授权）
└── scripts/
    ├── GameRoot.ts                    # 场景入口组件（P0）
    ├── core/
    │   ├── MainGame.ts                # 全局单例（对应 main.js）
    │   └── Constants.ts               # 画布尺寸/颜色/数值常量
    ├── vendor/
    │   ├── RotRng.ts                  # 对应 ROT.RNG
    │   ├── RotCellular.ts             # 对应 ROT.Map.Cellular
    │   ├── RotFov.ts                  # 对应 ROT.FOV.PreciseShadowcasting
    │   └── RotScheduler.ts            # 对应 ROT.Scheduler.Action
    ├── ecs/
    │   ├── Components.ts              # 对应 component.js
    │   ├── EntityFactory.ts           # 对应 entityFactory.js
    │   └── EntityRegistry.ts          # 对应 entity.js
    ├── world/
    │   ├── TurnEngine.ts              # 替代 ROT.Engine
    │   ├── DungeonBuilder.ts          # 地图生成 + FOV 封装
    │   └── GridRenderer.ts            # 替代 ROT.Display
    ├── system/
    │   ├── GameSystem.ts              # 对应 system.js
    │   ├── MonsterAI.ts               # 对应 monsterAI.js
    │   └── AchievementSystem.ts       # 对应 achievement.js
    ├── render/
    │   ├── ScreenLayout.ts            # 对应 screenLayout.js（仅坐标）
    │   ├── ScreenBase.ts              # 对应 screenFactory.js 的 Screen 基类
    │   ├── DrawUtils.ts               # colorfulText / 对齐 / 边框
    │   └── Screens.ts                 # 对应 screenInGame.js
    ├── input/
    │   ├── KeyBindings.ts             # 对应 keyInput.js
    │   └── InputRouter.ts             # 输入分发（替代 window 监听）
    ├── data/
    │   └── TextData.ts                # 对应 text.js（数据原样）
    └── save/
        └── SaveSystem.ts              # 对应 saveLoad.js
```

### 4.2 文件级映射与拆分原则

| 源文件 | 目标文件 | 拆分说明 |
| --- | --- | --- |
| `main.js` | `core/MainGame.ts` + `core/Constants.ts` | `_color`、`getColor`、`_log`、`getVersion` 进 MainGame；尺寸与数值进 Constants |
| `screenLayout.js` | `render/ScreenLayout.ts` | 删除 `ROT.Display` 创建，只保留 `Main.UI.*` 矩形对象与派生计算 |
| `component.js` | `ecs/Components.ts` | 每个组件改 `class`，`_name` 保留为字段；`getInventory(index)` 等历史行为原样保留 |
| `entityFactory.js` | `ecs/EntityFactory.ts` | ID 生成算法不变（32 位 hex + 每 8 位插 `-`，截 35 字符） |
| `entity.js` | `ecs/EntityRegistry.ts` | 每种实体一个 `createXxx()` 函数，注册到 `entities` Map；`act` 直接赋函数引用 |
| `system.js` | `system/GameSystem.ts` | 单文件先 1:1 迁移；P8 后再按职责拆（可选） |
| `monsterAI.js` | `system/MonsterAI.ts` | `dummyAct / gargoyleAct / butcherAct / ghoulAct / bombAct / giovanniAct` 六个入口 + 公共决策 |
| `screenFactory.js` | `render/ScreenBase.ts` + `render/DrawUtils.ts` | Screen 基类、当前屏状态、通用绘制；绘制工具抽到 DrawUtils |
| `screenInGame.js` | `render/Screens.ts` | 四屏定义 + `keyInput`；`display()` 原样搬运 |
| `keyInput.js` | `input/KeyBindings.ts` | 映射表原样；另加 `InputRouter` 管理 add/remove 监听 |
| `text.js` | `data/TextData.ts` | 500 行数据**逐字拷贝**，不要重写文案 |
| `saveLoad.js` | `save/SaveSystem.ts` | 六个键与格式不变 |
| `achievement.js` | `system/AchievementSystem.ts` | 判定逻辑不变 |
| `rot.min.js` | `vendor/*.ts` | 四个类移植，其余不复用 |

### 4.3 编码规范

- 文件：`PascalCase.ts`；类：`PascalCase`；常量：`SCREAMING_SNAKE`。
- 共享单例用 `export class MainGame { static I = new MainGame(); }`，避免 `Main` 全局变量（但仍建议保留 `Main` 命名别名以减少迁移期 diff：`export const Main = MainGame.I;`）。
- 所有 `Map` 语义（key = `"x,y"`）原样保留，便于逐行对照。
- 组件字段命名保留 `_hitPoint`、`_inventory` 等，减少迁移时的手误。

---

## 5. 场景搭建（Cocos Creator 3.8.8 编辑器操作）

### 5.1 工程设置

1. 打开 `d:/work2/test_funplay_mcp`。
2. **项目设置 → 项目数据**：设计分辨率 `1280 × 720`，`Fit Height`（宽随比例自适应）。
3. 资源导入：
   - 新建 `assets/fonts/`，把 `DejaVuSansMono.ttf` 拖入（授权：DejaVu 系列可免费商用）。若无该字体，可用系统等宽字体先跑通，P2 再替换。
   - 新建 `assets/scenes/`，把现有 `assets/scene.scene` 另存为 `Main.scene`（或新建场景并在构建设置里指定）。

### 5.2 节点树（最终形态）

```
Main (Scene)
└── Canvas                       (cc.Canvas, 已有; 锚点 0.5/0.5, 尺寸 1280×720)
    ├── Camera                   (已有, 2D, ClearFlags SOLID_COLOR, 背景 #262626)
    ├── Root                 (Node, 挂 GameRoot.ts)
    │   ├── GridRoot             (Node, UITransform, 锚点(0,1), 定位到网格左上角)
    │   │   ├── (1820 个 Cell 节点，运行期生成，不进场景文件)
    │   │   └── Highlight        (Node + cc.Graphics，画背景/高亮矩形)
    │   └── UIRoot               (可选：加载遮罩/错误提示，P0 用)
    │       ├── LoadingLabel     (Label: "Loading…")
    │       └── ErrorLabel       (Label: 空，用于 browser/storage 报错)
    └── (删除原有 TestPanel / Sprite / Button 测试节点)
```

### 5.3 组件参数

| 节点 | 组件 | 参数 |
| --- | --- | --- |
| `Root` | `GameRoot`（自定义脚本） | `gridRoot: Node`、`highlight: Node`、`loadingLabel: Label`、`errorLabel: Label`、`monoFont: Font`（TTF 资源） |
| `GridRoot` | `UITransform` | 尺寸 840×520（=70×12 / 26×20），锚点 (0,1)，位置按 Canvas 居中计算，见 5.4 |
| `Highlight` | `Graphics` | 与 GridRoot 同尺寸、锚点 (0,1)、层级在 Cell 之下 |
| `Canvas` | `Canvas` | 相机 `Camera` 关联；`Widget` 可选 |

### 5.4 网格像素换算

```ts
export const CELL_W = 12;   // 20px 等宽字体 ≈ 0.6em
export const CELL_H = 20;   // 行高 = 字号
export const GRID_COLS = 70;
export const GRID_ROWS = 26;
export const GRID_W = CELL_W * GRID_COLS;   // 840
export const GRID_H = CELL_H * GRID_ROWS;   // 520
// 居中：GridRoot.position = (-GRID_W/2, GRID_H/2, 0)（锚点 (0,1) 时）
```

> 浮点行号（如 `y = 0.5`、`y = 5.5 + i*1.1`）在 `GridRenderer` 内部换算成像素：`py = -(y * CELL_H)`，即**保留 rot.js 的坐标语义**，源码里的 UI 坐标可以原样使用。

### 5.5 场景自检（可直接用 FunPlay MCP）

```text
get_project_info         → 确认引擎版本 3.8.8
get_scene_info           → 确认场景名与节点树
get_hierarchy            → 确认 Canvas > Root > GridRoot 结构
validate_scene           → 检查缺失脚本/空引用
run_script_diagnostics   → 检查 TS 编译错误
capture_scene_screenshot → 目视确认布局
```

---

## 6. 分阶段实施计划（P0 ~ P8）

> 每个阶段结束都必须满足该阶段的「验收断言」。阶段之间可以独立提测，便于用 MCP 截图 + 日志回归。

### P0 脚手架与常量（半天量级）

**交付物**
- `core/MainGame.ts`：版本 `0.3.0`、`getColor`、`_log`、`develop` 开关、`getDevSeed`。
- `core/Constants.ts`：第 1.5 节全部数值 + `GRID_*` / `CELL_*`。
- `render/ScreenLayout.ts`：`Main.UI.*` 矩形（第 1.6 节坐标），不含 Display。
- `GameRoot.ts`：`start()` 里创建空 GridRoot、打印版本；`onDestroy` 清理输入监听。
- `Main.scene`：完成 5.2 节点树。

**验收断言**
- 预览运行无报错；控制台输出 `Cursed Souls 0.3.0`；`validate_scene` 与 `run_script_diagnostics` 均报 0 问题。

**实施要点**
- `Main.UI` 用简单可变的矩形对象（`x/y/w/h`），保留 `getX/getY/getWidth/getHeight` 方法名，后续绘制代码零改动。
- 不要提前创建 1820 个 Label（放 P2）。

### P1 随机 + 地图生成（核心地基）

**交付物**
- `vendor/RotRng.ts`：`setSeed(seed)`、`getUniform()`、`getPercentage()`。
- `vendor/RotCellular.ts`：`randomize(probability)`、`create()`、`connect(cb)`。
- `world/DungeonBuilder.ts`：`52×16` 生成循环 + `light()` + `fov` 封装。
- `vendor/RotFov.ts`：`compute(x, y, range, cb)`。

**验收断言**
- 固定种子 `#12345` 连续运行 3 次，地图 ASCII 输出完全一致。
- 统计可行走面积落在 55%~65%，与 `Main._log.floor` 一致。
- 在 PC 位置周围半径 5 的视野格集合，与源码语义一致（墙挡光）。

**实施要点**
- 生成循环必须保留 `do { cellular(); cycle++ } while (area < 55 || area > 65)`，`maxRetry` 不设，但要加 200 次保护并打印日志（防止极端种子死循环）。
- `connect` 回调写入的数值必须与源码一致（0=地板），因为 `isFloor` 判定是 `=== 0`。

### P2 渲染器 + 静态 UI 框架

**交付物**
- `world/GridRenderer.ts`（完整实现见 7.6）。
- `render/DrawUtils.ts`：`colorfulText`、`drawAlignRight`、`drawHighlightText`、`drawBorder`、`drawAchievementBorder`、`drawVersion`、`drawModeLine`、`drawBottomRight`。
- `render/ScreenBase.ts`：`Screen` 基类 + `Main.screens` 单例 + `get/setCurrentMode`。

**验收断言**
- 屏幕出现：外框竖线（x=55）、地牢区下横线（y=18.5）、右上灰色 `0.3.0`、右下 `Help: ?`、右下角 `Red Tabby Studio`（在过场屏）。
- 在 GridRoot 上画测试图案：`>>>>>` 橙色楼梯、`@` 白、`. / #` 灰/白，颜色与源码十六进制一致（`#FF9900 / #ABB2BF / #666666 / #A0D86C / #262626`）。
- 1820 Label 创建耗时 < 3 s；单次全屏刷新 < 8 ms（`performance.now()` 打点）。

**实施要点**
- 字体校准：先创建 1 个 `Label` 设 `string='M'`，读 `UITransform.width` 得到真实字符宽，回写 `CELL_W` 后重建所有 Cell。这样可避免不同字体导致整体错位。
- 背景色（成就高亮、诅咒条）统一走 `Highlight` 的 `Graphics`：每帧先 `clear()`，再按需 `rect + fill`。

### P3 输入 + 回合引擎（可玩性第一步）

**交付物**
- `input/KeyBindings.ts`：映射表原样（7.7 给出结构）。
- `input/InputRouter.ts`：`listenEvent('add'|'remove', handlerName|fn)`，内部维护当前激活处理器；`getAction(e, mode)` 保持不变。
- `world/TurnEngine.ts`：`lock()`、`unlock(duration?)`、`start()`（见 7.4）。
- `ecs/*`（PC 与基础实体）、`system/GameSystem.ts` 的 `move / unlockEngine / getNewCoordinates / pcFastMove`。

**验收断言**
- PC 用 `hjkl` / 方向键移动；撞墙不动且不消耗回合；`z` / `.` 等待 1 回合。
- 怪物按 `ActionDuration` 行动：`wisp` 每 0.6 回合动一次、`zombie` 每 1.5 回合动一次（可在 wizard 模式用 `\` 打印 `scheduler.getTime()` 观察）。
- `Shift+H/J/K/L` 连续快速移动最多 5 步，视野内出现敌人立刻停。
- 每回合只重绘一次（用计数器断言）。

### P4 实体/背包/球/楼梯

**交付物**
- `EntityRegistry.ts` 全部实体模板 + `DungeonBuilder.createOrbs/createEnemies`（含关卡配比）。
- `Components.Inventory`、`HitPoint`、`Cursor(marker)`、`downstairs`、`orb` 相关逻辑。
- `GameSystem.pcPickOrUse / pcPickUpOrb / pcUseDownstairs / placeActor / verify*Position`。

**验收断言**
- 第 1 层生成 25~30 个敌人，种类配比与 `enemyComposition` 日志一致；地面 12 颗球、不落楼梯、不落在 PC 周围 2 格内。
- `Space` 行为优先级：交互楼梯 > 拾取脚下球 > 进入瞄准模式。
- 满 6 球时不能拾取；受伤按 LIFO 弹球；HP 显示 = 当前球数。
- 冰球使用后变 `armor, armor`，超过容量时从尾部弹出。

### P5 战斗/掉落/诅咒/Boss 流程

**交付物**
- `GameSystem.pcAttack / npcDropOrb / pcUseSlimeOrb / pcUseIceOrb / pcTakeDamage`。
- `Screens.cutScene`、`BossFight` 三态（`inactive → active → win`）、`placeBoss`、`saveDungeonLevel/saveSeed/saveInventory/saveOrbsOnTheGround`。

**验收断言**
- 撞怪基础伤害 1；`nuke` 伤害 9；`lump` 2 格攻击；`slime` 传送；`ice` 加甲。
- 掉落率按攻击方式生效（bump 20%、fire 100%、lump 60%、冰甲 bump 60%）。
- 站上楼梯按 `Space`：首次召唤对应 Boss 并进过场；第二次进入下一层，并写入存档 4 个键。
- 第 3 层击败 Giovanni 后进入 `youWin` 过场。

### P6 全量怪物 AI 与 4 个 Boss

**交付物**
- `MonsterAI.ts`：`dummyAct`（普通/精英）、`gargoyleAct`、`butcherAct`、`ghoulAct`、`bombAct`、`giovanniAct`。
- `npcDecideNextStep / npcSearchOrWait / npcKeepDistance / npcCursePC / npcActBeforeDeath / npcSetBomb / reviveGiovanni`。

**验收断言**（逐条可复现）
- `gargoyle`：HP<3 且未召唤时召出 `juvenileGargoyle`；同轴距离 2 时用 halberd（`extend` 2）；贴脸时若同轴造成 2 点伤害。
- `butcher`：首次相遇先消耗 1 回合播放过场；贴脸 cleave 2 点；同轴 2 格内拉人。
- `ghoul`：4 格内布雷（`timeBomb`），冻住时不再布雷；近战 1 点，攻击耗时 0.4。
- `giovanni`：贴脸放 `hpBomb`；距离 ≤5 随机放 `timeBomb`/`hpBomb`；被非"冰甲基础攻击"打死时复活并清空特殊成就进度。
- 击杀 `zombie` 时原地延后 2 回合召出 `dog`；`wisp/twinWisp/cursedRat` 死亡时若贴脸且可诅咒则诅咒 PC。

### P7 屏幕族（Examine / Aim / Help / Achievement / 终局）

**交付物**
- `Screens.ts` 四屏 + `GameSystem.examineMode`（内含 marker、锁敌、冰甲自指、射程判定）+ `showHelp/exitHelp/showAchievement/exitAchievement/moveCursorInAchievement`。
- `data/TextData.ts` 全量文案。

**验收断言**
- `x` 进入 Examine：marker 随光标移动且在视野内；`Esc` 退出；上/下切换锁敌目标（右侧按 x 升序、左侧按 x 降序、同 x 按 y 升序）。
- `Space` 在 Examine 中进 Aim；射程外用橙色提示 `Out of range!`；`Space` 对空使用冰甲。
- `?`（Shift+/）进 Help；`Esc` 退出；`a` 进成就屏，上下键切换 9 项，已解锁白色、未解锁灰色、选中项反白（`Highlight` 画背景）。
- 死亡后模态行固定 `===The End===`，后续按键不再解锁引擎。

### P8 存档/成就收尾 + 构建回归

**交付物**
- `SaveSystem.ts` 完整；`AchievementSystem.ts` 9 项判定；wizard 模式全部开发键；`deleteSave/clearStorage`。
- 构建 Web（`get_build_status` 查看），或在预览中做全流程回归。

**验收断言**
- 重启浏览器后：`achievement` 解锁项保留、`wizard` 状态保留、`dungeonLevel/seed/inventory/orb` 让续关从下一层开始且球与地图球一致。
- 成就 9 项各有可触发路径（附录 E 给触发条件），`unlockAll` 全解锁后自动弹提示。
- `validate_scene` / `run_script_diagnostics` 0 问题；`capture_preview_screenshot` 无布局错位。

---

## 7. 核心实现骨架

> 下面是可直接落地的关键代码。未列出的部分（组件、实体模板、AI）按源码 1:1 翻译即可。

### 7.1 `core/MainGame.ts`

```ts
export class MainGame {
    static readonly I = new MainGame();

    version = '0.3.0';
    develop = false;          // 等价 Main._develop
    devSeed: string | null = null;   // 等价 Main._devSeed

    private colors = new Map<string, string>([
        ['white', '#ABB2BF'],
        ['black', '#262626'],
        ['grey', '#666666'],
        ['orange', '#FF9900'],
        ['green', '#A0D86C'],
    ]);

    log = {
        seedPrinted: false, msgPrinted: false,
        floor: 0, cycle: 0, retry: [] as string[],
        enemyCount: 0, enemyComposition: [] as number[],
    };

    getColor(color: string): string { return this.colors.get(color) ?? color; }
}
export const Main = MainGame.I;   // 迁移期别名，减少 diff
```

### 7.2 `ecs/Components.ts`（要点）

- 全部组件由 `function` 改 `class`，字段与 getter 原名保留。
- `Inventory.getInventory(index)` 的历史行为要保留：传索引返回单项，否则返回整个数组（源码就是这么写的，别"修好"）。
- `Inventory.removeItem(amount)` 保持 `for (i=0; i<amount-1; i++) pop(); return pop();`（等价删 `amount` 个并返回最后一个）。
- `Achievement` 的 `_boss4Special` 保留长度 3 的滑动窗口。

### 7.3 `ecs/EntityFactory.ts` + `EntityRegistry.ts`

```ts
export class EntityFactory {
    private _id: string;
    constructor(public _entityName: string) { this._id = EntityFactory.createID(); }
    getID() { return this._id; }
    getEntityName() { return this._entityName; }
    addComponent(c: any, name?: string) { (this as any)[name ?? c._name] = c; }
    removeComponent(name: string) { delete (this as any)[name]; }

    private static createID(): string {                    // 算法与源码一致
        let s = '';
        while (s.length < 32) s += (Math.random() * 1e8 | 0).toString(16);
        return s.replace(/.{8}/g, '$&' + '-').slice(0, 35);
    }
}
```

实体注册表保持 `entries = new Map<string, Map<string, Entity>>()` 与源码的键：

```
'npc' | 'orb' | 'message' | 'seed' | 'dungeon' | 'gameProgress'
| 'pc' | 'marker' | 'downstairs' | 'timer'
```

### 7.4 `world/TurnEngine.ts`（同步泵循环，替代 ROT.Engine）

```ts
export class TurnEngine {
    private locked = true;
    private pumping = false;

    constructor(private scheduler: RotSchedulerAction) {}

    lock(): void { this.locked = true; }

    /** 对应 Main.system.unlockEngine(duration) 中的引擎部分 */
    unlock(duration?: number): void {
        if (duration !== undefined) this.scheduler.setDuration(duration);
        this.locked = false;
        if (this.pumping) return;            // 已在泵内：交给外层 while 继续
        this.pumping = true;
        while (!this.locked) {
            const actor = this.scheduler.next();
            if (!actor) break;
            actor.act();                      // act() 内部会 lock() 再 unlock(...)
        }
        this.pumping = false;
    }

    start(): void { this.locked = false; this.unlock(); }
    getTime(): number { return this.scheduler.getTime(); }
}
```

> 语义对照：rot.js `Engine.unlock()` 是异步续跑；这里用 `pumping` 把递归变成循环，行为等价且不会栈溢出。`act()` 里首次调用的 `lock()` 会把 `locked` 置 true，外层 while 检查后退出——正好等价于"等玩家输入"。

### 7.5 `render/ScreenLayout.ts`（只留坐标）

```ts
export interface Rect { x: number; y: number; w: number; h: number; }
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export const CANVAS = { w: 70, h: 26 };
export const PAD = { topBottom: 0.5, leftRight: 1, modeStatus: 1, modeMessage: 0, messageDungeon: 1 };

export const UI = {
    status:  R(56, 0.5, 13, 25),
    modeline:R(1, 24.5, 54, 1),
    message: R(1, 19.5, 54, 5),
    dungeon: R(1, 0.5, 54, 18),
    level:   R(56, 2.5, 13, 1),
    hitpoint:R(56, 4, 13, 1),
    power:   R(56, 5.5, 13, 6),
    ground:  R(56, 13, 13, 1),
    enemy:   R(56, 14.5, 13, 8),
    help:    R(56, 23, 13, 1),
    cutScene:R(6, 3, 58, 20),
    achLeft: R(6, 3, 26, 20),
    achMid:  R(32, 3, 1.5, 20),
    achRight:R(33.5, 3, 30.5, 20),
};
```

### 7.6 `world/GridRenderer.ts`（关键实现）

```ts
import { Color, Graphics, Label, Layers, Node, UITransform, Font } from 'cc';
import { Main } from '../core/MainGame';
import { CELL_W, CELL_H, GRID_COLS, GRID_ROWS } from '../core/Constants';

interface Cell { ch: string; fg: string; bg: string; }

const MARKUP = /%([cbf])\{([^}]*)\}/g;
const DEFAULT_FG = '#ABB2BF';
const DEFAULT_BG = '#262626';

export class GridRenderer {
    private labels: Label[] = [];
    private cells: Cell[] = [];
    private prev: Cell[] = [];
    private bgCells = new Set<number>();
    private gfx: Graphics;

    constructor(private root: Node, private font: Font, highlightNode: Node) {
        this.makeBuffers();
        this.gfx = highlightNode.getComponent(Graphics) ?? highlightNode.addComponent(Graphics);
        this.build();
    }

    private makeBuffers() {
        this.cells = new Array(GRID_COLS * GRID_ROWS);
        for (let i = 0; i < this.cells.length; i++) this.cells[i] = { ch: ' ', fg: DEFAULT_FG, bg: DEFAULT_BG };
    }

    /** 1820 个 Cell，建议分帧创建（见 P2 实施要点） */
    private build() {
        for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
                const n = new Node(`c_${r}_${c}`);
                n.layer = Layers.Enum.UI_2D;
                n.parent = this.root;
                const ui = n.addComponent(UITransform);
                ui.setContentSize(CELL_W, CELL_H);
                ui.setAnchorPoint(0, 1);
                n.setPosition(c * CELL_W, -r * CELL_H);
                const lb = n.addComponent(Label);
                lb.string = '';
                lb.font = this.font;                 // 未赋值时用系统字体
                lb.fontSize = 20;
                lb.lineHeight = CELL_H;
                lb.overflow = Label.Overflow.NONE;
                lb.cacheMode = Label.CacheMode.CHAR;
                lb.horizontalAlign = Label.HorizontalAlign.CENTER;
                lb.verticalAlign = Label.VerticalAlign.CENTER;
                this.labels[r * GRID_COLS + c] = lb;
            }
        }
    }

    clear(bg = DEFAULT_BG) {
        for (const cell of this.cells) { cell.ch = ' '; cell.fg = DEFAULT_FG; cell.bg = bg; }
        this.bgCells.clear();
    }

    /** 与 ROT.Display.draw 同签名，x/y 为字符格坐标（可为小数） */
    draw(x: number, y: number, ch: string, fg?: string, bg?: string) {
        const col = Math.round(x), row = Math.round(y);
        if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return;
        const idx = row * GRID_COLS + col;
        const cell = this.cells[idx];
        cell.ch = ch;
        if (fg) cell.fg = Main.getColor(fg);
        if (bg) cell.bg = Main.getColor(bg);
        if (cell.bg !== DEFAULT_BG) this.bgCells.add(idx);
    }

    /** 与 ROT.Display.drawText 同签名，支持 %c{} %b{} 与 \n 与 maxWidth 折行 */
    drawText(x: number, y: number, text: string, maxWidth?: number) {
        let cx = x, cy = y;
        let fg = DEFAULT_FG, bg = DEFAULT_BG;
        const limitRight = maxWidth === undefined ? GRID_COLS : Math.round(x) + maxWidth;

        const tokens = this.tokenize(text);
        for (const t of tokens) {
            if (t.type === 'fg') { fg = Main.getColor(t.value); continue; }
            if (t.type === 'bg') { bg = Main.getColor(t.value); continue; }
            const ch = t.value;
            if (ch === '\n') { cx = x; cy += 1; continue; }
            if (maxWidth !== undefined && Math.round(cx) >= limitRight) {   // 折行
                cx = x; cy += 1;
            }
            this.draw(cx, cy, ch, fg, bg);
            cx += 1;
        }
    }

    /** 解析轮格式：%c{#hex} 设置前景，%c{} 复位；%b{#hex} 设置背景，%b{} 复位 */
    private tokenize(text: string): Array<{ type: 'fg' | 'bg' | 'ch'; value: string }> {
        const out: Array<{ type: 'fg' | 'bg' | 'ch'; value: string }> = [];
        let last = 0;
        let m: RegExpExecArray | null;
        MARKUP.lastIndex = 0;
        while ((m = MARKUP.exec(text))) {
            if (m.index > last) for (const ch of text.slice(last, m.index)) out.push({ type: 'ch', value: ch });
            out.push({ type: m[1] === 'b' ? 'bg' : 'fg', value: m[2] || DEFAULT_FG_BG(m[1]) });
            last = m.index + m[0].length;
        }
        for (const ch of text.slice(last)) out.push({ type: 'ch', value: ch });
        return out;
    }

    /** 差分刷新：只更新变化格；最后重画背景层 */
    refresh() {
        for (let i = 0; i < this.cells.length; i++) {
            const a = this.cells[i], b = this.prev[i];
            if (a.ch === b.ch && a.fg === b.fg && a.bg === b.bg) continue;
            const lb = this.labels[i];
            lb.string = a.ch;
            lb.color = parseColor(a.fg);
            b.ch = a.ch; b.fg = a.fg; b.bg = a.bg;
        }
        this.gfx.clear();
        for (const idx of this.bgCells) {
            const cell = this.cells[idx];
            if (cell.bg === DEFAULT_BG) continue;
            const col = idx % GRID_COLS, row = Math.floor(idx / GRID_COLS);
            this.gfx.fillColor = parseColor(cell.bg);
            this.gfx.rect(col * CELL_W, -(row + 1) * CELL_H, CELL_W, CELL_H);
            this.gfx.fill();
        }
    }
}

function parseColor(hex: string): Color { const c = new Color(); c.fromHEX(hex); return c; }
function DEFAULT_FG_BG(kind: string): string { return kind === 'b' ? '#262626' : '#ABB2BF'; }
```

> 说明：
> - `prev` 缓冲与 `cells` 同步更新，保证差分有效；初始时 `prev` 全为 `{ch:' ', fg:..., bg:...}`，可用 `clear()` 前先 `prev = cells.map(c => ({...c}))` 做一次全量刷新。
> - 若 `Label.Overflow.NONE` 下字符宽度小于 `CELL_W`，`CENTER` 对齐依然逐格对齐；若字体非严格等宽，必须换字体或改 `horizontalAlign = LEFT` 并微调。
> - `Highlight` 节点的锚点/尺寸必须与 `GridRoot` 一致，否则背景矩形偏移。

### 7.7 `input/InputRouter.ts`（替代 window 监听）

```ts
import { EventKeyboard, Input, KeyCode, input } from 'cc';
import { Main } from '../core/MainGame';

const KEY_TO_CHAR: Record<number, string> = {
    [KeyCode.KEY_A]: 'a', [KeyCode.KEY_B]: 'b', /* ... */ [KeyCode.KEY_Z]: 'z',
    [KeyCode.SPACE]: ' ', [KeyCode.ESCAPE]: 'Escape',
    [KeyCode.ARROW_LEFT]: 'ArrowLeft', [KeyCode.ARROW_RIGHT]: 'ArrowRight',
    [KeyCode.ARROW_UP]: 'ArrowUp', [KeyCode.ARROW_DOWN]: 'ArrowDown',
    [KeyCode.PAGE_UP]: 'PageUp', [KeyCode.PAGE_DOWN]: 'PageDown',
    [KeyCode.MINUS]: '-', [KeyCode.PERIOD]: '.', [KeyCode.EQUAL]: '=',
    [KeyCode.BACK_SLASH]: '\\', [KeyCode.BACK_QUOTE]: '`', [KeyCode.SLASH]: '/',
    [KeyCode.DIGIT_0]: '0', /* ... */ [KeyCode.DIGIT_9]: '9',
};

export class InputRouter {
    private shift = false;
    private handler: ((e: any) => void) | null = null;

    init() {
        input.on(Input.EventType.KEY_DOWN, this.onDown, this);
        input.on(Input.EventType.KEY_UP, this.onUp, this);
    }
    destroy() {
        input.off(Input.EventType.KEY_DOWN, this.onDown, this);
        input.off(Input.EventType.KEY_UP, this.onUp, this);
    }

    private onUp(e: EventKeyboard) {
        if (e.keyCode === KeyCode.SHIFT_LEFT || e.keyCode === KeyCode.SHIFT_RIGHT) this.shift = false;
    }

    private onDown(e: EventKeyboard) {
        if (e.keyCode === KeyCode.SHIFT_LEFT || e.keyCode === KeyCode.SHIFT_RIGHT) { this.shift = true; return; }
        if (!this.handler) return;
        const key = this.normalize(e.keyCode, this.shift);
        if (!key) return;
        this.handler({ key, shiftKey: this.shift });    // 与源码 e.key / e.shiftKey 对齐
    }

    /** 大小写与 Shift 符号还原：h → H；/ → ?；关闭 CapsLock 影响（Cocos 不暴露） */
    private normalize(code: number, shift: boolean): string | null {
        const c = KEY_TO_CHAR[code];
        if (!c) return null;
        if (/^[a-z]$/.test(c)) return shift ? c.toUpperCase() : c;
        if (shift) {
            if (c === '/') return '?';
            if (c === '=') return '+';
            if (c === '-') return '_';
        }
        return c;
    }

    listenEvent(event: 'add' | 'remove', handler: string | ((e: any) => void)) {
        const fn = typeof handler === 'string' ? Screens.get(handler).keyInput : handler;
        if (event === 'add') { this.handler = fn; Main.develop && console.log('bind', handler); }
        else if (this.handler === fn) this.handler = null;
    }
}
```

> 与源码的差异：源码支持"同一个 keydown 事件被多个屏幕处理器共用"，这里改成"单一激活处理器"，但 `Screens` 的 add/remove 调用序列与源码一致，所以行为等价。**不要**改用 `input.on(KEY_PRESSING)`，会重复触发。

### 7.8 `save/SaveSystem.ts`

```ts
import { sys } from 'cc';
export const SaveSystem = {
    get storage() { return sys.localStorage; },
    // 键名与源码完全一致
    KEY: { achievement: 'achievement', wizard: 'wizard', dungeonLevel: 'dungeonLevel',
           seed: 'seed', inventory: 'inventory', orb: 'orb' },
    // 其余函数（storageAvailable / deleteSave / saveWizardMode / loadWizardMode /
    // saveDungeonLevel / loadDungeonLevel / saveSeed / loadSeed / saveInventory /
    // loadInventory / saveOrbsOnTheGround / loadOrbsOnTheGround /
    // saveAchievements / loadAchievements）逻辑 1:1 搬运
};
```

### 7.9 地图与视野（`world/DungeonBuilder.ts`）

```ts
light(x: number, y: number) { return this.terrain.get(`${x},${y}`) === 0; }

generate() {
    const width = 52, height = 16;      // 由 UI.dungeon 减去 2×padding 得到
    let cycle = 0, area = 0;
    do {
        const cell = new RotCellular(width, height);
        cell.randomize(0.5);
        for (let i = 0; i < 5; i++) cell.create();
        cell.connect((x: number, y: number, wall: number) => this.terrain.set(`${x},${y}`, wall));
        area = this.floorArea(); cycle++;
    } while ((area < 55 || area > 65) && cycle < 200);
    this.fov = new RotFov(this.light.bind(this));
    Main.log.floor = area; Main.log.cycle = cycle;
}
```

### 7.10 `system/GameSystem.ts` 迁移注意点（逐条）

1. **`unlockEngine(duration)` 必须"先改调度再跑再重绘"**：
   ```ts
   unlockEngine(duration: number) {
       timer.engine.unlock(duration);      // 内部 scheduler.setDuration(duration)
       renderer.clear();
       Screens.main.display();
   }
   ```
   与源码顺序一致（源码是先 `setDuration` 再 `engine.unlock()` 再重绘）。
2. **每回合只重绘一次**：`act()` 内部不要额外重绘；`pcAct` 末尾注释"DO NOT redraw"要保留。
3. **`pcAttack` 的死亡判定条件**（尤其 Giovanni）是刻意写的，不要简化：
   `target.HitPoint.isDead() && (boss !== giovanni || (attackType==='base' && lastOrb==='armor'))`。
4. **掉落率分支**：Boss 固定用 `fire` 的 100%；普通怪按 `attackType`；基础攻击再按 `lastOrb`（armor→ice 60%、nuke→100%、其他→20%）。
5. **`npcActBeforeDeath`** 在掉落之前执行，且用 `scheduler.add(actor, true, 2)` 延迟 2。
6. **`reviveGiovanni`** 需要把 PC 移到楼梯、Giovanni 重新放置并 +1 HP、地面没有冰球时补 4 球（超过 20 颗直接清空重来）、清空 `boss4Special` 记录。
7. **`placeActor`** 保留 `maxRetry = 999` 与 `verify*Position` 回调签名（`(x, y, forbidden, isElite)`）。
8. **`getDistance` 用切比雪夫距离**（`max(|dx|,|dy|)`），不是欧氏距离。

---

## 8. 规则移植校验清单

| # | 断言 | 验证方法 | 期望 |
| --- | --- | --- | --- |
| V1 | 同种子同地图 | `Main._devSeed='#12345'` 连跑 3 次 | ASCII 地图逐字相同 |
| V2 | 面积范围 | 打印 `Main.log.floor` | 55~65 |
| V3 | 敌人数量 | 打印 `enemyCount` | 25~30 |
| V4 | 敌人配比 | `lump=ceil(20%)`; `fire+ice=ceil(50%)`; `slime` 余量 | 与 `enemyComposition` 一致 |
| V5 | 初始背包 | 新档开局 | `slime, armor, armor, fire, lump`（5 个，HP=5） |
| V6 | 受伤 LIFO | 受伤 2 点 | 顶部球被弹出 2 个 |
| V7 | 诅咒上限 | wizard `8` 连按 | 最多 3；满时 `Space` 不能拾取 |
| V8 | 冰甲 | 用冰球 | 该槽变 `armor, armor`，超出 6 个从尾部弹出 |
| V9 | 掉落率 | 击杀 100 只统计 | 火焰≈100%、撞击≈20%、冰甲撞击≈60% |
| V10 | Boss 顺序 | 1/2/3 层下楼 | Gargoyle → Ghoul（含 Butcher） → Giovanni |
| V11 | 小 Boss 过场只播一次 | 进 2 层 | Butcher 首次见面消耗 1 回合 + 按 Space 续 |
| V12 | 切换楼层存档 | 打完 Boss 用楼梯 | `dungeonLevel/seed/inventory/orb` 写入且重载生效 |
| V13 | 成就 9 项 | 见附录 E | 各触发一次后 `unlockAll` 自动解锁 |
| V14 | 死亡终局 | HP 扣到负数 | 显示 `You die.` + 遗言 + `===The End===`，引擎保持锁定 |
| V15 | 视线记忆 | 走开再回来 | 旧区域灰显、新区域白显 |
| V16 | 快速移动 | Shift+方向 | 最多 5 格，视野内出现敌人即停 |
| V17 | 锁敌顺序 | `n`/`p` 循环 | 右半区 x 升序 → 左半区 x 降序 |

---

## 9. 与 FunPlay MCP 的联调验证流程

每个阶段完成后的标准动作：

```text
1. run_script_diagnostics            # TS 编译错误（0 才继续）
2. validate_scene                    # 场景引用/组件缺失
3. get_recent_logs / search_project_logs  # 运行期 console 报错
4. capture_preview_screenshot        # 目视校验布局
5. get_performance_snapshot          # P2/P8 看帧时间与节点数
```

阶段专项：

| 阶段 | MCP 手段 |
| --- | --- |
| P0 | `get_project_info` 确认 3.8.8；`get_hierarchy` 核对节点树 |
| P1 | `execute_editor_script` 在编辑器里跑地图生成并打印 ASCII（避免每次预览） |
| P2 | `capture_scene_screenshot` + `get_performance_snapshot` |
| P3~P6 | `execute_javascript` 在预览上下文注入 wizard 操作（加球/加诅咒/传送），快速构造测试场景 |
| P7 | 截图逐屏比对（main / examine / aim / help / achievement / cutscene） |
| P8 | `get_build_status` 走 Web 构建；`capture_preview_screenshot` 做最终视觉回归 |

常见故障排查：

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 黑屏、无字符 | `Label` 未设 `fontSize/lineHeight` 或节点层级不在 `UI_2D` | 检查 `node.layer`、`UITransform` 尺寸、`GridRoot` 位置 |
| 字符重叠/错位 | 字体非等宽或 `CELL_W` 猜测值偏差 | 跑 `calibrate()`，改用 DejaVu 等宽字体 |
| 按键盘无反应 | `input` 未初始化 / `handler` 为 null / 焦点在编辑器 | 在 `GameRoot.start()` 调 `InputRouter.init()`；预览窗口点一下获取焦点 |
| 回合不推进 | `TurnEngine` 递归/`pumping` 逻辑写错 | 对照 7.4；确认 `act()` 末尾一定 `unlock(duration)` |
| 地图每次不同 | 用了 `Math.random()` 或未 `setSeed` | 全局搜索 `Math.random`，只允许出现在实体 ID 与初始种子 |
| 同名脚本报重复类 | 文件 `meta` 丢失或脚本被复制两份 | `run_script_diagnostics` + 删除 `library/` 重建 |

---

## 10. 性能与适配

1. **差分刷新**：每回合只改 `string / color` 变化的 Label；1820 次比较的成本可忽略。
2. **背景层**：`Graphics.clear()` 后只画非默认背景格（通常 0~3 个）。
3. **分帧创建**：首屏创建 1820 节点时用 `setTimeout` 分批（每批 200 个）+ 加载遮罩；实测 < 3 s 可接受。
4. **分辨率适配**：`Fit Height`，`1280×720` 下网格 840×520 居中；若改设计分辨率，只需重算 `Root` 位置，`CELL_*` 不变。
5. **可选优化（不阻塞首版）**：换成 BitmapFont（.fnt 图集）进一步减少纹理切换；或把 26 行合并为 `RichText`。
6. **移动端**：无物理键盘，后续加虚拟方向键（映射到同一 `InputRouter`），首版可不做。

---

## 11. 风险与回退

| 风险 | 触发信号 | 回退方案 |
| --- | --- | --- |
| Label 方案性能不达标 | P2 实测单帧 > 8 ms 或首屏 > 3 s | 切「行级 RichText」：26 个节点，颜色转 `<color>` 标记；背景改 Graphics |
| 字体错位无法调整 | 字符宽与 12 px 偏差 > 1 px | 换 DejaVuSansMono；或每格 `Sprite` + 字符图集 |
| RNG 差异导致地图不一致 | V1 断言失败 | 逐行比对 rot.js `RNG` 源码（`_s`、`_m`、`_a` 常量），不要"优化" |
| 回合卡死 | 点击后无任何反应 | 先按第 14.5 节 SOP 判定是"引擎锁死"还是"根本没在跑"；引擎侧兜底见 14.4 第 3、4 条 |
| 存档在原生平台失效 | Native 运行时写不进 | `sys.localStorage` 在 3.8 已兼容；确认未用 `window.localStorage` |

---

## 12. 附录

### 附录 A：按键映射（原样）

| 模式 | action | keys |
| --- | --- | --- |
| fixed | yes / no / help / seed / achievement | `Space` / `Escape` / `?` / `=` / `a` |
| fixed（开发） | develop / fov / turn / dummy / teleport / clearStorage | `~` / `]` / `\` / `d` / `0` / `C` |
| fixed（开发） | addFire / addIce / addSlime / addLump / addArmor / addNuke | `1`~`6` |
| fixed（开发） | removeCurse / addCurse / removeOrb | `7` / `8` / `-` |
| move | left / down / up / right / wait | `h`+`ArrowLeft` / `j`+`ArrowDown` / `k`+`ArrowUp` / `l`+`ArrowRight` / `z`+`.` |
| fastMove | left / down / up / right | `H` / `J` / `K` / `L`（+ 方向键需 Shift） |
| interact | examine / pickOrUse / next / previous | `x` / `Space` / `n`,`o`,`PageDown` / `p`,`i`,`PageUp` |

> 源码里 `Shift+方向键` 也走 fastMove（因为 `e.key` 仍是 `ArrowLeft` 且 `shiftKey` 为 true）。`InputRouter` 已保留 `shiftKey`，分支判断照搬即可。

### 附录 B：实体数值表

| 名称 | 字符 | 视野 | HP | 携带球 | 伤害 | 攻击距离 | 耗时 | 角色标记 | AI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pc | `@` | 5 | =当前球数（上限 6） | 初始 5 球 | base1 / nuke9 | fire1 ice0 slime2 lump2 nuke5 | 1 | — | pcAct |
| dummy | `d` | 5 | 1 | slime | 1 | 1 | 1 | — | dummyAct |
| rat | `r` | 5 | 1 | slime | 1 | 1 | 1 | — | dummyAct |
| dog（Zombie Dog） | `d` | 7 | 2 | fire | 1 | 1 | 1 | — | dummyAct |
| raven | `v` | 5 | 1 | ice | 1 | 1 | 1 | cautious | dummyAct |
| zombie | `z` | 5 | 3 | lump | 1 | 1 | slowMove 1.5 | — | dummyAct |
| archer | `a` | 5 | 1 | lump | 2 | 2（extend 3） | 1 | cautious | dummyAct |
| wisp | `w` | 5 | 1 | ice | 1（curse1） | 1 | fastMove 0.6 | — | dummyAct |
| ratMan | `m` | 7 | 2 | fire | 1 | 1（extend 2） | slowMove 1.2 | — | dummyAct |
| cultist | `c` | 5 | 2 | lump | 1（curse2） | 2 | slowAttack 1.2 | curse | dummyAct |
| cursedRat | `r` | 5 | 1 | slime | 1（curse1） | 1 | 1 | — | dummyAct |
| twinWisp | `w` | 5 | 1 | ice | 1（curse2） | 1 | fastMove 0.6 | — | dummyAct |
| gargoyle | `G` | 9 | 5 | lump | 1（high2） | 1（extend 2） | slowMove 1.2 / slowAttack 1.2 | isBoss, hasTail, hasSummoned | gargoyleAct |
| juvenileGargoyle | `g` | 9 | 2 | lump | 1（high2） | 1 | 1 | isBoss, hasTail | gargoyleAct |
| butcher | `B` | 5 | 3 | lump | 1（cleave2） | 1（pull 2） | slowMove 1.2 / slowAttack 1.2 | isBoss, isMiniBoss | butcherAct |
| ghoul | `J` | 7 | 3 | lump | 1（maxBomb4） | 1（bomb 4） | fastAttack 0.4 | isBoss | ghoulAct |
| timeBomb | `t` | 5 | 3 | slime | 1 | 1 | 1 | isBomb | bombAct |
| hpBomb（Remote Bomb） | `b` | 5 | 3 | slime | 2 | 1 | 1 | isBomb | bombAct |
| giovanni | `V` | 7 | 3 | lump | 1（maxBomb4） | 1（bomb 5） | 1 | isBoss, justRevived | giovanniAct |

### 附录 C：关卡与 Boss

| 层 | 名称 | Lump 池 | Fire 池 | Ice 池 | Slime 池 | Boss |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Churchyard | archer, zombie | dog | raven | rat | gargoyle（可召唤 juvenile） |
| 2 | Cellar | cultist | ratMan | wisp | rat | ghoul（+ 开场 Butcher 小 Boss） |
| 3 | Sanctum | archer, zombie, cultist×3 | dog, ratMan | raven, twinWisp | cursedRat | giovanni（可复活 1 次） |

生成数量：`total = 25 + floor(6*U)`；`lump = ceil(0.2*total)`；`fireAndIce = ceil(0.5*(total-lump))`；`fire = floor(fireAndIce * (0.4~0.6))`；`ice = fireAndIce-fire`；`slime = total-lump-fireAndIce`。

### 附录 D：成就（9 项）

| id | 触发条件 |
| --- | --- |
| boss1Normal | 击杀 gargoyle / juvenileGargoyle 且场上无同类 |
| boss1Special | 用 `fire` 攻击 gargoyle 且其 `hasTail` |
| boss2Normal | 击杀 butcher |
| boss3Normal | 击杀 ghoul |
| boss3Special | 打 ghoul 全程只用 `base` 攻击（一旦非 base 即作废） |
| boss4Normal | 击杀 giovanni |
| boss4Special | 对 giovanni 依次造成 `ice → fire → lump` 三种攻击（长度 3 滑动窗口） |
| noExamine | 整局未按 `x` 进入 Examine 即通关 |
| unlockAll | 以上 8 项全解锁后自动解锁 |

### 附录 E：存档键

| 键 | 写入时机 | 内容 |
| --- | --- | --- |
| `achievement` | 任意成就解锁 | `id,true;id,false;...` |
| `wizard` | 切开发模式 | `"true"/"false"` |
| `dungeonLevel` | 击败非最终 Boss 后 | 下一层号（1~3） |
| `seed` | 同上 | 整数种子 |
| `inventory` | 同上 | 逗号分隔的球名 |
| `orb` | 同上 | 按 Lump→Fire→Ice→Slime 排序后取前 4 |

`deleteSave()` 在每层初始化时清空除 `achievement/wizard` 外的所有键。

### 附录 F：文案迁移注意点

- `text.js` 的 500 行数据**整段拷贝**，键名、`%%`、`%1%%2%` 占位符不动。
- 拼接函数（`pickUp/hitTarget/killTarget/targetDropOrb/npcHit/npcCurse/npcSummon/modeLine/npcBottomDescription/orbTopDescription/lastWords/uiHitPoint/gargoyleBreathe/gargoyleDescription/unlockAchievement/bombExplode/setBomb`）逻辑原样搬运。
- `colorfulText()` 产出的 `%c{...}` 标记由 `GridRenderer.drawText` 解析，**不要**改成 HTML/RichText 标记。

### 附录 G：需要留意的源码"怪点"（移植时保持原样，避免行为漂移）

1. `drawBorder()` 竖线上界误用 `status.getHeight()`（应 `y + height`），实际画出 y=0.5~24.5 —— 保持。
2. `drawMessage(text)` 参数只在"加一条消息"时使用，正常重绘传 undefined —— 保持。
3. `placeBoss()` 理论上可能返回 `undefined`（视野内无合格格），随后 `split` 会抛错 —— 移植时加保护，回退到"离目标最远的空地"。
4. `Inventory.getInventory(index)` 无索引时返回**整个数组**（`addItem` 里当数组用）—— 保持。
5. `EntityRegistry` 里 `rat` 的显示字符是 `r`、`dog` 与 `dummy` 都用 `d`（敌人列表按字符归类时会合并计数）—— 保持。
6. `Achievement.resetAchievement` 遍历 Map 时 set 同名键 —— 合法，保持。
7. `Component.Seed.setSeed` 用正则去 `#` 并插连字符，`printSeed` 与 `seed` 两个字段含义不同 —— 保持。
8. `entity.rat` 用的是 `dummyAct`（不是自研 AI），且 `cursedRat` 显示字符也是 `r` —— 保持。

---

## 13. 交付物清单（本方案完成后应存在）

```
doc/cursedSouls_CocosCreator_移植执行方案.md      ← 本文档
assets/scenes/Main.scene
assets/fonts/DejaVuSansMono.ttf
assets/scripts/GameRoot.ts
assets/scripts/core/{MainGame,Constants}.ts
assets/scripts/vendor/{RotRng,RotCellular,RotFov,RotScheduler}.ts
assets/scripts/ecs/{Components,EntityFactory,EntityRegistry}.ts
assets/scripts/world/{TurnEngine,DungeonBuilder,GridRenderer}.ts
assets/scripts/system/{GameSystem,MonsterAI,AchievementSystem}.ts
assets/scripts/render/{ScreenLayout,ScreenBase,DrawUtils,Screens}.ts
assets/scripts/input/{KeyBindings,InputRouter}.ts
assets/scripts/data/TextData.ts
assets/scripts/save/SaveSystem.ts
```

> 施工顺序建议严格按 P0 → P8；每个阶段结束提交一次可运行版本，便于二分定位回归问题。

---

## 14. 故障复盘：为什么"看起来死循环"，以及兜底机制（v1.1 新增）

> 本章回答三个问题：**是否真的存在死循环？**、**为什么会被误判？**、**以后怎么保证不再卡死？**

### 14.1 实测结论（先给答案）

| 检查项 | 方法 | 结果 | 结论 |
| --- | --- | --- | --- |
| 地图生成本身 | Node 固定种子 `#12345` 直接调用 `Main.entity.dungeon()` | 52×16，floor 65%，**9 ms** | 不是死循环 |
| 地图生成稳定性 | 300 个随机种子批量跑 | 平均 **1.36 ms**，最慢 **14 ms**，最多 **9 轮**重试（轮数分布 `{1:159, 2:78, 3:41, 4:9, 5:6, 6:5, 7:1, 9:1}`） | 不是死循环，且收敛很快 |
| 全链路启动 | `temp/gen-test/headless/run.js`（用 `cc` 替身真实执行 `GameRoot.onLoad`） | 过场 → 主界面 → 移动 → 完整 26 行 ASCII 正确渲染，TypeScript 全量编译 **0 error** | 逻辑层没有卡死 |
| 浏览器预览会话 | `get_runtime_state` / `localhost:7456` 端口探测 | `running:false`；端口**无法连接**；`get_preview_mode` 报 `mode=browser` | 预览会话已经结束，页面是空的 |

**一句话结论**：游戏主循环没有死循环 —— **"死循环"发生在验证环节，不在代码里。**

### 14.2 误判是怎么产生的（真实因果链）

```
① 预览模式 = browser（Cocos 用系统浏览器打开 http://localhost:7456/）
        ↓
② 那个浏览器标签被关闭
   → Cocos 的 web 预览会话随页面销毁而终止
   → 7456 端口不再监听（Test-NetConnection = False）
   → get_runtime_state.running = false
        ↓
③ 之后再次打开预览地址，只会看到 Cocos 的占位页：「预览场景中啥都没有」
        ↓
④ 此时我仍用 capture_preview_screenshot(windowKind=preview) 截图
   → 截到的是 Creator 编辑器窗口（Game View 本来就是空的）
   → "没有动静" → 反复重截 → 用户看到的就是"死循环"
```

关键判断证据：**`Seed: 7318000165` 这行日志是"生成成功"的证据，而不是"卡在半路"的证据。**

- 它由 [`printGenerationLog`](file:///d:/work2/test_funplay_mcp/assets/scripts/system/GameSystem.ts#L868-L884) 打印，而该函数在 [`main.initialize()` 的最后一步](file:///d:/work2/test_funplay_mcp/assets/scripts/screens/Screens.ts#L94-L97) 被调用。
- 也就是说：能打印 `Seed` ⇒ 地图已生成、PC 已落位、敌人/Orb/楼梯已放置、存档已清理 —— **初始化全部完成**。
- `Cycle / Floor / Enemy / Lump / Fire / Ice / Slime` 这几行只在 `Main.getDevelop() === true` 时打印。因此"只看到 Seed、没看到 Cycle"是**正常输出**，不代表卡住。

### 14.3 代码里确实存在的无界循环（复核后的风险清单）

虽然没有实际触发，但下面 6 处是**理论无界**或**耗时不可控**的，必须加兜底：

| # | 位置 | 当前边界 | 理论风险 | 兜底做法 |
| --- | --- | --- | --- | --- |
| 1 | `Main.entity.dungeon()` 的 `do { cellular() } while (floorArea < 55 \|\| > 65)` | **无上限** | 极端种子下可能长时间不收敛（实测最多 9 轮，但无保证） | 轮数上限 `MAX_CYCLE = 60`；超限取"最接近 60% 的那一版"；仍不达标则改用固定连通模板 |
| 2 | `RotCellular.connect()` 的 `while (remaining.length > 0)` | **无上限** | 若 `_tunnelToConnected` 未能把点并入连通集，`remaining` 不减 → 真死循环 | 迭代上限 `remaining.length * 4 + 64`；超限直接终止并记录告警 |
| 3 | `Main.system.placeActor()` 的 `do { ... } while (notQualified && retry < 999)` | 999 次 | 每次重试都要跑 FOV / `countEnemiesInSight`，999 次可造成"假死"数秒 | 重试降到 `200`；超限走**确定性兜底格**（首个满足 `isFloor` 的空格），保证一定有结果 |
| 4 | `TurnEngine.unlock()` 的 `while (this._lock === 0)` | **无上限** | ① 某个 `act()` 既不 `lock` 也不 `unlock` → 永远转；② `unlock` 次数多于 `lock` → `_lock` 变负数 → **永久停摆（和卡死一模一样）** | 单次泵步数上限 `2000`；`_lock < 0` 时自动重置为 `1` 并 `console.error`；每帧最多泵一次，避免同步雪崩 |
| 5 | `GridRenderer` 首帧创建 1820 个 `Label`；且 `unlockEngine` 每回合末尾都会**整屏重绘一次** | 一次性同步 | 30 个 NPC 一个回合 = 30 次整屏重绘，浏览器可能明显卡顿（被误认为死循环） | `Label` 分帧创建（每帧 200 个）；`display()` 只置脏标记，真正 `flush` 每帧一次；`unlockEngine` 里的重绘与泵循环解耦（泵结束后统一重绘一次） |
| 6 | `GridRenderer._breakLines` 里的 `for (;;)` + `lastSpaceToken` 回退分支 | 依赖字符串内容 | 万一 `lastIndexOf(' ')` 为 -1，`i` 会来回跳（理论振荡） | 内层循环加迭代上限 `tokens.length * 2`，超限直接断行 |

> 说明：第 4 条是最容易造成"看起来死循环/卡死"的一条。源码每个 `act()` 开头 `engine.lock()`、结尾 `unlockEngine()`，靠"锁计数归零"驱动泵；只要有一处少配对，`_lock` 就再也回不到 0，游戏表现为**按键永久无反应**。

### 14.4 兜底机制设计（施工必须带）

**原则**：任何"等待某个条件成立"的循环，都必须有 `上限 + 退路 + 可观测告警`，三者缺一不可。

1. **生成器兜底**
   - `MAX_CYCLE = 60`，超出后选"floor 比例最接近 60%"的一版；再不行用固定模板（例如四周墙 + 中央连通房间），并把种子打到 console。
2. **连通算法兜底**
   - `connect()` 迭代计数超限 → `break`，并 `console.warn('[connect] aborted')`；保证返回的地图仍然可用（允许存在孤立小区域）。
3. **放置器兜底**
   - `RETRY_MAX = 200`；超限后不再随机，改为**线性扫描** `dungeon` 找第一个合法格；`placeActor` 永远返回 `true`（除非整张图没有合法格，此时报错并重开一层）。
4. **回合泵兜底（最关键）**
   ```ts
   // TurnEngine.unlock()
   if (this._lock < 0) {                 // 锁计数被多减：立即自愈
       console.error('[engine] lock < 0, reset to 1');
       this._lock = 1;
       return this;
   }
   let steps = 0;
   while (this._lock === 0) {
       if (++steps > TURN_STEP_MAX) {    // 2000
           console.error('[engine] pump exceeded ' + TURN_STEP_MAX + ' steps');
           this._lock = 1;               // 强制把控制权还给玩家
           break;
       }
       const actor = this._scheduler.next();
       if (!actor) { this._lock = 1; break; }
       actor.act();
   }
   ```
5. **渲染兜底**
   - `display()` 只写字符缓冲 + `dirty = true`；`update()` 每帧做一次差分 `flush`。
   - `unlockEngine` 不再"每个 NPC 一步就整屏重绘"，改为**泵结束后统一重绘一次**（把 `Main.screens.main.display()` 移到 `unlock` 返回之后）。
   - 首帧 `Label` 分帧创建，创建完成前用 `drawText` 提示 "Loading…"。
6. **启动心跳**
   - 在每个初始化步骤前后打点（`boot(1..8)`），例如 `seed / rng / timer / dungeon / pc / enemies / orbs / display`。卡在哪一步，日志里最后一条就打在哪里 —— 不再靠猜。
7. **全局异常兜底**
   ```ts
   // GameRoot.onLoad()
   try { ... 原有初始化 ... }
   catch (e) {
       console.error('[boot]', e);
       Main.display.clear();
       Main.display.drawText(1, 1, '%c{orange}Boot failed: ' + e);
       sys.localStorage.setItem('lastBootError', String(e));
   }
   ```
8. **观察兜底（见 14.5）**
   - **禁止**用"截 Creator 编辑器窗口"作为运行结果判断依据；预览跑在浏览器里，编辑器窗口永远是空的。

### 14.5 正确的观测方式（SOP，按顺序执行，不要跳步）

| 步骤 | 动作 | 判定 |
| --- | --- | --- |
| 1 | `get_preview_mode` | 确认 `mode`（browser / gameView / simulator） |
| 2 | `get_runtime_state` | 必须 `running:true`；`false` ⇒ **先去启动预览，不要截图** |
| 3 | 探测预览服务 | `http://localhost:7456/` 必须可访问；连不上 ⇒ 会话已结束 ⇒ 重新 `preview-scene-in-browser` |
| 4 | 逻辑正确性 | 跑 `temp/gen-test/headless/run.js`，直接读 `GridRenderer._ch` 打印 26 行 ASCII —— **零依赖、零截图、结果可断言** |
| 5 | 浏览器表现 | 用浏览器控制台看 `Seed:` / 报错，配合真实截图（仅作为最终存档） |

```powershell
# 第 4 步：headless 回放（不需要 Cocos 编辑器在运行）
cd d:\work2\test_funplay_mcp\temp\gen-test\headless
node "D:\Downloads\Creator\3.8.8\resources\resources\3d\engine\node_modules\typescript\bin\tsc" -p tsconfig.json
node run.js
```

> 该回放器用 [`cc` 替身](file:///d:/work2/test_funplay_mcp/temp/gen-test/headless/node_modules/cc/index.js) 提供 `Node/Label/Graphics/sys.localStorage/input` 的最小实现，真实执行 `GameRoot.onLoad()`、真实过回合、真实渲染到字符缓冲。它验证的是**逻辑层**；Cocos 侧只负责把字符缓冲画到屏幕上。

### 14.6 回归清单（每次改动后 30 秒自检）

1. `tsc -p temp/gen-test/headless/tsconfig.json` → **0 error**。
2. `node temp/gen-test/headless/run.js` → 过场 26 行、主界面 26 行、移动后 PC 位置有变化。
3. `get_runtime_state.running === true` 且 7456 可访问。
4. 浏览器控制台出现 `Seed: <数字>`，且**没有** `[engine]` / `[connect]` 告警。
5. 按 `l` 一步，画面有变化（说明泵正常、重绘正常）。

---

