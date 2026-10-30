import { Main } from '../core/MainGame';
import { RotRng } from '../vendor/RotRng';

/**
 * 对应源工程 `monsterAI.js` 的完整 1:1 移植。
 * 所有 act 函数都以实体自身作为 `this`，由 TurnEngine 调度执行。
 */

Main.system.dummyAct = function (this: any) {
    let approach = false;
    const moveDuration = this.ActionDuration.getDuration('slowMove')
        || this.ActionDuration.getDuration('fastMove')
        || this.ActionDuration.getDuration('base');
    const attackDuration = this.ActionDuration.getDuration('slowAttack')
        || this.ActionDuration.getDuration('fastAttack')
        || this.ActionDuration.getDuration('base');

    Main.getEntity('timer').engine.lock();

    if (Main.system.npcCannotSeePC(this)) {
        // 1-4: 搜索附近的 PC 或者等待 1 回合。
        Main.system.npcSearchOrWait(this, moveDuration);
    } else if (Main.system.pcIsInsideAttackRange(this)) {
        // 2a-4: 诅咒 PC。
        if (this.CombatRole.getRole('curse')
            && Main.getEntity('pc').Inventory.canBeCursed()
        ) {
            Main.system.npcCursePC(this, true, attackDuration);
        }
        // 2b-4: 攻击 PC。
        else {
            Main.system.pcTakeDamage(this.Damage.getDamage('base'));
            Main.system.npcHitOrKill(this, attackDuration);
        }
    } else {
        if (this.CombatRole.getCautious()) {
            // 谨慎的敌人不会轻易接近 PC。
            approach
                = !Main.system.pcIsInsideAttackRange(this)
                && Main.system.npcHasAlliesInCloseRange(this);
        } else {
            approach
                = !Main.system.pcIsInsideAttackRange(this);
        }

        if (approach) {
            // 3-4: 接近视野中的 PC。
            Main.system.npcMoveClose(this, moveDuration);
        } else {
            // 4-4: 包围 PC。
            Main.system.npcKeepDistance(
                this,
                moveDuration,
                // '3' 恰好超出 Lump Orb 的攻击范围。
                Math.max(3, this.AttackRange.getRange())
            );
        }
    }
};

Main.system.gargoyleAct = function (this: any) {
    let newActor = null;
    let newPosition = null;

    Main.getEntity('timer').engine.lock();

    // 1-3: 搜索附近的 PC 或者等待 1 回合。
    if (Main.system.npcCannotSeePC(this)) {
        Main.system.npcSearchOrWait(this, getMoveDuration(this));
    }
    // 2A-3: 召唤同伴。
    else if (this.getEntityName() === 'gargoyle'
        && !this.CombatRole.getRole('hasSummoned')
        && this.HitPoint.getHitPoint() < 3
    ) {
        newPosition = Main.system.placeBoss(this, this, 0);
        newActor = Main.entity.juvenileGargoyle(newPosition[0], newPosition[1]);
        Main.getEntity('timer').scheduler.add(newActor, true, 1);

        Main.getEntity('message').Message.pushMsg(Main.text.npcSummon(this));

        this.CombatRole.setRole('hasSummoned', true);
        Main.system.unlockEngine(this.ActionDuration.getDuration(
            getAttackDuration(this)
        ));
    }
    // 2B-3: 用长戟刺 PC。
    else if (
        this.CombatRole.getRole('extendRange')
        && Main.system.getDistance(this, Main.getEntity('pc'))
        <= this.AttackRange.getRange('extend')
        && Main.system.getDistance(this, Main.getEntity('pc'))
        > this.AttackRange.getRange('base')
    ) {
        Main.system.pcTakeDamage(this.Damage.getDamage('base'));

        Main.getEntity('message').Message.pushMsg(
            Main.text.action('gargoyleThrust'));

        Main.system.npcHitOrKill(this, getAttackDuration(this));
    }
    // 2C-3: 喷火。
    else if (
        Main.system.getDistance(this, Main.getEntity('pc'))
        === this.AttackRange.getRange('base')
    ) {
        Main.system.pcTakeDamage(
            Main.system.pcIsInStraightLine(this)
                ? this.Damage.getDamage('high')
                : this.Damage.getDamage('base')
        );

        Main.getEntity('message').Message.pushMsg(
            Main.text.gargoyleBreathe(this));

        Main.system.npcHitOrKill(this, getAttackDuration(this));
    }
    // 3-3: 接近视野中的 PC。
    else {
        Main.system.npcMoveClose(this, getMoveDuration(this));
    }

    // 辅助函数。
    function getMoveDuration(actor: any) {
        return actor.getEntityName() === 'gargoyle'
            ? actor.ActionDuration.getDuration('slowMove')
            : actor.ActionDuration.getDuration('base');
    }

    function getAttackDuration(actor: any) {
        return actor.CombatRole.getRole('hasTail')
            ? actor.ActionDuration.getDuration('base')
            : actor.ActionDuration.getDuration('slowAttack');
    }
};

Main.system.npcMoveClose = function (actor: any, duration: number) {
    Main.system.npcDecideNextStep(actor, 'moveClose', duration);
};

Main.system.npcMoveRandomly = function (actor: any, duration: number) {
    Main.system.npcDecideNextStep(actor, 'moveRandomly', duration);
};

Main.system.npcMoveAway = function (actor: any, duration: number) {
    Main.system.npcDecideNextStep(actor, 'moveAway', duration);
};

Main.system.npcKeepDistance = function (actor: any, duration: number,
    distance: number) {
    Main.system.npcDecideNextStep(actor, 'keepDistance', duration, distance);
};

Main.system.npcDecideNextStep = function (actor: any, nextStep: string,
    duration: number, distance?: number) {
    // 1-6: 取得 actor 周围的 8 个格子。
    // actor 可以停留在当前位置，也就是等待。
    const centerX = actor.Position.getX();
    const centerY = actor.Position.getY();
    let surround: number[][] = [];

    for (let i = -1; i < 2; i++) {
        for (let j = -1; j < 2; j++) {
            surround.push([centerX + i, centerY + j]);
        }
    }

    const currentDistance = Main.system.getDistance(actor,
        Main.getEntity('pc'));
    const newDistanceMap: Map<string, number> = new Map();
    let newPosition: string[] = [];
    const checkFirst: string[] = [];
    const checkNext: string[] = [];

    // 2-6: 移除非法格子。
    surround = surround.filter((position: number[]) => {
        return Main.system.isFloor(...position)
            && !Main.system.npcHere(...position)
            && !Main.system.pcHere(...position);
    });
    surround.push([centerX, centerY]);

    // 3-6: 计算每个格子到 PC 的距离。
    surround.forEach((position: number[]) => {
        newDistanceMap.set(position[0] + ',' + position[1],
            Main.system.getDistance(position, Main.getEntity('pc')));
    });

    // 4-6: 按优先级挑选候选格子。
    switch (nextStep) {
        case 'moveRandomly':
            newDistanceMap.forEach((value: number, key: string) => {
                checkFirst.push(key);
            });
            break;
        case 'moveClose':
            newDistanceMap.forEach((value: number, key: string) => {
                if (value < currentDistance) {
                    checkFirst.push(key);
                } else if (value === currentDistance) {
                    checkNext.push(key);
                }
            });
            break;
        case 'moveAway':
            newDistanceMap.forEach((value: number, key: string) => {
                if (value > currentDistance) {
                    checkFirst.push(key);
                } else if (value === currentDistance) {
                    checkNext.push(key);
                }
            });
            break;
        case 'keepDistance':
            if (currentDistance >= distance) {
                newDistanceMap.forEach((value: number, key: string) => {
                    if (value === currentDistance) {
                        checkFirst.push(key);
                    }
                });
            } else {
                newDistanceMap.forEach((value: number, key: string) => {
                    if (value > currentDistance) {
                        checkFirst.push(key);
                    }
                });
            }

            // 如果 NPC 被 PC 逼到角落，就随机移动。
            if (checkFirst.length === 0 && checkNext.length === 0) {
                surround.forEach((position: number[]) => {
                    checkNext.push(position[0] + ',' + position[1]);
                });
            }
            break;
    }

    // 5-6: 决定去哪里。
    if (checkFirst.length > 0) {
        newPosition
            = checkFirst[Math.floor(checkFirst.length * RotRng.getUniform())]
                .split(',');
    } else if (checkNext.length > 0) {
        newPosition
            = checkNext[Math.floor(checkNext.length * RotRng.getUniform())]
                .split(',');
    } else {
        // 正常不会发生。
        if (Main.getDevelop()) {
            console.log(actor.getEntityName() + ' cannot decide where to go.');
        }
        newPosition = [centerX, centerY];
    }

    const targetX = Number.parseInt(newPosition[0], 10);
    const targetY = Number.parseInt(newPosition[1], 10);

    // 6-6: 改变 actor 的位置并解锁引擎。
    actor.Position.setX(targetX);
    actor.Position.setY(targetY);

    if (targetX === centerX && targetY === centerY) {
        // 等待。
        Main.system.unlockEngine(actor.ActionDuration.getDuration('base'));
    } else {
        // 移动。
        Main.system.unlockEngine(duration);
    }
};

Main.system.npcHitOrKill = function (actor: any, duration: number) {
    if (!actor.CombatRole.getRole('isBoss')) {
        // Boss 有专属的受击文案。
        Main.getEntity('message').Message.pushMsg(Main.text.npcHit(actor));
    }

    if (Main.getEntity('pc').Inventory.getIsDead()) {
        Main.getEntity('message').Message.pushMsg(Main.text.action('die'));
        Main.getEntity('message').Message.pushMsg(Main.text.lastWords());
        // 在 modeline 上打印 'The End'。
        Main.getEntity('message').Message.setModeline(Main.text.action('end'));
    } else {
        Main.system.unlockEngine(duration);
    }
};

Main.system.npcSearchOrWait = function (actor: any, duration: number) {
    if (Main.system.getDistance(actor, Main.getEntity('pc'))
        <= actor.Position.getRange()) {
        // 搜索看不见的 PC。
        Main.system.npcMoveRandomly(actor, duration);
    } else {
        // 等待 1 回合。
        Main.system.unlockEngine(actor.ActionDuration.getDuration('base'));
    }
};

Main.system.pcIsInsideAttackRange = function (actor: any) {
    // 有些敌人可以在一条直线上用延伸射程击中 PC。
    if (actor.AttackRange.getRange('extend') > 0
        && Main.system.pcIsInStraightLine(actor)
    ) {
        return Main.system.getDistance(actor, Main.getEntity('pc'))
            <= actor.AttackRange.getRange('extend');
    }

    return Main.system.getDistance(actor, Main.getEntity('pc'))
        <= actor.AttackRange.getRange('base');
};

Main.system.pcIsInStraightLine = function (actor: any) {
    return actor.Position.getX() === Main.getEntity('pc').Position.getX()
        || actor.Position.getY() === Main.getEntity('pc').Position.getY();
};

Main.system.npcHasAlliesInCloseRange = function (actor: any) {
    let count = 0;
    const minimum = 2;

    Main.getEntity('dungeon').fov.compute(
        actor.Position.getX(),
        actor.Position.getY(),
        3,
        (x: number, y: number) => {
            if (Main.system.npcHere(x, y)) {
                count++;
            }
        });

    return count >= minimum;
};

Main.system.npcActBeforeDeath = function (actor: any) {
    switch (actor.getEntityName()) {
        case 'zombie':
            summon('dog');
            break;
        case 'wisp':
        case 'twinWisp':
        case 'cursedRat':
            if (Main.system.getDistance(actor, Main.getEntity('pc')) === 1
                && Main.getEntity('pc').Inventory.canBeCursed()
            ) {
                Main.system.npcCursePC(actor, false);
            }
            break;
    }

    // 辅助函数。
    function summon(who: string) {
        const newActor
            = Main.entity[who](actor.Position.getX(), actor.Position.getY());

        // 延迟 2 回合。
        Main.getEntity('timer').scheduler.add(newActor, true, 2);

        Main.getEntity('message').Message.pushMsg(Main.text.npcSummon(actor));
    }
};

Main.system.npcCannotSeePC = function (actor: any) {
    return Main.system.getDistance(actor, Main.getEntity('pc'))
        > actor.Position.getRange()
        || !Main.system.isInSight(actor, Main.getEntity('pc'));
};

Main.system.npcCursePC = function (actor: any, unlockEngine: boolean,
    duration?: number) {
    Main.getEntity('pc').Inventory.setCurse(actor.Damage.getCurse());
    Main.getEntity('message').Message.pushMsg(Main.text.npcCurse(actor));

    if (unlockEngine) {
        Main.system.unlockEngine(duration);
    }
};

Main.system.butcherAct = function (this: any) {
    const moveDuration = this.ActionDuration.getDuration('slowMove');
    const attackDuration = this.ActionDuration.getDuration('slowAttack');
    const pullHere
        = Main.system.canPullPC(this, this.AttackRange.getRange('pull'));

    Main.getEntity('timer').engine.lock();

    // 1-3: 搜索附近的 PC 或者等待 1 回合。
    if (Main.system.npcCannotSeePC(this)) {
        Main.system.npcSearchOrWait(this, moveDuration);
    } else {
        // 2A-3: 等待 1 回合。在 PC 的回合播放过场。
        if (Main.getEntity('gameProgress').BossFight.getMiniBossAppear() < 1) {
            Main.getEntity('gameProgress').BossFight.setMiniBossAppear();
            Main.system.unlockEngine(1);
        }
        // 2B-3: 劈砍 PC。
        else if (Main.system.getDistance(this, Main.getEntity('pc')) === 1) {
            Main.getEntity('message').Message.pushMsg(
                Main.text.action('butcherCleave')
            );

            Main.system.pcTakeDamage(this.Damage.getDamage('cleave'));
            Main.system.npcHitOrKill(this, attackDuration);
        }
        // 2C-3: 拉拽 PC。
        else if (pullHere.length > 0) {
            Main.getEntity('pc').Position.setX(pullHere[0]);
            Main.getEntity('pc').Position.setY(pullHere[1]);

            Main.getEntity('message').Message.pushMsg(
                Main.text.action('butcherPull')
            );
            Main.system.pcTakeDamage(this.Damage.getDamage('base'));
            Main.system.npcHitOrKill(this, attackDuration);
        }
        // 3-3: 接近视野中的 PC。
        else {
            Main.system.npcMoveClose(this, moveDuration);
        }
    }
};

Main.system.canPullPC = function (actor: any, pullRange: number) {
    const range = pullRange;
    const relativeX
        = Main.getEntity('pc').Position.getX() - actor.Position.getX();
    const relativeY
        = Main.getEntity('pc').Position.getY() - actor.Position.getY();
    const deltaX = relativeX > 0
        ? 1
        : relativeX < 0
            ? -1
            : 0;
    const deltaY = relativeY > 0
        ? 1
        : relativeY < 0
            ? -1
            : 0;
    const position: number[] = [];

    if (Main.system.getDistance(actor, Main.getEntity('pc')) > range
        || Math.abs(relativeX) > 1
        && Math.abs(relativeY) > 1
    ) {
        return [];
    }

    position.push(
        actor.Position.getX() + deltaX, actor.Position.getY() + deltaY
    );

    if (Main.system.isFloor(...position) && !Main.system.npcHere(...position)) {
        return position;
    }

    return [];
};

Main.system.ghoulAct = function (this: any) {
    const move = this.ActionDuration.getDuration('base');
    const setBomb = this.ActionDuration.getDuration('base');
    const melee = this.ActionDuration.getDuration('fastAttack');

    Main.getEntity('timer').engine.lock();

    // 1-3: 搜索附近的 PC 或者等待 1 回合。
    if (Main.system.npcCannotSeePC(this)) {
        Main.system.npcSearchOrWait(this, move);
    }
    // 2A-3: 攻击 PC。
    else if (Main.system.pcIsInsideAttackRange(this)) {
        Main.getEntity('message').Message.pushMsg(
            Main.text.action('ghoulPunch')
        );
        Main.system.pcTakeDamage(this.Damage.getDamage('base'));
        Main.system.npcHitOrKill(this, melee);
    }
    // 2B-3: 布置炸弹。
    else if (Main.system.getDistance(this, Main.getEntity('pc'))
        <= this.AttackRange.getRange('bomb')
        && !Main.getEntity('pc').CombatRole.getRole('isFrozen')
    ) {
        Main.system.npcSetBomb(this, 'timeBomb', setBomb);
    }
    // 3-3: 接近视野中的 PC。
    else {
        Main.system.npcMoveClose(this, move);
    }
};

Main.system.bombAct = function (this: any) {
    Main.getEntity('timer').engine.lock();

    if (Main.system.pcHere(this.Position.getX(), this.Position.getY())) {
        switch (this.getEntityName()) {
            case 'timeBomb':
                Main.getEntity('pc').CombatRole.setRole('isFrozen', true);
                Main.getEntity('message').Message.pushMsg(
                    Main.text.action('freezeTime')
                );
                break;
            case 'hpBomb':
                Main.system.pcTakeDamage(this.Damage.getDamage('base'));
                Main.system.npcHitOrKill(this, 1);
                break;
        }
    }

    Main.getEntity('timer').scheduler.remove(this);
    Main.getEntity('npc').delete(this.getID());

    if (!Main.getEntity('pc').Inventory.getIsDead()) {
        Main.system.unlockEngine(1);
    }
};

Main.system.npcSetBomb = function (actor: any, bomb: string,
    duration: number) {
    const pcX = Main.getEntity('pc').Position.getX();
    const pcY = Main.getEntity('pc').Position.getY();
    const surroundPC = Main.system.getSurroundPosition(pcX, pcY, 1)
        .filter((position: number[]) => {
            return Main.system.isFloor(...position)
                && !Main.system.npcHere(...position);
        });
    const maxBomb = actor.Damage.getDamage('maxBomb');

    const setHere: number[][] = [];
    let candidate: number[] = [];
    let newActor = null;

    if (!Main.system.npcHere(pcX, pcY)) {
        setHere.push([pcX, pcY]);
    }

    if (setHere.length + surroundPC.length > maxBomb) {
        while (setHere.length < maxBomb) {
            candidate = surroundPC[
                Math.floor(RotRng.getUniform() * surroundPC.length)
            ];
            setHere.push(candidate);
            surroundPC.splice(surroundPC.indexOf(candidate), 1);
        }
    } else {
        surroundPC.forEach((position: number[]) => {
            setHere.push(position);
        });
    }

    setHere.forEach((here: number[]) => {
        newActor = Main.entity[bomb](here[0], here[1]);
        Main.getEntity('timer').scheduler.add(newActor, true);
    });

    Main.getEntity('message').Message.pushMsg(Main.text.setBomb(actor));

    Main.system.unlockEngine(duration);
};

Main.system.giovanniAct = function (this: any) {
    const move = this.ActionDuration.getDuration('base');
    const setBomb = this.ActionDuration.getDuration('base');

    Main.getEntity('timer').engine.lock();

    // 1-3: 搜索附近的 PC 或者等待 1 回合。
    if (Main.system.npcCannotSeePC(this)
        || this.CombatRole.getRole('justRevived')
    ) {
        Main.system.npcSearchOrWait(this, move);
        this.CombatRole.setRole('justRevived', false);
    }
    // 2A-3: 保持距离。
    else if (Main.getEntity('pc').CombatRole.getRole('isFrozen')) {
        Main.system.npcKeepDistance(
            this, move, this.AttackRange.getRange('bomb')
        );
    }
    // 2B-3: 布置遥控炸弹。
    else if (Main.system.getDistance(this, Main.getEntity('pc')) === 1) {
        Main.system.npcSetBomb(this, 'hpBomb', setBomb);
    }
    // 2C-3: 布置炸弹。
    else if (Main.system.getDistance(this, Main.getEntity('pc'))
        <= this.AttackRange.getRange('bomb')
    ) {
        switch (Math.floor(RotRng.getUniform() * 2)) {
            case 0:
                Main.system.npcSetBomb(this, 'timeBomb', setBomb);
                break;
            case 1:
                Main.system.npcSetBomb(this, 'hpBomb', setBomb);
                break;
        }
    }
    // 3-3: 接近视野中的 PC。
    else {
        Main.system.npcMoveClose(this, move);
    }
};

Main.system.reviveGiovanni = function (target: any) {
    let newPosition: number[] = [];
    let addOrb: string[] = [];

    // 把 PC 移到楼梯口。
    Main.getEntity('pc').Position.setX(
        Main.getEntity('downstairs').Position.getX()
    );
    Main.getEntity('pc').Position.setY(
        Main.getEntity('downstairs').Position.getY()
    );

    // 移动 Giovanni 并提升 HP。
    newPosition = Main.system.placeBoss(
        Main.getEntity('downstairs'),
        Main.getEntity('pc'),
        2
    );

    target.Position.setX(newPosition[0]);
    target.Position.setY(newPosition[1]);
    target.HitPoint.takeDamage(-1);
    target.CombatRole.setRole('justRevived', true);

    // 必要时补充 Orb。
    if (!hasIceOrb()) {
        if (Main.getEntity('orb').size > 20) {
            Main.entities.set('orb', new Map());
        }

        addOrb = [
            Main.entity.orb('fire'),
            Main.entity.orb('ice'),
            Main.entity.orb('slime'),
            Main.entity.orb('lump')
        ];

        addOrb.forEach((orbID: string) => {
            Main.system.placeActor(
                Main.getEntity('orb').get(orbID),
                Main.system.verifyOrbPosition);
        });
    }

    // 禁止解锁 Giovanni 的特殊成就。
    Main.getEntity('gameProgress').Achievement.clearBoss4Special();

    // 打印过场文本。
    Main.text.action('reviveGiovanni').forEach((text: string) => {
        Main.getEntity('message').Message.pushMsg(text);
    });

    // 辅助函数。
    function hasIceOrb() {
        const orbName: string[] = [];

        Main.getEntity('orb').forEach((orbEntity: any) => {
            orbName.push(orbEntity.getEntityName());
        });

        return orbName.some((name: string) => { return name === 'ice'; });
    }
};
