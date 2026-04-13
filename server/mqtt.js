'use strict';

const mqtt = require('mqtt');
const { db } = require('./db');
const EventEmitter = require('events');

class MqttService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isConnected = false;
    this.currentConfig = null;
  }

  async init() {
    console.log('📡 Initializing MQTT Service...');
    try {
      const settings = await db.all('SELECT * FROM settings WHERE `key` LIKE "mqtt_%"');
      const config = {};
      settings.forEach(s => {
        config[s.key.replace('mqtt_', '')] = s.value;
      });

      if (config.host) {
        this.connect(config);
      } else {
        console.log('⚠️ MQTT host not configured. Waiting for admin setup.');
      }
    } catch (e) {
      console.error('MQTT Init Error:', e.message);
    }
  }

  connect(config) {
    if (this.client) {
      this.client.end();
    }

    this.currentConfig = config;
    const url = `mqtt://${config.host}:${config.port || 1883}`;
    console.log(`📡 Connecting to MQTT: ${url}`);

    const options = {
      reconnectPeriod: 5000,
      connectTimeout: 30000,
    };

    if (config.user) options.username = config.user;
    if (config.pass) options.password = config.pass;

    this.client = mqtt.connect(url, options);

    this.client.on('connect', () => {
      this.isConnected = true;
      console.log('✅ MQTT Connected');
      this.client.subscribe('#'); // Subscribe to all for monitor
      this.emit('status', { connected: true, broker: url });
    });

    this.client.on('message', (topic, message) => {
      let data = message.toString();
      try { data = JSON.parse(data); } catch (e) {}
      this.emit('message', { topic, data, time: new Date() });
    });

    this.client.on('error', (err) => {
      this.isConnected = false;
      console.error('❌ MQTT Error:', err.message);
      this.emit('status', { connected: false, error: err.message });
    });

    this.client.on('close', () => {
      this.isConnected = false;
      this.emit('status', { connected: false });
    });
  }

  async testConnection(config) {
    return new Promise((resolve) => {
      const url = `mqtt://${config.host}:${config.port || 1883}`;
      console.log(`📡 Testing MQTT connection to: ${url}`);
      
      const options = {
        reconnectPeriod: 0, // Don't reconnect for test
        connectTimeout: 5000,
      };
      if (config.user) options.username = config.user;
      if (config.pass) options.password = config.pass;

      const testClient = mqtt.connect(url, options);

      testClient.on('connect', () => {
        testClient.end();
        resolve({ success: true, message: 'Connection successful!' });
      });

      testClient.on('error', (err) => {
        testClient.end();
        resolve({ success: false, message: err.message });
      });

      setTimeout(() => {
        testClient.end();
        resolve({ success: false, message: 'Timeout connecting to broker' });
      }, 5500);
    });
  }

  getStatus() {
    return {
      connected: this.isConnected,
      broker: this.currentConfig ? `${this.currentConfig.host}:${this.currentConfig.port || 1883}` : 'Not configured'
    };
  }

  /**
   * Publish a message to the MQTT broker
   * @param {string} topic 
   * @param {Object|string} data 
   * @param {Object} options 
   */
  publish(topic, data, options = { qos: 1, retain: true }) {
    if (!this.client || !this.isConnected) {
      console.error('⚠️ MQTT: Cannot publish, client not connected');
      return false;
    }
    const payload = (typeof data === 'object') ? JSON.stringify(data) : data.toString();
    this.client.publish(topic, payload, options, (err) => {
      if (err) console.error(`❌ MQTT Publish Error [${topic}]:`, err.message);
    });
    return true;
  }
}

const mqttService = new MqttService();
module.exports = mqttService;
