/**
 * Color Wheels (Lift/Gamma/Gain) implementation
 * Based on DaVinci Resolve's color grading methodology
 */

import { hslToRGB } from '../processors/color-math';
import type { ColorWheels, ColorWheelControl } from './types';

/**
 * Convert color wheel control to RGB adjustment
 * 
 * @param wheel - Color wheel control (hue, saturation, luminance)
 * @returns RGB adjustment values
 */
export function colorWheelToRGB(wheel: ColorWheelControl): [number, number, number] {
    // hslToRGB expects hue in 0-360 range (it normalizes internally)
    const h = wheel.hue;  // Already in 0-360 range
    const s = wheel.saturation;
    // For color wheels, luminance of 0.5 means "no adjustment"
    const l = 0.5;

    // Convert to RGB
    const [r, g, b] = hslToRGB(h, s, l);

    // Subtract 0.5 to center the color adjustment around 0
    // When saturation is 0, RGB is (0.5, 0.5, 0.5), so subtracting 0.5 gives (0, 0, 0)
    const rOffset = r - 0.5;
    const gOffset = g - 0.5;
    const bOffset = b - 0.5;

    // Apply luminance adjustment
    // Luminance shifts the entire RGB value up or down
    const lumFactor = wheel.luminance;

    return [
        rOffset + lumFactor,
        gOffset + lumFactor,
        bOffset + lumFactor
    ];
}

/**
 * Apply Lift adjustment (shadows offset)
 * Lift adds a color offset to the entire image, affecting shadows most
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param lift - Lift wheel control
 * @returns Adjusted RGB
 */
export function applyLift(
    r: number,
    g: number,
    b: number,
    lift: ColorWheelControl
): [number, number, number] {
    const [liftR, liftG, liftB] = colorWheelToRGB(lift);

    // Lift is an offset that affects the entire range, but more in shadows
    // Formula: output = input + lift
    return [
        r + liftR,
        g + liftG,
        b + liftB
    ];
}

/**
 * Apply Gamma adjustment (midtones power)
 * Gamma adjusts the midtones using a power function
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param gamma - Gamma wheel control
 * @returns Adjusted RGB
 */
export function applyGamma(
    r: number,
    g: number,
    b: number,
    gamma: ColorWheelControl
): [number, number, number] {
    const [gammaR, gammaG, gammaB] = colorWheelToRGB(gamma);

    // Gamma is applied as a power function
    // Higher gamma values compress midtones towards 0
    // Lower gamma values expand midtones towards 1
    // Formula: output = input ^ (1 / (1 + gamma_adjustment))
    const gammaExp = (val: number, adjustment: number): number => {
        if (val <= 0) return 0;
        // Map adjustment (-1 to 1) to gamma exponent
        // 0 adjustment = gamma 1.0 (no change)
        // Positive adjustment = gamma > 1 (darken midtones)
        // Negative adjustment = gamma < 1 (brighten midtones)
        const exponent = 1 / (1 + adjustment);
        return Math.pow(val, exponent);
    };

    return [
        gammaExp(r, gammaR),
        gammaExp(g, gammaG),
        gammaExp(b, gammaB)
    ];
}

/**
 * Apply Gain adjustment (highlights multiplier)
 * Gain multiplies the color values, affecting highlights most
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param gain - Gain wheel control
 * @returns Adjusted RGB
 */
export function applyGain(
    r: number,
    g: number,
    b: number,
    gain: ColorWheelControl
): [number, number, number] {
    const [gainR, gainG, gainB] = colorWheelToRGB(gain);

    // Gain is a multiplier
    // Formula: output = input * (1 + gain)
    return [
        r * (1 + gainR),
        g * (1 + gainG),
        b * (1 + gainB)
    ];
}

/**
 * Apply all color wheels (Lift/Gamma/Gain) to RGB values
 * Applied in order: Lift → Gamma → Gain
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param wheels - Color wheels configuration
 * @returns Adjusted RGB
 */
export function applyColorWheels(
    r: number,
    g: number,
    b: number,
    wheels: ColorWheels
): [number, number, number] {
    // Apply in order: Lift → Gamma → Gain
    let [rOut, gOut, bOut] = applyLift(r, g, b, wheels.lift);
    [rOut, gOut, bOut] = applyGamma(rOut, gOut, bOut, wheels.gamma);
    [rOut, gOut, bOut] = applyGain(rOut, gOut, bOut, wheels.gain);

    // Clamp to valid range
    return [
        Math.max(0, Math.min(1, rOut)),
        Math.max(0, Math.min(1, gOut)),
        Math.max(0, Math.min(1, bOut))
    ];
}
