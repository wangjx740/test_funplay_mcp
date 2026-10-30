import { Main } from '../core/MainGame';

/**
 * 对应源工程 `screenLayout.js`：只保留坐标与尺寸，不再创建 ROT.Display。
 */
class UIBlock {
    public _width: number | null;
    public _height: number | null;
    public _x: number | null = null;
    public _y: number | null = null;

    constructor(width?: number | null, height?: number | null) {
        this._width = width || null;
        this._height = height || null;
    }

    public getWidth() { return this._width; }
    public getHeight() { return this._height; }
    public getX() { return this._x; }
    public getY() { return this._y; }
}

Main.UI = UIBlock;

Main.UI.canvas = new UIBlock(70, 26);

// ===============
// 主屏幕
// ===============

Main.UI.padTopBottom = 0.5;
Main.UI.padLeftRight = 1;
Main.UI.padModeStatus = 1;
Main.UI.padModeMessage = 0;
Main.UI.padMessageDungeon = 1;

const canvas = Main.UI.canvas;

Main.UI.status = new UIBlock(13, null);
Main.UI.status._height = canvas.getHeight() - Main.UI.padTopBottom * 2;
Main.UI.status._x = canvas.getWidth()
    - Main.UI.padLeftRight
    - Main.UI.status.getWidth();
Main.UI.status._y = Main.UI.padTopBottom;

Main.UI.modeline = new UIBlock(null, 1);
Main.UI.modeline._width = canvas.getWidth()
    - Main.UI.padLeftRight * 2
    - Main.UI.padModeStatus
    - Main.UI.status.getWidth();
Main.UI.modeline._x = Main.UI.padLeftRight;
Main.UI.modeline._y = canvas.getHeight()
    - Main.UI.padTopBottom
    - Main.UI.modeline.getHeight();

Main.UI.message = new UIBlock(Main.UI.modeline.getWidth(), 5);
Main.UI.message._x = Main.UI.modeline.getX();
Main.UI.message._y = Main.UI.modeline.getY()
    - Main.UI.padModeMessage
    - Main.UI.message.getHeight();

Main.UI.dungeon = new UIBlock(Main.UI.modeline.getWidth(), null);
Main.UI.dungeon._height = canvas.getHeight()
    - Main.UI.padTopBottom
    - Main.UI.padMessageDungeon
    - Main.UI.padModeMessage
    - Main.UI.modeline.getHeight()
    - Main.UI.message.getHeight();
// 地牢尺寸必须是整数。
Main.UI.dungeon._height = Math.floor(Main.UI.dungeon._height);
Main.UI.dungeon._x = Main.UI.padLeftRight;
Main.UI.dungeon._y = Main.UI.padTopBottom;

// ============================
// 主屏幕内的 UI 区块
// ============================

Main.UI.level = new UIBlock(Main.UI.status.getWidth(), 1);
Main.UI.level._x = Main.UI.status.getX();
Main.UI.level._y = Main.UI.status.getY() + 2;

Main.UI.hitpoint = new UIBlock(Main.UI.status.getWidth(), 1);
Main.UI.hitpoint._x = Main.UI.status.getX();
Main.UI.hitpoint._y = Main.UI.level.getY() + 1.5;

Main.UI.power = new UIBlock(Main.UI.status.getWidth(), 6);
Main.UI.power._x = Main.UI.status.getX();
Main.UI.power._y = Main.UI.hitpoint.getY() + 1.5;

Main.UI.ground = new UIBlock(Main.UI.status.getWidth(), 1);
Main.UI.ground._x = Main.UI.status.getX();
Main.UI.ground._y = Main.UI.power.getY() + Main.UI.power.getHeight() + 1.5;

// 5 种普通敌人，最多 3 个 Boss。
Main.UI.enemy = new UIBlock(Main.UI.status.getWidth(), 8);
Main.UI.enemy._x = Main.UI.status.getX();
Main.UI.enemy._y = Main.UI.ground.getY() + 1.5;

Main.UI.help = new UIBlock(Main.UI.status.getWidth(), 1);
Main.UI.help._x = Main.UI.status.getX();
Main.UI.help._y = Main.UI.status.getY() + Main.UI.status.getHeight() - 2.5;

// ====================
// 过场画面
// ====================

Main.UI.cutScene = new UIBlock(
    canvas.getWidth() - 6 * 2,
    canvas.getHeight() - 3 * 2
);
Main.UI.cutScene._x = 6;
Main.UI.cutScene._y = 3;

// ===================================
// 成就画面的 UI 区块
// ===================================

Main.UI.achievementLeft = new UIBlock(26, Main.UI.cutScene.getHeight());
Main.UI.achievementLeft._x = Main.UI.cutScene.getX();
Main.UI.achievementLeft._y = Main.UI.cutScene.getY();

Main.UI.achievementMiddle = new UIBlock(1.5, Main.UI.cutScene.getHeight());
Main.UI.achievementMiddle._x = Main.UI.cutScene.getX()
    + Main.UI.achievementLeft.getWidth();
Main.UI.achievementMiddle._y = Main.UI.cutScene.getY();

Main.UI.achievementRight = new UIBlock(
    Main.UI.cutScene.getWidth()
    - Main.UI.achievementLeft.getWidth()
    - Main.UI.achievementMiddle.getWidth(),
    Main.UI.cutScene.getHeight()
);
Main.UI.achievementRight._x = Main.UI.cutScene.getX()
    + Main.UI.achievementLeft.getWidth()
    + Main.UI.achievementMiddle.getWidth();
Main.UI.achievementRight._y = Main.UI.cutScene.getY();
