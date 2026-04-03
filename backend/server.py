from fastapi import FastAPI, APIRouter, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import hashlib
import math

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ==================== MODELS ====================

class DriverLocation(BaseModel):
    latitude: float
    longitude: float
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Driver(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str  # Phone number (unique identifier)
    vehicle_plate: str  # Placa del vehículo
    is_active: bool = True
    current_location: Optional[DriverLocation] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class DriverCreate(BaseModel):
    name: str
    phone: str
    vehicle_plate: str

class DriverLogin(BaseModel):
    phone: str

class UpdateLocationRequest(BaseModel):
    driver_id: str
    latitude: float
    longitude: float

class ServiceRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_phone: str  # Cliente's phone number
    customer_name: Optional[str] = None
    pickup_address: str  # Dirección de recogida
    pickup_latitude: Optional[float] = None
    pickup_longitude: Optional[float] = None
    destination: Optional[str] = None  # Destino opcional
    notes: Optional[str] = None  # Notas adicionales
    status: str = "pending"  # pending, accepted, completed, cancelled
    accepted_by_driver_id: Optional[str] = None
    accepted_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ServiceRequestCreate(BaseModel):
    customer_phone: str
    customer_name: Optional[str] = None
    pickup_address: str
    pickup_latitude: Optional[float] = None
    pickup_longitude: Optional[float] = None
    destination: Optional[str] = None
    notes: Optional[str] = None

class AcceptServiceRequest(BaseModel):
    driver_id: str

class Admin(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AdminLogin(BaseModel):
    username: str
    password: str

# ==================== N8N / WHATSAPP WEBHOOK MODELS ====================

class WhatsAppWebhook(BaseModel):
    """Model for receiving WhatsApp messages via n8n webhook"""
    customer_phone: str  # Phone number from WhatsApp (e.g., "573001234567")
    customer_name: Optional[str] = None  # Contact name if available
    message_text: Optional[str] = None  # Text message content (address)
    # Location if customer shares it via WhatsApp
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # Optional fields
    destination: Optional[str] = None
    message_id: Optional[str] = None  # WhatsApp message ID for tracking

class WhatsAppResponse(BaseModel):
    """Response to send back to n8n for WhatsApp reply"""
    success: bool
    service_id: Optional[str] = None
    message: str
    reply_to_customer: str  # Message to send back to customer via WhatsApp

class ServiceStatusCallback(BaseModel):
    """Model for service status updates (to notify customer via n8n)"""
    service_id: str
    status: str
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    driver_plate: Optional[str] = None
    estimated_minutes: Optional[int] = None

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the distance between two points on Earth using Haversine formula.
    Returns distance in kilometers.
    """
    R = 6371  # Earth's radius in kilometers
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def estimate_time_minutes(distance_km: float, avg_speed_kmh: float = 30) -> int:
    """
    Estimate travel time in minutes based on distance.
    Default average speed is 30 km/h (typical urban traffic in Colombia).
    """
    if distance_km <= 0:
        return 1
    time_hours = distance_km / avg_speed_kmh
    time_minutes = max(1, round(time_hours * 60))
    return time_minutes

# ==================== ROUTES ====================

@api_router.get("/")
async def root():
    return {"message": "Taxi Colombia API - Bienvenido!"}

# ==================== ADMIN ROUTES ====================

@api_router.post("/admin/setup")
async def setup_admin():
    """Create default admin if not exists"""
    existing = await db.admins.find_one({"username": "admin"})
    if existing:
        return {"message": "Admin ya existe"}
    
    admin = Admin(
        username="admin",
        password_hash=hash_password("admin123")
    )
    await db.admins.insert_one(admin.dict())
    return {"message": "Admin creado exitosamente", "username": "admin", "password": "admin123"}

@api_router.post("/admin/login")
async def admin_login(login: AdminLogin):
    """Admin login"""
    admin = await db.admins.find_one({
        "username": login.username,
        "password_hash": hash_password(login.password)
    })
    if not admin:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    return {"success": True, "admin_id": admin["id"], "username": admin["username"]}

# ==================== DRIVER ROUTES ====================

@api_router.post("/drivers", response_model=Driver)
async def create_driver(driver: DriverCreate):
    """Register a new driver (Admin only)"""
    # Check if phone already exists
    existing = await db.drivers.find_one({"phone": driver.phone})
    if existing:
        raise HTTPException(status_code=400, detail="Este número de teléfono ya está registrado")
    
    driver_obj = Driver(**driver.dict())
    await db.drivers.insert_one(driver_obj.dict())
    return driver_obj

@api_router.post("/drivers/login")
async def driver_login(login: DriverLogin):
    """Driver login with phone number"""
    driver = await db.drivers.find_one({"phone": login.phone, "is_active": True})
    if not driver:
        raise HTTPException(status_code=401, detail="Número no registrado o cuenta inactiva")
    return {
        "success": True,
        "driver": Driver(**driver).dict()
    }

@api_router.post("/drivers/update-location")
async def update_driver_location(request: UpdateLocationRequest):
    """Update driver's current GPS location"""
    location_data = {
        "latitude": request.latitude,
        "longitude": request.longitude,
        "updated_at": datetime.utcnow()
    }
    
    result = await db.drivers.update_one(
        {"id": request.driver_id},
        {"$set": {"current_location": location_data}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Conductor no encontrado")
    
    return {"success": True, "message": "Ubicación actualizada"}

@api_router.get("/drivers", response_model=List[Driver])
async def get_all_drivers():
    """Get all registered drivers (Admin only)"""
    drivers = await db.drivers.find().to_list(1000)
    return [Driver(**driver) for driver in drivers]

@api_router.delete("/drivers/{driver_id}")
async def delete_driver(driver_id: str):
    """Delete/deactivate a driver"""
    result = await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"is_active": False}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Conductor no encontrado")
    return {"message": "Conductor desactivado exitosamente"}

# ==================== SERVICE REQUEST ROUTES ====================

@api_router.post("/services", response_model=ServiceRequest)
async def create_service_request(service: ServiceRequestCreate):
    """Create a new service request (simulating WhatsApp message)"""
    service_obj = ServiceRequest(**service.dict())
    await db.service_requests.insert_one(service_obj.dict())
    return service_obj

@api_router.get("/services/available")
async def get_available_services(
    driver_lat: Optional[float] = None,
    driver_lon: Optional[float] = None
):
    """
    Get all pending/available services (for drivers)
    Returns services WITHOUT customer phone - only shows after accepting.
    If driver location is provided, services are sorted by proximity and include estimated time.
    """
    services = await db.service_requests.find({"status": "pending"}).sort("created_at", -1).to_list(100)
    
    result = []
    for service in services:
        service_data = {
            "id": service["id"],
            "pickup_address": service["pickup_address"],
            "pickup_latitude": service.get("pickup_latitude"),
            "pickup_longitude": service.get("pickup_longitude"),
            "destination": service.get("destination"),
            "notes": service.get("notes"),
            "created_at": service["created_at"],
            "customer_name": service.get("customer_name", "Cliente"),
            "distance_km": None,
            "estimated_minutes": None
        }
        
        # Calculate distance and estimated time if both locations are available
        if (driver_lat is not None and driver_lon is not None and 
            service.get("pickup_latitude") is not None and 
            service.get("pickup_longitude") is not None):
            
            distance = haversine_distance(
                driver_lat, driver_lon,
                service["pickup_latitude"], service["pickup_longitude"]
            )
            service_data["distance_km"] = round(distance, 2)
            service_data["estimated_minutes"] = estimate_time_minutes(distance)
        
        result.append(service_data)
    
    # Sort by estimated time if driver location was provided
    if driver_lat is not None and driver_lon is not None:
        # Services with coordinates go first, sorted by time
        # Services without coordinates go last
        result.sort(key=lambda x: (
            x["estimated_minutes"] is None,  # None values go to end
            x["estimated_minutes"] or float('inf')
        ))
    
    return result

@api_router.post("/services/{service_id}/accept")
async def accept_service(service_id: str, request: AcceptServiceRequest):
    """Accept a service request - only the accepting driver gets customer info"""
    # Check if service exists and is pending
    service = await db.service_requests.find_one({"id": service_id})
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    
    if service["status"] != "pending":
        raise HTTPException(status_code=400, detail="Este servicio ya fue tomado por otro conductor")
    
    # Verify driver exists
    driver = await db.drivers.find_one({"id": request.driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="Conductor no encontrado")
    
    # Accept the service
    result = await db.service_requests.update_one(
        {"id": service_id, "status": "pending"},  # Double check status
        {
            "$set": {
                "status": "accepted",
                "accepted_by_driver_id": request.driver_id,
                "accepted_at": datetime.utcnow()
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="No se pudo aceptar el servicio. Puede que otro conductor lo haya tomado.")
    
    # Return full service info including customer phone
    updated_service = await db.service_requests.find_one({"id": service_id})
    return {
        "success": True,
        "message": "Servicio aceptado exitosamente",
        "service": ServiceRequest(**updated_service).dict()
    }

@api_router.get("/services/my-services/{driver_id}")
async def get_driver_services(driver_id: str):
    """Get all services accepted by a specific driver"""
    services = await db.service_requests.find({
        "accepted_by_driver_id": driver_id
    }).sort("accepted_at", -1).to_list(100)
    
    return [ServiceRequest(**service).dict() for service in services]

@api_router.post("/services/{service_id}/complete")
async def complete_service(service_id: str, driver_id: str):
    """Mark a service as completed"""
    service = await db.service_requests.find_one({"id": service_id})
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    
    if service["accepted_by_driver_id"] != driver_id:
        raise HTTPException(status_code=403, detail="No tienes permiso para completar este servicio")
    
    await db.service_requests.update_one(
        {"id": service_id},
        {"$set": {"status": "completed"}}
    )
    return {"success": True, "message": "Servicio completado"}

@api_router.get("/services/all")
async def get_all_services():
    """Get all services (Admin only)"""
    services = await db.service_requests.find().sort("created_at", -1).to_list(1000)
    return [ServiceRequest(**service).dict() for service in services]

# ==================== STATS ROUTES ====================

@api_router.get("/stats")
async def get_stats():
    """Get dashboard statistics"""
    total_drivers = await db.drivers.count_documents({"is_active": True})
    total_services = await db.service_requests.count_documents({})
    pending_services = await db.service_requests.count_documents({"status": "pending"})
    accepted_services = await db.service_requests.count_documents({"status": "accepted"})
    completed_services = await db.service_requests.count_documents({"status": "completed"})
    
    return {
        "total_drivers": total_drivers,
        "total_services": total_services,
        "pending_services": pending_services,
        "accepted_services": accepted_services,
        "completed_services": completed_services
    }

# ==================== N8N / WHATSAPP WEBHOOK ROUTES ====================

@api_router.post("/webhook/whatsapp", response_model=WhatsAppResponse)
async def whatsapp_webhook(data: WhatsAppWebhook):
    """
    Webhook endpoint for n8n to send WhatsApp messages.
    
    n8n Workflow:
    1. WhatsApp Trigger (receives customer message)
    2. HTTP Request to this endpoint
    3. Send response back to customer via WhatsApp
    
    Expected data from n8n:
    - customer_phone: WhatsApp number (e.g., "573001234567")
    - customer_name: Contact name (optional)
    - message_text: The address/message sent by customer
    - latitude/longitude: If customer shared location
    """
    
    # Validate we have at least phone and some location info
    if not data.customer_phone:
        return WhatsAppResponse(
            success=False,
            message="Número de teléfono requerido",
            reply_to_customer="❌ Error: No pudimos procesar tu solicitud. Por favor intenta de nuevo."
        )
    
    # Clean phone number (remove WhatsApp prefix if present)
    phone = data.customer_phone.replace("whatsapp:", "").replace("+", "")
    
    # Need either coordinates or text address
    if not data.latitude and not data.message_text:
        return WhatsAppResponse(
            success=False,
            message="Se requiere ubicación o dirección",
            reply_to_customer="📍 Por favor envía tu ubicación o escribe la dirección donde necesitas el taxi."
        )
    
    # Create the service request
    pickup_address = data.message_text or f"Ubicación GPS: {data.latitude}, {data.longitude}"
    
    service_data = {
        "customer_phone": phone,
        "customer_name": data.customer_name,
        "pickup_address": pickup_address,
        "pickup_latitude": data.latitude,
        "pickup_longitude": data.longitude,
        "destination": data.destination,
        "notes": f"Solicitud via WhatsApp. ID: {data.message_id}" if data.message_id else "Solicitud via WhatsApp"
    }
    
    service_obj = ServiceRequest(**service_data)
    await db.service_requests.insert_one(service_obj.dict())
    
    # Log for debugging
    logger.info(f"WhatsApp service created: {service_obj.id} for {phone}")
    
    return WhatsAppResponse(
        success=True,
        service_id=service_obj.id,
        message="Servicio creado exitosamente",
        reply_to_customer=f"✅ ¡Tu solicitud de taxi ha sido recibida!\n\n📍 Recogida: {pickup_address}\n\n🚕 En breve un conductor aceptará tu servicio y te contactará.\n\n🆔 Código: {service_obj.id[:8]}"
    )


@api_router.get("/webhook/service-status/{service_id}")
async def get_service_status_for_webhook(service_id: str):
    """
    Get service status for n8n to check and notify customer.
    
    n8n can poll this endpoint to check if a driver accepted the service
    and then send a WhatsApp notification to the customer.
    """
    service = await db.service_requests.find_one({"id": service_id})
    
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    
    response = {
        "service_id": service["id"],
        "status": service["status"],
        "customer_phone": service["customer_phone"],
        "pickup_address": service["pickup_address"],
        "created_at": service["created_at"],
        "driver_info": None,
        "notification_message": None
    }
    
    # If accepted, get driver info
    if service["status"] == "accepted" and service.get("accepted_by_driver_id"):
        driver = await db.drivers.find_one({"id": service["accepted_by_driver_id"]})
        if driver:
            response["driver_info"] = {
                "name": driver["name"],
                "phone": driver["phone"],
                "vehicle_plate": driver["vehicle_plate"]
            }
            response["notification_message"] = f"""🚕 ¡Tu taxi está en camino!

👤 Conductor: {driver["name"]}
🚗 Placa: {driver["vehicle_plate"]}
📞 Teléfono: {driver["phone"]}

El conductor te contactará cuando llegue a tu ubicación."""
    
    elif service["status"] == "completed":
        response["notification_message"] = "✅ Tu servicio ha sido completado. ¡Gracias por usar Taxi Colombia!"
    
    elif service["status"] == "pending":
        response["notification_message"] = "⏳ Tu solicitud está pendiente. Estamos buscando un conductor cercano."
    
    return response


@api_router.get("/webhook/pending-notifications")
async def get_pending_notifications():
    """
    Get all accepted services that haven't been notified yet.
    
    n8n can poll this endpoint periodically to find services where:
    - Status is "accepted"
    - Customer hasn't been notified yet (notified_customer = false)
    
    After notifying, n8n should call /webhook/mark-notified/{service_id}
    """
    # Find accepted services that haven't notified the customer
    services = await db.service_requests.find({
        "status": "accepted",
        "customer_notified": {"$ne": True}
    }).to_list(50)
    
    notifications = []
    for service in services:
        driver = await db.drivers.find_one({"id": service.get("accepted_by_driver_id")})
        if driver:
            notifications.append({
                "service_id": service["id"],
                "customer_phone": service["customer_phone"],
                "customer_name": service.get("customer_name"),
                "pickup_address": service["pickup_address"],
                "driver_name": driver["name"],
                "driver_phone": driver["phone"],
                "driver_plate": driver["vehicle_plate"],
                "message": f"""🚕 ¡Tu taxi está en camino!

👤 Conductor: {driver["name"]}
🚗 Placa: {driver["vehicle_plate"]}
📞 Teléfono: {driver["phone"]}

📍 Te recogerá en: {service["pickup_address"]}

El conductor te contactará cuando llegue."""
            })
    
    return {"pending_notifications": notifications, "count": len(notifications)}


@api_router.post("/webhook/mark-notified/{service_id}")
async def mark_service_notified(service_id: str):
    """
    Mark a service as notified (customer received WhatsApp about driver).
    
    n8n should call this after successfully sending WhatsApp to customer.
    """
    result = await db.service_requests.update_one(
        {"id": service_id},
        {"$set": {"customer_notified": True, "notified_at": datetime.utcnow()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    
    return {"success": True, "message": "Servicio marcado como notificado"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
