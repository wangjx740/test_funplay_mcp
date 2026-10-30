import { Main } from '../core/MainGame';
import { sys } from 'cc';

/**
 * 对应 `saveLoad.js`：localStorage → sys.localStorage，存档键保持不变
 * （achievement / wizard / dungeonLevel / seed / inventory / orb）。
 */

const storage: any = sys.localStorage;
Main.storage = storage;

Main.system.storageAvailable = function () {
    try {
        const testKey = '__storage_test__';
        storage.setItem(testKey, testKey);
        storage.removeItem(testKey);
        return true;
    } catch (e) {
        return false;
    }
};

Main.system.clearStorage = function () {
    if (Main.getDevelop()) {
        storage.clear();
        Main.getEntity('gameProgress').Achievement.resetAchievement();
        console.log('The local storage is cleared.');
    }
};

Main.system.deleteSave = function () {
    const achievement = storage.getItem('achievement');
    const wizard = storage.getItem('wizard');

    storage.clear();

    if (achievement) { storage.setItem('achievement', achievement); }
    if (wizard) { storage.setItem('wizard', wizard); }
};

Main.system.saveWizardMode = function () {
    storage.setItem('wizard', Main.getDevelop());
};

Main.system.loadWizardMode = function () {
    return storage.getItem('wizard') === 'true';
};

Main.system.saveDungeonLevel = function () {
    storage.setItem(
        'dungeonLevel',
        Main.getEntity('gameProgress').BossFight.getNextDungeonLevel()
    );
};

Main.system.loadDungeonLevel = function () {
    return storage.getItem('dungeonLevel')
        ? Number.parseInt(storage.getItem('dungeonLevel'), 10)
        : 1;
};

Main.system.saveSeed = function () {
    storage.setItem('seed', Main.getEntity('seed').Seed.getSeed());
};

Main.system.loadSeed = function () {
    return storage.getItem('seed');
};

Main.system.saveInventory = function () {
    storage.setItem('inventory',
        Main.getEntity('pc').Inventory.getInventory().toString());
};

Main.system.loadInventory = function () {
    if (storage.getItem('inventory')) {
        return storage.getItem('inventory').split(',');
    }
    return [];
};

Main.system.saveOrbsOnTheGround = function () {
    let saveOrbs: string[] = [];
    let lump: string[] = [];
    let fire: string[] = [];
    let ice: string[] = [];
    let slime: string[] = [];

    Main.getEntity('orb').forEach((orb: any) => {
        saveOrbs.push(orb.getEntityName());
    });

    lump = saveOrbs.filter((orb) => orb === 'lump');
    fire = saveOrbs.filter((orb) => orb === 'fire');
    ice = saveOrbs.filter((orb) => orb === 'ice');
    slime = saveOrbs.filter((orb) => orb === 'slime');

    saveOrbs = lump.concat(fire, ice, slime);
    saveOrbs = saveOrbs.slice(0, 4);

    storage.setItem('orb', saveOrbs.toString());
};

Main.system.loadOrbsOnTheGround = function () {
    if (storage.getItem('orb')) {
        return storage.getItem('orb').split(',');
    }
    return [];
};

Main.system.saveAchievements = function () {
    const achievements = Main.getEntity('gameProgress').Achievement.getAchievement();
    const save: string[] = [];

    achievements.forEach((value: boolean, key: string) => {
        save.push(key + ',' + value);
    });

    storage.setItem('achievement', save.join(';'));
};

Main.system.loadAchievements = function () {
    let save: string[] = [];
    const achievements: string[][] = [];

    if (storage.getItem('achievement')) {
        save = storage.getItem('achievement').split(';');
    }

    save.forEach((value) => {
        achievements.push(value.split(','));
    });

    return achievements;
};
