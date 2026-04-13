import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_shaders/flutter_shaders.dart';
import '../services/mqtt_service.dart';

class KegWidget extends StatefulWidget {
  const KegWidget({super.key});

  @override
  State<KegWidget> createState() => _KegWidgetState();
}

class _KegWidgetState extends State<KegWidget> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mqtt = Provider.of<MqttService>(context);
    
    return SizedBox(
      width: 450,
      height: 700,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // 1. Liquid Shader Layer
          ShaderBuilder(
            assetKey: 'shaders/liquid_shader.frag',
            (context, shader, child) {
              return CustomPaint(
                size: const Size(350, 600),
                painter: LiquidPainter(
                  shader: shader,
                  time: _controller.value,
                  fillLevel: mqtt.kegVolume / 50.0, // Assume 50L max
                  turbulence: mqtt.flowRate > 0 ? 1.0 : 0.2,
                ),
              );
            },
          ),
          
          // 2. Keg Glass Overlay (Custom Painter)
          CustomPaint(
            size: const Size(400, 650),
            painter: KegGlassPainter(),
          ),
          
          // 3. Logo
          Positioned(
            top: 280,
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.amber.withOpacity(0.3),
                    blurRadius: 40,
                    spreadRadius: 10,
                  ),
                ],
              ),
              child: Image.network(
                  "https://i.ibb.co/vzN4K5D/brewmaster-logo.png", // Mock logo placeholder
                  width: 220,
                  errorBuilder: (context, error, stackTrace) => const LogoPlaceholder(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class LiquidPainter extends CustomPainter {
  final ui.FragmentShader shader;
  final double time;
  final double fillLevel;
  final double turbulence;

  LiquidPainter({
    required this.shader,
    required this.time,
    required this.fillLevel,
    required this.turbulence,
  });

  @override
  void paint(Canvas canvas, Size size) {
    shader.setFloat(0, size.width);
    shader.setFloat(1, size.height);
    shader.setFloat(2, time);
    shader.setFloat(3, fillLevel);
    shader.setFloat(4, turbulence);
    // Amber Color
    shader.setFloat(5, 0.84); // R
    shader.setFloat(6, 0.45); // G
    shader.setFloat(7, 0.0);  // B
    shader.setFloat(8, 1.0);  // A
    // Foam Color
    shader.setFloat(9, 1.0);  // R
    shader.setFloat(10, 0.98); // G
    shader.setFloat(11, 0.9);  // B
    shader.setFloat(12, 1.0);  // A

    final paint = Paint()..shader = shader;
    
    // Create a path that matches the keg interior
    final path = Path()
      ..addRRect(RRect.fromRectAndRadius(
        Rect.fromLTWH(0, 0, size.width, size.height),
        const Radius.circular(50),
      ));
      
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}

class KegGlassPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(0, 0, size.width, size.height);
    final rrect = RRect.fromRectAndRadius(rect, const Radius.circular(60));
    
    // Glass Body
    final paint = Paint()
      ..color = Colors.white.withOpacity(0.1)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4;
      
    canvas.drawRRect(rrect, paint);
    
    // Reflections
    final reflectionShader = const ui.Gradient.linear(
        Offset(0, 0),
        Offset(1, 1),
        [
          Color(0x66FFFFFF),
          Color(0x00FFFFFF),
          Color(0x33FFFFFF),
        ],
        [0.1, 0.5, 0.9],
      );
      
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(10, 10, size.width - 20, size.height - 20),
            const Radius.circular(55)
        ),
        Paint()..shader = reflectionShader..style = PaintingStyle.stroke..strokeWidth = 10
    );
    
    // Keg Metal Rings (Top/Bottom/Handle)
    final metalPaint = Paint()..color = Colors.white24..strokeWidth = 8..style = PaintingStyle.stroke;
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(0, 50, size.width, 20), const Radius.circular(5)), metalPaint);
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(0, size.height - 70, size.width, 20), const Radius.circular(5)), metalPaint);
    
    // Handle holder at top
    final handleRect = Rect.fromCenter(center: Offset(size.width / 2, 40), width: 100, height: 40);
    canvas.drawRRect(RRect.fromRectAndRadius(handleRect, const Radius.circular(10)), metalPaint);
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => false;
}

class LogoPlaceholder extends StatelessWidget {
  const LogoPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Icon(Icons.shield, color: Colors.amber, size: 80),
        Text(
          'BREWMASTER\nSELECT IPA',
          textAlign: TextAlign.center,
          style: GoogleFonts.cinzel(
            color: Colors.amber,
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
      ],
    );
  }
}
