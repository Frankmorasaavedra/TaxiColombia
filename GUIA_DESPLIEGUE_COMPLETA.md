# ============================================
# GUÍA COMPLETA: Desplegar Taxi Colombia App
# ============================================

## FASE 1: GUARDAR CÓDIGO EN GITHUB

1. Clic en "Save to GitHub" en la interfaz de Emergent
2. Crear repositorio "taxi-colombia-app"
3. Push del código

---

## FASE 2: CREAR CUENTAS (30 minutos)

### 2.1 MongoDB Atlas (Base de datos)
1. Ir a https://mongodb.com/atlas
2. Crear cuenta gratuita
3. Crear Cluster → FREE M0 → Región: Sao Paulo
4. Database Access → Add User → Guardar usuario/contraseña
5. Network Access → Add IP → 0.0.0.0/0 (Allow from anywhere)
6. Copiar Connection String:
   mongodb+srv://USUARIO:PASSWORD@cluster0.xxxxx.mongodb.net/taxi_colombia

### 2.2 Railway (Hosting)
1. Ir a https://railway.app
2. Crear cuenta con GitHub

### 2.3 Expo
1. Ir a https://expo.dev
2. Crear cuenta
3. En terminal: npm install -g eas-cli && eas login

### 2.4 Google Play Console
1. Ir a https://play.google.com/console
2. Pagar $25 USD
3. Completar información

---

## FASE 3: DESPLEGAR BACKEND EN RAILWAY (15 minutos)

### 3.1 Conectar repositorio
1. En Railway → New Project → Deploy from GitHub
2. Seleccionar repositorio "taxi-colombia-app"
3. Seleccionar carpeta "/backend"

### 3.2 Configurar variables de entorno
En Railway → Variables, agregar:

```
MONGO_URL=mongodb+srv://tu_usuario:tu_password@cluster0.xxxxx.mongodb.net/taxi_colombia
DB_NAME=taxi_colombia
```

### 3.3 Obtener URL del backend
Railway te dará una URL como: https://taxi-colombia-backend.up.railway.app

¡GUARDA ESTA URL! La necesitas para la app móvil.

---

## FASE 4: CONFIGURAR WHATSAPP + N8N (45 minutos)

### 4.1 Opción A: n8n Cloud (más fácil)
1. Ir a https://n8n.cloud
2. Crear cuenta ($20/mes)
3. Crear nuevo workflow

### 4.1 Opción B: n8n Self-hosted (gratis)
1. En Railway → New Project → Deploy Template → n8n
2. O usar Docker en tu servidor

### 4.2 Configurar Meta WhatsApp Business
1. Ir a https://business.facebook.com
2. Crear cuenta de Business
3. Ir a https://developers.facebook.com
4. Crear App → Tipo: Business
5. Agregar producto: WhatsApp
6. Configurar número de prueba
7. Copiar: Phone Number ID, Access Token

### 4.3 Crear Workflow en n8n

**Workflow 1: Recibir mensajes**
```
[WhatsApp Trigger] → [HTTP Request POST a tu API] → [WhatsApp Send Reply]
```

Configuración HTTP Request:
- URL: https://TU-URL-RAILWAY.up.railway.app/api/webhook/whatsapp
- Method: POST
- Body:
  {
    "customer_phone": "{{ $json.from }}",
    "customer_name": "{{ $json.profile.name }}",
    "message_text": "{{ $json.text.body }}",
    "latitude": {{ $json.location?.latitude || null }},
    "longitude": {{ $json.location?.longitude || null }}
  }

**Workflow 2: Notificar al cliente**
```
[Schedule Trigger 30seg] → [HTTP GET pending-notifications] → [IF count>0] → [WhatsApp Send] → [HTTP POST mark-notified]
```

---

## FASE 5: ACTUALIZAR APP MÓVIL (10 minutos)

### 5.1 Cambiar URL del backend

En tu código local, editar `/frontend/.env`:

```
EXPO_PUBLIC_BACKEND_URL=https://TU-URL-RAILWAY.up.railway.app
```

### 5.2 Actualizar app.json

Editar `/frontend/app.json`:
```json
{
  "expo": {
    "name": "Taxi Colombia",
    "slug": "taxi-colombia",
    "version": "1.0.0",
    "icon": "./assets/images/icon.png",
    "splash": {
      "image": "./assets/images/splash.png",
      "backgroundColor": "#1a1a2e"
    },
    "android": {
      "package": "com.tuempresa.taxicolombia",
      "permissions": ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"]
    },
    "ios": {
      "bundleIdentifier": "com.tuempresa.taxicolombia"
    }
  }
}
```

---

## FASE 6: CONSTRUIR Y PUBLICAR APP (30 minutos)

### 6.1 Construir para Android

```bash
cd frontend

# Configurar EAS
eas build:configure

# Construir APK para pruebas
eas build --platform android --profile preview

# Construir AAB para Play Store
eas build --platform android --profile production
```

### 6.2 Publicar en Google Play

1. Ir a Google Play Console
2. Crear nueva aplicación
3. Completar información de la tienda:
   - Nombre: Taxi Colombia
   - Descripción corta y larga
   - Capturas de pantalla
   - Icono
4. Subir el archivo .aab
5. Enviar a revisión

---

## FASE 7: DOCUMENTOS LEGALES

### 7.1 Política de Privacidad (requerida por Google Play)

Crear página web o documento con:
- Qué datos recolectas (ubicación, teléfono)
- Para qué los usas
- Cómo los proteges
- Derechos del usuario

### 7.2 Términos y Condiciones

- Condiciones de uso del servicio
- Responsabilidades
- Cancelaciones

---

## CHECKLIST FINAL

### Backend
- [ ] MongoDB Atlas configurado
- [ ] Railway desplegado
- [ ] Variables de entorno configuradas
- [ ] API respondiendo

### WhatsApp
- [ ] Meta Business Account creada
- [ ] WhatsApp Business API configurada
- [ ] n8n workflows activos

### App Móvil
- [ ] URL del backend actualizada
- [ ] EAS Build configurado
- [ ] APK generado y probado
- [ ] Play Store configurado

### Legal
- [ ] Política de privacidad publicada
- [ ] Términos y condiciones listos

---

## COSTOS ESTIMADOS

| Item | Costo |
|------|-------|
| MongoDB Atlas | $0 (free tier) |
| Railway | $5/mes |
| n8n Cloud | $20/mes |
| WhatsApp mensajes | ~$0.005/mensaje |
| Google Play | $25 (una vez) |
| **TOTAL MENSUAL** | **~$25-30 USD** |

---

## SOPORTE

Si tienes problemas:
1. Revisa los logs en Railway Dashboard
2. Revisa ejecuciones en n8n
3. Prueba la API con: curl https://tu-url.railway.app/api/

¡Éxito con tu app de taxi! 🚕
