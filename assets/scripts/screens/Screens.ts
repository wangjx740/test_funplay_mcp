import { Main } from '../core/MainGame';

/**
 * 对应源工程 `screenInGame.js`：main / cutScene / help / achievement 四个屏幕。
 */

// ===============
// 主屏幕
// ===============

Main.screens.main = new Main.Screen('main', ['main', 'examine', 'aim']);

// * 按以下顺序创建并放置实体（如有必要）：
//   Seed、Timer、Dungeon、Marker、(PC、NPC、Downstairs、Orbs)。
// * PC 不能站在墙上。
// * PC 视野内最多出现 5 个 NPC。
// * Orb 不能生成在楼梯上。
Main.screens.main.initialize = function () {
    let pcCanSee = [];
    let eliteAndGrunt: any[] = [];

    // Seed。
    Main.entity.seed();
    Main.system.startRNG();
    console.log('[boot] 2/9 rng seed=' + Main.getEntity('seed').Seed.getPrintSeed());

    // Timer。
    Main.entity.timer();
    Main.getEntity('timer').engine.start();
    console.log('[boot] 3/9 timer');

    // Dungeon 与 marker。
    Main.entity.dungeon();
    console.log('[boot] 4/9 dungeon floor=' + Main._log.floor
        + ' cycle=' + Main._log.cycle);
    Main.entity.marker();

    // PC。
    Main.entity.pc();
    Main.system.fillInventory();

    Main.system.placeActor(
        Main.getEntity('pc'),
        Main.system.verifyPCPosition);
    console.log('[boot] 5/9 pc');

    pcCanSee = Main.system.getActorSight(Main.getEntity('pc'));

    Main.getEntity('timer').scheduler.add(Main.getEntity('pc'), true);

    // NPC。
    eliteAndGrunt = Main.system.createEnemies();
    console.log('[boot] 6/9 enemies count=' + Main._log.enemyCount);

    // 放置精英怪。
    for (let i = 0; i < eliteAndGrunt[0].length; i++) {
        Main.system.placeActor(
            eliteAndGrunt[0][i],
            Main.system.verifyEnemyPosition,
            pcCanSee,
            true);

        Main.getEntity('timer').scheduler.add(eliteAndGrunt[0][i], true);
    }

    // 放置普通怪。
    for (let i = 0; i < eliteAndGrunt[1].length; i++) {
        Main.system.placeActor(
            eliteAndGrunt[1][i],
            Main.system.verifyEnemyPosition,
            pcCanSee,
            false);

        Main.getEntity('timer').scheduler.add(eliteAndGrunt[1][i], true);
    }

    // 放置小 Boss：Butcher。
    if (Main.getEntity('gameProgress').BossFight.getDungeonLevel() === 2) {
        const butcher = Main.entity.butcher();
        Main.system.placeActor(butcher, Main.system.verifyButcherPosition);
        Main.getEntity('timer').scheduler.add(butcher, true);
    }

    // Downstairs。
    Main.entity.downstairs();

    Main.system.placeActor(
        Main.getEntity('downstairs'),
        Main.system.verifyDownstairsPosition);

    // Orbs。
    Main.system.createOrbs();

    for (const keyValue of Main.getEntity('orb')) {
        Main.system.placeActor(
            keyValue[1],
            Main.system.verifyOrbPosition);
    }
    console.log('[boot] 7/9 placed');

    // 输出地牢生成细节。
    Main.system.printGenerationLog();
    // 删除存档。
    Main.system.deleteSave();
    console.log('[boot] 8/9 ready');
};

// 按以下顺序绘制实体：
//      静态 UI 元素、Dungeon、(Orbs、Downstairs、NPC、PC)、Marker。
//      NPC 与 PC 可以站在 Orb 上。
//      Marker 在最上层。

// 重绘主屏幕的时机比较琐碎，这些条件是互斥的，不要重复重绘：
//      按下开发按键（无论是否按 Shift）。
//      解锁引擎。
//      进入或退出 examine 模式。
//      examine 模式下按任意键。
//      执行非法移动。
Main.screens.main.display = function () {
    // 更新 PC 视野内的地形。
    Main.system.pcRememberTerrain();

    Main.screens.drawBorder();
    Main.screens.drawVersion();
    Main.screens.drawHelp();
    Main.screens.drawBottomRight(Main.getEntity('seed').Seed.getPrintSeed());

    Main.screens.drawLevelName();
    Main.screens.drawPCHitPoint();
    Main.screens.drawInventory();
    Main.screens.drawItemUnderYourFoot();
    Main.screens.drawEnemyList();
    Main.screens.drawDungeon();

    Main.getEntity('orb').forEach(
        (orb: any) => {
            Main.screens.drawActor(
                orb,
                Main.getEntity('gameProgress').BossFight.getBossFightStatus()
                !== 'inactive'
                || orb.Memory.getHasSeen()
            );
        }
    );

    Main.screens.drawDownstairs();

    for (const keyValue of Main.getEntity('npc')) {
        Main.screens.drawActor((keyValue as any[])[1]);
    }

    Main.screens.drawActor(Main.getEntity('pc'));
    Main.screens.drawActor(Main.getEntity('marker'));

    if (Main.screens.getCurrentMode() !== 'main') {
        Main.screens.drawDescription();
    } else {
        Main.screens.drawMessage();
    }

    Main.screens.drawModeLine();
};

Main.screens.main.keyInput = function (e: any) {
    const keyAction = Main.input.getAction;

    if (e.shiftKey) {
        if (keyAction(e, 'fixed') === 'develop') {
            Main.setDevelop();
            Main.system.saveWizardMode();
            Main.system.printGenerationLog();

            Main.display.clear();
            Main.screens.main.display();
        } else if (keyAction(e, 'fastMove')) {
            Main.system.pcFastMove(true, keyAction(e, 'fastMove'));
        } else if (keyAction(e, 'fixed') === 'help') {
            Main.system.showHelp();
        } else if (Main.getDevelop()) {
            switch (keyAction(e, 'fixed')) {
                case 'clearStorage':
                    Main.system.clearStorage();
                    break;
            }
        }
    } else if (keyAction(e, 'move')) {
        Main.system.move(keyAction(e, 'move'));
    } else if (keyAction(e, 'interact') === 'examine') {
        if (Main.getEntity('gameProgress').Achievement.getNoExamine()) {
            Main.getEntity('gameProgress').Achievement.setNoExamine(false);
        }
        Main.system.examineMode();
    } else if (keyAction(e, 'interact') === 'pickOrUse') {
        Main.system.pcPickOrUse();
    } else if (keyAction(e, 'fixed') === 'seed') {
        console.log(Main.getEntity('seed').Seed.getSeed());
    } else if (keyAction(e, 'fixed') === 'achievement') {
        Main.system.showAchievement();
    } else if (Main.getDevelop()) {
        switch (keyAction(e, 'fixed')) {
            case 'fov':
                Main.getEntity('dungeon').Dungeon.setFov();
                break;
            case 'turn':
                console.log(Main.getEntity('timer').scheduler.getTime());
                break;
            case 'teleport':
                Main.system.killAndTeleport();
                break;
            case 'dummy':
                Main.getEntity('timer').scheduler.add(
                    Main.entity.dummy(
                        Main.getEntity('pc').Position.getX() - 1,
                        Main.getEntity('pc').Position.getY()),
                    true
                );
                break;
            case 'addFire':
                Main.getEntity('pc').Inventory.addItem('fire');
                break;
            case 'addIce':
                Main.getEntity('pc').Inventory.addItem('ice');
                break;
            case 'addSlime':
                Main.getEntity('pc').Inventory.addItem('slime');
                break;
            case 'addLump':
                Main.getEntity('pc').Inventory.addItem('lump');
                break;
            case 'addArmor':
                Main.getEntity('pc').Inventory.addItem('armor');
                break;
            case 'addNuke':
                Main.getEntity('pc').Inventory.addItem('nuke');
                break;
            case 'removeOrb':
                Main.getEntity('pc').Inventory.removeItem(1);
                break;
            case 'addCurse':
                Main.getEntity('pc').Inventory.setCurse(1);
                break;
            case 'removeCurse':
                Main.getEntity('pc').Inventory.setCurse(-1);
                break;
        }
        // 按下开发按键后重绘屏幕。
        Main.display.clear();
        Main.screens.main.display();
    }

    // 不要在这里重绘屏幕，由各动作函数自行决定重绘时机。
};

// ====================
// 过场屏幕
// ====================

Main.screens.cutScene = new Main.Screen('cutScene', ['main']);

Main.screens.cutScene.display = function () {
    if (Main.getEntity('gameProgress').BossFight.getDungeonLevel() === 3
        && Main.getEntity('gameProgress').BossFight.getBossFightStatus()
        === 'win'
    ) {
        Main.getEntity('message').Message.setModeline(
            Main.text.action('closeOrReload')
        );
    } else {
        Main.getEntity('message').Message.setModeline(
            Main.text.action('continue')
        );
    }

    Main.screens.drawCutScene();
    Main.screens.drawModeLine();
    Main.screens.drawBottomRight(Main.text.ui('studio'));
};

Main.screens.cutScene.keyInput = function (e: any) {
    if (Main.input.getAction(e, 'fixed') === 'yes') {
        Main.system.exitCutScene();
    }
};

// ====================
// 帮助屏幕
// ====================

Main.screens.help = new Main.Screen('help', ['main']);

Main.screens.help.display = function () {
    Main.getEntity('message').Message.setModeline(Main.text.action('exit'));

    Main.screens.drawKeyBindings();
    Main.screens.drawModeLine();
    Main.screens.drawBottomRight(Main.text.ui('studio'));
};

Main.screens.help.keyInput = function (e: any) {
    if (Main.input.getAction(e, 'fixed') === 'no') {
        Main.system.exitHelp();
    }
};

// ======================
// 成就屏幕
// ======================

Main.screens.achievement = new Main.Screen('achievement', ['main']);

Main.screens.achievement._index = 0;
Main.screens.achievement._orderedList
    = [
        'boss1Normal',
        'boss1Special',
        'boss2Normal',
        'boss3Normal',
        'boss3Special',
        'boss4Normal',
        'boss4Special',
        'noExamine',
        'unlockAll'
    ];

Main.screens.achievement.getIndex = function () { return this._index; };
Main.screens.achievement.getOrderedList = function (index?: number) {
    if (index > -1 && index < this._orderedList.length) {
        return this._orderedList[index];
    }
    return this._orderedList;
};
Main.screens.achievement.setIndex = function (value: number) {
    this._index = value;
};

Main.screens.achievement.display = function () {
    Main.screens.drawAchievementLeft();
    Main.screens.drawAchievementRight();
    Main.screens.drawAchievementBorder();

    Main.getEntity('message').Message.setModeline(Main.text.action('exit'));
    Main.screens.drawModeLine();
    Main.screens.drawBottomRight(Main.text.ui('studio'));
};

Main.screens.achievement.keyInput = function (e: any) {
    if (Main.input.getAction(e, 'fixed') === 'no') {
        Main.system.exitAchievement();
    } else if (Main.input.getAction(e, 'move') === 'down'
        || Main.input.getAction(e, 'move') === 'up'
    ) {
        Main.system.moveCursorInAchievement(Main.input.getAction(e, 'move'));
    }
};
