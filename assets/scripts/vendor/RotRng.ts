/**
 * rot.js 的 RNG（Alea）逐行移植，保证同种子生成同一序列。
 * 源码来自 rot.js @ BSD-3-Clause，minified 版本的等价还原。
 */
export class RotRngClass {
    public _seed = 12345;
    public _s0 = 0;
    public _s1 = 0;
    public _s2 = 0;
    public _c = 0;
    public _frac = 2.3283064365386963e-10;

    public getSeed(): number {
        return this._seed;
    }

    public setSeed(seed?: number): this {
        let value = seed === undefined ? 12345 : seed;
        // `1 > a ? 1/a : a`
        value = value < 1 ? 1 / value : value;
        this._seed = value;

        this._s0 = (value >>> 0) * this._frac;
        let a = (69069 * value + 1) >>> 0;
        this._s1 = a * this._frac;
        this._s2 = ((69069 * a + 1) >>> 0) * this._frac;
        this._c = 1;
        return this;
    }

    public getUniform(): number {
        const a = 2091639 * this._s0 + this._c * this._frac;
        this._s0 = this._s1;
        this._s1 = this._s2;
        this._c = a | 0;
        return (this._s2 = a - this._c);
    }

    public getUniformInt(lower: number, upper: number): number {
        const max = Math.max(lower, upper);
        const min = Math.min(lower, upper);
        return Math.floor(this.getUniform() * (max - min + 1)) + min;
    }

    public getPercentage(): number {
        return 1 + Math.floor(100 * this.getUniform());
    }

    public getWeightedValue(data: any): string {
        let total = 0;
        for (const key in data) {
            total += data[key];
        }
        total *= this.getUniform();
        let running = 0;
        for (const key in data) {
            running += data[key];
            if (total < running) { return key; }
        }
        return '';
    }

    public getState(): number[] {
        return [this._s0, this._s1, this._s2, this._c];
    }

    public setState(state: number[]): this {
        this._s0 = state[0];
        this._s1 = state[1];
        this._s2 = state[2];
        this._c = state[3];
        return this;
    }
}

export const RotRng = new RotRngClass();
