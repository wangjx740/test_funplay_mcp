import { Color, Graphics, Label, Node, UITransform, Layers } from 'cc';

/** 源工程 rot.js 的字符网格尺寸。 */
const GRID_WIDTH = 70;
const GRID_HEIGHT = 26;

/** 每格像素尺寸（1280×720 下 70×26 刚好居中）。 */
const CELL_WIDTH = 16;
const CELL_HEIGHT = 22;

const DEFAULT_FG = '#ABB2BF';
const DEFAULT_BG = '#262626';

interface TextToken {
    type: number;
    value?: string;
}

const TYPE_TEXT = 0;
const TYPE_NEWLINE = 1;
const TYPE_FG = 2;
const TYPE_BG = 3;
const RE_COLORS = /%([bc]){([^}]*)}/g;

/** 文本断行循环的兜底上限（见方案文档 14.4 第 6 条）。 */
const MAX_BREAK_ITERATIONS = 4096;

/**
 * 逐格 Label 网格渲染器。
 * 对外保留 rot.js Display 的 draw / drawText / clear 接口，
 * 以字符格为单位，支持小数坐标（渲染时四舍五入到最近的整格）。
 */
export class GridRenderer {
    public dirty = false;

    private _root: Node;
    private _bgGraphics: Graphics;

    private _cells: Label[] = [];
    private _ch: string[] = [];
    private _fg: string[] = [];
    private _bg: string[] = [];

    /** 已创建的 Label 数量（分帧创建进度）。 */
    private _created = 0;
    private _createDone = false;

    // 上一次实际渲染的值，用于差分刷新。
    private _rch: string[] = [];
    private _rfg: string[] = [];
    private _rbg: string[] = [];

    private _colorCache = new Map<string, Color>();
    private _bgDirty = true;

    constructor(root: Node) {
        this._root = root;

        const bgNode = new Node('GridBackground');
        bgNode.layer = Layers.Enum.UI_2D;
        const bgTransform = bgNode.addComponent(UITransform);
        bgTransform.setAnchorPoint(0, 1);
        bgTransform.setContentSize(GRID_WIDTH * CELL_WIDTH, GRID_HEIGHT * CELL_HEIGHT);
        this._bgGraphics = bgNode.addComponent(Graphics);
        root.addChild(bgNode);

        const total = GRID_WIDTH * GRID_HEIGHT;
        for (let i = 0; i < total; i++) {
            this._ch.push(' ');
            this._fg.push(DEFAULT_FG);
            this._bg.push(DEFAULT_BG);
            this._rch.push('');
            this._rfg.push('');
            this._rbg.push('');
            this._cells.push(null as any);
        }
        // 兜底：1820 个 Label 同步创建会阻塞主线程，改为每帧 stepCreate() 分帧创建。
        // 见方案文档 14.4 第 5 条。
    }

    /**
     * 分帧创建格子 Label，每帧最多 `budget` 个。
     * @returns 是否已全部创建完成
     */
    public stepCreate(budget = 200): boolean {
        if (this._createDone) { return true; }

        const total = GRID_WIDTH * GRID_HEIGHT;
        const end = Math.min(total, this._created + budget);

        for (; this._created < end; this._created++) {
            const index = this._created;
            const x = index % GRID_WIDTH;
            const y = Math.floor(index / GRID_WIDTH);

            const node = new Node('Cell');
            node.layer = Layers.Enum.UI_2D;
            node.parent = this._root;

            const transform = node.addComponent(UITransform);
            transform.setAnchorPoint(0.5, 0.5);
            transform.setContentSize(CELL_WIDTH, CELL_HEIGHT);
            node.setPosition(
                x * CELL_WIDTH + CELL_WIDTH / 2,
                -(y * CELL_HEIGHT + CELL_HEIGHT / 2)
            );

            const label = node.addComponent(Label);
            label.string = this._ch[index];
            label.fontSize = 20;
            label.lineHeight = 22;
            label.fontFamily = 'Consolas, monospace';
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            label.overflow = Label.Overflow.NONE;
            label.enableWrapText = false;
            label.cacheMode = Label.CacheMode.CHAR;
            label.color = this._parseColor(this._fg[index]);

            this._rch[index] = this._ch[index];
            this._rfg[index] = this._fg[index];
            this._cells[index] = label;
        }

        if (this._created >= total) {
            this._createDone = true;
            this.dirty = true;
        }
        return this._createDone;
    }

    public get width() { return GRID_WIDTH; }
    public get height() { return GRID_HEIGHT; }

    /** 对应 ROT.Display.draw。 */
    public draw(x: number, y: number, ch: string, fg?: string, bg?: string): void {
        if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
            return;
        }
        const ix = Math.round(x);
        const iy = Math.round(y);
        if (ix < 0 || ix >= GRID_WIDTH || iy < 0 || iy >= GRID_HEIGHT) {
            return;
        }
        const index = iy * GRID_WIDTH + ix;
        this._ch[index] = ch;
        this._fg[index] = fg || DEFAULT_FG;
        if (bg && bg !== this._bg[index]) {
            this._bg[index] = bg;
            this._bgDirty = true;
            this.dirty = true;
        } else if (bg) {
            this._bg[index] = bg;
            this.dirty = true;
        }
        this.dirty = true;
    }

    /** 对应 ROT.Display.drawText，支持 %c{} %b{} 内联颜色与自动换行。 */
    public drawText(x: number, y: number, text: string, maxWidth?: number): number {
        if (text === undefined || text === null) {
            text = '';
        }
        let fg: string | null = null;
        let bg: string | null = null;
        let cx = x;
        let lines = 1;
        const width = maxWidth || GRID_WIDTH - x;

        const tokens = this._tokenize(String(text), width);

        while (tokens.length) {
            const token: any = tokens.shift();
            switch (token.type) {
                case TYPE_TEXT: {
                    const value: string = token.value;
                    let prevIsSpace = false;
                    let prevIsWide = false;
                    for (let i = 0; i < value.length; i++) {
                        const code = value.charCodeAt(i);
                        const char = value.charAt(i);
                        const isWide = (code > 65280 && code < 65377)
                            || (code > 65500 && code < 65512)
                            || (code > 65518);
                        const isSpace = char.charCodeAt(0) === 32
                            || char.charCodeAt(0) === 12288;

                        if (prevIsWide && !isWide && !isSpace) { cx++; }
                        if (isWide && !prevIsSpace) { cx++; }

                        this.draw(cx++, y, char, fg === null ? undefined : fg,
                            bg === null ? undefined : bg);

                        prevIsSpace = isSpace;
                        prevIsWide = isWide;
                    }
                    break;
                }
                case TYPE_FG:
                    fg = token.value || null;
                    break;
                case TYPE_BG:
                    bg = token.value || null;
                    break;
                case TYPE_NEWLINE:
                    cx = x;
                    y++;
                    lines++;
                    break;
            }
        }
        return lines;
    }

    /** 对应 ROT.Display.clear。 */
    public clear(): void {
        for (let i = 0; i < this._ch.length; i++) {
            this._ch[i] = ' ';
            this._fg[i] = DEFAULT_FG;
            this._bg[i] = DEFAULT_BG;
        }
        this._bgDirty = true;
        this.dirty = true;
    }

    /** 差分刷新字符与背景（每帧调用一次即可）。 */
    public flush(): void {
        if (!this.dirty) { return; }

        if (this._bgDirty) {
            this._redrawBackground();
            this._bgDirty = false;
        }

        for (let i = 0; i < this._cells.length; i++) {
            const cell = this._cells[i];
            if (!cell) { continue; }
            if (this._ch[i] !== this._rch[i]) {
                cell.string = this._ch[i];
                this._rch[i] = this._ch[i];
            }
            if (this._fg[i] !== this._rfg[i]) {
                cell.color = this._parseColor(this._fg[i]);
                this._rfg[i] = this._fg[i];
            }
            this._rbg[i] = this._bg[i];
        }
        this.dirty = false;
    }

    private _redrawBackground(): void {
        const g = this._bgGraphics;
        g.clear();
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const bg = this._bg[y * GRID_WIDTH + x];
                if (bg === DEFAULT_BG) { continue; }
                g.fillColor = this._parseColor(bg);
                g.rect(
                    x * CELL_WIDTH,
                    -(y + 1) * CELL_HEIGHT,
                    CELL_WIDTH,
                    CELL_HEIGHT
                );
                g.fill();
            }
        }
    }

    private _parseColor(hex: string): Color {
        let color = this._colorCache.get(hex);
        if (!color) {
            color = new Color().fromHEX(hex);
            if (!color) {
                color = new Color(255, 255, 255, 255);
            }
            this._colorCache.set(hex, color);
        }
        return color;
    }

    // ==========================================================
    // rot.js Text.tokenize / _breakLines 的移植（保证换行行为一致）
    // ==========================================================

    private _tokenize(text: string, maxWidth: number): TextToken[] {
        const tokens: TextToken[] = [];
        let index = 0;

        text.replace(RE_COLORS, (match: string, kind: string, value: string, offset: number) => {
            const chunk = text.substring(index, offset);
            if (chunk.length) {
                tokens.push({ type: TYPE_TEXT, value: chunk });
            }
            tokens.push({
                type: kind === 'c' ? TYPE_FG : TYPE_BG,
                value: value.trim()
            });
            index = offset + match.length;
            return '';
        });

        const tail = text.substring(index);
        if (tail.length) {
            tokens.push({ type: TYPE_TEXT, value: tail });
        }

        return this._breakLines(tokens, maxWidth);
    }

    private _breakLines(tokens: TextToken[], maxWidth: number): TextToken[] {
        const width = maxWidth || Infinity;
        let i = 0;
        let x = 0;
        let lastSpaceToken = -1;
        let guard = 0;

        while (i < tokens.length) {
            if (++guard > MAX_BREAK_ITERATIONS) {
                console.warn('[drawText] breakLines aborted');
                break;
            }
            const token: any = tokens[i];
            if (token.type === TYPE_NEWLINE) {
                x = 0;
                lastSpaceToken = -1;
            }
            if (token.type !== TYPE_TEXT) {
                i++;
                continue;
            }

            while (x === 0 && token.value.charAt(0) === ' ') {
                token.value = token.value.substring(1);
            }

            let newlineIndex = token.value.indexOf('\n');
            if (newlineIndex !== -1) {
                token.value = this._breakInsideToken(tokens, i, newlineIndex, true);
                let chars = token.value.split('');
                while (chars.length && chars[chars.length - 1] === ' ') { chars.pop(); }
                token.value = chars.join('');
            }

            if (token.value.length) {
                if (x + token.value.length > width) {
                    let spaceIndex = -1;
                    for (;;) {
                        const next = token.value.indexOf(' ', spaceIndex + 1);
                        if (next === -1) { break; }
                        if (x + next > width) { break; }
                        spaceIndex = next;
                    }
                    if (spaceIndex !== -1) {
                        token.value = this._breakInsideToken(tokens, i, spaceIndex, true);
                    } else if (lastSpaceToken !== -1) {
                        const spaceToken: any = tokens[lastSpaceToken];
                        i = spaceToken.value.lastIndexOf(' ');
                        spaceToken.value = this._breakInsideToken(
                            tokens, lastSpaceToken, i, true);
                        i = lastSpaceToken;
                    } else {
                        token.value = this._breakInsideToken(
                            tokens, i, width - x, false);
                    }
                } else {
                    x += token.value.length;
                    if (token.value.indexOf(' ') !== -1) {
                        lastSpaceToken = i;
                    }
                }
            } else {
                tokens.splice(i, 1);
            }
            i++;
        }

        tokens.push({ type: TYPE_NEWLINE });

        let lastText: any = null;
        for (let k = 0; k < tokens.length; k++) {
            const token: any = tokens[k];
            if (token.type === TYPE_TEXT) {
                lastText = token;
            } else if (token.type === TYPE_NEWLINE) {
                if (lastText) {
                    const chars = lastText.value.split('');
                    while (chars.length && chars[chars.length - 1] === ' ') { chars.pop(); }
                    lastText.value = chars.join('');
                }
                lastText = null;
            }
        }
        tokens.pop();

        return tokens;
    }

    private _breakInsideToken(
        tokens: TextToken[], index: number, at: number, skipChar: boolean
    ): string {
        const token: any = tokens[index];
        tokens.splice(index + 1, 0,
            { type: TYPE_NEWLINE },
            {
                type: TYPE_TEXT,
                value: token.value.substring(at + (skipChar ? 1 : 0))
            });
        return token.value.substring(0, at);
    }
}
