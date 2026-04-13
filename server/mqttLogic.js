'use strict';

const mqttService = require('./mqtt');
const { db } = require('./db');

/**
 * MqttLogic handles the business logic of incoming MQTT messages
 * and coordinates updates to the database and displays.
 */
class MqttLogic {
  constructor() {
    this.init();
  }

  init() {
    console.log('🧠 MQTT Logic Engine initialized');
    mqttService.on('message', (msg) => this.handleMessage(msg));
  }

  /**
   * Routes incoming messages based on topic structure
   * Typical topics:
   * - keghero/sensor/[SENSOR_ID]/pour -> { liters: 0.1, flow: 1.5, temp: 4.2 }
   * - keghero/sensor/[SENSOR_ID]/heartbeat -> { status: "online", battery: 95 }
   * @param {Object} msg { topic, data, time }
   */
  async handleMessage(msg) {
    const parts = msg.topic.split('/');
    if (parts[0] !== 'keghero' || parts[1] !== 'sensor') return;

    const sensorId = parts[2];
    const type = parts[3];

    if (type === 'pour') {
      await this.processPour(sensorId, msg.data);
    } else if (type === 'heartbeat') {
      await this.processHeartbeat(sensorId, msg.data);
    }
  }

  /**
   * Processes a pour event: updates remaining liters and records event
   */
  async processPour(sensorId, data) {
    const liters = parseFloat(data.liters || 0);
    if (liters <= 0) return;

    try {
      // Find the keg associated with this sensor
      const keg = await db.get("SELECT * FROM kegs WHERE esp32_sensor_id = ? AND active = 1", [sensorId]);
      if (!keg) {
        console.warn(`⚠️ MQTT: Pour received for unknown/inactive sensor ID: ${sensorId}`);
        return;
      }

      const newRemaining = Math.max(0, (keg.remaining_liters || 0) - liters);
      
      // Update Keg
      await db.run("UPDATE kegs SET remaining_liters = ?, current_flow = ?, current_temp = ?, current_co2 = ? WHERE id = ?", 
        [newRemaining, data.flow || 0, data.temp || keg.current_temp, data.co2 || keg.current_co2, keg.id]);

      // Record Pour Event
      await db.run("INSERT INTO pour_events (keg_id, restaurant_id, liters, flow_rate, temp, co2) VALUES (?,?,?,?,?,?)",
        [keg.id, keg.restaurant_id, liters, data.flow || 0, data.temp || 0, data.co2 || 0]);

      console.log(`🍺 MQTT: Pour processed for ${keg.beer_name} (${liters}L). Remaining: ${newRemaining.toFixed(2)}L`);

      // Trigger display sync for this keg's display
      if (keg.esp32_display_id) {
        await this.syncDisplay(keg.esp32_display_id);
      }
    } catch (err) {
      console.error('❌ MQTT Logic: Error processing pour:', err.message);
    }
  }

  /**
   * Updates online status and last known telemetry
   */
  async processHeartbeat(sensorId, data) {
    try {
      await db.run("UPDATE kegs SET online = 1, current_temp = ? WHERE esp32_sensor_id = ?", 
        [data.temp || 0, sensorId]);
    } catch (err) {
      console.error('❌ MQTT Logic: Error processing heartbeat:', err.message);
    }
  }

  /**
   * Fetches all kegs for a display and publishes a bundle to MQTT
   * @param {string} displayId 
   */
  async syncDisplay(displayId) {
    if (!displayId) return;
    try {
      const kegs = await db.all(`
        SELECT id, tap_number, beer_name, keg_size_liters, remaining_liters, 
               current_temp, current_co2, current_flow, co2_min_bar, temp_max_c,
               alert_low_pct, alert_critical_pct, logo_path
        FROM kegs 
        WHERE esp32_display_id = ? AND active = 1
        ORDER BY tap_number
      `, [displayId]);

      if (kegs.length === 0) return;

      const topic = `keghero/display/${displayId}/kegs`;
      const payload = {
        display_id: displayId,
        timestamp: new Date().toISOString(),
        keg_count: kegs.length,
        kegs: kegs.map(k => ({
          ...k,
          remaining_pct: Math.round(((k.remaining_liters || 0) / (k.keg_size_liters || 1)) * 100)
        }))
      };

      mqttService.publish(topic, payload);
      console.log(`📺 MQTT: Synced display ${displayId} (${kegs.length} kegs)`);
    } catch (err) {
      console.error('❌ MQTT Logic: Error syncing display:', err.message);
    }
  }
}

module.exports = new MqttLogic();
