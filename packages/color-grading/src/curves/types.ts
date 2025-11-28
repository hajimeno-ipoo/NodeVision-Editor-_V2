/**
 * カーブポイント
 * DaVinci Resolve / Adobe Premiere スタイルのカーブエディタ用
 */
export interface CurvePoint {
    /** 入力値（0.0 ~ 1.0） */
    x: number;
    /** 出力値（0.0 ~ 1.0） */
    y: number;
}

/**
 * カーブ定義（ソート済みポイントの配列）
 * 最低でも両端の (0, 0) と (1, 1) を含むべき
 */
export type Curve = CurvePoint[];

/**
 * RGB Curves
 * Master カーブは全チャンネルに適用される
 * R/G/B は個別のチャンネルに適用される
 */
export interface RGBCurves {
    /** マスターカーブ（全チャンネル） */
    master: Curve;
    /** 赤チャンネルカーブ */
    red: Curve;
    /** 緑チャンネルカーブ */
    green: Curve;
    /** 青チャンネルカーブ */
    blue: Curve;
}

/**
 * Hue Curves
 * 色相ごとに Hue/Saturation/Luminance を調整
 */
export interface HueCurves {
    /** Hue vs Hue */
    hueVsHue: Curve;
    /** Hue vs Saturation */
    hueVsSat: Curve;
    /** Hue vs Luminance */
    hueVsLuma: Curve;
}

/**
 * デフォルトのカーブ（変更なし）
 * 0.0 から 1.0 まで線形
 */
export const DEFAULT_CURVE: Curve = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
];

/**
 * デフォルトのRGBカーブセット
 */
export const DEFAULT_RGB_CURVES: RGBCurves = {
    master: DEFAULT_CURVE,
    red: DEFAULT_CURVE,
    green: DEFAULT_CURVE,
    blue: DEFAULT_CURVE,
};

/**
 * デフォルトのHueカーブセット
 */
export const DEFAULT_HUE_CURVES: HueCurves = {
    hueVsHue: DEFAULT_CURVE,
    hueVsSat: DEFAULT_CURVE,
    hueVsLuma: DEFAULT_CURVE,
};
