import { RotRng } from './RotRng';

const DIRS_8 = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1]
];

type Point = number[];
type PointMap = { [key: string]: Point };

/**
 * rot.js `Map.Cellular` 的移植（topology 固定为 8）。
 * RNG 调用顺序与源码保持一致，保证同种子地图一致。
 */
export class RotCellular {
    public _width: number;
    public _height: number;
    public _map: number[][];
    public _options = {
        born: [5, 6, 7, 8],
        survive: [4, 5, 6, 7, 8],
        topology: 8
    };
    private _dirs: number[][];

    constructor(width: number, height: number) {
        this._width = width;
        this._height = height;
        this._dirs = DIRS_8;
        this._map = this._fillMap(0);
    }

    private _fillMap(value: number): number[][] {
        const map: number[][] = [];
        for (let x = 0; x < this._width; x++) {
            const column: number[] = [];
            for (let y = 0; y < this._height; y++) {
                column.push(value);
            }
            map.push(column);
        }
        return map;
    }

    public randomize(ratio: number): this {
        for (let x = 0; x < this._width; x++) {
            for (let y = 0; y < this._height; y++) {
                this._map[x][y] = RotRng.getUniform() < ratio ? 1 : 0;
            }
        }
        return this;
    }

    public set(x: number, y: number, value: number): void {
        this._map[x][y] = value;
    }

    public create(callback?: (x: number, y: number, value: number) => void): void {
        const newMap = this._fillMap(0);
        const born = this._options.born;
        const survive = this._options.survive;

        for (let y = 0; y < this._height; y++) {
            for (let x = 0; x < this._width; x++) {
                const cell = this._map[x][y];
                const neighbors = this._getNeighbors(x, y);

                if (cell && survive.indexOf(neighbors) !== -1) {
                    newMap[x][y] = 1;
                } else if (!cell && born.indexOf(neighbors) !== -1) {
                    newMap[x][y] = 1;
                }
            }
        }

        this._map = newMap;
        if (callback) {
            this._serviceCallback(callback);
        }
    }

    private _serviceCallback(cb: (x: number, y: number, value: number) => void): void {
        for (let y = 0; y < this._height; y++) {
            for (let x = 0; x < this._width; x++) {
                cb(x, y, this._map[x][y]);
            }
        }
    }

    private _getNeighbors(x: number, y: number): number {
        let count = 0;
        for (let i = 0; i < this._dirs.length; i++) {
            const dir = this._dirs[i];
            const nx = x + dir[0];
            const ny = y + dir[1];
            if (nx < 0 || nx >= this._width || ny < 0 || ny >= this._height) {
                continue;
            }
            count += this._map[nx][ny] === 1 ? 1 : 0;
        }
        return count;
    }

    public connect(
        callback?: (x: number, y: number, value: number) => void,
        value?: number,
        connectionCallback?: (from: Point, to: Point) => void
    ): void {
        const connected: PointMap = {};
        const remaining: PointMap = {};
        const points: Point[] = [];
        const startValue = value || 0;

        for (let y = 0; y < this._height; y++) {
            for (let x = 0; x < this._width; x++) {
                if (this._freeSpace(x, y, startValue)) {
                    const point = [x, y];
                    remaining[this._pointKey(point)] = point;
                    points.push([x, y]);
                }
            }
        }

        const start = points[RotRng.getUniformInt(0, points.length - 1)];
        const startKey = this._pointKey(start);
        connected[startKey] = start;
        delete remaining[startKey];

        this._findConnected(connected, remaining, [start], false, startValue);

        // 兜底：理论上每次迭代至少会把 1 个点并入连通集，但为防止意外
        // 长时间不收敛，这里给一个硬上限（见方案文档 14.4 第 2 条）。
        const maxIterations = points.length * 4 + 64;
        let iterations = 0;

        while (Object.keys(remaining).length > 0) {
            if (++iterations > maxIterations) {
                console.warn('[connect] aborted after ' + iterations + ' iterations');
                break;
            }
            const fromTo = this._getFromTo(connected, remaining);
            const from = fromTo[0];
            const to = fromTo[1];

            const newConnected: PointMap = {};
            newConnected[this._pointKey(from)] = from;
            this._findConnected(newConnected, remaining, [from], true, startValue);

            this._tunnelToConnected(to, from, connected, remaining,
                startValue, connectionCallback);

            for (const key in newConnected) {
                const point = newConnected[key];
                this._map[point[0]][point[1]] = startValue;
                connected[key] = point;
                delete remaining[key];
            }
        }

        if (callback) {
            this._serviceCallback(callback);
        }
    }

    private _getFromTo(connected: PointMap, remaining: PointMap): Point[] {
        const connectedKeys = Object.keys(connected);
        const remainingKeys = Object.keys(remaining);
        let from: Point = null as any;
        let to: Point = null as any;

        for (let i = 0; i < 5; i++) {
            if (connectedKeys.length < remainingKeys.length) {
                from = connected[connectedKeys[
                    RotRng.getUniformInt(0, connectedKeys.length - 1)]];
                to = this._getClosest(from, remaining);
            } else {
                from = remaining[remainingKeys[
                    RotRng.getUniformInt(0, remainingKeys.length - 1)]];
                to = this._getClosest(from, connected);
            }

            const dx = from[0] - to[0];
            const dy = from[1] - to[1];
            if (dx * dx + dy * dy < 64) { break; }
        }

        return [from, to];
    }

    private _getClosest(from: Point, candidates: PointMap): Point {
        let closest: Point = null as any;
        let best = null as any;

        for (const key in candidates) {
            const point = candidates[key];
            const dx = point[0] - from[0];
            const dy = point[1] - from[1];
            const dist = dx * dx + dy * dy;
            if (best === null || dist < best) {
                best = dist;
                closest = point;
            }
        }
        return closest;
    }

    private _findConnected(
        connected: PointMap,
        remaining: PointMap,
        queue: Point[],
        isNew: boolean,
        exceptValue: number
    ): void {
        while (queue.length > 0) {
            const point = queue.splice(0, 1)[0];
            const neighbors: Point[] = [
                [point[0] + 1, point[1]],
                [point[0] - 1, point[1]],
                [point[0], point[1] + 1],
                [point[0], point[1] - 1]
            ];

            for (let i = 0; i < neighbors.length; i++) {
                const neighbor = neighbors[i];
                const key = this._pointKey(neighbor);
                if (connected[key] == null
                    && this._freeSpace(neighbor[0], neighbor[1], exceptValue)) {
                    connected[key] = neighbor;
                    if (!isNew) {
                        delete remaining[key];
                    }
                    queue.push(neighbor);
                }
            }
        }
    }

    private _tunnelToConnected(
        a: Point,
        c: Point,
        connected: PointMap,
        remaining: PointMap,
        value: number,
        connectionCallback?: (from: Point, to: Point) => void
    ): void {
        this._pointKey(c);

        let from: Point;
        let to: Point;
        if (c[0] < a[0]) {
            from = c; to = a;
        } else {
            from = a; to = c;
        }

        let x = from[0];
        for (; x <= to[0]; x++) {
            this._map[x][from[1]] = value;
            const point: Point = [x, from[1]];
            connected[this._pointKey(point)] = point;
            delete remaining[this._pointKey(point)];
        }
        if (connectionCallback && from[0] < to[0]) {
            connectionCallback(from, [to[0], from[1]]);
        }

        x = to[0];
        if (c[1] < a[1]) {
            from = c; to = a;
        } else {
            from = a; to = c;
        }

        let y = from[1];
        for (; y < to[1]; y++) {
            this._map[x][y] = value;
            const point: Point = [x, y];
            connected[this._pointKey(point)] = point;
            delete remaining[this._pointKey(point)];
        }
        if (connectionCallback && from[1] < to[1]) {
            connectionCallback([to[0], from[1]], [to[0], to[1]]);
        }
    }

    private _freeSpace(x: number, y: number, value: number): boolean {
        return x >= 0 && x < this._width
            && y >= 0 && y < this._height
            && this._map[x][y] === value;
    }

    private _pointKey(point: Point): string {
        return point[0] + '.' + point[1];
    }
}
