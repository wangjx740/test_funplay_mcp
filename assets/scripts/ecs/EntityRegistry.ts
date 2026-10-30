import { Main } from '../core/MainGame';
import { Factory } from './EntityFactory';
import { RotCellular } from '../vendor/RotCellular';
import { RotFov } from '../vendor/RotFov';
import { RotScheduler, TurnEngine } from '../vendor/RotScheduler';

/** 对应 `entity.js`：实体模板注册表。 */

Main.entity = {};

Main.entity.message = function () {
    const e = new Factory('message');
    e.addComponent(new Main.Component.Message());
    Main.entities.set('message', e);
};

Main.entity.seed = function () {
    const e = new Factory('seed');
    e.addComponent(new Main.Component.Seed());
    Main.entities.set('seed', e);
};

Main.entity.dungeon = function () {
    const e: any = new Factory('dungeon');
    e.addComponent(new Main.Component.Dungeon());

    // 兜底：地图生成最多重试 MAX_CYCLE 轮，超限取最接近 60% 的那一版。
    // 见方案文档 14.4 第 1 条。
    const MAX_CYCLE = 60;
    const targetFloor = 60;
    let cycle = 0;
    let bestTerrain: Map<string, number> = null;
    let bestDistance = Infinity;

    do {
        cellular();
        cycle++;
        const distance = Math.abs(floorArea() - targetFloor);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestTerrain = new Map(e.Dungeon.getTerrain());
        }
    } while ((floorArea() < e.Dungeon.getFloorArea()[0]
        || floorArea() > e.Dungeon.getFloorArea()[1])
        && cycle < MAX_CYCLE);

    if (cycle >= MAX_CYCLE
        && (floorArea() < e.Dungeon.getFloorArea()[0]
            || floorArea() > e.Dungeon.getFloorArea()[1])
        && bestTerrain) {
        console.warn('[dungeon] not converged after ' + cycle
            + ' cycles, fallback to best floor=' + (targetFloor - bestDistance));
        bestTerrain.forEach((value: number, key: string) => {
            e.Dungeon.getTerrain().set(key, value);
        });
    }

    Main._log.floor = floorArea();
    Main._log.cycle = cycle;

    e.light = function (x: number, y: number) {
        return e.Dungeon.getTerrain().get(x + ',' + y) === 0;
    };
    e.fov = new RotFov(e.light);

    Main.entities.set('dungeon', e);

    function cellular() {
        const cell = new RotCellular(
            e.Dungeon.getWidth(), e.Dungeon.getHeight());

        cell.randomize(0.5);
        for (let i = 0; i < 5; i++) { cell.create(); }
        cell.connect(function (x: number, y: number, wall: number) {
            e.Dungeon.getTerrain().set(x + ',' + y, wall);
        });
    }

    function floorArea() {
        let floor = 0;
        for (const keyValue of e.Dungeon.getTerrain()) {
            if (keyValue[1] === 0) { floor++; }
        }
        return Math.floor(
            floor / (e.Dungeon.getWidth() * e.Dungeon.getHeight()) * 100);
    }
};

Main.entity.gameProgress = function () {
    const e = new Factory('gameProgress');
    e.addComponent(new Main.Component.BossFight());
    e.addComponent(new Main.Component.Achievement());
    Main.entities.set('gameProgress', e);
};

Main.entity.pc = function () {
    const e: any = new Factory('pc');

    e.addComponent(new Main.Component.Position(5));
    e.addComponent(new Main.Component.Display('@'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(6));
    e.addComponent(new Main.Component.Damage(1));
    e.addComponent(new Main.Component.DropRate());
    e.addComponent(new Main.Component.AttackRange());
    e.addComponent(new Main.Component.FastMove());
    e.addComponent(new Main.Component.CombatRole(false));

    e.Display.setColor('die', 'grey');
    e.Damage.setDamage('nuke', 9);

    e.AttackRange.setRange('fire', 1);
    e.AttackRange.setRange('ice', 0);
    e.AttackRange.setRange('slime', 2);
    e.AttackRange.setRange('lump', 2);
    e.AttackRange.setRange('nuke', 5);

    e.act = Main.system.pcAct;

    Main.entities.set('pc', e);
};

Main.entity.dummy = function (x?: number, y?: number) {
    const e: any = new Factory('dummy');

    e.addComponent(new Main.Component.Position(5, x, y));
    e.addComponent(new Main.Component.Display('d'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'slime'));
    e.addComponent(new Main.Component.HitPoint(1));
    e.addComponent(new Main.Component.Damage(1));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.act = Main.system.dummyAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.rat = function (x?: number, y?: number) {
    const e: any = new Factory('rat');

    e.addComponent(new Main.Component.Position(5, x, y));
    e.addComponent(new Main.Component.Display('r'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'slime'));
    e.addComponent(new Main.Component.HitPoint(1));
    e.addComponent(new Main.Component.Damage(1));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.act = Main.system.dummyAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.dog = function (x?: number, y?: number) {
    const e: any = new Factory('dog');

    e.addComponent(new Main.Component.Position(7, x, y));
    e.addComponent(new Main.Component.Display('d'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'fire'));
    e.addComponent(new Main.Component.HitPoint(2));
    e.addComponent(new Main.Component.Damage(1));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.act = Main.system.dummyAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.raven = function (x?: number, y?: number) {
    const e: any = new Factory('raven');

    e.addComponent(new Main.Component.Position(5, x, y));
    e.addComponent(new Main.Component.Display('v'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'ice'));
    e.addComponent(new Main.Component.HitPoint(1));
    e.addComponent(new Main.Component.Damage(1));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(true));

    e.ActionDuration.setDuration('fastMove', 0.5);

    e.act = Main.system.dummyAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.zombie = function (x?: number, y?: number) {
    const e: any = new Factory('zombie');

    e.addComponent(new Main.Component.Position(5, x, y));
    e.addComponent(new Main.Component.Display('z'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'lump'));
    e.addComponent(new Main.Component.HitPoint(3));
    e.addComponent(new Main.Component.Damage(1));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.ActionDuration.setDuration('slowMove', 1.5);

    e.act = Main.system.dummyAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.archer = function (x?: number, y?: number) {
    const e: any = new Factory('archer');

    e.addComponent(new Main.Component.Position(5, x, y));
    e.addComponent(new Main.Component.Display('a'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'lump'));
    e.addComponent(new Main.Component.HitPoint(1));
    e.addComponent(new Main.Component.Damage(2));
    e.addComponent(new Main.Component.AttackRange(2));
    e.addComponent(new Main.Component.CombatRole(true));

    e.AttackRange.setRange('extend', 3);

    e.act = Main.system.dummyAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.gargoyle = function (x?: number, y?: number) {
    const e: any = new Factory('gargoyle');

    e.addComponent(new Main.Component.Position(9, x, y));
    e.addComponent(new Main.Component.Display('G'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'lump'));
    e.addComponent(new Main.Component.HitPoint(5));
    e.addComponent(new Main.Component.Damage(1));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.ActionDuration.setDuration('slowMove', 1.2);
    e.ActionDuration.setDuration('slowAttack', 1.2);
    e.Damage.setDamage('high', 2);
    e.AttackRange.setRange('extend', 2);
    e.CombatRole.setRole('isBoss', true);
    e.CombatRole.setRole('hasTail', true);
    e.CombatRole.setRole('hasSummoned', false);

    e.act = Main.system.gargoyleAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.juvenileGargoyle = function (x?: number, y?: number) {
    const e: any = new Factory('juvenileGargoyle');

    e.addComponent(new Main.Component.Position(9, x, y));
    e.addComponent(new Main.Component.Display('g'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'lump'));
    e.addComponent(new Main.Component.HitPoint(2));
    e.addComponent(new Main.Component.Damage(1));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.Damage.setDamage('high', 2);
    e.CombatRole.setRole('isBoss', true);
    e.CombatRole.setRole('hasTail', true);

    e.act = Main.system.gargoyleAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.marker = function () {
    const e = new Factory('marker');
    e.addComponent(new Main.Component.Position());
    e.addComponent(new Main.Component.Display('X', 'orange', true));
    Main.entities.set('marker', e);
};

Main.entity.downstairs = function () {
    const e = new Factory('downstairs');
    e.addComponent(new Main.Component.Position(5));
    e.addComponent(new Main.Component.Display('>', 'orange', true));
    Main.entities.set('downstairs', e);
};

Main.entity.timer = function () {
    const e: any = new Factory('timer');
    e.scheduler = new RotScheduler();
    e.engine = new TurnEngine(e.scheduler);
    Main.entities.set('timer', e);
};

Main.entity.orb = function (orbName: string) {
    const e: any = new Factory(orbName);
    let orbChar = '';

    switch (orbName) {
        case 'fire': orbChar = 'F'; break;
        case 'ice': orbChar = 'I'; break;
        case 'slime': orbChar = 'S'; break;
        case 'lump': orbChar = 'L'; break;
    }

    e.addComponent(new Main.Component.Position(0));
    e.addComponent(new Main.Component.Display(orbChar, 'green', true));
    e.addComponent(new Main.Component.Memory());

    Main.entities.get('orb').set(e.getID(), e);
    return e.getID();
};

Main.entity.wisp = function (x?: number, y?: number) {
    const e: any = new Factory('wisp');

    e.addComponent(new Main.Component.Position(5, x, y));
    e.addComponent(new Main.Component.Display('w'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'ice'));
    e.addComponent(new Main.Component.HitPoint(1));
    e.addComponent(new Main.Component.Damage(1, 1));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.ActionDuration.setDuration('fastMove', 0.6);

    e.act = Main.system.dummyAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.ratMan = function (x?: number, y?: number) {
    const e: any = new Factory('ratMan');

    e.addComponent(new Main.Component.Position(7, x, y));
    e.addComponent(new Main.Component.Display('m'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'fire'));
    e.addComponent(new Main.Component.HitPoint(2));
    e.addComponent(new Main.Component.Damage(1));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.ActionDuration.setDuration('slowMove', 1.2);
    e.AttackRange.setRange('extend', 2);

    e.act = Main.system.dummyAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.cultist = function (x?: number, y?: number) {
    const e: any = new Factory('cultist');

    e.addComponent(new Main.Component.Position(5, x, y));
    e.addComponent(new Main.Component.Display('c'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'lump'));
    e.addComponent(new Main.Component.HitPoint(2));
    e.addComponent(new Main.Component.Damage(1, 2));
    e.addComponent(new Main.Component.AttackRange(2));
    e.addComponent(new Main.Component.CombatRole(false));

    e.ActionDuration.setDuration('slowAttack', 1.2);
    e.CombatRole.setRole('curse', true);

    e.act = Main.system.dummyAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.butcher = function (x?: number, y?: number) {
    const e: any = new Factory('butcher');

    e.addComponent(new Main.Component.Position(5, x, y));
    e.addComponent(new Main.Component.Display('B'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'lump'));
    e.addComponent(new Main.Component.HitPoint(3));
    e.addComponent(new Main.Component.Damage(1));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.ActionDuration.setDuration('slowAttack', 1.2);
    e.ActionDuration.setDuration('slowMove', 1.2);

    e.AttackRange.setRange('pull', 2);
    e.Damage.setDamage('cleave', 2);

    e.CombatRole.setRole('playCutScene', false);
    e.CombatRole.setRole('isBoss', true);
    e.CombatRole.setRole('isMiniBoss', true);

    e.act = Main.system.butcherAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.ghoul = function (x?: number, y?: number) {
    const e: any = new Factory('ghoul');

    e.addComponent(new Main.Component.Position(7, x, y));
    e.addComponent(new Main.Component.Display('J'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'lump'));
    e.addComponent(new Main.Component.HitPoint(3));
    e.addComponent(new Main.Component.Damage(1));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.ActionDuration.setDuration('fastAttack', 0.4);
    e.AttackRange.setRange('bomb', 4);
    e.Damage.setDamage('maxBomb', 4);
    e.CombatRole.setRole('isBoss', true);

    e.act = Main.system.ghoulAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.timeBomb = function (x?: number, y?: number) {
    const e: any = new Factory('timeBomb');

    e.addComponent(new Main.Component.Position(5, x, y));
    e.addComponent(new Main.Component.Display('t'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'slime'));
    e.addComponent(new Main.Component.HitPoint(3));
    e.addComponent(new Main.Component.Damage(1));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.CombatRole.setRole('isBomb', true);

    e.act = Main.system.bombAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.cursedRat = function (x?: number, y?: number) {
    const e: any = new Factory('cursedRat');

    e.addComponent(new Main.Component.Position(5, x, y));
    e.addComponent(new Main.Component.Display('r'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'slime'));
    e.addComponent(new Main.Component.HitPoint(1));
    e.addComponent(new Main.Component.Damage(1, 1));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.act = Main.system.dummyAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.twinWisp = function (x?: number, y?: number) {
    const e: any = new Factory('twinWisp');

    e.addComponent(new Main.Component.Position(5, x, y));
    e.addComponent(new Main.Component.Display('w'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'ice'));
    e.addComponent(new Main.Component.HitPoint(1));
    e.addComponent(new Main.Component.Damage(1, 2));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.ActionDuration.setDuration('fastMove', 0.6);

    e.act = Main.system.dummyAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.hpBomb = function (x?: number, y?: number) {
    const e: any = new Factory('hpBomb');

    e.addComponent(new Main.Component.Position(5, x, y));
    e.addComponent(new Main.Component.Display('b'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'slime'));
    e.addComponent(new Main.Component.HitPoint(3));
    e.addComponent(new Main.Component.Damage(2));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.CombatRole.setRole('isBomb', true);

    e.act = Main.system.bombAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};

Main.entity.giovanni = function (x?: number, y?: number) {
    const e: any = new Factory('giovanni');

    e.addComponent(new Main.Component.Position(7, x, y));
    e.addComponent(new Main.Component.Display('V'));
    e.addComponent(new Main.Component.ActionDuration());
    e.addComponent(new Main.Component.Inventory(1, 'lump'));
    e.addComponent(new Main.Component.HitPoint(3));
    e.addComponent(new Main.Component.Damage(1));
    e.addComponent(new Main.Component.AttackRange(1));
    e.addComponent(new Main.Component.CombatRole(false));

    e.AttackRange.setRange('bomb', 5);
    e.Damage.setDamage('maxBomb', 4);
    e.CombatRole.setRole('isBoss', true);
    e.CombatRole.setRole('justRevived', false);

    e.act = Main.system.giovanniAct;
    Main.entities.get('npc').set(e.getID(), e);
    return e;
};
