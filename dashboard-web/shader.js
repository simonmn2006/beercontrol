const canvas = document.getElementById('beer-canvas');
const gl = canvas.getContext('webgl');

if (!gl) {
    console.error('WebGL not supported');
}

const vertexShaderSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
        v_uv = a_position * 0.5 + 0.5;
        v_uv.y = 1.0 - v_uv.y;
        gl_Position = vec4(a_position, 0.0, 1.0);
    }
`;

const fragmentShaderSource = `
    precision mediump float;
    varying vec2 v_uv;
    uniform float u_time;
    uniform float u_fill_level;
    uniform float u_turbulence;
    uniform vec4 u_beer_color;
    uniform vec4 u_foam_color;

    float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }

    void main() {
        vec2 uv = v_uv;
        
        // Wave physics
        float fastTime = u_time * 2.0;
        float wave = (sin(uv.x * 8.0 + fastTime) + cos(uv.x * 12.0 - fastTime * 0.5)) * 0.01 * u_turbulence;
        float surface = 1.0 - u_fill_level + wave;
        
        // Foam layer
        float foamThickness = 0.04 + 0.08 * u_turbulence;
        float foamBoundary = surface - foamThickness;
        
        vec4 color = vec4(0.0, 0.0, 0.0, 0.0);
        
        if (uv.y > surface) {
            // Beer area
            float depth = (uv.y - surface) * 0.8;
            color = u_beer_color;
            color.rgb *= (1.0 - depth); 
            
            // Bubbles
            if (hash(uv + u_time * 0.05) > 0.995) {
                color.rgb += 0.2;
            }
        } else if (uv.y > foamBoundary) {
            // Foam Area
            float n = hash(uv * 15.0 + u_time * 0.5);
            color = mix(u_foam_color, vec4(1.0, 1.0, 1.0, 1.0), n * 0.3);
        }
        
        gl_FragColor = color;
    }
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
}

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1,
]), gl.STATIC_DRAW);

const positionLocation = gl.getAttribLocation(program, 'a_position');
const timeLocation = gl.getUniformLocation(program, 'u_time');
const fillLocation = gl.getUniformLocation(program, 'u_fill_level');
const turbLocation = gl.getUniformLocation(program, 'u_turbulence');
const beerColorLocation = gl.getUniformLocation(program, 'u_beer_color');
const foamColorLocation = gl.getUniformLocation(program, 'u_foam_color');

// State managed by mqtt_service.js
window.dashboardState = {
    fillLevel: 0.85,
    turbulence: 0.2,
    time: 0
};

function render(time) {
    window.dashboardState.time = time * 0.001;
    
    // Auto-resize canvas
    const displayWidth  = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width  = displayWidth;
        canvas.height = displayHeight;
    }

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(timeLocation, window.dashboardState.time);
    gl.uniform1f(fillLocation, window.dashboardState.fillLevel);
    gl.uniform1f(turbLocation, window.dashboardState.turbulence);
    
    // Amber Beer
    gl.uniform4f(beerColorLocation, 0.84, 0.45, 0.0, 1.0);
    // Foam
    gl.uniform4f(foamColorLocation, 1.0, 0.98, 0.9, 1.0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(render);
}

requestAnimationFrame(render);
