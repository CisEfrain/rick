# Setup de Rick en Raspberry Pi

Guia paso a paso para instalar Rick desde cero en una Raspberry Pi.

## Requisitos

- Raspberry Pi Zero 2 W (o cualquier Pi con WiFi)
- MicroSD con Raspberry Pi OS instalado (Lite recomendado)
- Microfono USB
- Tarjeta de sonido USB + parlante
- Hub USB + adaptador OTG (la Pi Zero tiene un solo puerto micro-USB)
- Conexion WiFi configurada
- Bridge de Rick deployado (Railway u otro servidor)

---

## 1. Habilitar y Conectar por SSH

### Desde la Raspberry Pi (con monitor)

```bash
sudo raspi-config
# Interface Options → SSH → Enable
```

### Sin monitor (headless)

Crear un archivo vacio llamado `ssh` (sin extension) en la particion `boot` de la SD card.

### Conectar desde tu PC

```bash
ssh pi@<IP_DE_LA_RASPI>
```

Para encontrar la IP: `ping raspberrypi.local` o revisar el router.

### Configurar clave SSH (recomendado)

En tu PC:
```bash
ssh-keygen -t ed25519 -C "rick-raspi" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

En la Raspi:
```bash
mkdir -p ~/.ssh
echo "<PEGAR_CLAVE_PUBLICA>" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```

---

## 2. Instalar Herramientas de Audio

```bash
sudo apt update
sudo apt install -y alsa-utils git
```

---

## 3. Verificar Dispositivos de Audio

```bash
# Listar dispositivos de captura (microfono)
arecord -l

# Listar dispositivos de reproduccion (parlante)
aplay -l
```

Anotar los numeros de card. Ejemplo: microfono en card 1, parlante en card 0.

---

## 4. Configurar ALSA

Crear `~/.asoundrc` con los numeros de card correctos:

```bash
cat > ~/.asoundrc << 'EOF'
pcm.!default {
    type asym
    playback.pcm "plughw:0,0"
    capture.pcm "plughw:1,0"
}
ctl.!default {
    type hw
    card 0
}
EOF
```

Ajustar `plughw:X,0` segun los numeros que mostro `arecord -l` y `aplay -l`.

---

## 5. Probar Audio

```bash
# Grabar 5 segundos
arecord -r 16000 -c 1 -f S16_LE -t wav -d 5 /tmp/test.wav

# Reproducir
aplay /tmp/test.wav
```

Si la grabacion suena bien al reproducirla, el audio esta configurado.

---

## 6. Habilitar I2C (para pantalla OLED futura)

```bash
sudo raspi-config nonint do_i2c 0
```

---

## 7. Instalar Node.js 20

```bash
# Verificar arquitectura
uname -m
# Debe mostrar "aarch64" para Pi Zero 2 W

# Agregar repositorio NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Instalar
sudo apt install -y nodejs

# Verificar
node --version   # v20.x.x
npm --version    # 10.x.x
```

---

## 8. Aumentar Swap (CRITICO para Pi Zero)

La Pi Zero 2 W tiene solo 512MB de RAM. Sin swap suficiente, `npm install` se cuelga o falla por OOM (Out of Memory).

```bash
# Si existe dphys-swapfile:
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon

# Si no existe, crear swap manual:
sudo swapoff -a
sudo dd if=/dev/zero of=/swapfile bs=1M count=1024 status=progress
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Verificar
free -h
# Swap debe mostrar >= 1.0Gi
```

---

## 9. Clonar e Instalar el Proyecto

```bash
cd ~
git clone https://github.com/CisEfrain/rick.git
cd rick

# Si npm install falla por memoria:
NODE_OPTIONS="--max-old-space-size=256" npm install
```

La instalacion puede tardar varios minutos en la Pi Zero.

---

## 10. Configurar Variables de Entorno

```bash
cp apps/node-client/.env.example apps/node-client/.env
```

Editar `apps/node-client/.env`:

```env
SESSION_ID=raspi-001
BRIDGE_WS_URL=wss://<URL_DEL_BRIDGE_EN_RAILWAY>
TOKEN=<MISMO_TOKEN_QUE_INTERNAL_TOKEN_DEL_BRIDGE>
AUDIO_BACKEND=arecord
MUTE_MIC_WHILE_SPEAKING=true
PLAYBACK_DONE_DELAY_MS=500
```

**Importante:** Usar `wss://` (no `ws://`) si el bridge esta en Railway (HTTPS).

---

## 11. Configurar Volumen

```bash
# Subir volumen al maximo
amixer -c 0 sset 'Speaker' 100%

# Guardar configuracion (persiste entre reinicios)
sudo alsactl store
```

---

## 12. Ejecutar Rick

```bash
cd ~/rick/apps/node-client
npx tsx src/index.ts
```

**Importante:** Ejecutar desde el directorio `apps/node-client` para que el `.env` se lea correctamente.

Para correr en background:

```bash
cd ~/rick/apps/node-client
nohup npx tsx src/index.ts > /tmp/rick.log 2>&1 &
```

Ver logs: `tail -f /tmp/rick.log`

Detener: `killall node arecord aplay`

---

## Troubleshooting

| Problema | Solucion |
|----------|---------|
| `npm install` se cuelga o muere | Verificar swap >= 1GB con `free -h` |
| `arecord: no soundcards found` | Conectar microfono USB, verificar con `arecord -l` |
| No se escucha nada por parlante | Verificar card number en `.asoundrc` con `aplay -l` |
| Volumen muy bajo | `amixer -c 0 sset 'Speaker' 100%` + `sudo alsactl store` |
| `ws.error: connect ECONNREFUSED` | Verificar que el bridge este corriendo y la URL sea correcta |
| `Unauthorized` al conectar | Verificar que TOKEN coincida con INTERNAL_TOKEN del bridge |
| Eco / frases cortadas | Verificar `MUTE_MIC_WHILE_SPEAKING=true` en `.env` |
| `recorder.stream.error` en los logs | Es un log informativo de arecord, no un error real. Ignorar |
| Conexion se cae frecuentemente | Verificar senal WiFi. Acercar la Raspi al router |
| `Device or resource busy` en arecord | Matar procesos anteriores: `killall arecord aplay node` |
