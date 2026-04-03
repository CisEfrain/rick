# CONSTITUCION DEL PROYECTO

## RICK V1 — Robot Interactivo con Voz y Movimiento

---

## 1. Vision del Sistema

Rick es un robot fisico interactivo que:

- Escucha mediante interaccion fisica (PTT)
- Procesa voz con IA
- Responde con audio (TTS)
- Expresa estados mediante pantalla
- Puede moverse mediante traccion diferencial

> **Filosofia clave:** Simple, robusto, incremental (agentic-ready)

---

## 2. Principios de Diseno

### 2.1 Simplicidad operativa

- Evitar AEC (usar half-duplex)
- Evitar Bluetooth (cableado estable)
- Minimizar dependencias externas

### 2.2 Separacion de responsabilidades

| Capa | Responsabilidad |
|------|----------------|
| Hardware | Captura / salida fisica |
| Runtime local | Control + orquestacion |
| IA / Backend | Inteligencia |

### 2.3 Control determinista

- Boton fisico controla inicio de interaccion
- No dependencia de VAD en V1
- Estado siempre explicito

### 2.4 Evolucion modular

Rick esta disenado para evolucionar hacia:

- Multi-agente
- Percepcion contextual
- Autonomia fisica

---

## 3. Arquitectura General

```text
Usuario
   |
   v
[ BOTON PTT ]
   |
   v
Raspberry Pi (Core)
   |
   |-- Microfono USB
   |-- Speaker (USB / 3.5mm)
   |-- Pantalla OLED (I2C)
   |-- Driver Motores
   |       |
   |    Motores -> Movimiento
   |
   +-- Runtime (Python)
            |
            v
       Backend IA
```

---

## 4. Capas del Sistema

### 4.1 Capa Hardware

**Componentes:**

- Raspberry Pi Zero 2 W
- Pantalla OLED SH1106 (I2C)
- Microfono USB
- Tarjeta sonido USB
- Parlante activo
- Boton arcade (GPIO)
- Driver motores (L298N / TB6612FNG)
- Motores TT + ruedas
- Power bank
- Hub USB + OTG

**Subcapas:**

| Tipo | Componentes |
|------|------------|
| Input | Boton (GPIO), Microfono USB |
| Output | Parlante, Pantalla OLED |
| Actuacion | Motores |

### 4.2 Runtime local (Python)

**Responsabilidades:**

- Control de estados
- Captura de audio
- Reproduccion de audio
- Render de UI (OLED)
- Control de motores
- Orquestacion de interaccion

### 4.3 Backend IA

**Responsabilidades:**

- STT (speech to text)
- LLM (intencion / respuesta)
- TTS (text to speech)

---

## 5. Modelo de Interaccion

### Half-duplex

> **Regla fundamental:** O escucha o habla, nunca ambos

### Maquina de estados

```text
IDLE
 |
 v
LISTENING (boton presionado)
 |
 v
PROCESSING (boton soltado)
 |
 v
SPEAKING
 |
 v
IDLE
```

### Control de interaccion (Boton PTT)

- **Presionar** -> iniciar captura
- **Soltar** -> procesar
- **Presionar durante TTS** -> interrumpir

---

## 6. Flujo Completo

```text
Usuario presiona boton
        |
        v
Mic activo
        |
        v
Captura audio
        |
        v
Usuario suelta boton
        |
        v
Audio enviado a backend
        |
        v
IA procesa
        |
        v
Respuesta TTS
        |
        v
Robot reproduce audio
        |
        v
Pantalla muestra estado
        |
        v
Vuelve a IDLE
```

---

## 7. Arquitectura de Audio

| Componente | Detalle |
|-----------|---------|
| Input | Mic USB, captura via ALSA |
| Output | Tarjeta sonido USB -> parlante |
| Control | Si TTS activo -> mic desactivado |

---

## 8. Arquitectura de Movimiento

**Modelo:** Traccion diferencial (motor izquierdo + motor derecho)

| Accion | Motores |
|--------|---------|
| Avanzar | Ambos adelante |
| Girar derecha | Izq adelante |
| Girar izquierda | Der adelante |
| Pivot | Uno adelante / otro atras |

**Interfaz:** GPIO -> Driver -> Motores

---

## 9. Arquitectura de UI (OLED)

### Estados visuales

| Estado | UI |
|--------|-----|
| IDLE | dormido |
| LISTENING | escuchando |
| PROCESSING | pensando |
| SPEAKING | hablando |
| ERROR | error |

**Render:** Python + luma.oled, frame-based simple animation

---

## 10. Energia

| Fuente | Destino |
|--------|---------|
| Powerbank | Raspberry |
| Bateria separada | Motores |

**Razon:** Evitar ruido electrico, evitar reinicios, proteger sistema

---

## 11. Decisiones Clave

### Elegidas

- Raspberry como unico cerebro
- Half-duplex
- Boton fisico
- Audio por cable
- UI minima OLED
- Driver directo desde Raspberry

### Rechazadas

- Arduino como intermediario
- Bluetooth audio
- AEC compleja
- Microfonos analogicos
- Full-duplex en V1

---

## 12. Escalabilidad

Proximas evoluciones:

- VAD automatico
- Mic array
- Barge-in real
- Navegacion autonoma
- Multi-agente IA
- Memoria persistente
- Camara + vision

---

## 13. Riesgos Identificados

| Riesgo | Mitigacion |
|--------|-----------|
| Eco | Half-duplex |
| Ruido electrico | Bateria separada |
| Latencia | Local control |
| Complejidad | Arquitectura modular |

---

## 14. Definicion de V1

Rick V1 esta completo cuando:

- Escucha con boton
- Responde con voz
- Muestra estado
- Puede moverse
- Es portable

---

## Conclusion

Rick no es solo un robot. Es una plataforma agentic fisica donde:

- **Hardware** = cuerpo
- **Runtime** = sistema nervioso
- **IA** = cerebro
