import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class CO2Gauge extends StatelessWidget {
  final double pressure;
  final String status;

  const CO2Gauge({super.key, required this.pressure, required this.status});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Text(
          'CO2 PRESSURE',
          style: TextStyle(
            color: Colors.white60,
            fontSize: 14,
            fontWeight: FontWeight.bold,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: 180,
          height: 180,
          child: Stack(
            alignment: Alignment.center,
            children: [
              CustomPaint(
                size: const Size(180, 180),
                painter: GaugePainter(value: pressure / 20), // Assume 20 is max
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    pressure.toStringAsFixed(1),
                    style: GoogleFonts.orbitron(
                      color: Colors.white,
                      fontSize: 42,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const Text(
                    'PSI',
                    style: TextStyle(color: Colors.white54, fontSize: 16),
                  ),
                  const SizedBox(height: 5),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: Colors.greenAccent,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Colors.greenAccent,
                              blurRadius: 5,
                              spreadRadius: 1,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        status.toUpperCase(),
                        style: const TextStyle(
                          color: Colors.greenAccent,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class GaugePainter extends CustomPainter {
  final double value; // 0.0 to 1.0

  GaugePainter({required this.value});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;
    const startAngle = -7 / 6 * math.pi;
    const sweepAngle = 4 / 3 * math.pi;

    final backgroundPaint = Paint()
      ..color = Colors.white10
      ..strokeWidth = 12
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final progressPaint = Paint()
      ..shader = const SweepGradient(
        colors: [Color(0xFFFFA500), Color(0xFFFF4500)],
        stops: [0.0, 1.0],
      ).createShader(Rect.fromCircle(center: center, radius: radius))
      ..strokeWidth = 12
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final glowPaint = Paint()
      ..color = const Color(0xFFFFA500).withOpacity(0.3)
      ..strokeWidth = 18
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius - 10),
      startAngle,
      sweepAngle,
      false,
      backgroundPaint,
    );

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius - 10),
      startAngle,
      sweepAngle * value,
      false,
      glowPaint,
    );

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius - 10),
      startAngle,
      sweepAngle * value,
      false,
      progressPaint,
    );
    
    // Ticks
    final tickPaint = Paint()..color = Colors.white24..strokeWidth = 2;
    for (int i = 0; i <= 10; i++) {
        final angle = startAngle + (sweepAngle * (i / 10));
        final inner = radius - 25;
        final outer = radius - 15;
        canvas.drawLine(
            Offset(center.dx + inner * math.cos(angle), center.dy + inner * math.sin(angle)),
            Offset(center.dx + outer * math.cos(angle), center.dy + outer * math.sin(angle)),
            tickPaint
        );
    }
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => true;
}

class TemperatureGauge extends StatelessWidget {
  final double temp;

  const TemperatureGauge({super.key, required this.temp});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Text(
          'TEMPERATURE',
          style: TextStyle(
            color: Colors.white60,
            fontSize: 14,
            fontWeight: FontWeight.bold,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 20),
        Stack(
          alignment: Alignment.center,
          children: [
            // Ice crystals glow effect background
            Image.network(
                "https://cdn-icons-png.flaticon.com/512/2322/2322701.png", // Placeholder for actual ice asset
                color: Colors.blueAccent.withOpacity(0.2),
                width: 140,
            ),
            Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  temp.toStringAsFixed(1),
                  style: GoogleFonts.orbitron(
                    color: const Color(0xFFB0E0E6),
                    fontSize: 52,
                    fontWeight: FontWeight.bold,
                    shadows: [
                        const Shadow(color: Colors.blueAccent, blurRadius: 20),
                    ]
                  ),
                ),
                Text(
                  '°C',
                  style: GoogleFonts.orbitron(
                    color: const Color(0xFFB0E0E6),
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const Positioned(
                bottom: -40,
                child: Icon(Icons.ac_unit, color: Colors.blueAccent, size: 80, opacity: 0.3,)
            )
          ],
        ),
      ],
    );
  }
}
