/**
 * rot.js `EventQueue` / `Scheduler` / `Scheduler.Action` 的移植，
 * 以及用同步泵循环替代 `ROT.Engine` 的 TurnEngine。
 */
class EventQueue {
    private _time = 0;
    private _events: any[] = [];
    private _eventTimes: number[] = [];

    public getTime(): number {
        return this._time;
    }

    public clear(): this {
        this._events = [];
        this._eventTimes = [];
        return this;
    }

    public add(actor: any, time: number): void {
        let index = this._events.length;
        for (let i = 0; i < this._eventTimes.length; i++) {
            if (this._eventTimes[i] > time) {
                index = i;
                break;
            }
        }
        this._events.splice(index, 0, actor);
        this._eventTimes.splice(index, 0, time);
    }

    public get(): any {
        if (!this._events.length) {
            return null;
        }

        const time = this._eventTimes.splice(0, 1)[0];
        if (time > 0) {
            this._time += time;
            for (let i = 0; i < this._eventTimes.length; i++) {
                this._eventTimes[i] -= time;
            }
        }

        return this._events.splice(0, 1)[0];
    }

    public getEventTime(actor: any): number | undefined {
        const index = this._events.indexOf(actor);
        if (index !== -1) {
            return this._eventTimes[index];
        }
        return undefined;
    }

    public remove(actor: any): boolean {
        const index = this._events.indexOf(actor);
        if (index === -1) {
            return false;
        }
        this._events.splice(index, 1);
        this._eventTimes.splice(index, 1);
        return true;
    }
}

export class RotScheduler {
    private _queue = new EventQueue();
    private _repeat: any[] = [];
    private _current: any = null;
    private _duration = 1;
    private _defaultDuration = 1;

    public getTime(): number {
        return this._queue.getTime();
    }

    public add(actor: any, repeat?: boolean, time?: number): this {
        this._queue.add(actor, time || this._defaultDuration);
        if (repeat) {
            this._repeat.push(actor);
        }
        return this;
    }

    public getTimeOf(actor: any): number | undefined {
        return this._queue.getEventTime(actor);
    }

    public clear(): this {
        this._duration = this._defaultDuration;
        this._queue.clear();
        this._repeat = [];
        this._current = null;
        return this;
    }

    public remove(actor: any): boolean {
        if (actor === this._current) {
            this._duration = this._defaultDuration;
        }
        const removed = this._queue.remove(actor);
        const repeatIndex = this._repeat.indexOf(actor);
        if (repeatIndex !== -1) {
            this._repeat.splice(repeatIndex, 1);
        }
        if (this._current === actor) {
            this._current = null;
        }
        return removed;
    }

    public next(): any {
        if (this._current && this._repeat.indexOf(this._current) !== -1) {
            this._queue.add(this._current, this._duration || this._defaultDuration);
            this._duration = this._defaultDuration;
        }
        this._current = this._queue.get();
        return this._current;
    }

    public setDuration(duration: number): this {
        if (this._current) {
            this._duration = duration;
        }
        return this;
    }
}

/**
 * 同步泵循环引擎。
 * `unlock()` 内部用 `_pumping` 标记避免递归，模拟原 ROT.Engine 的异步调度。
 *
 * 兜底（见方案文档 14.4 第 4 条）：
 * - 单次 unlock 最多推进 `TURN_STEP_MAX` 步，超限强制把控制权还给玩家；
 * - 锁计数变负说明 lock/unlock 失配，立即重置并报错，避免永久停摆。
 */
export class TurnEngine {
    public _scheduler: RotScheduler;
    public _lock = 1;
    private _pumping = false;

    constructor(scheduler: RotScheduler) {
        this._scheduler = scheduler;
    }

    public start(): this {
        return this.unlock();
    }

    public lock(): this {
        this._lock++;
        return this;
    }

    public unlock(): this {
        if (this._lock < 0) {
            console.error('[engine] lock < 0 (' + this._lock + '), reset to 1');
            this._lock = 1;
            return this;
        }
        if (!this._lock) {
            throw new Error('Cannot unlock unlocked engine');
        }

        this._lock--;

        // 嵌套调用（act 内部再 unlock）只减锁，由外层循环继续驱动。
        if (this._pumping) {
            return this;
        }

        this._pumping = true;
        let steps = 0;
        while (this._lock === 0) {
            if (++steps > TURN_STEP_MAX) {
                console.error('[engine] pump exceeded ' + TURN_STEP_MAX + ' steps');
                this._lock = 1;
                break;
            }
            const actor = this._scheduler.next();
            if (!actor) {
                this._lock = 1;
                break;
            }
            actor.act();
        }
        this._pumping = false;
        return this;
    }
}

/** 单次解锁允许推进的最大回合数（兜底上限）。 */
const TURN_STEP_MAX = 2000;

