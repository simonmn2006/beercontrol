// KegHero Web Dashboard - MQTT Data Binding
const MQTT_URL = 'ws://localhost:9001'; // Uses the WebSocket listener in mosquitto.conf

const client = mqtt.connect(MQTT_URL);

// UI Elements mapping
const elements = {
    co2Value: document.getElementById('co2-value'),
    co2Progress: document.getElementById('co2-progress-bar'),
    co2Status: document.getElementById('co2-status'),
    tempValue: document.getElementById('temp-value'),
    flowValue: document.getElementById('flow-value'),
    kegRemaining: document.getElementById('liters-remaining'),
    alertBar: document.getElementById('status-alert')
};

client.on('connect', () => {
    console.log('✅ Connected to MQTT via WebSocket');
    
    // Subscribe to relevant topics
    client.subscribe('kegerator/keg1/volume');
    client.subscribe('kegerator/keg1/flow');
    client.subscribe('kegerator/co2/pressure');
    client.subscribe('kegerator/fridge/temp');
});

client.on('message', (topic, message) => {
    const payload = parseFloat(message.toString());
    
    if (isNaN(payload)) return;

    switch(topic) {
        case 'kegerator/keg1/volume':
            updateKegVolume(payload);
            break;
        case 'kegerator/keg1/flow':
            updateFlowRate(payload);
            break;
        case 'kegerator/co2/pressure':
            updateCO2(payload);
            break;
        case 'kegerator/fridge/temp':
            updateTemp(payload);
            break;
    }
});

function updateKegVolume(volume) {
    // Assume 50L max
    const percentage = volume / 50.0;
    window.dashboardState.fillLevel = percentage;
    elements.kegRemaining.innerText = Math.round(volume);
    
    if (volume < 10) {
        elements.alertBar.style.display = 'flex';
    } else {
        elements.alertBar.style.display = 'none';
    }
}

function updateFlowRate(flow) {
    elements.flowValue.innerText = flow.toFixed(2);
    // Increase wave turbulence when beer is flowing
    window.dashboardState.turbulence = flow > 0 ? 1.5 : 0.2;
}

function updateCO2(pressure) {
    elements.co2Value.innerText = pressure.toFixed(1);
    
    // Update circular gauge (212 is full circumference in our path)
    const maxPSI = 20.0;
    const offset = 212 - (pressure / maxPSI) * 212;
    elements.co2Progress.style.strokeDashoffset = offset;
    
    if (pressure > 11 && pressure < 14) {
        elements.co2Status.innerText = 'STABLE';
        elements.co2Status.style.color = '#4ade80';
    } else {
        elements.co2Status.innerText = 'ALERT';
        elements.co2Status.style.color = '#ff3e3e';
    }
}

function updateTemp(temp) {
    elements.tempValue.innerText = temp.toFixed(1);
}

// SIMULATOR: Run mock data if no real broker activity
let lastMsgTime = Date.now();
setInterval(() => {
    if (Date.now() - lastMsgTime > 5000) {
        simulateData();
    }
}, 2000);

function simulateData() {
    const mockFlow = Math.random() < 0.2 ? 1.45 + (Math.random() * 0.5) : 0;
    updateFlowRate(mockFlow);
    
    if (mockFlow > 0) {
        const currentVol = parseFloat(elements.kegRemaining.innerText) - 0.01;
        updateKegVolume(Math.max(0, currentVol));
    }
    
    const mockCO2 = 12.0 + (Math.random() * 1.5);
    updateCO2(mockCO2);
    
    const mockTemp = 3.6 + (Math.random() * 0.4);
    updateTemp(mockTemp);
}
