#!/usr/bin/env python3
"""
Comprehensive Backend API Tests for Taxi Colombia App
Tests the three main areas that need validation:
1. Zone Masking - Available Services API hides pickup_address and customer_phone
2. Nearest Driver Acceptance Validation
3. N8N WhatsApp Webhook
"""

import requests
import json
import time
from typing import Dict, List, Optional

# Backend URL from environment
BACKEND_URL = "https://taxismart-ubicacion.preview.emergentagent.com/api"

class TaxiBackendTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.admin_token = None
        self.drivers = []
        self.services = []
        
    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        print(f"[{level}] {message}")
        
    def make_request(self, method: str, endpoint: str, data: dict = None, params: dict = None) -> dict:
        """Make HTTP request to backend"""
        url = f"{self.base_url}{endpoint}"
        
        try:
            if method.upper() == "GET":
                response = requests.get(url, params=params, timeout=30)
            elif method.upper() == "POST":
                response = requests.post(url, json=data, timeout=30)
            elif method.upper() == "PUT":
                response = requests.put(url, json=data, timeout=30)
            elif method.upper() == "DELETE":
                response = requests.delete(url, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            self.log(f"{method} {endpoint} -> {response.status_code}")
            
            if response.status_code >= 400:
                self.log(f"Error response: {response.text}", "ERROR")
                
            return {
                "status_code": response.status_code,
                "data": response.json() if response.content else {},
                "success": response.status_code < 400
            }
            
        except requests.exceptions.RequestException as e:
            self.log(f"Request failed: {str(e)}", "ERROR")
            return {
                "status_code": 0,
                "data": {"error": str(e)},
                "success": False
            }
        except json.JSONDecodeError as e:
            self.log(f"JSON decode error: {str(e)}", "ERROR")
            return {
                "status_code": response.status_code,
                "data": {"error": "Invalid JSON response"},
                "success": False
            }
    
    def test_admin_setup(self) -> bool:
        """Test admin setup and login"""
        self.log("=== Testing Admin Setup & Login ===")
        
        # Setup admin
        result = self.make_request("POST", "/admin/setup")
        if not result["success"]:
            self.log("Admin setup failed", "ERROR")
            return False
            
        # Login admin
        login_data = {"username": "admin", "password": "admin123"}
        result = self.make_request("POST", "/admin/login", login_data)
        
        if result["success"]:
            self.log("✅ Admin setup and login successful")
            return True
        else:
            self.log("❌ Admin login failed", "ERROR")
            return False
    
    def test_driver_registration(self) -> bool:
        """Test driver registration and login - use existing drivers"""
        self.log("=== Testing Driver Registration ===")
        
        # Get existing drivers
        result = self.make_request("GET", "/drivers")
        if not result["success"]:
            self.log("❌ Failed to get existing drivers", "ERROR")
            return False
        
        existing_drivers = result["data"]
        if len(existing_drivers) < 2:
            self.log("❌ Need at least 2 existing drivers", "ERROR")
            return False
        
        # Use first two existing drivers
        self.drivers = existing_drivers[:2]
        self.log(f"Using existing drivers: {self.drivers[0]['name']} and {self.drivers[1]['name']}")
        
        # Test driver login with first driver
        login_result = self.make_request("POST", "/drivers/login", {"phone": self.drivers[0]["phone"]})
        if login_result["success"]:
            self.log("✅ Driver login successful with existing drivers")
            return True
        else:
            self.log("❌ Driver login failed", "ERROR")
            return False
    
    def test_driver_location_updates(self) -> bool:
        """Test updating driver locations"""
        self.log("=== Testing Driver Location Updates ===")
        
        if len(self.drivers) < 2:
            self.log("❌ Need 2 drivers for location testing", "ERROR")
            return False
        
        # Update driver 1 location (closer to pickup point)
        # Pickup will be at: 4.6097, -74.0817 (Bogotá center)
        # Driver 1: 4.6100, -74.0820 (very close - ~300m)
        location1_data = {
            "driver_id": self.drivers[0]["id"],
            "latitude": 4.6100,
            "longitude": -74.0820
        }
        
        result1 = self.make_request("POST", "/drivers/update-location", location1_data)
        if not result1["success"]:
            self.log("❌ Driver 1 location update failed", "ERROR")
            return False
        
        # Update driver 2 location (farther from pickup point)
        # Driver 2: 4.6200, -74.0900 (farther - ~1.5km)
        location2_data = {
            "driver_id": self.drivers[1]["id"],
            "latitude": 4.6200,
            "longitude": -74.0900
        }
        
        result2 = self.make_request("POST", "/drivers/update-location", location2_data)
        if not result2["success"]:
            self.log("❌ Driver 2 location update failed", "ERROR")
            return False
        
        self.log("✅ Driver locations updated successfully")
        self.log(f"Driver 1 ({self.drivers[0]['name']}): 4.6100, -74.0820 (closer)")
        self.log(f"Driver 2 ({self.drivers[1]['name']}): 4.6200, -74.0900 (farther)")
        return True
    
    def test_service_creation(self) -> bool:
        """Test creating a service request"""
        self.log("=== Testing Service Creation ===")
        
        service_data = {
            "customer_phone": "3005551234",
            "customer_name": "Ana Perez",
            "pickup_address": "Carrera 7 #32-16, Bogotá",  # Exact address (should be hidden)
            "pickup_zone": "Zona Rosa",  # General zone (should be visible)
            "pickup_latitude": 4.6097,
            "pickup_longitude": -74.0817,
            "destination": "Aeropuerto El Dorado",
            "notes": "Equipaje pesado"
        }
        
        result = self.make_request("POST", "/services", service_data)
        if result["success"]:
            service = result["data"]["service"]
            self.services.append(service)
            self.log("✅ Service created successfully")
            self.log(f"Service ID: {service['id']}")
            return True
        else:
            self.log("❌ Service creation failed", "ERROR")
            return False
    
    def test_zone_masking(self) -> bool:
        """
        CRITICAL TEST: Zone Masking - Available Services API hides pickup_address and customer_phone
        """
        self.log("=== Testing Zone Masking (CRITICAL) ===")
        
        if not self.services:
            self.log("❌ No services available for testing", "ERROR")
            return False
        
        if len(self.drivers) < 2:
            self.log("❌ Need 2 drivers for zone masking test", "ERROR")
            return False
        
        # Get available services for driver 1
        params = {
            "driver_id": self.drivers[0]["id"],
            "driver_lat": 4.6100,
            "driver_lon": -74.0820
        }
        
        result = self.make_request("GET", "/services/available", params=params)
        if not result["success"]:
            self.log("❌ Failed to get available services", "ERROR")
            return False
        
        services = result["data"]
        if not services:
            self.log("❌ No available services returned", "ERROR")
            return False
        
        # Check that sensitive data is hidden
        service = services[0]
        
        # These fields should NOT be present
        forbidden_fields = ["pickup_address", "customer_phone", "customer_name"]
        
        # These fields SHOULD be present
        required_fields = ["id", "pickup_zone", "destination", "notes", "created_at", "distance_km", "estimated_minutes"]
        
        issues = []
        
        # Check forbidden fields are not present
        for field in forbidden_fields:
            if field in service:
                issues.append(f"❌ CRITICAL: {field} is exposed in available services (should be hidden)")
        
        # Check required fields are present
        for field in required_fields:
            if field not in service:
                issues.append(f"❌ Missing required field: {field}")
        
        # Verify pickup_zone is shown instead of pickup_address
        if "pickup_zone" in service:
            if service["pickup_zone"] == "Zona Rosa":
                self.log("✅ pickup_zone correctly shown")
            else:
                issues.append(f"❌ pickup_zone value incorrect: {service['pickup_zone']}")
        
        if issues:
            for issue in issues:
                self.log(issue, "ERROR")
            return False
        else:
            self.log("✅ Zone masking working correctly - sensitive data hidden")
            self.log(f"✅ Visible fields: {list(service.keys())}")
            return True
    
    def test_nearest_driver_acceptance(self) -> bool:
        """
        CRITICAL TEST: Nearest Driver Acceptance Validation
        """
        self.log("=== Testing Nearest Driver Acceptance (CRITICAL) ===")
        
        if not self.services:
            self.log("❌ No services available for testing", "ERROR")
            return False
        
        if len(self.drivers) < 2:
            self.log("❌ Need 2 drivers for nearest driver test", "ERROR")
            return False
        
        service_id = self.services[0]["id"]
        
        # Test 1: Farther driver tries to accept (should fail)
        self.log("--- Test 1: Farther driver attempts acceptance ---")
        farther_driver_id = self.drivers[1]["id"]  # Driver 2 is farther
        
        accept_data = {"driver_id": farther_driver_id}
        result = self.make_request("POST", f"/services/{service_id}/accept", accept_data)
        
        if result["status_code"] == 400:
            self.log("✅ Farther driver correctly rejected (400 error)")
        else:
            self.log(f"❌ Farther driver should be rejected but got status {result['status_code']}", "ERROR")
            return False
        
        # Test 2: Nearest driver accepts (should succeed)
        self.log("--- Test 2: Nearest driver attempts acceptance ---")
        nearest_driver_id = self.drivers[0]["id"]  # Driver 1 is closer
        
        accept_data = {"driver_id": nearest_driver_id}
        result = self.make_request("POST", f"/services/{service_id}/accept", accept_data)
        
        if result["status_code"] == 200:
            self.log("✅ Nearest driver successfully accepted service")
            
            # Verify full service data is returned (including sensitive info)
            service_data = result["data"]["service"]
            
            # These fields should NOW be present after acceptance
            required_fields = ["customer_phone", "pickup_address", "customer_name"]
            
            missing_fields = []
            for field in required_fields:
                if field not in service_data:
                    missing_fields.append(field)
            
            if missing_fields:
                self.log(f"❌ Missing fields after acceptance: {missing_fields}", "ERROR")
                return False
            else:
                self.log("✅ Full service data (including sensitive info) returned after acceptance")
                self.log(f"✅ Customer phone: {service_data['customer_phone']}")
                self.log(f"✅ Pickup address: {service_data['pickup_address']}")
                return True
        else:
            self.log(f"❌ Nearest driver acceptance failed with status {result['status_code']}", "ERROR")
            return False
    
    def test_whatsapp_webhook(self) -> bool:
        """
        Test N8N WhatsApp Webhook
        """
        self.log("=== Testing WhatsApp Webhook ===")
        
        webhook_data = {
            "customer_phone": "573001112233",
            "customer_name": "Pedro Martinez",
            "message_text": "Calle 26 #68-22, Bogotá",
            "latitude": 4.6150,
            "longitude": -74.0850,
            "destination": "Centro Comercial Andino"
        }
        
        result = self.make_request("POST", "/webhook/whatsapp", webhook_data)
        
        if result["success"]:
            response_data = result["data"]
            
            # Check required response fields
            required_fields = ["success", "service_id", "message", "reply_to_customer"]
            missing_fields = []
            
            for field in required_fields:
                if field not in response_data:
                    missing_fields.append(field)
            
            if missing_fields:
                self.log(f"❌ Missing response fields: {missing_fields}", "ERROR")
                return False
            
            if response_data["success"] and response_data["service_id"]:
                self.log("✅ WhatsApp webhook working correctly")
                self.log(f"✅ Service ID created: {response_data['service_id']}")
                self.log(f"✅ Reply message: {response_data['reply_to_customer']}")
                return True
            else:
                self.log("❌ WhatsApp webhook response indicates failure", "ERROR")
                return False
        else:
            self.log("❌ WhatsApp webhook request failed", "ERROR")
            return False
    
    def run_all_tests(self) -> Dict[str, bool]:
        """Run all backend tests"""
        self.log("🚀 Starting Taxi Colombia Backend API Tests")
        self.log(f"Backend URL: {self.base_url}")
        
        results = {}
        
        # Test 1: Admin Setup
        results["admin_setup"] = self.test_admin_setup()
        
        # Test 2: Driver Registration
        results["driver_registration"] = self.test_driver_registration()
        
        # Test 3: Driver Location Updates
        results["driver_locations"] = self.test_driver_location_updates()
        
        # Test 4: Service Creation
        results["service_creation"] = self.test_service_creation()
        
        # Test 5: Zone Masking (CRITICAL)
        results["zone_masking"] = self.test_zone_masking()
        
        # Test 6: Nearest Driver Acceptance (CRITICAL)
        results["nearest_driver_acceptance"] = self.test_nearest_driver_acceptance()
        
        # Test 7: WhatsApp Webhook
        results["whatsapp_webhook"] = self.test_whatsapp_webhook()
        
        return results
    
    def print_summary(self, results: Dict[str, bool]):
        """Print test summary"""
        self.log("\n" + "="*50)
        self.log("🏁 TEST SUMMARY")
        self.log("="*50)
        
        passed = 0
        total = len(results)
        
        for test_name, passed_test in results.items():
            status = "✅ PASS" if passed_test else "❌ FAIL"
            priority = ""
            
            if test_name in ["zone_masking", "nearest_driver_acceptance"]:
                priority = " (CRITICAL)"
            
            self.log(f"{status} {test_name.replace('_', ' ').title()}{priority}")
            
            if passed_test:
                passed += 1
        
        self.log(f"\nResults: {passed}/{total} tests passed")
        
        if passed == total:
            self.log("🎉 ALL TESTS PASSED!")
        else:
            failed_tests = [name for name, result in results.items() if not result]
            self.log(f"❌ FAILED TESTS: {', '.join(failed_tests)}")


def main():
    """Main test execution"""
    tester = TaxiBackendTester()
    results = tester.run_all_tests()
    tester.print_summary(results)
    
    # Return exit code based on results
    all_passed = all(results.values())
    return 0 if all_passed else 1


if __name__ == "__main__":
    exit(main())