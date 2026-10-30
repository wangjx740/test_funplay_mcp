import { Main } from '../core/MainGame';
import { RotRng } from '../vendor/RotRng';

/**
 * 对应 `system.js`：生成、放置、移动、攻击、拾取、下楼、FOV、镜头等逻辑。
 * 逻辑 1:1 迁移，仅把 ROT.* 换成 vendor 实现。
 */

Main.system = Main.system || {};

Main.system.isFloor = function (x: number, y: number) {
    return Main.getEntity('dungeon').Dungeon.getTerrain().get(x + ',' + y) === 0;
};

Main.system.placeActor = function (
    actor: any,
    notQualified: any,
    forbidden?: any,
    isElite?: boolean
) {
    let x: number = null as any;
    let y: number = null as any;
    let retry = 0;
    // 兜底：重试上限 200（原先 999 次配合 FOV 判定会造成数秒假死），
    // 超限改为线性扫描第一个合法格，保证一定能落位。见方案文档 14.4 第 3 条。
    const maxRetry = 200;

    do {
        x = Math.floor(Main.getEntity('dungeon').Dungeon.getWidth()
            * RotRng.getUniform());
        y = Math.floor(Main.getEntity('dungeon').Dungeon.getHeight()
            * RotRng.getUniform());
        retry++;
    } while (notQualified(x, y, forbidden, isElite) && retry < maxRetry);

    if (retry > 10) {
        Main._log.retry.push(actor.getEntityName() + ': ' + retry);
    }

    if (retry >= maxRetry) {
        const fallback = fallbackPosition();
        if (!fallback) {
            console.warn('[place] no valid cell for ' + actor.getEntityName());
            return false;
        }
        x = fallback[0];
        y = fallback[1];
    }

    actor.Position.setX(x);
    actor.Position.setY(y);
    return true;

    function fallbackPosition() {
        const width = Main.getEntity('dungeon').Dungeon.getWidth();
        const height = Main.getEntity('dungeon').Dungeon.getHeight();
        for (let yy = 0; yy < height; yy++) {
            for (let xx = 0; xx < width; xx++) {
                if (!notQualified(xx, yy, forbidden, isElite)) {
                    return [xx, yy];
                }
            }
        }
        return null;
    }
};

Main.system.verifyPCPosition = function (x: number, y: number) {
    return !Main.system.isFloor(x, y)
        || x < Main.getEntity('pc').Position.getRange()
        || x > Main.getEntity('dungeon').Dungeon.getWidth()
        - Main.getEntity('pc').Position.getRange()
        || y < Main.getEntity('pc').Position.getRange()
        || y > Main.getEntity('dungeon').Dungeon.getHeight()
        - Main.getEntity('pc').Position.getRange();
};

Main.system.verifyOrbPosition = function (x: number, y: number) {
    return !Main.system.isFloor(x, y)
        || Main.system.getDistance([x, y], Main.getEntity('pc')) <= 2
        || Main.system.downstairsHere(x, y)
        || Main.system.orbHere(x, y);
};

Main.system.npcIsTooDense = function (x: number, y: number) {
    const surround = Main.system.getSurroundPosition(x, y, 1);
    let count = 0;

    for (let i = 0; i < surround.length; i++) {
        if (Main.system.npcHere(surround[i][0], surround[i][1])) {
            count++;
        }
    }
    return count > 0;
};

Main.system.verifyEnemyPosition = function (
    x: number, y: number, pcSight: string[], isElite: boolean
) {
    return !Main.system.isFloor(x, y)
        || tooClose(x, y)
        || tooMany(x, y)
        || Main.system.npcIsTooDense(x, y)
        || Main.system.npcHere(x, y);

    function tooClose(x: number, y: number) {
        const isInsight = pcSight.indexOf(x + ',' + y) > -1;
        const distance = isElite ? 8 : 3;
        const isTooClose = Main.system.getDistance([x, y], Main.getEntity('pc'))
            <= distance;
        return isInsight && isTooClose;
    }

    function tooMany(x: number, y: number) {
        let number = 0;
        const extendRange = 12;

        if (pcSight.indexOf(x + ',' + y) > -1) {
            const countEnemies = Main.system.countEnemiesInSight(extendRange);
            countEnemies.forEach((value: number) => { number += value; });
        }
        return number > 2;
    }
};

Main.system.verifyButcherPosition = function (x: number, y: number) {
    return !Main.system.isFloor(x, y)
        || Main.system.getDistance([x, y], Main.getEntity('pc'))
        < Main.getEntity('pc').Position.getRange() * 3;
};

Main.system.verifyDownstairsPosition = function (x: number, y: number) {
    return !Main.system.isFloor(x, y)
        || Main.system.pcHere(x, y)
        || floorInSight(x, y) < 36;

    function floorInSight(x: number, y: number) {
        let floor = 0;
        Main.getEntity('dungeon').fov.compute(
            x, y,
            Main.getEntity('downstairs').Position.getRange(),
            (positionX: number, positionY: number) => {
                if (Main.system.isFloor(positionX, positionY)) { floor++; }
            });
        return floor;
    }
};

Main.system.placeBoss = function (observer: any, target: any, distance: number) {
    let inSight = Main.system.getActorSight(observer, 3);
    let x: number = null as any;
    let y: number = null as any;

    inSight = inSight.filter((position: string) => {
        x = Number.parseInt(position.split(',')[0], 10);
        y = Number.parseInt(position.split(',')[1], 10);
        return Main.system.isFloor(x, y)
            && !Main.system.npcHere(x, y)
            && !Main.system.pcHere(x, y)
            && Main.system.getDistance(target, [x, y]) > distance;
    });

    let newPosition = inSight[
        Math.floor(inSight.length * RotRng.getUniform())];
    let newX = Number.parseInt(newPosition.split(',')[0], 10);
    let newY = Number.parseInt(newPosition.split(',')[1], 10);
    return [newX, newY];
};

Main.system.createOrbs = function () {
    const loop = Main.getEntity('gameProgress').BossFight.getDungeonLevel() > 1
        ? 2 : 3;
    const orbsInherited = Main.system.loadOrbsOnTheGround();

    for (let i = 0; i < loop; i++) {
        Main.entity.orb('fire');
        Main.entity.orb('ice');
        Main.entity.orb('slime');
        Main.entity.orb('lump');
    }

    orbsInherited.forEach((orb: string) => { Main.entity.orb(orb); });
};

Main.system.createEnemies = function () {
    const enemyAmount = amount();
    const enemyType = type(Main.getEntity('gameProgress')
        .BossFight.getDungeonLevel());
    const elite: any[] = [];
    const grunt: any[] = [];

    for (let i = 0; i < enemyAmount[0]; i++) {
        elite.push(Main.entity[pickUp(enemyType[0])]());
    }

    for (let i = 1; i < enemyAmount.length; i++) {
        for (let j = 0; j < enemyAmount[i]; j++) {
            grunt.push(Main.entity[pickUp(enemyType[i])]());
        }
    }

    return [elite, grunt];

    function amount() {
        const total = 25 + Math.floor(6 * RotRng.getUniform());
        const lump = Math.ceil(total * 0.2);
        const fireAndIce = Math.ceil((total - lump) * 0.5);
        const slime = total - lump - fireAndIce;

        const fire = Math.floor(fireAndIce * percent());
        const ice = fireAndIce - fire;

        Main._log.enemyCount = total;
        Main._log.enemyComposition = [lump, fire, ice, slime];
        return Main._log.enemyComposition;
    }

    function percent() {
        return Math.floor(4 + 3 * RotRng.getUniform()) / 10;
    }

    function type(dungeonLevel: number) {
        let lump: string[] = [];
        let fire: string[] = [];
        let ice: string[] = [];
        let slime: string[] = [];

        switch (dungeonLevel) {
            case 1:
                lump = ['archer', 'zombie'];
                fire = ['dog'];
                ice = ['raven'];
                slime = ['rat'];
                break;
            case 2:
                lump = ['cultist'];
                fire = ['ratMan'];
                ice = ['wisp'];
                slime = ['rat'];
                break;
            case 3:
                lump = ['archer', 'zombie', 'cultist', 'cultist', 'cultist'];
                fire = ['dog', 'ratMan'];
                ice = ['raven', 'twinWisp'];
                slime = ['cursedRat'];
                break;
        }
        return [lump, fire, ice, slime];
    }

    function pickUp(enemyList: string[]) {
        if (enemyList.length > 1) {
            return enemyList[Math.floor(enemyList.length * RotRng.getUniform())];
        }
        return enemyList[0];
    }
};

Main.system.isPC = function (actor: any) {
    return actor.getID() === Main.getEntity('pc').getID();
};

Main.system.isMarker = function (checkThis: any) {
    return checkThis.getID() === Main.getEntity('marker').getID();
};

Main.system.isInSight = function (source: any, target: any) {
    const sight = Main.system.getActorSight(source);
    let targetX: number = null as any;
    let targetY: number = null as any;

    if (Array.isArray(target)) {
        targetX = target[0];
        targetY = target[1];
    } else {
        targetX = target.Position.getX();
        targetY = target.Position.getY();
    }

    return sight.indexOf(targetX + ',' + targetY) > -1;
};

Main.system.pcAct = function (this: any) {
    Main.getEntity('timer').engine.lock();

    if (this.CombatRole.getRole('isFrozen')) {
        this.CombatRole.setRole('isFrozen', false);
        Main.system.unlockEngine(1);
    } else if (this.FastMove.getStep() > 0) {
        Main.system.pcFastMove(false, this.FastMove.getDirection());
    } else if (Main.getEntity('gameProgress').BossFight.getMiniBossAppear() === 1) {
        Main.system.enterMiniBossCutScene();
    } else {
        Main.input.listenEvent('add', 'main');
    }
};

Main.system.pcTakeDamage = function (damage: number) {
    const pcIsDead = damage > Main.getEntity('pc').Inventory.getLength();

    Main.getEntity('pc').Inventory.removeItem(damage);
    Main.getEntity('pc').Inventory.setIsDead(pcIsDead);
    return pcIsDead;
};

Main.system.pcPickOrUse = function () {
    if (Main.system.downstairsHere(
        Main.getEntity('pc').Position.getX(),
        Main.getEntity('pc').Position.getY())
        && Main.getEntity('gameProgress').BossFight.getBossFightStatus()
        !== 'active') {
        Main.system.pcUseDownstairs();
    } else if (Main.system.orbHere(
        Main.getEntity('pc').Position.getX(),
        Main.getEntity('pc').Position.getY())
        && Main.getEntity('pc').Inventory.getLength()
        < Main.getEntity('pc').Inventory.getCapacity()
        - Main.getEntity('pc').Inventory.getCurse()) {
        Main.system.pcPickUpOrb();
    } else if (Main.getEntity('pc').Inventory.getLength() > 0
        && Main.getEntity('pc').Inventory.getLastOrb() !== 'armor') {
        Main.screens.setCurrentMode(Main.screens.main.getMode(2));
        Main.system.examineMode();
    }
};

Main.system.pcPickUpOrb = function () {
    const orbHere = Main.system.orbHere(
        Main.getEntity('pc').Position.getX(),
        Main.getEntity('pc').Position.getY());

    Main.getEntity('pc').Inventory.addItem(orbHere.getEntityName());

    Main.getEntity('message').Message.pushMsg(
        Main.text.pickUp(orbHere.getEntityName()));

    Main.getEntity('orb').delete(orbHere.getID());

    Main.system.unlockEngine(
        Main.getEntity('pc').ActionDuration.getDuration());
};

Main.system.pcUseDownstairs = function () {
    let position: number[] = [];

    switch (Main.getEntity('gameProgress').BossFight.getBossFightStatus()) {
        case 'inactive': {
            Main.input.listenEvent('remove', 'main');
            Main.screens.main.exit();

            Main.getEntity('gameProgress').BossFight.goToNextBossFightStage();

            position = Main.system.placeBoss(
                Main.getEntity('downstairs'), Main.getEntity('pc'), 2);

            let newActor: any = null;
            switch (Main.getEntity('gameProgress').BossFight.getDungeonLevel()) {
                case 1: newActor = Main.entity.gargoyle(position[0], position[1]); break;
                case 2: newActor = Main.entity.ghoul(position[0], position[1]); break;
                case 3: newActor = Main.entity.giovanni(position[0], position[1]); break;
            }
            Main.getEntity('timer').scheduler.add(newActor, true, 2);

            if (Main.getEntity('pc').Inventory.getCurse()
                >= Math.floor(Main.getEntity('pc').Inventory.getCapacity() / 2)) {
                Main.getEntity('pc').Inventory.setCurse(-1);
                Main.getEntity('message').Message.pushMsg(
                    Main.text.action('removeCurse'));
            }

            Main.screens.cutScene.enter();
            Main.input.listenEvent('add', 'cutScene');
            break;
        }
        case 'win':
            Main.input.listenEvent('remove', 'main');
            Main.system.checkAchNoExamine();

            if (Main.getEntity('gameProgress').BossFight.getDungeonLevel() < 3) {
                Main.system.saveDungeonLevel();
                Main.system.saveSeed();
                Main.system.saveInventory();
                Main.system.saveOrbsOnTheGround();

                Main.getEntity('message').Message.pushMsg(
                    Main.text.action('save'));
                Main.getEntity('message').Message.pushMsg(
                    Main.text.action('closeOrReload'));

                Main.display.clear();
                Main.screens.main.display();
            } else {
                Main.display.clear();
                Main.screens.main.exit();
                Main.screens.cutScene.enter(true);
            }
            break;
    }
};

Main.system.move = function (direction: string, who?: any) {
    const actor = who || Main.getEntity('pc');
    let x = actor.Position.getX();
    let y = actor.Position.getY();
    let newCoordinates: number[] = [];
    const duration = getDuration();
    const actorType = getActorType();
    let isMoveable = false;
    let npcHere: any = null;

    if (direction !== 'wait') {
        newCoordinates = Main.system.getNewCoordinates([x, y], direction);
        x = newCoordinates[0];
        y = newCoordinates[1];
    }

    if (direction === 'wait') {
        isMoveable = true;
    } else {
        npcHere = Main.system.npcHere(x, y);

        switch (actorType) {
            case 'pc':
                isMoveable = Main.system.isFloor(x, y)
                    && (!npcHere || npcHere.CombatRole.getRole('isBomb'));
                break;
            case 'npc':
                isMoveable = Main.system.isFloor(x, y)
                    && !Main.system.pcHere(x, y)
                    && !npcHere;
                break;
            case 'marker':
                isMoveable = Main.system.isInSight(Main.getEntity('pc'), [x, y]);
                break;
        }
    }

    if (isMoveable) {
        actor.Position.setX(x);
        actor.Position.setY(y);

        if (actorType === 'pc') {
            Main.input.listenEvent('remove', 'main');
        }
        if (actorType !== 'marker') {
            Main.system.unlockEngine(duration);
        }
    } else if (actorType === 'pc' && Main.system.npcHere(x, y)) {
        Main.system.pcAttack(Main.system.npcHere(x, y), 'base');
    }

    function getDuration() {
        return Main.system.isMarker(actor)
            ? null
            : actor.ActionDuration.getDuration('base');
    }

    function getActorType() {
        if (Main.system.isPC(actor)) { return 'pc'; }
        if (Main.system.isMarker(actor)) { return 'marker'; }
        return 'npc';
    }
};

Main.system.unlockEngine = function (duration: number) {
    Main.getEntity('timer').scheduler.setDuration(duration);
    Main.getEntity('timer').engine.unlock();

    // 兜底：泵内不再逐回合整屏重绘，只置脏标记，
    // 由 GameRoot.update 每帧统一重绘一次。见方案文档 14.4 第 5 条。
    Main._pendingRedraw = true;
};

Main.system.npcHere = function (x: number, y: number) {
    if (x >= 0 && y >= 0) {
        for (const keyValue of Main.getEntity('npc')) {
            if (x === keyValue[1].Position.getX()
                && y === keyValue[1].Position.getY()) {
                return keyValue[1];
            }
        }
    }
    return null;
};

Main.system.pcHere = function (x: number, y: number) {
    if (x >= 0 && y >= 0
        && x === Main.getEntity('pc').Position.getX()
        && y === Main.getEntity('pc').Position.getY()) {
        return Main.getEntity('pc');
    }
    return null;
};

Main.system.orbHere = function (x: number, y: number) {
    if (x >= 0 && y >= 0) {
        for (const keyValue of Main.getEntity('orb')) {
            if (x === keyValue[1].Position.getX()
                && y === keyValue[1].Position.getY()) {
                return keyValue[1];
            }
        }
    }
    return null;
};

Main.system.downstairsHere = function (x: number, y: number) {
    if (x >= 0 && y >= 0
        && x === Main.getEntity('downstairs').Position.getX()
        && y === Main.getEntity('downstairs').Position.getY()) {
        return Main.getEntity('downstairs');
    }
    return null;
};

Main.system.examineMode = function () {
    Main.input.listenEvent('remove', 'main');
    Main.input.listenEvent('add', examine);

    setOrRemoveMarker(true);
    return true;

    function examine(e: any) {
        if (Main.input.getAction(e, 'fixed') === 'no') {
            exitExamineOrAimMode(true);
        } else if (Main.input.getAction(e, 'move')) {
            Main.system.move(Main.input.getAction(e, 'move'),
                Main.getEntity('marker'));
        } else if (Main.input.getAction(e, 'interact') === 'next'
            || Main.input.getAction(e, 'interact') === 'previous') {
            lockTarget(Main.input.getAction(e, 'interact'));
        } else if (Main.input.getAction(e, 'interact') === 'pickOrUse') {
            useOrbInTheInventory();
        }

        setExModeLine();
        Main.display.clear();
        Main.screens.main.display();
    }

    function setOrRemoveMarker(setMarker: boolean) {
        if (setMarker) {
            Main.getEntity('marker').Position.setX(
                Main.getEntity('pc').Position.getX());
            Main.getEntity('marker').Position.setY(
                Main.getEntity('pc').Position.getY());

            if (Main.screens.getCurrentMode() === 'main') {
                Main.screens.setCurrentMode(Main.screens.main.getMode(1));
            }
        } else {
            Main.getEntity('marker').Position.setX(null);
            Main.getEntity('marker').Position.setY(null);
            Main.screens.setCurrentMode(Main.screens.main.getMode(0));
        }

        setExModeLine();
        Main.display.clear();
        Main.screens.main.display();
    }

    function exitExamineOrAimMode(addKey: boolean) {
        Main.input.listenEvent('remove', examine);
        if (addKey) {
            Main.input.listenEvent('add', 'main');
        }
        setOrRemoveMarker(false);
    }

    function lockTarget(who: string) {
        const left: any[] = [];
        const right: any[] = [];
        let lockIndex: number | null = null;

        Main.getEntity('npc').forEach((value: any) => {
            if (Main.system.getDistance(Main.getEntity('pc'), value)
                <= Main.getEntity('pc').Position.getRange()
                && Main.system.isInSight(Main.getEntity('pc'), value)) {
                if (value.Position.getX()
                    < Main.getEntity('pc').Position.getX()) {
                    left.push(value);
                } else {
                    right.push(value);
                }
            }
        });

        right.sort((a: any, b: any) => {
            if (a.Position.getX() !== b.Position.getX()) {
                return a.Position.getX() - b.Position.getX();
            }
            return a.Position.getY() - b.Position.getY();
        });

        left.sort((a: any, b: any) => {
            if (a.Position.getX() !== b.Position.getX()) {
                return -(a.Position.getX() - b.Position.getX());
            }
            return a.Position.getY() - b.Position.getY();
        });

        const targets = right.concat(left);
        if (targets.length < 1) { return false; }

        for (let i = 0; i < targets.length; i++) {
            if (Main.getEntity('marker').Position.getX()
                === targets[i].Position.getX()
                && Main.getEntity('marker').Position.getY()
                === targets[i].Position.getY()) {
                lockIndex = i;
                break;
            }
        }

        switch (who) {
            case 'next':
                if (lockIndex === null) {
                    lockIndex = 0;
                } else {
                    lockIndex = lockIndex + 1 > targets.length - 1
                        ? 0 : lockIndex + 1;
                }
                break;
            case 'previous':
                if (lockIndex === null) {
                    lockIndex = targets.length - 1;
                } else {
                    lockIndex = lockIndex - 1 < 0
                        ? targets.length - 1 : lockIndex - 1;
                }
                break;
        }

        Main.getEntity('marker').Position.setX(
            targets[lockIndex!].Position.getX());
        Main.getEntity('marker').Position.setY(
            targets[lockIndex!].Position.getY());
        return true;
    }

    function setExModeLine() {
        if (Main.screens.getCurrentMode() === 'examine') {
            Main.getEntity('message').Message.setModeline(
                Main.text.modeLine('examine'));
        } else if (Main.screens.getCurrentMode() === 'aim') {
            Main.getEntity('message').Message.setModeline(
                Main.text.modeLine('aim'));
        } else if (!Main.getEntity('pc').Inventory.getIsDead()) {
            Main.getEntity('message').Message.setModeline('');
        }
    }

    function useOrbInTheInventory() {
        const orb = Main.getEntity('pc').Inventory.getLastOrb();
        const npcHere = Main.system.npcHere(
            Main.getEntity('marker').Position.getX(),
            Main.getEntity('marker').Position.getY());
        const pcHere = Main.system.pcHere(
            Main.getEntity('marker').Position.getX(),
            Main.getEntity('marker').Position.getY());
        const markerPosition = [
            Main.getEntity('marker').Position.getX(),
            Main.getEntity('marker').Position.getY()
        ];

        let takeAction = false;

        if (Main.screens.getCurrentMode() === 'aim'
            && Main.system.insideOrbRange()) {
            switch (orb) {
                case 'fire':
                case 'lump':
                case 'nuke':
                    if (npcHere) {
                        takeAction = true;
                        Main.system.pcAttack(npcHere, orb);
                    }
                    break;
                case 'slime':
                    if (Main.system.isFloor(
                        Main.getEntity('marker').Position.getX(),
                        Main.getEntity('marker').Position.getY())
                        && !npcHere && !pcHere) {
                        takeAction = true;
                        Main.system.pcUseSlimeOrb(markerPosition[0], markerPosition[1]);
                    }
                    break;
                case 'ice':
                    takeAction = true;
                    Main.system.pcUseIceOrb();
                    break;
            }
        }

        if (takeAction) {
            exitExamineOrAimMode(false);
        }
    }
};

Main.system.getDistance = function (source: any, target: any) {
    let sourceX: number;
    let sourceY: number;
    let targetX: number;
    let targetY: number;

    if (Array.isArray(source)) {
        sourceX = source[0];
        sourceY = source[1];
    } else {
        sourceX = source.Position.getX();
        sourceY = source.Position.getY();
    }

    if (Array.isArray(target)) {
        targetX = target[0];
        targetY = target[1];
    } else {
        targetX = target.Position.getX();
        targetY = target.Position.getY();
    }

    return Math.max(Math.abs(sourceX - targetX), Math.abs(sourceY - targetY));
};

Main.system.insideOrbRange = function () {
    const orb = Main.getEntity('pc').Inventory.getLastOrb();
    return Main.system.getDistance(
        Main.getEntity('pc'), Main.getEntity('marker'))
        <= Main.getEntity('pc').AttackRange.getRange(orb);
};

Main.system.exitCutScene = function () {
    Main.input.listenEvent('remove', 'cutScene');
    Main.screens.cutScene.exit();

    if (Main.getEntity('pc')) {
        Main.screens.main.enter(true);
        Main.system.unlockEngine(
            Main.getEntity('pc').ActionDuration.getDuration());
    } else {
        Main.screens.main.enter(false);
    }

    Main.input.listenEvent('add', 'main');
};

Main.system.exitHelp = function () {
    Main.input.listenEvent('remove', 'help');
    Main.screens.help.exit();

    Main.screens.main.enter(true);
    Main.input.listenEvent('add', 'main');
};

Main.system.pcAttack = function (target: any, attackType: string) {
    let dropRate = 0;
    const lastOrb = Main.getEntity('pc').Inventory.getLastOrb();

    target.HitPoint.takeDamage(
        lastOrb === 'nuke'
            ? Main.getEntity('pc').Damage.getDamage('nuke')
            : Main.getEntity('pc').Damage.getDamage('base'));

    if (target.getEntityName() === 'ghoul' && attackType !== 'base') {
        Main.getEntity('gameProgress').Achievement.setBoss3Special(false);
    }
    if (target.getEntityName() === 'giovanni') {
        Main.system.checkAchBoss4Special(target, attackType);
    }

    if (target.HitPoint.isDead()
        && (target.getEntityName() !== 'giovanni'
            || target.getEntityName() === 'giovanni'
            && attackType === 'base' && lastOrb === 'armor')) {
        if (target.CombatRole.getRole('isBoss')) {
            dropRate = Main.getEntity('pc').DropRate.getDropRate('fire');
        } else if (attackType === 'base') {
            switch (lastOrb) {
                case 'armor':
                    dropRate = Main.getEntity('pc').DropRate.getDropRate('ice');
                    break;
                case 'nuke':
                    dropRate = Main.getEntity('pc').DropRate.getDropRate('nuke');
                    break;
                default:
                    dropRate = Main.getEntity('pc').DropRate.getDropRate('base');
                    break;
            }
        } else {
            dropRate = Main.getEntity('pc').DropRate.getDropRate(attackType);
        }

        Main.getEntity('message').Message.pushMsg(
            Main.text.killTarget(target));

        if (Main.getEntity('pc').Inventory.getCurse() > 0) {
            Main.getEntity('pc').Inventory.setCurse(-1);
            Main.getEntity('message').Message.pushMsg(
                Main.text.action('removeCurse'));
        }

        Main.system.npcActBeforeDeath(target);
        Main.system.npcDropOrb(target, dropRate);

        Main.getEntity('timer').scheduler.remove(target);
        Main.getEntity('npc').delete(target.getID());

        if (Main.system.bossIsDead(target)) {
            if (!target.CombatRole.getRole('isMiniBoss')) {
                Main.getEntity('gameProgress').BossFight
                    .goToNextBossFightStage();
            }
            Main.system.checkAchBossNormal(target);
            Main.system.checkAchBoss3Special(target);
        }

        if (target.getEntityName() === 'giovanni') {
            Main.getEntity('message').Message.pushMsg(
                Main.text.action('useDownstairs'));
        }
    } else {
        Main.getEntity('message').Message.pushMsg(
            Main.text.hitTarget(target));
    }

    if (target.getEntityName() === 'giovanni'
        && target.HitPoint.isDead()
        && (attackType !== 'base' || lastOrb !== 'armor')) {
        Main.system.reviveGiovanni(target);
    }

    Main.system.checkAchBoss1Special(target, attackType);

    Main.input.listenEvent('remove', 'main');
    Main.system.unlockEngine(
        Main.getEntity('pc').ActionDuration.getDuration());
};

Main.system.pcUseSlimeOrb = function (x: number, y: number) {
    Main.getEntity('pc').Position.setX(x);
    Main.getEntity('pc').Position.setY(y);

    Main.getEntity('message').Message.pushMsg(Main.text.action('teleport'));

    Main.system.unlockEngine(
        Main.getEntity('pc').ActionDuration.getDuration());
};

Main.system.pcUseIceOrb = function () {
    const cutIndex = Main.getEntity('pc').Inventory.getLastIndex();

    Main.getEntity('pc').Inventory.getInventory().splice(cutIndex, 1);
    Main.getEntity('pc').Inventory.getInventory().splice(
        cutIndex, 0, 'armor', 'armor');

    while (Main.getEntity('pc').Inventory.getInventory().length
        > Main.getEntity('pc').Inventory.getCapacity()) {
        Main.getEntity('pc').Inventory.getInventory().pop();
    }

    Main.getEntity('message').Message.pushMsg(Main.text.action('armor'));

    Main.system.unlockEngine(
        Main.getEntity('pc').ActionDuration.getDuration());
};

Main.system.npcDropOrb = function (actor: any, dropRate: number) {
    let orbID: string | null = null;
    const orbHere = Main.system.orbHere(
        actor.Position.getX(), actor.Position.getY());

    if (!Main.system.downstairsHere(
        actor.Position.getX(), actor.Position.getY())
        && RotRng.getPercentage() <= dropRate) {
        if (orbHere) {
            Main.getEntity('orb').delete(orbHere.getID());
        }

        orbID = Main.entity.orb(actor.Inventory.getInventory(0));

        Main.getEntity('orb').get(orbID).Position.setX(actor.Position.getX());
        Main.getEntity('orb').get(orbID).Position.setY(actor.Position.getY());

        Main.getEntity('message').Message.pushMsg(
            Main.text.targetDropOrb(actor, Main.getEntity('orb').get(orbID)));
    }
};

Main.system.printGenerationLog = function () {
    const labels = ['Lump: ', 'Fire: ', 'Ice: ', 'Slime: '];

    if (!Main._log.seedPrinted) {
        console.log('Seed: ' + Main.getEntity('seed').Seed.getSeed());
        Main._log.seedPrinted = true;
    }

    if (Main.getDevelop() && !Main._log.msgPrinted) {
        console.log('Cycle: ' + Main._log.cycle);
        console.log('Floor: ' + Main._log.floor + '%');
        console.log('Enemy: ' + Main._log.enemyCount);

        for (let i = 0; i < labels.length; i++) {
            console.log(labels[i] + Main._log.enemyComposition[i]);
        }

        if (Main._log.retry.length > 0) {
            console.log('==========');
            console.log('Retry:');
            Main._log.retry.forEach((value: string) => { console.log(value); });
        }

        Main._log.msgPrinted = true;
    }
};

Main.system.countEnemiesInSight = function (range?: number) {
    const pcSight = Main.system.getActorSight(
        Main.getEntity('pc'),
        range || Main.getEntity('pc').Position.getRange());
    const count = new Map<string, number>();

    Main.getEntity('npc').forEach((value: any) => {
        if (pcSight.indexOf(
            value.Position.getX() + ',' + value.Position.getY()) > -1) {
            const char = value.Display.getCharacter();
            if (count.get(char)) {
                count.set(char, count.get(char)! + 1);
            } else {
                count.set(char, 1);
            }
        }
    });

    return count;
};

Main.system.getActorSight = function (actor: any, range?: number) {
    const actorCanSee: string[] = [];

    Main.getEntity('dungeon').fov.compute(
        actor.Position.getX(),
        actor.Position.getY(),
        range || actor.Position.getRange(),
        (x: number, y: number) => { actorCanSee.push(x + ',' + y); }
    );

    return actorCanSee;
};

Main.system.bossIsDead = function (target: any) {
    let bossIsDead = true;

    if (target.CombatRole.getRole('isBoss')) {
        switch (target.getEntityName()) {
            case 'gargoyle':
            case 'juvenileGargoyle':
                Main.getEntity('npc').forEach((actor: any) => {
                    if (actor.getEntityName() === 'gargoyle'
                        || actor.getEntityName() === 'juvenileGargoyle') {
                        bossIsDead = false;
                    }
                });
                break;
        }
    } else {
        bossIsDead = false;
    }

    return bossIsDead;
};

Main.system.killAndTeleport = function () {
    Main.getEntity('npc').forEach((actor: any) => {
        Main.getEntity('timer').scheduler.remove(actor);
        Main.getEntity('npc').delete(actor.getID());
    });

    Main.getEntity('pc').Position.setX(
        Main.getEntity('downstairs').Position.getX());
    Main.getEntity('pc').Position.setY(
        Main.getEntity('downstairs').Position.getY());
};

Main.system.getNewCoordinates = function (currentPosition: number[], direction: string) {
    let x = currentPosition[0];
    let y = currentPosition[1];

    switch (direction) {
        case 'left': x -= 1; break;
        case 'right': x += 1; break;
        case 'up': y -= 1; break;
        case 'down': y += 1; break;
    }

    return [x, y];
};

Main.system.pcRememberTerrain = function () {
    const pcSight = Main.system.getActorSight(Main.getEntity('pc'));

    pcSight.forEach((position: string) => {
        if (Main.getEntity('dungeon').Dungeon.getMemory().indexOf(position) < 0) {
            Main.getEntity('dungeon').Dungeon.getMemory().push(position);
        }
        Main.getEntity('orb').forEach((orb: any) => {
            if (!orb.Memory.getHasSeen()
                && position === orb.Position.getX() + ',' + orb.Position.getY()) {
                orb.Memory.setHasSeen(true);
            }
        });
    });
};

Main.system.pcFastMove = function (initialize: boolean, direction: string) {
    const newPosition = Main.system.getNewCoordinates(
        [
            Main.getEntity('pc').Position.getX(),
            Main.getEntity('pc').Position.getY()
        ],
        direction
    );

    if (initialize) {
        Main.getEntity('pc').FastMove.resetStep();
        Main.getEntity('pc').FastMove.setDirection(direction);
    }

    if (Main.system.countEnemiesInSight().size === 0
        && Main.system.isFloor(newPosition[0], newPosition[1])
        && !Main.system.npcHere(newPosition[0], newPosition[1])) {
        Main.getEntity('pc').FastMove.reduceStep();
        Main.system.move(direction, Main.getEntity('pc'));
    } else {
        Main.getEntity('pc').FastMove.clearStep();
        Main.input.listenEvent('add', 'main');
    }
};

Main.system.showHelp = function () {
    Main.input.listenEvent('remove', 'main');
    Main.screens.main.exit();

    Main.screens.help.enter();
    Main.input.listenEvent('add', 'help');
};

Main.system.startRNG = function () {
    let newSeed = null;

    Main.getEntity('seed').Seed.setSeed(
        Main.system.loadSeed() || Main.getDevSeed());

    RotRng.setSeed(Main.getEntity('seed').Seed.getSeed());

    if (Main.getEntity('gameProgress').BossFight.getDungeonLevel() > 1) {
        for (let i = 0;
            i < Main.getEntity('gameProgress').BossFight.getDungeonLevel();
            i++) {
            newSeed = RotRng.getUniform();
        }
        RotRng.setSeed(newSeed * Math.pow(10, 8));
    }
};

Main.system.fillInventory = function () {
    if (Main.system.loadDungeonLevel() > 1) {
        Main.system.loadInventory().forEach((orb: string) => {
            Main.getEntity('pc').Inventory.addItem(orb);
        });
    } else {
        Main.getEntity('pc').Inventory.addItem('slime');
        Main.getEntity('pc').Inventory.addItem('armor');
        Main.getEntity('pc').Inventory.addItem('armor');
        Main.getEntity('pc').Inventory.addItem('fire');
        Main.getEntity('pc').Inventory.addItem('lump');
    }
};

Main.system.enterMiniBossCutScene = function () {
    Main.text.cutScene('miniBoss1').forEach((text: string) => {
        Main.getEntity('message').Message.pushMsg(text);
    });
    Main.getEntity('gameProgress').BossFight.setMiniBossAppear();

    Main.input.listenEvent('add', Main.system.miniBossCutSceneKeyInput);
};

Main.system.miniBossCutSceneKeyInput = function (e: any) {
    if (Main.input.getAction(e, 'fixed') === 'yes') {
        Main.input.listenEvent('remove', Main.system.miniBossCutSceneKeyInput);
        Main.input.listenEvent('add', 'main');

        Main.getEntity('message').Message.getMessage().pop();
        Main.getEntity('message').Message.pushMsg(
            Main.text.cutScene('miniBoss2'));

        Main.display.clear();
        Main.screens.main.display();
    }
};

Main.system.getSurroundPosition = function (x: number, y: number, range: number) {
    const surround: number[][] = [];

    for (let i = -range; i < range + 1; i++) {
        for (let j = -range; j < range + 1; j++) {
            if (i !== 0 || j !== 0) {
                surround.push([x + i, y + j]);
            }
        }
    }
    return surround;
};
