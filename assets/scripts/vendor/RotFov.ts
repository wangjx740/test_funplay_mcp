const DIRS_4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIRS_8 = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1]
];

type Angle = number[];

/**
 * rot.js `FOV.PreciseShadowcasting` 的移植（topology 8）。
 */
export class RotFov {
    private _lightPasses: (x: number, y: number) => boolean;

    constructor(lightPasses: (x: number, y: number) => boolean) {
        this._lightPasses = lightPasses;
    }

    public compute(
        ox: number,
        oy: number,
        radius: number,
        callback: (x: number, y: number, radius: number, visibility: number) => void
    ): void {
        callback(ox, oy, 0, 1);

        if (!this._lightPasses(ox, oy)) {
            return;
        }

        const shadows: Angle[] = [];

        for (let r = 1; r <= radius; r++) {
            const ring = this._getCircle(ox, oy, r);
            const size = ring.length;

            for (let i = 0; i < size; i++) {
                const x = ring[i][0];
                const y = ring[i][1];
                const from: Angle = [i ? 2 * i - 1 : 2 * size - 1, 2 * size];
                const to: Angle = [2 * i + 1, 2 * size];
                const blocks = !this._lightPasses(x, y);

                const visibility = this._checkVisibility(from, to, blocks, shadows);
                if (visibility) {
                    callback(x, y, r, visibility);
                }

                if (shadows.length === 2
                    && shadows[0][0] === 0
                    && shadows[1][0] === shadows[1][1]) {
                    return;
                }
            }
        }
    }

    private _getCircle(cx: number, cy: number, radius: number): number[][] {
        const result: number[][] = [];
        const dirs = DIRS_8;

        cx += -1 * radius;
        cy += 1 * radius;

        for (let i = 0; i < DIRS_4.length; i++) {
            const dir = DIRS_4[i];
            for (let j = 0; j < radius * 2; j++) {
                result.push([cx, cy]);
                cx += dir[0];
                cy += dir[1];
            }
        }
        return result;
    }

    private _checkVisibility(
        a: Angle,
        c: Angle,
        blocks: boolean,
        shadows: Angle[]
    ): number {
        if (a[0] > c[0]) {
            const left = this._checkVisibility(a, [a[1], a[1]], blocks, shadows);
            const right = this._checkVisibility([0, 1], c, blocks, shadows);
            return (left + right) / 2;
        }

        let index1 = 0;
        let edge1 = false;
        while (index1 < shadows.length) {
            const shadow = shadows[index1];
            const diff = shadow[0] * a[1] - a[0] * shadow[1];
            if (diff >= 0) {
                if (diff === 0 && index1 % 2 === 0) {
                    edge1 = true;
                }
                break;
            }
            index1++;
        }

        let index2 = shadows.length;
        let edge2 = false;
        while (index2--) {
            const shadow = shadows[index2];
            const diff = c[0] * shadow[1] - shadow[0] * c[1];
            if (diff >= 0) {
                if (diff === 0 && index2 % 2 === 1) {
                    edge2 = true;
                }
                break;
            }
        }

        let visible = true;
        if (index1 === index2 && (edge1 || edge2)) {
            visible = false;
        } else if (edge1 && edge2 && index1 + 1 === index2 && index2 % 2 === 1) {
            visible = false;
        } else if (index1 > index2 && index1 % 2 === 1) {
            visible = false;
        }

        if (!visible) { return 0; }

        const count = index2 - index1 + 1;

        let angle = 0;
        if (count % 2 === 1) {
            if (index1 % 2 === 1) {
                const shadow = shadows[index1];
                angle = (c[0] * shadow[1] - shadow[0] * c[1]) / (shadow[1] * c[1]);
                if (blocks) {
                    shadows.splice(index1, count, c);
                }
            } else {
                const shadow = shadows[index2];
                angle = (shadow[0] * a[1] - a[0] * shadow[1]) / (a[1] * shadow[1]);
                if (blocks) {
                    shadows.splice(index1, count, a);
                }
            }
        } else if (index1 % 2 === 1) {
            const shadow1 = shadows[index1];
            const shadow2 = shadows[index2];
            angle = (shadow2[0] * shadow1[1] - shadow1[0] * shadow2[1])
                / (shadow1[1] * shadow2[1]);
            if (blocks) {
                shadows.splice(index1, count);
            }
        } else {
            if (blocks) {
                shadows.splice(index1, count, a, c);
            }
            return 1;
        }

        return angle / ((c[0] * a[1] - a[0] * c[1]) / (a[1] * c[1]));
    }
}
