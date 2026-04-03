# Configuración de n8n para WhatsApp - Taxi Colombia

## Resumen de Endpoints Disponibles

Tu API está lista en: `https://taxismart-ubicacion.preview.emergentagent.com/api`

### Endpoints para n8n:

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/webhook/whatsapp` | POST | Recibe mensajes de WhatsApp y crea servicios |
| `/api/webhook/service-status/{id}` | GET | Consulta estado de un servicio |
| `/api/webhook/pending-notifications` | GET | Lista servicios aceptados sin notificar |
| `/api/webhook/mark-notified/{id}` | POST | Marca servicio como notificado |

---

## Workflow 1: Recibir Solicitudes de WhatsApp

### Flujo:
```
Cliente envía WhatsApp → n8n recibe → API crea servicio → n8n responde al cliente
```

### Configuración en n8n:

#### Nodo 1: WhatsApp Trigger
- **Tipo:** WhatsApp Business Cloud API / Twilio
- **Evento:** Mensaje recibido

#### Nodo 2: HTTP Request (enviar a tu API)
```
Método: POST
URL: https://taxismart-ubicacion.preview.emergentagent.com/api/webhook/whatsapp

Headers:
  Content-Type: application/json

Body (JSON):
{
  "customer_phone": "{{ $json.from }}",
  "customer_name": "{{ $json.profile.name }}",
  "message_text": "{{ $json.text.body }}",
  "latitude": {{ $json.location?.latitude || null }},
  "longitude": {{ $json.location?.longitude || null }},
  "message_id": "{{ $json.id }}"
}
```

#### Nodo 3: WhatsApp - Enviar Respuesta
```
Mensaje: {{ $json.reply_to_customer }}
```

---

## Workflow 2: Notificar al Cliente cuando el Taxista Acepta

### Flujo:
```
n8n consulta cada 30 seg → Encuentra servicios aceptados → Envía WhatsApp → Marca como notificado
```

### Configuración en n8n:

#### Nodo 1: Schedule Trigger
- **Intervalo:** Cada 30 segundos (o 1 minuto)

#### Nodo 2: HTTP Request (obtener pendientes)
```
Método: GET
URL: https://taxismart-ubicacion.preview.emergentagent.com/api/webhook/pending-notifications
```

#### Nodo 3: IF (verificar si hay notificaciones)
```
Condición: {{ $json.count > 0 }}
```

#### Nodo 4: Split In Batches
- **Campo:** pending_notifications
- **Batch Size:** 1

#### Nodo 5: WhatsApp - Enviar Notificación
```
Número: {{ $json.customer_phone }}
Mensaje: {{ $json.message }}
```

#### Nodo 6: HTTP Request (marcar como notificado)
```
Método: POST
URL: https://taxismart-ubicacion.preview.emergentagent.com/api/webhook/mark-notified/{{ $json.service_id }}
```

---

## Estructura de Datos

### Enviar mensaje de WhatsApp a la API:
```json
{
  "customer_phone": "573001234567",
  "customer_name": "María García",
  "message_text": "Calle 72 #10-25, Bogotá",
  "latitude": 4.6568,
  "longitude": -74.0565,
  "destination": "Aeropuerto",
  "message_id": "wamid.123456"
}
```

### Respuesta de la API:
```json
{
  "success": true,
  "service_id": "abc123...",
  "message": "Servicio creado exitosamente",
  "reply_to_customer": "✅ ¡Tu solicitud de taxi ha sido recibida!..."
}
```

### Notificaciones pendientes:
```json
{
  "pending_notifications": [
    {
      "service_id": "abc123",
      "customer_phone": "573001234567",
      "customer_name": "María García",
      "pickup_address": "Calle 72 #10-25",
      "driver_name": "Juan Pérez",
      "driver_phone": "3009876543",
      "driver_plate": "ABC123",
      "message": "🚕 ¡Tu taxi está en camino!..."
    }
  ],
  "count": 1
}
```

---

## Configuración de WhatsApp Business API

### Opción 1: Meta WhatsApp Business Cloud API (Recomendado)

1. Crear cuenta en [Meta for Developers](https://developers.facebook.com)
2. Crear una App de tipo "Business"
3. Agregar el producto "WhatsApp"
4. Configurar número de teléfono de prueba
5. En n8n usar el nodo "WhatsApp Business Cloud"

### Opción 2: Twilio

1. Crear cuenta en [Twilio](https://www.twilio.com)
2. Activar WhatsApp Sandbox (para pruebas)
3. Obtener Account SID y Auth Token
4. En n8n usar el nodo "Twilio"

### Opción 3: 360dialog

1. Registrarse en [360dialog](https://www.360dialog.com)
2. Solicitar acceso a WhatsApp Business API
3. Configurar webhook para recibir mensajes

---

## Ejemplo de Flujo Completo en n8n

```
┌─────────────────┐
│ WhatsApp        │
│ Trigger         │
│ (mensaje nuevo) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ HTTP Request    │
│ POST /webhook/  │
│ whatsapp        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ WhatsApp        │
│ Send Message    │
│ (confirmación)  │
└─────────────────┘


┌─────────────────┐
│ Schedule        │
│ (cada 30 seg)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ HTTP Request    │
│ GET /pending-   │
│ notifications   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ IF count > 0    │
└────────┬────────┘
         │ (sí)
         ▼
┌─────────────────┐
│ Split In        │
│ Batches         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ WhatsApp        │
│ Send Message    │
│ (taxi en camino)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ HTTP Request    │
│ POST /mark-     │
│ notified        │
└─────────────────┘
```

---

## Probar sin n8n (con curl)

```bash
# Simular mensaje de WhatsApp
curl -X POST https://taxismart-ubicacion.preview.emergentagent.com/api/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "customer_phone": "573001234567",
    "customer_name": "Test Cliente",
    "message_text": "Calle 80 #15-20, Bogotá",
    "latitude": 4.6800,
    "longitude": -74.0500
  }'

# Ver notificaciones pendientes
curl https://taxismart-ubicacion.preview.emergentagent.com/api/webhook/pending-notifications
```

---

## Notas Importantes

1. **Formato de teléfono:** Usar formato internacional sin "+" (ej: 573001234567)
2. **Ubicación GPS:** Si el cliente comparte ubicación por WhatsApp, incluir latitude/longitude
3. **Mensaje de texto:** Si solo envía dirección escrita, incluirla en message_text
4. **Polling:** El workflow de notificaciones debe correr cada 30-60 segundos
5. **Marcar notificado:** Siempre marcar el servicio después de enviar WhatsApp para evitar duplicados

---

## Soporte

Si tienes problemas con la integración, revisa:
1. Los logs del backend en `/var/log/supervisor/backend.err.log`
2. El historial de ejecuciones en n8n
3. Que los endpoints estén respondiendo correctamente
