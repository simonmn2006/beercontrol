#version 460 core
#include <flutter/runtime_effect.glsl>

uniform vec2 uSize;
uniform float uTime;
uniform float uFillLevel; // 0.0 to 1.0
uniform float uTurbulence; // 0.0 to 1.0
uniform vec4 uBeerColor;
uniform vec4 uFoamColor;

out vec4 fragColor;

float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = FlutterFragCoord().xy / uSize;
    
    // Wave physics
    float wave = sin(uv.x * 10.0 + uTime * 5.0) * 0.02 * uTurbulence;
    float surface = 1.0 - uFillLevel + wave;
    
    // Beer mask
    float beerMask = step(surface, uv.y);
    
    // Foam layer (at the surface)
    float foamThickness = 0.05 + 0.1 * uTurbulence;
    float foamMask = step(surface - foamThickness, uv.y) * (1.0 - beerMask);
    
    // Base colors
    vec4 color = vec4(0.0);
    
    if (beerMask > 0.5) {
        // Beer with some internal gradient/bubbles
        float bubble = step(0.99, noise(uv * 10.0 + uTime * 0.1));
        color = uBeerColor + bubble * 0.2;
        // Darkness deeper down
        color *= (1.0 - (uv.y - surface) * 0.5);
    } else if (foamMask > 0.5) {
        // Moving foam texture
        float n = noise(uv * 20.0 + uTime);
        color = uFoamColor + n * 0.1;
    }
    
    // Transparency for glass effect (handled by painter overlay mostly, but base clear)
    fragColor = color;
}
