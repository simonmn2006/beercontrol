import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';

class MqttService with ChangeNotifier {
  late MqttServerClient client;
  
  double _kegVolume = 42.5; // Liters
  double _flowRate = 0.0;   // L/min
  double _co2Pressure = 12.5; // PSI
  double _temperature = 3.8;  // Celsius
  double _pouredVolume = 1.45;
  String _co2Status = "STABLE";
  bool _kegLow = true;

  double get kegVolume => _kegVolume;
  double get flowRate => _flowRate;
  double get co2Pressure => _co2Pressure;
  double get temperature => _temperature;
  double get pouredVolume => _pouredVolume;
  String get co2Status => _co2Status;
  bool get kegLow => _kegLow;

  MqttService() {
    _initializeMqtt();
    
    // Fallback: Mock data if no broker is active
    if (kDebugMode) {
        Timer.periodic(const Duration(seconds: 2), (timer) {
            _simulateData();
        });
    }
  }

  void _initializeMqtt() async {
    client = MqttServerClient('localhost', 'dashboard_client');
    client.port = 1883;
    client.keepAlivePeriod = 20;
    client.onDisconnected = () => print('MQTT Disconnected');

    final connMessage = MqttConnectMessage()
        .withClientIdentifier('dashboard_client')
        .startClean()
        .withWillQos(MqttQos.atLeastOnce);
    client.connectionMessage = connMessage;

    try {
      await client.connect();
      print('MQTT Connected');
      
      client.subscribe('kegerator/keg1/volume', MqttQos.atMostOnce);
      client.subscribe('kegerator/keg1/flow', MqttQos.atMostOnce);
      client.subscribe('kegerator/co2/pressure', MqttQos.atMostOnce);
      client.subscribe('kegerator/fridge/temp', MqttQos.atMostOnce);

      client.updates!.listen((List<MqttReceivedMessage<MqttMessage>> c) {
        final MqttPublishMessage message = c[0].payload as MqttPublishMessage;
        final payload = MqttPublishPayload.bytesToStringAsString(message.payload.message);
        
        _handleMessage(c[0].topic, payload);
      });
    } catch (e) {
      print('MQTT Connection failed: $e');
    }
  }

  void _handleMessage(String topic, String payload) {
    try {
        double value = double.parse(payload);
        if (topic.contains('volume')) {
            _kegVolume = value;
            _kegLow = _kegVolume < 10.0;
        } else if (topic.contains('flow')) {
            _flowRate = value;
        } else if (topic.contains('pressure')) {
            _co2Pressure = value;
            _co2Status = (value > 11 && value < 14) ? "STABLE" : "ALERT";
        } else if (topic.contains('temp')) {
            _temperature = value;
        }
        notifyListeners();
    } catch (e) {
        print('Error parsing MQTT payload: $e');
    }
  }

  void _simulateData() {
    // Random walk for demo purposes
    _flowRate = (math.Random().nextDouble() < 0.2) ? 1.45 + math.Random().nextDouble() : 0.0;
    if (_flowRate > 0) {
        _kegVolume -= 0.01;
        _pouredVolume += 0.01;
    }
    _co2Pressure = 12.0 + math.Random().nextDouble();
    _temperature = 3.6 + math.Random().nextDouble() * 0.4;
    notifyListeners();
  }
}


