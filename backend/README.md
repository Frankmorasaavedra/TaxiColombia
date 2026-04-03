# Backend - Taxi Colombia

## Requisitos
- Python 3.9+
- MongoDB

## Variables de Entorno (.env)
```
MONGO_URL=mongodb+srv://usuario:password@cluster.mongodb.net/taxi_colombia
DB_NAME=taxi_colombia
```

## Instalar dependencias
```bash
pip install -r requirements.txt
```

## Ejecutar localmente
```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

## Deploy en Railway
1. Conecta tu repositorio de GitHub
2. Railway detectará automáticamente que es Python
3. Agrega las variables de entorno en Railway Dashboard
4. El deploy es automático

## Endpoints principales

### Webhooks para n8n/WhatsApp
- `POST /api/webhook/whatsapp` - Recibir mensajes de WhatsApp
- `GET /api/webhook/pending-notifications` - Notificaciones pendientes
- `POST /api/webhook/mark-notified/{id}` - Marcar como notificado

### Admin
- `POST /api/admin/setup` - Crear admin inicial
- `POST /api/admin/login` - Login admin

### Conductores
- `POST /api/drivers` - Registrar conductor
- `POST /api/drivers/login` - Login conductor
- `GET /api/drivers` - Listar conductores

### Servicios
- `POST /api/services` - Crear servicio
- `GET /api/services/available` - Servicios disponibles
- `POST /api/services/{id}/accept` - Aceptar servicio
