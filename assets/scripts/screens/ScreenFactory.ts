import { Main } from '../core/MainGame';

/**
 * 对应源工程 `screenFactory.js`：Screen 原型、当前屏幕状态与全部绘制函数。
 */

// ====================
// 屏幕原型
// ====================

Main.Screen = function (this: any, name?: string, mode?: string[]) {
    // 每个屏幕都有名字。
    this._name = name || 'Unnamed Screen';

    // 每个屏幕至少有一个 `main` 模式，也可能有 `aim` 或 `examine` 等模式。
    // `main` 模式应在列表首位。
    this._mode = mode || ['main'];
};

Main.Screen.prototype.getName = function () { return this._name; };
Main.Screen.prototype.getMode = function (index: number) {
    return this._mode[index];
};

Main.Screen.prototype.enter = function (doNotInitialize?: boolean) {
    Main.screens.setCurrentName(this.getName());
    Main.screens.setCurrentMode(this.getMode(0));

    if (!doNotInitialize) {
        this.initialize(this.getName());
    }
    this.display();
};

Main.Screen.prototype.exit = function () {
    Main.screens.setCurrentName(null);
    Main.screens.setCurrentMode(null);

    Main.getEntity('message').Message.setModeline('');
    Main.display.clear();
};

Main.Screen.prototype.keyInput = function (e: any) {
    if (Main.getDevelop()) {
        console.log('Key pressed: ' + e.key);
    }
};

Main.Screen.prototype.initialize = function () {
    if (Main.getDevelop()) {
        console.log('Enter screen: ' + this._name + '.');
    }
};

Main.Screen.prototype.display = function () {
    Main.display.drawText(1, 1, 'Testing screen');
    Main.display.drawText(1, 2, 'Name: ' + Main.screens.getCurrentName());
    Main.display.drawText(1, 3, 'Mode: ' + Main.screens.getCurrentMode());
};

// =======================================
// 当前屏幕的名称与模式
// =======================================

Main.screens._currentName = null;
Main.screens._currentMode = null;

Main.screens.getCurrentName = function () { return this._currentName; };
Main.screens.getCurrentMode = function () { return this._currentMode; };

Main.screens.setCurrentName = function (name: string) {
    this._currentName = name;
};
Main.screens.setCurrentMode = function (mode: string) {
    this._currentMode = mode;
};

// ===============================================
// 在屏幕上绘制元素的辅助函数
// ===============================================

Main.screens.colorfulText = function (text: string, fgColor: string,
    bgColor?: string) {
    return bgColor
        ? '%c{' + Main.getColor(fgColor) + '}'
        + '%b{' + Main.getColor(bgColor) + '}'
        + text + '%b{}%c{}'
        : '%c{' + Main.getColor(fgColor) + '}'
        + text + '%c{}';
};

Main.screens.drawAlignRight = function (x: number, y: number, text: string,
    width: number, color?: string) {
    Main.display.drawText(
        x + width - text.length,
        y,
        color
            ? Main.screens.colorfulText(text, color)
            : text);
};

Main.screens.drawHighlightText = function (text: string) {
    // 这些数据本可通过参数传入，这里为方便直接硬编码。
    const headLength = 1;
    const fullLength = 26;
    const fgColor = 'black';
    const bgColor = 'white';

    const tailLength = fullLength - headLength - text.length;
    const headString = '#'.repeat(headLength);
    const tailString = '#'.repeat(tailLength);

    return Main.screens.colorfulText(headString, bgColor, bgColor)
        + Main.screens.colorfulText(text, fgColor, bgColor)
        + Main.screens.colorfulText(tailString, bgColor, bgColor);
};

Main.screens.drawBorder = function () {
    // Dungeon | Status
    // ------- | Status
    // Message | Status

    for (let i = Main.UI.status.getY();
        i < Main.UI.status.getHeight();
        i++) {
        Main.display.draw(
            Main.UI.status.getX() - 1, i, '|');
    }

    for (let i = Main.UI.dungeon.getX();
        i < Main.UI.dungeon.getWidth() + 1;
        i++) {
        Main.display.draw(
            i, Main.UI.dungeon.getY() + Main.UI.dungeon.getHeight(), '-');
    }
};

Main.screens.drawAchievementBorder = function () {
    for (let i = 0; i < Main.UI.achievementMiddle.getHeight(); i++) {
        Main.display.drawText(
            Main.UI.achievementMiddle.getX(),
            Main.UI.achievementMiddle.getY() + i,
            '|'
        );
    }
};

Main.screens.drawVersion = function () {
    let version = '';

    if (Main.getDevelop()) {
        version = Main.text.ui('wizard') + Main.getVersion();
    } else {
        version = Main.getVersion();
    }

    Main.screens.drawAlignRight(
        Main.UI.status.getX(), Main.UI.status.getY(),
        version,
        Main.UI.status.getWidth(), 'grey');
};

Main.screens.drawModeLine = function () {
    if (Main.getEntity('message').Message.getModeline()) {
        Main.display.drawText(
            Main.UI.modeline.getX(), Main.UI.modeline.getY(),
            Main.getEntity('message').Message.getModeline());

        // 若处于主屏幕、主模式且 PC 存活，则只绘制一次 modeline；
        // 其它情况每回合都要绘制。
        if (Main.screens.getCurrentName() === 'main'
            && Main.screens.getCurrentMode() === 'main'
            && !Main.getEntity('pc').Inventory.getIsDead()
        ) {
            Main.getEntity('message').Message.setModeline('');
        }
    }
};

Main.screens.drawBottomRight = function (text: string) {
    Main.screens.drawAlignRight(
        Main.UI.status.getX(),
        Main.UI.status.getY() + Main.UI.status.getHeight() - 1,
        text,
        Main.UI.status.getWidth(), 'grey');
};

// 文本长度不能超过 message 区块宽度。
Main.screens.drawMessage = function (text?: string) {
    if (text) {
        Main.getEntity('message').Message.getMessage().push(text);
    }
    while (Main.getEntity('message').Message.getMessage().length
        > Main.UI.message.getHeight()) {
        Main.getEntity('message').Message.getMessage().shift();
    }

    for (let i = 0;
        i < Main.getEntity('message').Message.getMessage().length;
        i++) {
        Main.display.drawText(
            Main.UI.message.getX(),
            Main.UI.message.getY()
            + Main.UI.message.getHeight()
            - Main.getEntity('message').Message.getMessage().length
            + i,
            Main.getEntity('message').Message.getMessage()[i]);
    }
};

Main.screens.drawDescription = function () {
    const npcAtMarker = Main.system.npcHere(
        Main.getEntity('marker').Position.getX(),
        Main.getEntity('marker').Position.getY());
    const downstairsAtMarker = Main.system.downstairsHere(
        Main.getEntity('marker').Position.getX(),
        Main.getEntity('marker').Position.getY());
    const orbAtMarker = Main.system.orbHere(
        Main.getEntity('marker').Position.getX(),
        Main.getEntity('marker').Position.getY());

    if (npcAtMarker) {
        drawTextBlock(
            // 顶行
            getTopLine(npcAtMarker),
            // 底行
            Main.text.npcBottomDescription(
                downstairsAtMarker, npcAtMarker, orbAtMarker));
    } else if (downstairsAtMarker) {
        drawTextBlock(Main.text.downstairs(), '');
    } else if (orbAtMarker) {
        drawTextBlock(Main.text.orbTopDescription(orbAtMarker), '');
    } else {
        Main.screens.drawMessage();
    }

    // 辅助函数。
    function getTopLine(actor: any) {
        let text = null;

        switch (actor.getEntityName()) {
            case 'gargoyle':
                text = Main.text.gargoyleDescription(actor);
                break;
            default:
                text = Main.text.info(npcAtMarker.getEntityName());
        }

        return text;
    }

    function drawTextBlock(top: string, bottom: string) {
        Main.display.drawText(
            Main.UI.message.getX(),
            Main.UI.message.getY(),
            top,
            Main.UI.message.getWidth());

        Main.display.drawText(
            Main.UI.message.getX(),
            Main.UI.message.getY() + Main.UI.message.getHeight() - 1,
            bottom);
    }
};

Main.screens.drawDungeon = function () {
    const pcSight = Main.system.getActorSight(Main.getEntity('pc'));

    // 默认：战争迷雾开启。
    if (Main.getEntity('dungeon').Dungeon.getFov()) {
        // 绘制 PC 曾经见过的墙壁与地板。
        if (Main.getEntity('dungeon').Dungeon.getMemory().length > 0) {
            for (let i = 0;
                i < Main.getEntity('dungeon').Dungeon.getMemory().length;
                i++) {
                drawWallAndFloor(
                    Main.getEntity('dungeon').Dungeon
                        .getMemory()[i].split(',')[0],
                    Main.getEntity('dungeon').Dungeon
                        .getMemory()[i].split(',')[1],
                    'grey');
            }
        }

        // 绘制视野内的墙壁与地板。
        pcSight.forEach((position: string) => {
            if (Main.getEntity('dungeon').Dungeon.getMemory().indexOf(position)
                > -1
            ) {
                drawWallAndFloor(
                    Number.parseInt(position.split(',')[0], 10),
                    Number.parseInt(position.split(',')[1], 10),
                    'white'
                );
            }
        });
    }
    // 巫师模式：关闭战争迷雾，绘制全部墙壁与地板。
    else {
        for (const keyValue of Main.getEntity('dungeon').Dungeon
            .getTerrain()) {
            drawWallAndFloor(
                (keyValue as any[])[0].split(',')[0],
                (keyValue as any[])[0].split(',')[1],
                'white'
            );
        }
    }

    function drawWallAndFloor(x: any, y: any, color: string) {
        x = Number.parseInt(x, 10);
        y = Number.parseInt(y, 10);

        Main.display.draw(
            x + Main.UI.dungeon.getX()
            + Main.getEntity('dungeon').Dungeon.getPadding(),
            y + Main.UI.dungeon.getY()
            + Main.getEntity('dungeon').Dungeon.getPadding(),
            Main.system.isFloor(x, y) ? '.' : '#',
            Main.getColor(color));
    }
};

Main.screens.drawActor = function (actor: any, noFov?: boolean) {
    const pcSight = Main.system.getActorSight(Main.getEntity('pc'));
    let drawThis = false;
    let color = null;

    // 1-3: 决定是否绘制该 actor。
    if (// 1A: 强制绘制该 actor。
        noFov
        // 1B: 关闭迷雾时绘制一切，但主模式下不绘制 marker。
        || !Main.getEntity('dungeon').Dungeon.getFov()
        && typeof actor.Position.getX() === 'number'
        && typeof actor.Position.getY() === 'number'
        // 1C: 总是绘制 PC。
        || Main.system.isPC(actor)
    ) {
        drawThis = true;
    } else {
        // 1D: 若在 PC 视野内则绘制该 actor。
        if (pcSight.indexOf(
            actor.Position.getX() + ',' + actor.Position.getY())
            > -1
        ) {
            drawThis = true;
        }
    }

    if (drawThis) {
        // 2-3: 选择颜色。
        if (Main.system.isPC(actor) && actor.Inventory.getIsDead()) {
            color = actor.Display.getColor('die');
        } else if (Main.system.downstairsHere(
            actor.Position.getX(), actor.Position.getY())
        ) {
            color = actor.Display.getDownstairsColor();
        } else if (Main.system.orbHere(
            actor.Position.getX(), actor.Position.getY())
        ) {
            color = actor.Display.getOrbColor();
        } else {
            color = actor.Display.getColor();
        }

        // 3-3: 绘制该 actor。
        Main.display.draw(
            // X
            Main.UI.dungeon.getX()
            + Main.getEntity('dungeon').Dungeon.getPadding()
            + actor.Position.getX(),
            // Y
            Main.UI.dungeon.getY()
            + Main.getEntity('dungeon').Dungeon.getPadding()
            + actor.Position.getY(),
            // 字符
            actor.Display.getCharacter(),
            // 颜色
            Main.getColor(color)
        );
    }
};

Main.screens.drawDownstairs = function () {
    if (Main.getEntity('dungeon').Dungeon.getMemory()
        .indexOf(Main.getEntity('downstairs').Position.getX()
            + ',' + Main.getEntity('downstairs').Position.getY())
        > -1) {
        Main.screens.drawActor(Main.getEntity('downstairs'), true);
    } else {
        Main.screens.drawActor(Main.getEntity('downstairs'), false);
    }
};

Main.screens.drawLevelName = function () {
    const levelName = Main.text.dungeon(
        'level' + Main.getEntity('gameProgress').BossFight.getDungeonLevel()
    );

    Main.display.drawText(
        Main.UI.level.getX(),
        Main.UI.level.getY(),
        `${Main.text.dungeon('downstairsIcon')} ${levelName}`);
};

Main.screens.drawPCHitPoint = function () {
    Main.display.drawText(
        Main.UI.hitpoint.getX() + 2,
        Main.UI.hitpoint.getY(),
        Main.text.uiHitPoint());
};

Main.screens.drawInventory = function () {
    const enhance = false;

    // 力量 Orb。
    for (let i = 0;
        i < Main.getEntity('pc').Inventory.getInventory().length;
        i++
    ) {
        Main.display.drawText(
            Main.UI.power.getX() + 2,
            Main.UI.power.getY() + i * 1.1,
            Main.screens.colorfulText(
                // 文本
                Main.text.dungeon(
                    Main.getEntity('pc').Inventory.getInventory()[i]
                ),
                // 颜色：普通（白），被诅咒（灰）。
                i < Main.getEntity('pc').Inventory.getCapacity()
                    - Main.getEntity('pc').Inventory.getCurse()
                    ? 'white'
                    : 'grey'
            )
        );
    }

    // HP 条。
    for (let i = 0; i < 6; i++) {
        Main.display.drawText(
            Main.UI.power.getX() + Main.UI.power.getWidth() - 1,
            Main.UI.power.getY() + i * 1.1,
            (i + 1).toString(10));
    }

    // 强化指示器。
    if (enhance) {
        Main.display.drawText(
            Main.UI.power.getX(),
            Main.UI.power.getY(),
            Main.text.ui('enhance'));
    }

    // 诅咒。
    for (let i = Main.getEntity('pc').Inventory.getCapacity()
        - Main.getEntity('pc').Inventory.getCurse();
        i < Main.getEntity('pc').Inventory.getCapacity();
        i++) {
        // 1-2: 诅咒指示器。
        Main.display.drawText(
            Main.UI.power.getX(),
            Main.UI.power.getY() + i * 1.1,
            Main.screens.colorfulText('x', 'grey')
        );

        // 2-2: 诅咒条。
        if (i >= Main.getEntity('pc').Inventory.getInventory().length) {
            Main.display.drawText(
                Main.UI.power.getX() + 2,
                Main.UI.power.getY() + i * 1.1,
                Main.screens.colorfulText(
                    Main.text.ui('curse').repeat(9),
                    'grey', 'grey'
                )
            );
        }
    }
};

Main.screens.drawItemUnderYourFoot = function () {
    let itemFound = null;

    itemFound
        = Main.system.downstairsHere(
            Main.getEntity('pc').Position.getX(),
            Main.getEntity('pc').Position.getY())
        || Main.system.orbHere(
            Main.getEntity('pc').Position.getX(),
            Main.getEntity('pc').Position.getY());

    Main.display.drawText(
        Main.UI.ground.getX(),
        Main.UI.ground.getY(),
        itemFound
            ? Main.text.ui('ground') + ' '
            + Main.screens.colorfulText(Main.text.dungeon(
                itemFound.getEntityName()),
                itemFound.Display.getColor())
            : Main.text.ui('ground'));
};

Main.screens.drawEnemyList = function () {
    const enemyList = Main.system.countEnemiesInSight();
    let i = 0;

    for (const [key, value] of enemyList) {
        Main.display.drawText(
            Main.UI.enemy.getX() + 2,
            Main.UI.enemy.getY() + i,
            Main.screens.colorfulText(key + ': ' + value, 'orange')
        );
        i++;
    }
};

Main.screens.drawHelp = function () {
    const helpKey = Main.input.keybind.get('fixed').get('help')[0];

    Main.screens.drawAlignRight(
        Main.UI.help.getX(),
        Main.UI.help.getY(),
        `${Main.text.ui('help')} ${helpKey}`,
        Main.UI.help.getWidth(), 'grey');
};

Main.screens.drawCutScene = function () {
    const level = Main.getEntity('gameProgress').BossFight.getDungeonLevel();
    const bossFight
        = Main.getEntity('gameProgress').BossFight.getBossFightStatus();
    let text = '';

    switch (bossFight) {
        case 'inactive':
            text = Main.text.cutScene('enterLevel' + level);
            break;
        case 'active':
            text = Main.text.cutScene('beforeBossFight' + level);
            break;
        case 'win':
            if (level === 3) {
                text = Main.text.cutScene('youWin');
            }
    }

    Main.display.drawText(
        Main.UI.cutScene.getX(),
        Main.UI.cutScene.getY(),
        text,
        Main.UI.cutScene.getWidth()
    );
};

Main.screens.drawKeyBindings = function () {
    Main.display.drawText(
        Main.UI.cutScene.getX(),
        Main.UI.cutScene.getY() - 1.5,
        Main.text.help('keyBindings'),
        Main.UI.cutScene.getWidth()
    );
};

Main.screens.drawAchievementLeft = function () {
    const orderdList = Main.screens.achievement.getOrderedList();
    // 高亮字符串里有一个占位字符。
    const placeHolder = Main.screens.colorfulText('#', 'black', 'black');

    for (let i = 0; i < orderdList.length; i++) {
        Main.display.drawText(
            Main.UI.achievementLeft.getX(),
            Main.UI.achievementLeft.getY() + i * 1.5,
            highlightOrColorful(i)
        );
    }

    function highlightOrColorful(index: number) {
        if (index === Main.screens.achievement.getIndex()) {
            return Main.screens.drawHighlightText(
                Main.text.achievementLeft(orderdList[index])
            );
        } else if (
            !Main.getEntity('gameProgress').Achievement.getAchievement(
                orderdList[index]
            )
        ) {
            return placeHolder
                + Main.screens.colorfulText(
                    Main.text.achievementLeft(orderdList[index]), 'grey'
                );
        }
        return placeHolder + Main.text.achievementLeft(orderdList[index]);
    }
};

Main.screens.drawAchievementRight = function () {
    let status = null;

    if (Main.getEntity('gameProgress').Achievement.getAchievement(
        Main.screens.achievement.getOrderedList(
            Main.screens.achievement.getIndex()
        )
    )) {
        status = Main.text.achievementRight('unlocked');
    } else {
        status = Main.text.achievementRight('locked');
    }

    Main.display.drawText(
        Main.UI.achievementRight.getX(),
        Main.UI.achievementRight.getY(),
        Main.screens.colorfulText(status, 'grey')
    );

    Main.display.drawText(
        Main.UI.achievementRight.getX(),
        Main.UI.achievementRight.getY() + 1.5,
        Main.text.achievementRight(
            Main.screens.achievement.getOrderedList(
                Main.screens.achievement.getIndex()
            )
        ),
        Main.UI.achievementRight.getWidth()
    );
};
