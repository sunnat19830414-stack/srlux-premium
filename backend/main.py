"""
SR Lux Premium - FastAPI Backend
Интеграция с Dolibarr ERP для синхронизации товаров, цен и наличия
"""

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZIPMiddleware
from contextlib import asynccontextmanager
import httpx
import os
from typing import Optional
import logging

# === КОНФИГУРАЦИЯ ===

DOLIBARR_API_URL = os.getenv("DOLIBARR_API_URL", "https://bollente.uz/api/index.php/")
DOLIBARR_API_KEY = os.getenv("DOLIBARR_API_KEY", "77759613d55e2ae88e3db1202e53f860f2b9a93a")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# === DOLIBARR CLIENT ===

class DolibarrClient:
    """Клиент для работы с Dolibarr API"""
    
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.api_key = api_key
        self.headers = {"DOLAPIKEY": api_key}
    
    async def get_status(self) -> dict:
        """Проверить статус Dolibarr"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}status",
                headers=self.headers,
                timeout=10
            )
            return response.json()
    
    async def get_products(self, limit: int = 100) -> list:
        """Получить список товаров из Dolibarr"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}products",
                headers=self.headers,
                params={"limit": limit, "sortorder": "ASC"},
                timeout=30
            )
            if response.status_code == 200:
                return response.json()
            return []
    
    async def get_product(self, product_id: int) -> dict:
        """Получить товар по ID"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}products/{product_id}",
                headers=self.headers,
                timeout=10
            )
            if response.status_code == 200:
                return response.json()
            raise HTTPException(status_code=404, detail="Product not found")
    
    async def get_categories(self) -> list:
        """Получить категории товаров"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}categories",
                headers=self.headers,
                timeout=10
            )
            if response.status_code == 200:
                return response.json()
            return []

# === ИНИЦИАЛИЗАЦИЯ ===

dolibarr = DolibarrClient(DOLIBARR_API_URL, DOLIBARR_API_KEY)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Жизненный цикл приложения"""
    # Startup
    try:
        status = await dolibarr.get_status()
        logger.info(f"✅ Dolibarr подключен: {status}")
    except Exception as e:
        logger.error(f"❌ Ошибка подключения к Dolibarr: {e}")
    
    yield
    
    # Shutdown
    logger.info("🛑 Приложение останавливается")

# === FASTAPI ПРИЛОЖЕНИЕ ===

app = FastAPI(
    title="SR Lux Premium API",
    description="Premium E-commerce API с интеграцией Dolibarr",
    version="1.0.0",
    lifespan=lifespan
)

# === MIDDLEWARE ===

app.add_middleware(GZIPMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === API ENDPOINTS ===

@app.get("/health")
async def health_check():
    """Проверка здоровья приложения"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "environment": ENVIRONMENT
    }

@app.get("/api/v1/status")
async def status():
    """Статус системы и Dolibarr"""
    try:
        dolibarr_status = await dolibarr.get_status()
        return {
            "app": "SR Lux Premium",
            "status": "online",
            "dolibarr": dolibarr_status
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Dolibarr error: {str(e)}")

@app.get("/api/v1/products")
async def get_products(
    limit: int = 100,
    skip: int = 0
):
    """Получить список товаров"""
    try:
        products = await dolibarr.get_products(limit=limit)
        return {
            "count": len(products),
            "products": products[skip:skip+limit] if isinstance(products, list) else [],
            "dolibarr_integration": "active"
        }
    except Exception as e:
        logger.error(f"Error fetching products: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch products")

@app.get("/api/v1/products/{product_id}")
async def get_product(product_id: int):
    """Получить товар по ID"""
    try:
        product = await dolibarr.get_product(product_id)
        return product
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching product {product_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch product")

@app.get("/api/v1/categories")
async def get_categories():
    """Получить категории товаров"""
    try:
        categories = await dolibarr.get_categories()
        return {
            "count": len(categories),
            "categories": categories if isinstance(categories, list) else []
        }
    except Exception as e:
        logger.error(f"Error fetching categories: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch categories")

@app.post("/api/v1/cart")
async def create_cart(items: list):
    """Создать корзину"""
    return {
        "cart_id": "temp_" + str(hash(str(items)))[:8],
        "items": items,
        "total": sum(item.get("price", 0) * item.get("quantity", 1) for item in items)
    }

@app.post("/api/v1/orders")
async def create_order(
    customer_email: str,
    customer_phone: str,
    items: list,
    notes: Optional[str] = None
):
    """Создать заказ"""
    try:
        # В реальной системе здесь сохранялся бы заказ в Dolibarr
        return {
            "order_id": "ORD-" + str(hash(customer_email))[:8].upper(),
            "status": "pending",
            "customer_email": customer_email,
            "items": items,
            "total": sum(item.get("price", 0) * item.get("quantity", 1) for item in items),
            "message": "Order created successfully"
        }
    except Exception as e:
        logger.error(f"Error creating order: {e}")
        raise HTTPException(status_code=500, detail="Failed to create order")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=ENVIRONMENT == "development"
    )
