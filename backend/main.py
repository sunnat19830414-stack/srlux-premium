"""
SR Lux Premium — FastAPI backend
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from database import init_db
from routers import admin, categories, orders, products
from routers import models as models_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Database tables ready")
    yield
    logger.info("Shutdown")


app = FastAPI(
    title="SR Lux Premium API",
    description="Premium heating & HVAC catalogue with Dolibarr ERP integration",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# Request body size limit: 10 MB
MAX_BODY_SIZE = 10 * 1024 * 1024  # 10 MB


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH"):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_BODY_SIZE:
            return JSONResponse(status_code=413, content={"detail": "Request body too large"})
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://srlux.uz",
        "https://www.srlux.uz",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Api-Key", "Accept-Language"],
)

app.include_router(products.router)
app.include_router(categories.router)
app.include_router(orders.router)
app.include_router(admin.router)
app.include_router(models_router.router)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
