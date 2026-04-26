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
   * - keghero/facility/[SENSOR_ID]/temp -> { temp: 4.2 }
   * @param {Object} msg { topic, data, time }
   */
  async handleMessage(msg) {
    const parts = msg.topic.split('/');
    if (parts[0] !== 'keghero') return;

    const category = parts[1];
    const sensorId = parts[2];
    const type     = parts[3];

    if (category === 'sensor') {
      if (type === 'pour') {
        await this.processPour(sensorId, msg.data);
      } else if (type === 'heartbeat') {
        await this.processHeartbeat(sensorId, msg.data);
      }
    } else if (category === 'facility') {
      if (type === 'temp' || type === 'telemetry') {
        await this.processFacilityTemp(sensorId, msg.data);
      }
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
   * Processes facility sensor data (e.g. Fridge Temp)
   */
  async processFacilityTemp(sensorId, data) {
    const temp = parseFloat(typeof data === 'object' ? (data.temp || data.value || 0) : data);
    
    try {
      // 1. Find the sensor
      const sensor = await db.get("SELECT * FROM facility_sensors WHERE sensor_id = ?", [sensorId]);
      if (!sensor) {
        // Optional: Auto-discover new sensors? 
        // For now, only process known ones to avoid db pollution from rogue devices.
        return;
      }

      // 2. Update current state
      await db.run("UPDATE facility_sensors SET current_value = ?, online = 1, last_seen = NOW() WHERE id = ?", 
        [temp, sensor.id]);

      // 3. Log to historical data (every 10 mins approx)
      const lastLog = await db.get("SELECT recorded_at FROM sensor_logs WHERE sensor_id = ? ORDER BY recorded_at DESC LIMIT 1", [sensorId]);
      const now = new Date();
      if (!lastLog || (now - new Date(lastLog.recorded_at)) >= 10 * 60 * 1000) {
        await db.run("INSERT INTO sensor_logs (sensor_id, value) VALUES (?, ?)", [sensorId, temp]);
      }

      // 4. Threshold Checks & Alerts
      if (temp > sensor.max_threshold) {
        await this.createFacilityAlert(sensor, 'high_temp', `High Temperature Alert: ${sensor.name} is at ${temp}°C (Limit: ${sensor.max_threshold}°C)`);
      } else if (temp < sensor.min_threshold) {
        await this.createFacilityAlert(sensor, 'low_temp', `Low Temperature Alert: ${sensor.name} is at ${temp}°C (Limit: ${sensor.min_threshold}°C)`);
      }

    } catch (err) {
      console.error('❌ MQTT Logic: Error processing facility temp:', err.message);
    }
  }

  async createFacilityAlert(sensor, type, message) {
    try {
      // Check if an unresolved alert of this type already exists for this sensor
      const existing = await db.get("SELECT id FROM alerts WHERE restaurant_id = ? AND message LIKE ? AND resolved = 0", 
        [sensor.restaurant_id, `%${sensor.name}%`]);
      
      if (!existing) {
        await db.run("INSERT INTO alerts (restaurant_id, type, message) VALUES (?, ?, ?)", 
          [sensor.restaurant_id, type, message]);
        console.warn(`🔔 ALERT: ${message}`);
      }
    } catch (e) {
      console.error('❌ Error creating facility alert:', e);
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
        SELECT k.id, k.tap_number, k.beer_name, k.keg_size_liters, k.remaining_liters, 
               k.current_temp, k.current_co2, k.current_flow, k.co2_min_bar, k.temp_max_c,
               k.alert_low_pct, k.alert_critical_pct, k.logo_path,
               b.logo_data as library_logo,
               r.display_feature_temp, r.display_feature_co2
        FROM kegs k
        JOIN restaurants r ON k.restaurant_id = r.id
        LEFT JOIN beer_library b ON k.beer_name = b.name
        WHERE k.esp32_display_id = ? AND k.active = 1
        ORDER BY k.tap_number
      `, [displayId]);

      if (kegs.length === 0) return;

      const topic = `keghero/display/${displayId}/kegs`;
      const payload = {
        display_id: displayId,
        timestamp: new Date().toISOString(),
        keg_count: kegs.length,
        feature_temp: kegs[0].display_feature_temp === 1,
        feature_co2: kegs[0].display_feature_co2 === 1,
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
