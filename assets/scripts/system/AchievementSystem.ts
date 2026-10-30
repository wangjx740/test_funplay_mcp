import { Main } from '../core/MainGame';

/** 对应 `achievement.js`。 */

Main.system.setAchievement = function () {
    const achievements = Main.system.loadAchievements();

    achievements.forEach((value: string[]) => {
        Main.getEntity('gameProgress').Achievement.setAchievement(
            value[0], value[1] === 'true'
        );
    });
};

Main.system.unlockAchievement = function (id: string) {
    Main.getEntity('gameProgress').Achievement.setAchievement(id, true);
    Main.system.saveAchievements();

    Main.getEntity('message').Message.pushMsg(
        Main.text.unlockAchievement(Main.text.achievementLeft(id))
    );
};

Main.system.showAchievement = function () {
    Main.input.listenEvent('remove', 'main');
    Main.screens.main.exit();

    Main.screens.achievement.enter();
    Main.input.listenEvent('add', 'achievement');
};

Main.system.exitAchievement = function () {
    Main.screens.achievement.setIndex(0);

    Main.input.listenEvent('remove', 'achievement');
    Main.screens.achievement.exit();

    Main.screens.main.enter(true);
    Main.input.listenEvent('add', 'main');
};

Main.system.achievementIsLocked = function (achieveID: string) {
    const achievements = Main.getEntity('gameProgress')
        .Achievement.getAchievement();
    if (achievements.has(achieveID)) {
        return !achievements.get(achieveID);
    }
    return false;
};

Main.system.moveCursorInAchievement = function (direction: string) {
    let shift = 0;
    const maxIndex = Main.getEntity('gameProgress')
        .Achievement.getAchievement().size - 1;

    switch (direction) {
        case 'up': shift = -1; break;
        case 'down': shift = 1; break;
    }

    const index = Main.screens.achievement.getIndex();
    if (index + shift < 0) {
        Main.screens.achievement.setIndex(maxIndex);
    } else if (index + shift > maxIndex) {
        Main.screens.achievement.setIndex(0);
    } else {
        Main.screens.achievement.setIndex(index + shift);
    }

    Main.display.clear();
    Main.screens.achievement.display();
};

// 确认在解锁某成就后再调用此函数。
Main.system.checkAchUnlockAll = function () {
    let unlockable = true;

    if (!Main.system.achievementIsLocked('unlockAll')) {
        return;
    }

    for (const [key, value] of Main.getEntity('gameProgress')
        .Achievement.getAchievement()) {
        if (value === false && key !== 'unlockAll') {
            unlockable = false;
            break;
        }
    }

    if (unlockable) {
        Main.system.unlockAchievement('unlockAll');
    }
};

Main.system.checkAchBoss1Special = function (actor: any, attackType: string) {
    if (Main.system.achievementIsLocked('boss1Special')
        && actor.getEntityName() === 'gargoyle'
        && attackType === 'fire') {
        if (actor.CombatRole.getRole('hasTail')) {
            actor.CombatRole.setRole('hasTail', false);

            Main.getEntity('message').Message.pushMsg(
                Main.text.action('breakTail')
            );
            Main.system.unlockAchievement('boss1Special');
            Main.system.checkAchUnlockAll();
        }
    }
};

// 在 Boss 被击杀后调用。
Main.system.checkAchBossNormal = function (boss: any) {
    let achieveID: string | null = null;

    switch (boss.getEntityName()) {
        case 'gargoyle':
        case 'juvenileGargoyle':
            achieveID = 'boss1Normal';
            break;
        case 'butcher': achieveID = 'boss2Normal'; break;
        case 'ghoul': achieveID = 'boss3Normal'; break;
        case 'giovanni': achieveID = 'boss4Normal'; break;
    }

    if (achieveID && Main.system.achievementIsLocked(achieveID)) {
        Main.system.unlockAchievement(achieveID);
        Main.system.checkAchUnlockAll();
    }
};

Main.system.checkAchNoExamine = function () {
    if (Main.system.achievementIsLocked('noExamine')
        && Main.getEntity('gameProgress').Achievement.getNoExamine()) {
        Main.system.unlockAchievement('noExamine');
        Main.system.checkAchUnlockAll();
    }
};

Main.system.checkAchBoss3Special = function (actor: any) {
    if (Main.system.achievementIsLocked('boss3Special')
        && Main.getEntity('gameProgress').Achievement.getBoss3Special()
        && actor.getEntityName() === 'ghoul') {
        Main.system.unlockAchievement('boss3Special');
        Main.system.checkAchUnlockAll();
    }
};

Main.system.checkAchBoss4Special = function (target: any, attackType: string) {
    const check = ['ice', 'fire', 'lump'];
    let orb = attackType;

    if (attackType === 'base'
        && Main.getEntity('pc').Inventory.getLastOrb() === 'armor') {
        orb = 'ice';
    }

    if (Main.system.achievementIsLocked('boss4Special')) {
        Main.getEntity('gameProgress').Achievement.setBoss4Special(orb);

        if (Main.system.arrayEquals(
            check,
            Main.getEntity('gameProgress').Achievement.getBoss4Special()
        )) {
            Main.system.unlockAchievement('boss4Special');
            Main.system.checkAchUnlockAll();
        }
    }
};

Main.system.arrayEquals = function (left: string[], right: string[]) {
    if (left.length !== 3 || right.length !== 3) { return false; }
    for (let i = 0; i < 3; i++) {
        if (left[i] !== right[i]) { return false; }
    }
    return true;
};
