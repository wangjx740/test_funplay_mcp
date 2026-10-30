/**
 * 全局命名空间 Main —— 对应源工程 `main.js` 的 `Main` 对象。
 * 所有模块都挂在这个对象上，保持与源工程 1:1 的调用风格。
 */
export const Main: any = {};

// ================================================
// 版本号、开发开关、种子与颜色
// ================================================

Main._version = '0.3.0';
Main._develop = false;
// 手动测试种子，例如 '#12345'。
Main._devSeed = undefined;

Main.getVersion = function () { return this._version; };
Main.getDevelop = function () { return this._develop; };

Main.setDevelop = function () { this._develop = !this._develop; };

Main.getDevSeed = function () { return this._devSeed; };

Main._color = new Map();
Main._color.set('white', '#ABB2BF');
Main._color.set('black', '#262626');
Main._color.set('grey', '#666666');
Main._color.set('orange', '#FF9900');
Main._color.set('green', '#A0D86C');

Main.getColor = function (color: string) {
    if (Main._color.get(color)) {
        return Main._color.get(color);
    }
    return color;
};

Main._log = {
    seedPrinted: false,
    msgPrinted: false,
    floor: null,
    cycle: null,
    retry: [],
    enemyCount: null,
    enemyComposition: []
};

// ==============
// 实体存储
// ==============

Main.entities = new Map();
// Key: ID, value: object。
Main.entities.set('npc', new Map());
Main.entities.set('orb', new Map());

Main.getEntity = function (id: string) { return Main.entities.get(id); };

// ==============
// 各层命名空间
// ==============

Main.Component = {};
Main.entity = {};
Main.system = {};
Main.screens = {};
Main.text = {};
Main.input = {};
Main.UI = {};

// 由 GameRoot 赋值的渲染器（对应源工程的 Main.display）。
Main.display = null;
