#version 460 core
#include <flutter/runtime_effect.glsl>

precision mediump float;

uniform vec2 uSize;
uniform float uTime;
uniform float uFillLevel; // 0.0 to 1.0
uniform float uTurbulence; // 0.0 to 1.0
uniform vec4 uBeerColor;
uniform vec4 uFoamColor;

out vec4 fragColor;

// Faster hash for RPi 4 hardware
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main() {
    vec2 uv = FlutterFragCoord().xy / uSize;
    
    // Simplified wave physics
    float fastTime = uTime * 4.0;
    float wave = (sin(uv.x * 8.0 + fastTime) + cos(uv.x * 12.0 - fastTime * 0.5)) * 0.01 * uTurbulence;
    float surface = 1.0 - uFillLevel + wave;
    
    // Foam threshold
    float foamThickness = 0.04 + 0.08 * uTurbulence;
    float foamBoundary = surface - foamThickness;
    
    vec4 color = vec4(0.0);
    
    if (uv.y > surface) {
        // Beer area
        float d = (uv.y - surface) * 0.8;
        color = uBeerColor * (1.0 - d); // Ambient occlusion feel
        
        // Faster bubbles
        if (hash(uv + uTime * 0.05) > 0.992) {
            color += 0.15;
        }
    } else if (uv.y > foamBoundary) {
        // Foam Area
        float n = hash(uv * 15.0 + uTime);
        color = mix(uFoamColor, vec4(1.0), n * 0.2);
    }
    
    fragColor = color;
}
