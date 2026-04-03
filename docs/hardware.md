# Hardware de Rick

## Lista de Componentes

### Implementados

| Componente | Modelo | Notas |
|-----------|--------|-------|
| Raspberry Pi | Zero 2 W | ARM64, 512MB RAM, WiFi integrado |
| Microfono | USB generico | Captura via ALSA (arecord) |
| Tarjeta de sonido | USB generica | Salida de audio para parlante |
| Parlante | Activo | Conectado a tarjeta de sonido USB |
| Hub USB | Con adaptador OTG | Necesario en Pi Zero (un solo puerto micro-USB) |
| MicroSD | 16GB+ | Con Raspberry Pi OS |

### Planificados (V1 completo)

| Componente | Modelo | Notas |
|-----------|--------|-------|
| Pantalla OLED | SH1106 128x64 | Conexion I2C |
| Boton arcade | Generico | Push-to-talk via GPIO |
| Driver motores | L298N o TB6612FNG | Control de traccion diferencial |
| Motores TT | Con ruedas | Dos motores para traccion diferencial |
| Power bank | 5V 2A+ | Alimentacion de Raspberry Pi |
| Bateria separada | Para motores | Evitar ruido electrico y reinicios |

---

## Conexiones GPIO

### Referencia del Header GPIO (Pi Zero 2 W)

El header tiene 40 pines. El **pin 1** esta en la esquina mas cercana a la ranura de la SD card.

```
Pin 1 esta aca
    |
    v
[ 1][ 2]    ← 1=3.3V, 2=5V
[ 3][ 4]    ← 3=SDA(GPIO2), 4=5V
[ 5][ 6]    ← 5=SCL(GPIO3), 6=GND
[ 7][ 8]
[ 9][10]
[11][12]
...
[39][40]
```

### Pantalla OLED SH1106 (I2C)

| Pin OLED | Pin Raspberry Pi | Funcion |
|----------|-----------------|---------|
| VCC | Pin 1 (3.3V) | Alimentacion |
| GND | Pin 6 (GND) | Tierra |
| SDA | Pin 3 (GPIO 2) | Datos I2C |
| SCL | Pin 5 (GPIO 3) | Reloj I2C |

**Nota:** Requiere habilitar I2C en la Raspi: `sudo raspi-config` → Interface Options → I2C → Enable. Verificar conexion con `sudo i2cdetect -y 1` (debe aparecer direccion `0x3C` o `0x3D`).

**Importante:** La Pi Zero 2 W no viene con header soldado. Se necesita soldar una tira de 40 pines macho 2.54mm.

### Boton Arcade (planificado)

Pines GPIO por definir. Se conectara entre un pin GPIO y GND con resistencia pull-up interna.

### Driver de Motores (planificado)

Pines GPIO por definir. Requiere 4 pines: 2 de direccion + 2 de PWM para los dos motores.

---

## Alimentacion

| Fuente | Destino | Razon |
|--------|---------|-------|
| Power bank 5V | Raspberry Pi (via micro-USB) | Alimentacion principal |
| Bateria separada | Motores (via driver) | Evitar ruido electrico, caidas de tension y reinicios |

Las fuentes deben compartir GND (tierra comun) entre la Raspberry Pi y el driver de motores.

---

## Traccion Diferencial

Dos motores TT controlados independientemente permiten todos los movimientos:

| Accion | Motor Izquierdo | Motor Derecho |
|--------|----------------|---------------|
| Avanzar | Adelante | Adelante |
| Retroceder | Atras | Atras |
| Girar derecha | Adelante | Parado |
| Girar izquierda | Parado | Adelante |
| Pivot sobre eje | Adelante | Atras |

Interfaz: GPIO → Driver (L298N/TB6612FNG) → Motores

---

## Audio y Echo Cancellation

### Configuracion actual (software)

El sistema usa half-duplex por software: mutea el microfono mientras Rick habla (`MUTE_MIC_WHILE_SPEAKING=true`). Esto evita que el parlante genere eco que Deepgram interprete como habla del usuario.

### Opciones de hardware para echo cancellation

| Dispositivo | Ventaja | Configuracion |
|------------|---------|---------------|
| ReSpeaker 2-Mic HAT | AEC por hardware, permite full-duplex | `MUTE_MIC_WHILE_SPEAKING=false` |
| ReSpeaker Lite USB | Alternativa USB, sin HAT | `MUTE_MIC_WHILE_SPEAKING=false` |
| Sin hardware AEC | Mas simple y barato | `MUTE_MIC_WHILE_SPEAKING=true` (default) |

### Backends de audio por plataforma

| Plataforma | Captura | Reproduccion | Notas |
|-----------|---------|-------------|-------|
| Raspberry Pi / Linux | arecord (ALSA) | aplay (ALSA) | Incluido en `alsa-utils` |
| Windows | SoX | SoX | Requiere `SOX_PATH` en .env |
