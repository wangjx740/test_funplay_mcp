import { Main } from '../core/MainGame';
import { input, Input, EventKeyboard, game } from 'cc';

/**
 * 对应源工程 `keyInput.js`：按键表、getAction 与事件监听。
 * 监听层从浏览器 `keydown` 改为 Cocos 的 `input.on(Input.EventType.KEY_DOWN)`，
 * 并把 KeyCode 归一化回源码使用的字符键名（如 'h'、'H'、'ArrowLeft'、' '）。
 */

Main.input.keybind = new Map();

// Keys that cannot be remapped by player
Main.input.keybind.set('fixed', new Map());
Main.input.keybind.get('fixed').set('yes', [' ']);
Main.input.keybind.get('fixed').set('no', ['Escape']);
Main.input.keybind.get('fixed').set('help', ['?']);
Main.input.keybind.get('fixed').set('seed', ['=']);
Main.input.keybind.get('fixed').set('achievement', ['a']);

// Development
Main.input.keybind.get('fixed').set('develop', ['~']);
Main.input.keybind.get('fixed').set('fov', [']']);
Main.input.keybind.get('fixed').set('turn', ['\\']);
Main.input.keybind.get('fixed').set('dummy', ['d']);
Main.input.keybind.get('fixed').set('teleport', ['0']);
Main.input.keybind.get('fixed').set('clearStorage', ['C']);

Main.input.keybind.get('fixed').set('addFire', ['1']);
Main.input.keybind.get('fixed').set('addIce', ['2']);
Main.input.keybind.get('fixed').set('addSlime', ['3']);
Main.input.keybind.get('fixed').set('addLump', ['4']);
Main.input.keybind.get('fixed').set('addArmor', ['5']);
Main.input.keybind.get('fixed').set('addNuke', ['6']);
Main.input.keybind.get('fixed').set('removeCurse', ['7']);
Main.input.keybind.get('fixed').set('addCurse', ['8']);
Main.input.keybind.get('fixed').set('removeOrb', ['-']);

// Movement
Main.input.keybind.set('move', new Map());
Main.input.keybind.get('move').set('left', ['h', 'ArrowLeft']);
Main.input.keybind.get('move').set('down', ['j', 'ArrowDown']);
Main.input.keybind.get('move').set('up', ['k', 'ArrowUp']);
Main.input.keybind.get('move').set('right', ['l', 'ArrowRight']);
Main.input.keybind.get('move').set('wait', ['z', '.']);

// Fast Movement
Main.input.keybind.set('fastMove', new Map());
Main.input.keybind.get('fastMove').set('left', ['H', 'ArrowLeft']);
Main.input.keybind.get('fastMove').set('down', ['J', 'ArrowDown']);
Main.input.keybind.get('fastMove').set('up', ['K', 'ArrowUp']);
Main.input.keybind.get('fastMove').set('right', ['L', 'ArrowRight']);

// Interaction
Main.input.keybind.set('interact', new Map());
Main.input.keybind.get('interact').set('examine', ['x']);
Main.input.keybind.get('interact').set('pickOrUse', [' ']);
Main.input.keybind.get('interact').set('next', ['n', 'o', 'PageDown']);
Main.input.keybind.get('interact').set('previous', ['p', 'i', 'PageUp']);

// ================
// 辅助函数
// ================

Main.input.getAction = function (keyInput: any, mode: string) {
    if (!mode) {
        if (Main.getDevelop()) {
            console.log('Undefined mode.');
        }
        return null;
    }

    for (const [key, value] of Main.input.keybind.get(mode)) {
        if (value.indexOf(keyInput.key) > -1) {
            return key;
        }
    }
    return null;
};

// Cocos 键盘监听：由 GameRoot 在启动时调用 installKeyboard() 安装一次。
Main.input._handler = null;
Main.input._shift = false;
Main.input._installed = false;

Main.input.listenEvent = function (event: string, handler: any) {
    handler = Main.screens[String(handler)]
        ? Main.screens[handler].keyInput
        : handler;

    switch (event) {
        case 'add':
            Main.input._handler = handler;
            break;
        case 'remove':
            if (Main.input._handler === handler) {
                Main.input._handler = null;
            }
            break;
    }
};

/**
 * 把 Cocos 的 KeyCode 归一化成源码里的按键字符串。
 * 字母按 Shift 状态区分大小写；方向键、空格、Esc、PgUp/PgDn 使用源码中的名字。
 */
Main.input.toKeyString = function (keyCode: number, shift: boolean) {
    switch (keyCode) {
        case 37: return 'ArrowLeft';
        case 38: return 'ArrowUp';
        case 39: return 'ArrowRight';
        case 40: return 'ArrowDown';
        case 33: return 'PageUp';
        case 34: return 'PageDown';
        case 27: return 'Escape';
        case 32: return ' ';
        case 8: return 'Backspace';
        case 13: return 'Enter';
        case 9: return 'Tab';
        case 45: return 'Insert';
        case 46: return 'Delete';
        // 数字键。
        case 48: return shift ? ')' : '0';
        case 49: return shift ? '!' : '1';
        case 50: return shift ? '@' : '2';
        case 51: return shift ? '#' : '3';
        case 52: return shift ? '$' : '4';
        case 53: return shift ? '%' : '5';
        case 54: return shift ? '^' : '6';
        case 55: return shift ? '&' : '7';
        case 56: return shift ? '*' : '8';
        case 57: return shift ? '(' : '9';
        // 符号键（浏览器 keyCode）。
        case 189: return shift ? '_' : '-';
        case 187: return shift ? '+' : '=';
        case 219: return shift ? '{' : '[';
        case 221: return shift ? '}' : ']';
        case 220: return shift ? '|' : '\\';
        case 186: return shift ? ':' : ';';
        case 188: return shift ? '<' : ',';
        case 190: return shift ? '>' : '.';
        case 191: return shift ? '?' : '/';
        case 192: return shift ? '~' : '`';
        case 222: return shift ? '"' : '\'';
    }

    // A-Z：65-90。
    if (keyCode >= 65 && keyCode <= 90) {
        const letter = String.fromCharCode(keyCode);
        return shift ? letter : letter.toLowerCase();
    }

    return '';
};

// Cocos 3.8 的 KeyCode 里右 Shift 是 2000（左 Shift 是 16），两者都要跟踪。
const SHIFT_KEY_CODES = [16, 2000];

Main.input._onKeyDown = function (event: EventKeyboard) {
    const keyCode = event.keyCode as unknown as number;

    if (SHIFT_KEY_CODES.indexOf(keyCode) > -1) {
        Main.input._shift = true;
        return;
    }

    const keyString = Main.input.toKeyString(keyCode, Main.input._shift);
    if (!keyString) {
        return;
    }

    const fakeEvent = { key: keyString, shiftKey: Main.input._shift };

    if (Main.input._handler) {
        Main.input._handler(fakeEvent);
    }
};

Main.input._onKeyUp = function (event: EventKeyboard) {
    const keyCode = event.keyCode as unknown as number;

    if (SHIFT_KEY_CODES.indexOf(keyCode) > -1) {
        Main.input._shift = false;
    }
};

Main.input.installKeyboard = function () {
    if (Main.input._installed) {
        return;
    }
    Main.input._installed = true;

    input.on(Input.EventType.KEY_DOWN, Main.input._onKeyDown);
    input.on(Input.EventType.KEY_UP, Main.input._onKeyUp);

    // 浏览器预览下键盘监听挂在 canvas 上（pal/input/web/keyboard-input.js），
    // 启动后主动聚焦 canvas，避免用户首次按键被页面/编辑器抢走焦点。
    const canvas = game.canvas;
    if (canvas && canvas.focus) {
        canvas.focus();
    }
};
