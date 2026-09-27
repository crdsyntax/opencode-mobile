# opencode-mobile

Cliente movil nativo (React Native / Expo) para [opencode](https://github.com/anomalyco/opencode).

Habla con el servidor por HTTP y se empareja con el como dispositivo, de modo que la contrasena del
servidor nunca sale de la maquina que lo aloja.

Probado en un Infinix X665E (Android 12, SDK 31, arm64-v8a).

---

## Requisito importante del servidor

El emparejamiento y el traspaso de sesiones **no existen en opencode upstream**. Requieren un fork
del servidor que exponga estos endpoints:

| Metodo | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/device` | Lista dispositivos emparejados |
| `POST` | `/api/device/offer` | Emite un codigo de pairing de un solo uso |
| `POST` | `/api/device/pair` | Canjea el codigo por un dispositivo y su token (sin auth) |
| `DELETE` | `/api/device/:deviceID` | Revoca un dispositivo |
| `POST` | `/api/handoff` | Envia una sesion a un dispositivo |
| `GET` | `/api/handoff/pending` | Cola del dispositivo autenticado |
| `POST` | `/api/handoff/:handoffID` | Acepta o rechaza |

Contra un servidor sin esos endpoints la app **sigue funcionando**: la lista de sesiones, el chat,
el streaming y la autenticacion por contrasena no dependen del fork. Solo se degradan el
emparejamiento y el handoff.

---

## Funcionalidades

| Funcionalidad | Estado |
| --- | --- |
| Emparejamiento por codigo | Funcional |
| Autenticacion por token de dispositivo (`Bearer`) | Funcional |
| Autenticacion por contrasena (Basic), alternativa | Funcional |
| Estado de conexion en vivo | Funcional |
| Listado y creacion de sesiones | Funcional |
| Ver mensajes, texto, razonamiento y herramientas | Funcional |
| Enviar mensaje | Funcional |
| Streaming en vivo (SSE) | Funcional |
| Detener generacion | Funcional |
| Bandeja de handoffs recibidos | Funcional |
| Enviar sesion a otro dispositivo | Funcional |
| Seleccion de directorio de trabajo | Funcional |
| Compatibilidad V1 y V2 del protocolo | Funcional |

### No implementado

Aprobar permisos, revision de diffs, terminal (PTY), notificaciones push, escaneo de codigo QR,
subida de adjuntos, markdown enriquecido, paginacion de historial y selector de agente.

---

## Puesta en marcha

```bash
npm install --legacy-peer-deps
npx expo prebuild --platform android
cd android && ./gradlew.bat assembleRelease     # Windows
adb install -r app/build/outputs/apk/release/app-release.apk
```

Variables de entorno en Windows, si no estan en el PATH:

```
JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
```

`assembleRelease` firma con el keystore de debug, que es lo que deja el template de Expo. Para
distribucion real hace falta un keystore propio.

### Conectar el movil

1. En el servidor: `OPENCODE_SERVER_PASSWORD=tuclave opencode serve --hostname 0.0.0.0`
2. En la app: Conexion → direccion `http://<IP-LAN-DEL-PC>:4096` → directorio de trabajo →
   *Guardar servidor*
3. Empareja: en el escritorio, paleta de comandos → *Sessions from your devices* → genera un
   codigo; en el movil, introducelo y pulsa *Emparejar*

Sin `adb reverse` hace falta que el servidor escuche en `0.0.0.0`. Con el movil conectado por adb
tambien funciona usando `adb reverse tcp:4096 tcp:4096` y `http://127.0.0.1:4096`.

---

## Arquitectura

```
app/                       rutas de expo-router (un fichero = una pantalla)
  _layout.tsx              Stack + ConnectionProvider
  index.tsx                lista de sesiones
  connect.tsx              servidor, directorio, emparejamiento, contrasena
  handoffs.tsx             bandeja de recibidos
  session/[id].tsx         chat
src/
  api.ts                   cliente HTTP tipado + deteccion de protocolo + SSE
  contracts.ts             contratos de API (Session, Device, Handoff)
  protocol.ts              normalizacion de mensajes V1 y V2
  connection.tsx           contexto de conexion y credenciales
  theme.ts                 paleta
  components/
    MessageRow.tsx         render de mensajes
    DevicePicker.tsx       selector de destino para handoff
```

### La decision de diseño que mas importa: V1 y V2

opencode esta en plena transicion de un formato de mensaje a otro, y **un mismo servidor expone
las dos superficies con datos distintos**:

| Endpoint | Formato | Resultado en una sesion real |
| --- | --- | --- |
| `/session/:id/message` (V1) | `{ info, parts }[]` | **618 mensajes** |
| `/api/session/:id/message` (V2) | union etiquetada con `content[]` | **1 mensaje** |

V2 mantiene su propia proyeccion, asi que una sesion que vive en el almacen V1 aparece como un
unico mensaje al consultarla por V2. Es un caso facil de no detectar: si solo se prueba contra
sesiones creadas por la propia API, todo parece correcto.

Por eso la app **detecta el protocolo en tiempo de ejecucion** y normaliza ambos formatos a un tipo
comun (`src/protocol.ts`). La UI no sabe de donde salieron los mensajes. Es el mismo mecanismo que
usa el escritorio en `server-compat.ts`.

La deteccion mira **la forma de la respuesta**, no el codigo de estado: las rutas legacy solo
aceptan Basic auth, asi que un token de dispositivo recibe un 401 en `/global/health` incluso en un
servidor que soporta V1 por completo. Interpretar ese 401 como "no es V1" degradaria en silencio a
V2 y dejaria la lista de mensajes vacia.

### Otros puntos

- **Fuera del workspace de opencode.** No requiere clonar el monorepo ni compilar el servidor.
- **Streaming por recarga coalescada.** Al llegar cualquier frame del stream se recarga la lista de
  mensajes, con 120 ms de agrupamiento. Es correcto y simple, pero no es streaming fino: no reduce
  deltas de texto. Es la deuda tecnica mas clara de la v1.
- **El token va a SecureStore**, no a AsyncStorage.
- **`expo/fetch`** aporta `response.body.getReader()`, necesario para el SSE.
- **Limitacion de mensajes.** La carga inicial pide todos los mensajes de la sesion. Con miles de
  mensajes habra que paginar.

---

## Compilar el fork del servidor

La app necesita un servidor con los endpoints de la tabla del principio. Si estas construyendo
esa parte, consulta la especificacion tecnica completa en el fork: restricciones de la
arquitectura actual, decisiones de seguridad y el procedimiento de build del escritorio.
