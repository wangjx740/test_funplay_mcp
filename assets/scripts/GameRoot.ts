import { _decorator, Component, Node, Layers, UITransform, sys } from 'cc';
import { Main } from './core/MainGame';
import { GridRenderer } from './render/GridRenderer';

// 按源工程 index.html 的脚本顺序导入，保证初始化时序一致。
import './render/ScreenLayout';
import './screens/ScreenFactory';
import './screens/Screens';
import './input/KeyInput';
import './data/TextData';
import './ecs/Components';
import './ecs/EntityFactory';
import './ecs/EntityRegistry';
import './system/GameSystem';
import './system/MonsterAI';
import './save/SaveSystem';
import './system/AchievementSystem';

const { ccclass } = _decorator;

/** 对应源工程 `window.onload`：初始化引擎外的一切并进入首个屏幕。 */
@ccclass('GameRoot')
export class GameRoot extends Component {
    private _renderer: GridRenderer = null;

    protected onLoad(): void {
        // 兜底：初始化任何一步异常都不再静默卡住，直接把错误打到屏幕与 localStorage。
        // 见方案文档 14.4 第 7 条。
        try {
            this._boot();
        } catch (e) {
            console.error('[boot] failed', e);
            try {
                sys.localStorage.setItem('lastBootError', String(e));
                if (Main.display) {
                    Main.display.clear();
                    Main.display.drawText(1, 1,
                        '%c{orange}Boot failed: ' + e, 68);
                }
            } catch (inner) {
                console.error('[boot] failed to render error', inner);
            }
        }
    }

    private _boot(): void {
        console.log('[boot] 1/9 display');

        // 1. 建立 70×26 的字符网格，并挂到 Main.display（对应 ROT.Display）。
        const gridRoot = new Node('GridRoot');
        gridRoot.layer = Layers.Enum.UI_2D;
        gridRoot.parent = this.node;

        const gridTransform = gridRoot.addComponent(UITransform);
        // 网格整体 1120×572，在 1280×720 设计分辨率内居中。
        gridTransform.setAnchorPoint(0, 1);
        gridTransform.setContentSize(1120, 572);
        gridRoot.setPosition(-560, 286);

        this._renderer = new GridRenderer(gridRoot);
        Main.display = this._renderer;

        // 2. 读取开发模式，初始化文案与全局实体。
        Main._develop = Main.system.loadWizardMode();

        Main.text.initialize();
        Main.entity.message();
        Main.entity.gameProgress();

        // 3. 存储不可用时给出错误提示。
        if (!Main.system.storageAvailable()) {
            Main.display.drawText(
                Main.UI.cutScene.getX(),
                Main.UI.cutScene.getY(),
                Main.text.error('storage'),
                Main.UI.cutScene.getWidth()
            );
            return;
        }

        Main.display.clear();

        Main.getEntity('gameProgress').BossFight.setDungeonLevel(
            Main.system.loadDungeonLevel()
        );

        // 4. 成就。
        Main.system.setAchievement();
        Main.system.checkAchUnlockAll();

        // 5. 键盘监听与首个屏幕。
        Main.input.installKeyboard();

        if (Main.getDevelop()) {
            Main.screens.main.enter();
            Main.input.listenEvent('add', 'main');
        } else {
            Main.screens.cutScene.enter();
            Main.input.listenEvent('add', 'cutScene');
        }
        console.log('[boot] 9/9 screen ready');
    }

    protected update(): void {
        if (!this._renderer) { return; }

        // 分帧创建格子 Label，全部创建完成前不刷屏。
        if (!this._renderer.stepCreate()) { return; }

        // 回合泵只置脏标记，这里每帧统一重绘一次。
        if (Main._pendingRedraw) {
            Main._pendingRedraw = false;
            Main.display.clear();
            Main.screens.main.display();
        }

        if (this._renderer.dirty) {
            this._renderer.flush();
        }
    }
}
