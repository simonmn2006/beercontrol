import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:google_fonts/google_fonts.dart';
import 'widgets/keg_widget.dart';
import 'widgets/gauges.dart';
import 'services/mqtt_service.dart';

void main() {
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => MqttService()),
      ],
      child: const KegHeroDashboard(),
    ),
  );
}

class KegHeroDashboard extends StatelessWidget {
  const KegHeroDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF0D1117),
        textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme),
      ),
      home: const DashboardHome(),
    );
  }
}

class DashboardHome extends StatelessWidget {
  const DashboardHome({super.key});

  @override
  Widget build(BuildContext context) {
    final mqtt = Provider.of<MqttService>(context);
    
    return Scaffold(
      body: Container(
        width: 720,
        height: 1560,
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment.center,
            radius: 1.5,
            colors: [Color(0xFF161B22), Color(0xFF0D1117)],
          ),
        ),
        child: Column(
          children: [
            const SizedBox(height: 60),
            // Top Gauges Row
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 40),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  CO2Gauge(pressure: mqtt.co2Pressure, status: mqtt.co2Status),
                  TemperatureGauge(temp: mqtt.temperature),
                ],
              ),
            ),
            
            const Spacer(),
            
            // Middle Keg Section
            const Center(
              child: KegWidget(),
            ),
            
            const Spacer(),
            
            // Flow Rate & Poured Liter
            FlowRateDisplay(flow: mqtt.flowRate, poured: mqtt.pouredVolume),
            
            const SizedBox(height: 40),
            
            // Status Bar
            if (mqtt.kegLow) const LowLevelAlert(remaining: 8),
            
            const SizedBox(height: 60),
          ],
        ),
      ),
    );
  }
}

class FlowRateDisplay extends StatelessWidget {
  final double flow;
  final double poured;
  const FlowRateDisplay({super.key, required this.flow, required this.poured});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Text(
          'FLOW RATE',
          style: TextStyle(
            color: Colors.white70,
            fontSize: 18,
            fontWeight: FontWeight.w600,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            const Icon(Icons.water_drop, color: Color(0xFFFFD700), size: 40),
            const SizedBox(width: 15),
            Text(
              flow.toStringAsFixed(2),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 72,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(width: 10),
            const Text(
              'LITERS/MIN',
              style: TextStyle(
                color: Colors.white60,
                fontSize: 20,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
        const Text(
          'POURED',
          style: TextStyle(
            color: Colors.white54,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class LowLevelAlert extends StatelessWidget {
  final double remaining;
  const LowLevelAlert({super.key, required this.remaining});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 40),
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 20),
      decoration: BoxDecoration(
        color: const Color(0xFF1F0B0B),
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: Colors.red.withOpacity(0.5), width: 2),
        boxShadow: [
          BoxShadow(
            color: Colors.red.withOpacity(0.2),
            blurRadius: 15,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.warning_amber_rounded, color: Colors.white, size: 24),
              const SizedBox(width: 10),
              Text(
                'KEG STATUS: LOW LEVEL - PLEASE REPLACE SOON!',
                style: GoogleFonts.orbitron(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          Text(
            '(${remaining.toInt()} LITERS REMAINING)',
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}
