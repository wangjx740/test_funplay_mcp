import { Main } from '../core/MainGame';

/**
 * 对应 `entityFactory.js`。实体 ID 仍用 Math.random 生成（与源码一致，
 * 不参与地图随机序列）。
 */
export class Factory {
    public _entityName: string;
    public _id: string;

    constructor(name: string) {
        this._entityName = name;
        this._id = Factory.createID();
    }

    private static createID(): string {
        let randomNumber = '';
        while (randomNumber.length < 32) {
            randomNumber += ((Math.random() * Math.pow(10, 8)) | 0).toString(16);
        }
        return randomNumber.replace(/.{8}/g, '$&-').slice(0, 35);
    }

    public getID() { return this._id; }
    public getEntityName() { return this._entityName; }

    public addComponent(component: any, newName?: string): void {
        if (newName) {
            (this as any)[newName] = component;
        } else {
            (this as any)[component._name] = component;
        }
    }

    public removeComponent(name: string): void {
        delete (this as any)[name];
    }

    public print(): void {
        console.log(JSON.stringify(this, null, 2));
    }
}

Main.Factory = Factory;
