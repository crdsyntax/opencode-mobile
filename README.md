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
| Renderizado de markdown (negrita, codigo, listas, tablas) | Funcional |
| Enviar mensaje | Funcional |
| El chat se elevate con el teclado del telefono | Funcional |
| Selector de modelo (120+ modelos, con buscador) | Funcional |
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

Este proyecto usa **bun**. No uses npm.

```bash
bun install
bunx expo prebuild --platform android
cd android && ./gradlew assembleRelease        # Linux/macOS
cd android && .\gradlew.bat assembleRelease   # Windows
adb install -r app/build/outputs/apk/release/app-release.apk
```

Variables de entorno en Windows, si no estan en el PATH:

```
JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
```

### Requisito en Windows: CMake 3.31 o superior

El build nativo **falla** si el SDK trae la version de CMake por defecto, con un error asi:

```
ninja: error: Stat(.../RNGestureHandlerDetectorShadowNode.cpp.o):
  Filename longer than 260 characters
```

CMake espeja la ruta absoluta de cada fuente dentro del directorio de compilacion, asi que la
duplica: el objeto acaba en ~370 caracteres. `LongPathsEnabled` ya esta activo en el registro, pero
el `ninja.exe` que empaqueta CMake 3.22.1 es anterior al manifiesto de rutas largas y por tanto no lo
respeta. Ninguna ruta corta lo resuelve, porque el espejado la alarga otra vez.

La solucion es usar un CMake cuyo ninja ya soporte rutas largas:

```powershell
sdkmanager.bat "cmake;3.31.6"
```

Y apuntar el build a el en `android/local.properties` (este fichero es local, no se versiona):

```properties
cmake.dir=C\:\\Users\\TU_USUARIO\\AppData\\Local\\Android\\Sdk\\cmake\\3.31.6
```

Si cambias de version de CMake, borra `android/app/.cxx` para que se regenere con las rutas nuevas.

`assembleRelease` firma con el keystore de debug, que es lo que deja el template de Expo. Para
distribucion real hace falta un keystore propio.

> `bunfig.toml` fija `linker = "hoisted"`. El layout aislado por defecto de bun anida cada paquete
> en `node_modules/.bun/<paquete>@<version>/`, lo que duplica la profundidad de esas mismas rutas.

> `punycode` figura como dependencia explicita porque `markdown-it` la usa sin declararla, y Metro
> no la resuelve por su cuenta. Sin ella el empaquetado del bundle falla.

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
  connection.tsx           contexto de conexion, credenciales y modelo elegido
  theme.ts                 paleta
  use-keyboard-height.ts   altura real del teclado
  components/
    MessageRow.tsx         render de mensajes
    DevicePicker.tsx       selector de destino para handoff
    ModelPicker.tsx        selector de modelo con buscador
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

- **El teclado lo mide la app, no el sistema.** Android dibuja *edge to edge* y ya no redimensiona la
  ventana cuando sube el IME, de modo que `KeyboardAvoidingView` se queda sin nada que compensar: en
  Android su `behavior` era `undefined` y el compositor no se movia, tapandolo el teclado. La app
  escucha `keyboardDidShow` y aplica esa altura como `paddingBottom`. En iOS se sigue usando
  `KeyboardAvoidingView`, que si funciona. Hook en `src/use-keyboard-height.ts`.
- **El modelo viaja en cada prompt.** `POST /session/:id/message` acepta
  `model: { providerID, modelID }`, opcional. Si no eliges ninguno, la app no envia el campo y manda
  el que tenga configurado el servidor. La eleccion se persiste en SecureStore.
- **El catalogo de modelos** sale de `GET /config/providers`, cuyo campo `models` es un **mapa**
  indexado por id, no un array, y viene envuelto en `data` en V2. `Opencode.models()` normaliza
  ambas formas. En el servidor de pruebas son 120 modelos en 4 proveedores, asi que la lista se
  filtra al escribir.
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
