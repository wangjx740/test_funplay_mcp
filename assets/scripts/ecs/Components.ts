import { Main } from '../core/MainGame';

/** 对应 `component.js` 的所有组件。 */

export class Message {
    public _name = 'Message';
    private _message: string[] = [];
    private _modeline = '';

    public getMessage() { return this._message; }
    public getModeline() { return this._modeline; }
    public setModeline(text: string) { this._modeline = text; }
    public pushMsg(text: string) { this._message.push(text); }
}

export class Seed {
    public _name = 'Seed';
    private _seed: number | null = null;
    private _printSeed: string | null = null;

    public getSeed() { return this._seed; }
    public getPrintSeed() { return this._printSeed; }

    public setSeed(seed?: number | string) {
        if (!seed) {
            this._seed = Math.floor((Math.random() * 9 + 1) * Math.pow(10, 9));
            this._printSeed = this._seed.toString();
        } else {
            // 手动设置种子时去掉开头的 `#`。
            this._seed = Number.parseInt(
                seed.toString().replace(/^#{0,1}(.+)$/, '$1'), 10);
            this._printSeed = seed.toString();
        }
        // 种子字符串中插入连字符。
        this._printSeed = this._printSeed!
            .replace(/^(#{0,1}\d{5})(\d{5})$/, '$1-$2');
    }
}

export class Dungeon {
    public _name = 'Dungeon';
    private _width: number;
    private _height: number;
    private _padding = 1;
    private _hasFov = true;
    private _terrain = new Map<string, number>();
    private _memory: string[] = [];
    private _floorArea = [55, 65];

    constructor() {
        this._width = Main.UI.dungeon.getWidth() - 2;
        this._height = Main.UI.dungeon.getHeight() - 2;
    }

    public getWidth() { return this._width; }
    public getHeight() { return this._height; }
    public getPadding() { return this._padding; }
    public getFov() { return this._hasFov; }
    public getTerrain() { return this._terrain; }
    public getMemory() { return this._memory; }
    public getFloorArea() { return this._floorArea; }

    public setFov() { this._hasFov = !this._hasFov; }
    public setMemory(memory: string[]) { this._memory = memory; }
}

export class BossFight {
    public _name = 'BossFight';
    private _progress = ['inactive', 'active', 'win'];
    private _bossFight = this._progress[0];
    private _dungeonLevel = 1;
    private _maxDungeonLevel = 3;
    private _miniBossAppear = 0;

    public getBossFightStatus() { return this._bossFight; }
    public getDungeonLevel() { return this._dungeonLevel; }

    public goToNextBossFightStage() {
        const nextIndex = Math.min(
            this._progress.indexOf(this._bossFight) + 1,
            this._progress.length - 1);
        this._bossFight = this._progress[nextIndex];
    }

    public getNextDungeonLevel() {
        return Math.min(this._dungeonLevel + 1, this._maxDungeonLevel);
    }

    public setDungeonLevel(level: number) { this._dungeonLevel = level; }

    public getMiniBossAppear() { return this._miniBossAppear; }
    public setMiniBossAppear() { this._miniBossAppear += 1; }
}

export class Display {
    public _name = 'Display';
    private _character: string;
    private _color = new Map<string, string>();

    constructor(char: string, color?: string, onlyOneColor?: boolean) {
        this._character = char;
        this._color.set('default', color || 'white');

        if (onlyOneColor) {
            this._color.set('orb', this._color.get('default')!);
            this._color.set('downstairs', this._color.get('default')!);
        } else {
            this._color.set('orb', 'green');
            this._color.set('downstairs', 'orange');
        }
    }

    public getCharacter() { return this._character; }
    public getColor(color?: string) { return this._color.get(color || 'default'); }
    public getOrbColor() { return this._color.get('orb'); }
    public getDownstairsColor() { return this._color.get('downstairs'); }
    public setColor(key: string, value: string) { this._color.set(key, value); }
}

export class Position {
    public _name = 'Position';
    private _x: number | null;
    private _y: number | null;
    private _range: number;

    constructor(range?: number, x?: number, y?: number) {
        this._x = x === undefined ? null : x;
        this._y = y === undefined ? null : y;
        this._range = range || 0;
    }

    public getX() { return this._x; }
    public getY() { return this._y; }
    public getRange() { return this._range; }
    public setX(pos: number | null) { this._x = pos; }
    public setY(pos: number | null) { this._y = pos; }
}

export class ActionDuration {
    public _name = 'ActionDuration';
    private _duration = new Map<string, number>();

    constructor() {
        this._duration.set('base', 1);
    }

    public getDuration(action?: string) {
        return this._duration.get(action || 'base');
    }
    public setDuration(key: string, value: number) { this._duration.set(key, value); }
}

export class Inventory {
    public _name = 'Inventory';
    private _inventory: string[] = [];
    private _capacity: number;
    private _isDead = false;
    private _curse = 0;

    constructor(capacity?: number, firstItem?: string) {
        this._capacity = capacity || 1;
        if (firstItem) {
            this._inventory.push(firstItem);
        }
    }

    public getInventory(index?: number) {
        if (index !== undefined && this._inventory[index]) {
            return this._inventory[index];
        }
        return this._inventory;
    }
    public getLength() { return this._inventory.length; }
    public getCapacity() { return this._capacity; }

    public getLastOrb() {
        const index = this.getLastIndex();
        if (index > -1) { return this._inventory[index]; }
        return null;
    }

    public getLastIndex() {
        return Math.min(this._inventory.length - 1, this._capacity - this._curse - 1);
    }

    public getIsDead() { return this._isDead; }

    public isEnhanced() {
        if (this._inventory.length > 1) {
            return this._inventory[this._inventory.length - 1]
                === this._inventory[this._inventory.length - 2];
        }
        return false;
    }

    public addItem(item: string) {
        if (item && this._inventory.length < this._capacity) {
            this._inventory.push(item);
        }
    }

    public removeItem(amount: number) {
        const count = Math.min(amount, this._inventory.length);
        for (let i = 0; i < count - 1; i++) {
            this._inventory.pop();
        }
        return this._inventory.pop();
    }

    public setIsDead(status: boolean) { this._isDead = status; }

    public getCurse() { return this._curse; }

    public setCurse(addOrRemove: number) {
        this._curse = Math.min(
            Math.floor(this._capacity / 2),
            Math.max(0, this._curse + addOrRemove)
        );
    }

    public canBeCursed() {
        return this._curse < Math.floor(this._capacity / 2);
    }
}

export class HitPoint {
    public _name = 'HitPoint';
    private _hitPoint: number;

    constructor(hp: number) { this._hitPoint = hp; }

    public getHitPoint() { return this._hitPoint; }
    public takeDamage(damage: number) { this._hitPoint -= damage; }
    public isDead() { return this._hitPoint <= 0; }
}

export class Damage {
    public _name = 'Damage';
    private _damage = new Map<string, number>();
    private _curse: number;

    constructor(baseDamage?: number, curse?: number) {
        this._damage.set('base', baseDamage || 1);
        this._curse = curse || 0;
    }

    public getDamage(attackType?: string) {
        return this._damage.get(attackType || 'base');
    }
    public getCurse() { return this._curse; }
    public setDamage(attackType: string, damage: number) {
        this._damage.set(attackType, damage);
    }
    public setCurse(value: number) { this._curse = value; }
}

export class AttackRange {
    public _name = 'AttackRange';
    private _range = new Map<string, number>();

    constructor(baseRange?: number) {
        if (baseRange) { this._range.set('base', baseRange); }
    }

    public getRange(rangeKey?: string) {
        return this._range.get(rangeKey || 'base');
    }
    public setRange(rangeKey: string, rangeValue: number) {
        this._range.set(rangeKey, rangeValue);
    }
}

export class DropRate {
    public _name = 'DropRate';
    private _dropRate = new Map<string, number>([
        ['base', 20],
        ['fire', 100],
        ['ice', 60],
        ['lump', 60],
        ['nuke', 100]
    ]);

    public getDropRate(attackType: string) {
        return this._dropRate.get(attackType);
    }
}

export class Memory {
    public _name = 'Memory';
    private _hasSeen = false;

    public getHasSeen() { return this._hasSeen; }
    public setHasSeen(status: boolean) { this._hasSeen = status; }
}

export class CombatRole {
    public _name = 'CombatRole';
    private _combatRoles = new Map<string, any>();

    constructor(isCautious?: boolean, hasExtendRange?: boolean) {
        this._combatRoles.set('cautious', isCautious);
        this._combatRoles.set('extendRange', hasExtendRange);
    }

    public getCautious() { return this._combatRoles.get('cautious'); }
    public getExtendRange() { return this._combatRoles.get('extendRange'); }
    public getRole(role: string) { return this._combatRoles.get(role); }
    public setRole(role: string, boolValue: any) { this._combatRoles.set(role, boolValue); }
}

export class FastMove {
    public _name = 'FastMove';
    private _maxStep = 5;
    private _step = this._maxStep;
    private _direction: string | null = null;

    public getStep() { return this._step; }
    public getDirection() { return this._direction; }
    public reduceStep() { this._step -= 1; }
    public resetStep() { this._step = this._maxStep; }
    public clearStep() { this._step = 0; }
    public setDirection(direction: string) { this._direction = direction; }
}

export class Achievement {
    public _name = 'Achievement';
    private _achievement = new Map<string, boolean>();

    private _noExamine = true;
    private _boss3Special = true;
    private _boss4Special: string[] = [];

    constructor() {
        this._achievement.set('noExamine', false);
        this._achievement.set('unlockAll', false);
        this._achievement.set('boss1Normal', false);
        this._achievement.set('boss1Special', false);
        this._achievement.set('boss2Normal', false);
        this._achievement.set('boss3Normal', false);
        this._achievement.set('boss3Special', false);
        this._achievement.set('boss4Normal', false);
        this._achievement.set('boss4Special', false);
    }

    public getAchievement(id?: string) {
        if (id && this._achievement.has(id)) {
            return this._achievement.get(id);
        }
        return this._achievement;
    }

    public setAchievement(key: string, value: boolean) {
        if (key && this._achievement.has(key)) {
            this._achievement.set(key, value);
        }
    }

    public resetAchievement() {
        for (const keyValue of this._achievement) {
            this._achievement.set(keyValue[0], false);
        }
    }

    public getNoExamine() { return this._noExamine; }
    public setNoExamine(status: boolean) { this._noExamine = status; }
    public getBoss3Special() { return this._boss3Special; }
    public setBoss3Special(status: boolean) { this._boss3Special = status; }
    public getBoss4Special() { return this._boss4Special; }

    public setBoss4Special(attackType: string) {
        if (this._boss4Special.push(attackType) > 3) {
            this._boss4Special.shift();
        }
    }

    public clearBoss4Special() { this._boss4Special = []; }
}

Main.Component.Message = Message;
Main.Component.Seed = Seed;
Main.Component.Dungeon = Dungeon;
Main.Component.BossFight = BossFight;
Main.Component.Display = Display;
Main.Component.Position = Position;
Main.Component.ActionDuration = ActionDuration;
Main.Component.Inventory = Inventory;
Main.Component.HitPoint = HitPoint;
Main.Component.Damage = Damage;
Main.Component.AttackRange = AttackRange;
Main.Component.DropRate = DropRate;
Main.Component.Memory = Memory;
Main.Component.CombatRole = CombatRole;
Main.Component.FastMove = FastMove;
Main.Component.Achievement = Achievement;
